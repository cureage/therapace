import { requireOptionalNativeModule } from 'expo-modules-core';
import { PermissionsAndroid, Platform } from 'react-native';
import { MUSE_EEG_CHANNELS, type MuseEEGChannel, type MuseEEGEvent } from './MuseEEGMeasurement';

const SCAN_DURATION_MS = 10_000;
const CONNECT_TIMEOUT_MS = 20_000;
const EEG_TIMEOUT_MS = 10_000;

export type MuseDevice = {
  id: string;
  name: string;
  localName: string;
  rssi: number | null;
};

type DeviceListener = (device: MuseDevice | null) => void;
type EEGListener = (event: MuseEEGEvent) => void;
type ScanCallbacks = {
  onDevice: (device: MuseDevice) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
};

type ConnectionEvent = MuseDevice & {
  state: 'connecting' | 'connected' | 'disconnected' | 'needsLicense' | 'needsUpdate' | 'unknown';
};

type EEGPacketEvent = {
  timestamp: number;
  channels: Partial<Record<MuseEEGChannel, number[]>>;
};

type NativeMuseEvents = {
  onMuseDevice: (device: MuseDevice) => void;
  onMuseConnection: (event: ConnectionEvent) => void;
  onMuseEEG: (event: EEGPacketEvent) => void;
  onMuseError: (event: { message: string }) => void;
};

type NativeMuseModule = {
  addListener<EventName extends keyof NativeMuseEvents>(
    eventName: EventName,
    listener: NativeMuseEvents[EventName]
  ): { remove(): void };
  startScan(): Promise<void>;
  stopScan(): Promise<void>;
  connect(deviceId: string): Promise<void>;
  disconnect(): Promise<void>;
  getSignalStrength(deviceId: string): Promise<number | null>;
};

