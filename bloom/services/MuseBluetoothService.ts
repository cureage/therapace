import { BleManager, type BleError, type Device, type Subscription } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';
import { getBluetoothManager } from './BluetoothManager';

const MUSE_NAME_PREFIX = 'muse';
const SCAN_DURATION_MS = 10_000;
const CONNECT_TIMEOUT_MS = 15_000;

type DeviceListener = (device: Device | null) => void;
type ScanCallbacks = {
  onDevice: (device: Device) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
};

class MuseBluetoothService {
  private manager: BleManager | null = null;
  private connectedDevice: Device | null = null;
  private disconnectSubscription: Subscription | null = null;
  private scanTimeout: ReturnType<typeof setTimeout> | null = null;
  private scanActive = false;
  private scanGeneration = 0;
  private readonly deviceListeners = new Set<DeviceListener>();

  private getManager(): BleManager {
    if (Platform.OS === 'web') {
      throw new Error('Muse BLE is available only in a native iOS or Android build.');
    }

    this.manager ??= getBluetoothManager();
    return this.manager;
  }

  private async requestPermissions(): Promise<void> {
    if (Platform.OS !== 'android') {
      if (Platform.OS !== 'ios') {
        throw new Error('Muse BLE is supported only on iOS and Android.');
      }
      return;
    }

    const permissions =
      Number(Platform.Version) >= 31
        ? [
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          ]
        : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
    const results = await PermissionsAndroid.requestMultiple(permissions);
    const denied = permissions.filter(
      (permission) => results[permission] !== PermissionsAndroid.RESULTS.GRANTED
    );

    if (denied.length > 0) {
      throw new Error(
        'Bluetooth permission is required to scan for and connect to a Muse headband.'
      );
    }
  }

  private isMuse(device: Device): boolean {
    // Muse 2 advertises a name such as "Muse-XXXX". Scan without a service UUID
    // filter because the advertised GATT UUIDs are not consistent across models.
    const advertisedName = device.name ?? device.localName;
    return advertisedName?.toLowerCase().startsWith(MUSE_NAME_PREFIX) ?? false;
  }

  async startScan(callbacks: ScanCallbacks): Promise<void> {
    await this.stopScan();
    const scanGeneration = this.scanGeneration;
    await this.requestPermissions();
    if (scanGeneration !== this.scanGeneration) {
      return;
    }

    const manager = this.getManager();
    this.scanActive = true;
    this.scanTimeout = setTimeout(() => {
      void this.stopScan().then(callbacks.onComplete).catch(callbacks.onError);
    }, SCAN_DURATION_MS);

    let scanFailed = false;
    try {
      await manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
        if (scanGeneration !== this.scanGeneration) {
          return;
        }

        if (error) {
          if (!scanFailed) {
            scanFailed = true;
            void this.stopScan()
              .then(() => callbacks.onError(error))
              .catch(callbacks.onError);
          }
          return;
        }

        if (device && this.isMuse(device)) {
          callbacks.onDevice(device);
        }
      });
    } catch (error) {
      await this.stopScan();
      throw error;
    }
  }

  async stopScan(): Promise<void> {
    this.scanGeneration += 1;
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }

    if (this.scanActive && this.manager) {
      this.scanActive = false;
      await this.manager.stopDeviceScan();
    }
  }

  async connect(deviceId: string): Promise<Device> {
    await this.stopScan();
    await this.requestPermissions();

    if (this.connectedDevice?.id === deviceId) {
      return this.connectedDevice;
    }
    if (this.connectedDevice) {
      await this.disconnect();
    }

    const manager = this.getManager();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const device = await Promise.race([
        manager.connectToDevice(deviceId, { timeout: CONNECT_TIMEOUT_MS }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Connecting to the Muse timed out.')),
            CONNECT_TIMEOUT_MS
          );
        }),
      ]);
      const discoveredDevice = await device.discoverAllServicesAndCharacteristics();
      this.setConnectedDevice(discoveredDevice);
      return discoveredDevice;
    } catch (error) {
      try {
        await manager.cancelDeviceConnection(deviceId);
      } catch (cleanupError) {
        console.warn('Could not cancel the pending Muse connection.', cleanupError);
      }
      throw error;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  async disconnect(): Promise<void> {
    const device = this.connectedDevice;
    if (!device) {
      return;
    }

    await this.getManager().cancelDeviceConnection(device.id);
    this.setConnectedDevice(null);
  }

  async readSignalStrength(device: Device): Promise<number | null> {
    const updatedDevice = await device.readRSSI();
    return updatedDevice.rssi;
  }

  subscribeToConnection(listener: DeviceListener): () => void {
    this.deviceListeners.add(listener);
    listener(this.connectedDevice);
    return () => {
      this.deviceListeners.delete(listener);
    };
  }

  private setConnectedDevice(device: Device | null): void {
    this.disconnectSubscription?.remove();
    this.disconnectSubscription = null;
    this.connectedDevice = device;

    if (device) {
      this.disconnectSubscription = this.getManager().onDeviceDisconnected(
        device.id,
        (error: BleError | null) => {
          if (error) {
            console.warn('Muse disconnected unexpectedly.', error);
          }
          this.setConnectedDevice(null);
        }
      );
    }

    this.deviceListeners.forEach((listener) => listener(device));
  }
}

export const museBluetoothService = new MuseBluetoothService();