type PendingConnection = {
  resolve: (device: MuseDevice) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

class MuseBluetoothService {
  private readonly nativeModule = requireOptionalNativeModule<NativeMuseModule>('BloomMuse');
  private connectedDevice: MuseDevice | null = null;
  private readonly devices = new Map<string, MuseDevice>();
  private readonly deviceListeners = new Set<DeviceListener>();
  private readonly eegListeners = new Set<EEGListener>();
  private readonly pendingConnections = new Map<string, PendingConnection>();
  private scanTimeout: ReturnType<typeof setTimeout> | null = null;
  private scanActive = false;
  private scanGeneration = 0;
  private scanCallbacks: ScanCallbacks | null = null;
  private eegTimeout: ReturnType<typeof setTimeout> | null = null;
  private sequenceId = 0;

  constructor() {
    this.nativeModule?.addListener('onMuseDevice', (device) => {
      const normalized = { ...device, localName: device.name };
      this.devices.set(normalized.id, normalized);
      this.scanCallbacks?.onDevice(normalized);
    });

    this.nativeModule?.addListener('onMuseConnection', (event) => {
      const device = { ...event, localName: event.name };
      if (event.state === 'connected') {
        this.setConnectedDevice(device);
        const pending = this.pendingConnections.get(device.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingConnections.delete(device.id);
          pending.resolve(device);
        }
        this.watchForEEG();
      } else if (event.state === 'disconnected') {
        if (this.connectedDevice?.id === device.id) {
          this.setConnectedDevice(null);
          this.clearEEGTimeout();
          this.emitEEGEvent({ error: 'The Muse disconnected.' });
        }
        this.rejectPendingConnection(
          device.id,
          new Error('The Muse disconnected before connecting.')
        );
      } else if (event.state === 'needsLicense' || event.state === 'needsUpdate') {
        const message =
          event.state === 'needsLicense'
            ? 'The Muse SDK reports that this headband needs a valid license.'
            : 'The Muse SDK reports that this headband needs a firmware update.';
        this.rejectPendingConnection(device.id, new Error(message));
        this.emitEEGEvent({ error: message });
      }
    });

    this.nativeModule?.addListener('onMuseEEG', ({ timestamp, channels }) => {
      this.clearEEGTimeout();
      MUSE_EEG_CHANNELS.forEach((channel) => {
        const samples = channels[channel];
        if (!samples || samples.length === 0) return;
        this.emitEEGEvent({
          reading: {
            channel,
            sequenceId: this.sequenceId++,
            samples,
            receivedAt: timestamp,
          },
        });
      });
    });

    this.nativeModule?.addListener('onMuseError', ({ message }) => {
      const error = new Error(message);
      this.scanCallbacks?.onError(error);
      this.scanCallbacks = null;
      void this.stopScan().catch((scanError: unknown) => {
        console.warn('Could not stop the Muse scan after an SDK error.', scanError);
      });
      this.emitEEGEvent({ error: message });
      this.pendingConnections.forEach((pending, id) => {
        this.rejectPendingConnection(id, error);
      });
    });
  }

  private getNativeModule(): NativeMuseModule {
    if (!this.nativeModule) {
      throw new Error('Muse SDK is available only in a native iOS or Android build.');
    }
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      throw new Error('Muse SDK is supported only on iOS and Android.');
    }
    return this.nativeModule;
  }

  private async requestPermissions(): Promise<void> {
    if (Platform.OS !== 'android') {
      if (Platform.OS !== 'ios') {
        throw new Error('Muse SDK is supported only on iOS and Android.');
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

  async startScan(callbacks: ScanCallbacks): Promise<void> {
    await this.stopScan();
    const scanGeneration = this.scanGeneration;
    await this.requestPermissions();
    if (scanGeneration !== this.scanGeneration) return;

    this.scanActive = true;
    this.scanCallbacks = callbacks;
    this.scanTimeout = setTimeout(() => {
      void this.stopScan().then(callbacks.onComplete).catch(callbacks.onError);
    }, SCAN_DURATION_MS);

    try {
      await this.getNativeModule().startScan();
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
    this.scanCallbacks = null;

    if (this.scanActive) {
      this.scanActive = false;
      await this.getNativeModule().stopScan();
    }
  }

  async connect(deviceId: string): Promise<MuseDevice> {
    await this.stopScan();
    await this.requestPermissions();

    if (this.connectedDevice?.id === deviceId) return this.connectedDevice;
    if (this.connectedDevice) await this.disconnect();

    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error('The selected Muse is no longer available. Scan again.');
    }

    const connected = new Promise<MuseDevice>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingConnections.delete(deviceId);
        void this.nativeModule?.disconnect().catch((error: unknown) => {
          console.warn('Could not stop the timed-out Muse connection.', error);
        });
        reject(new Error('The Muse did not connect. Check that it is powered on and try again.'));
      }, CONNECT_TIMEOUT_MS);
      this.pendingConnections.set(deviceId, { resolve, reject, timeout });
    });

    try {
      await this.getNativeModule().connect(deviceId);
    } catch (error) {
      this.rejectPendingConnection(
        deviceId,
        error instanceof Error ? error : new Error('Could not start the Muse connection.')
      );
    }
    return connected;
  }

  async disconnect(): Promise<void> {
    this.clearEEGTimeout();
    await this.getNativeModule().disconnect();
  }

  async readSignalStrength(device: MuseDevice): Promise<number | null> {
    return this.getNativeModule().getSignalStrength(device.id);
  }

  subscribeToConnection(listener: DeviceListener): () => void {
    this.deviceListeners.add(listener);
    listener(this.connectedDevice);
    return () => {
      this.deviceListeners.delete(listener);
    };
  }

  subscribeToEEG(listener: EEGListener): () => void {
    this.eegListeners.add(listener);
    return () => {
      this.eegListeners.delete(listener);
    };
  }

  private setConnectedDevice(device: MuseDevice | null): void {
    this.connectedDevice = device;
    this.deviceListeners.forEach((listener) => listener(device));
  }

  private emitEEGEvent(event: MuseEEGEvent): void {
    this.eegListeners.forEach((listener) => listener(event));
  }

  private watchForEEG(): void {
    this.clearEEGTimeout();
    this.eegTimeout = setTimeout(() => {
      this.emitEEGEvent({
        error:
          'Connected to the Muse, but no EEG data arrived. Check the headband fit and sensors.',
      });
    }, EEG_TIMEOUT_MS);
  }

  private clearEEGTimeout(): void {
    if (this.eegTimeout) {
      clearTimeout(this.eegTimeout);
      this.eegTimeout = null;
    }
  }

  private rejectPendingConnection(id: string, error: Error): void {
    const pending = this.pendingConnections.get(id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingConnections.delete(id);
    pending.reject(error);
  }
}

export const museBluetoothService = new MuseBluetoothService();
