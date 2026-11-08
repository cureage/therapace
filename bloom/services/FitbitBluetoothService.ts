import type { Device, Subscription } from 'react-native-ble-plx';
import { getBluetoothManager, prepareBluetooth } from './BluetoothManager';
import { decodeHeartRate } from './HeartRateMeasurement';

const HEART_RATE_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
const HEART_RATE_MEASUREMENT = '00002a37-0000-1000-8000-00805f9b34fb';

export type HeartRateState = {
  device: Device | null;
  bpm: number | null;
  receivedAt: number | null;
  error: string | null;
};

class FitbitBluetoothService {
  private state: HeartRateState = { device: null, bpm: null, receivedAt: null, error: null };
  private listeners = new Set<(state: HeartRateState) => void>();
  private monitor: Subscription | null = null;
  private disconnectListener: Subscription | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private scanning = false;
  private scanGeneration = 0;
  private connecting = false;

  subscribe(listener: (state: HeartRateState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private update(update: Partial<HeartRateState>) {
    this.state = { ...this.state, ...update };
    this.listeners.forEach((listener) => listener(this.state));
  }

  async startScan(callbacks: {
    onDevice: (device: Device) => void;
    onComplete: () => void;
    onError: (error: Error) => void;
  }): Promise<void> {
    await this.stopScan();
    const generation = this.scanGeneration;
    const ble = await prepareBluetooth();
    if (generation !== this.scanGeneration) return;
    this.scanning = true;
    const finish = (error?: Error) => {
      if (generation !== this.scanGeneration) return;
      void this.stopScan()
        .then(() => {
          if (error) callbacks.onError(error);
          else callbacks.onComplete();
        })
        .catch(callbacks.onError);
    };
    this.scanTimer = setTimeout(() => finish(), 12_000);
    try {
      // Unfiltered scan also finds Air devices that omit the HR UUID in advertisements.
      await ble.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
        if (generation !== this.scanGeneration) return;
        if (error) {
          finish(error);
          return;
        }
        if (!device) return;
        const name = `${device.name ?? ''} ${device.localName ?? ''}`.toLowerCase();
        const advertisesHeartRate = device.serviceUUIDs?.some((uuid) =>
          [HEART_RATE_SERVICE, '180d'].includes(uuid.toLowerCase())
        );
        if (name.includes('fitbit') || name.trim() === 'air' || advertisesHeartRate) {
          callbacks.onDevice(device);
        }
      });
    } catch (error) {
      await this.stopScan();
      throw error;
    }
  }

  async stopScan(): Promise<void> {
    this.scanGeneration++;
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.scanTimer = null;
    if (this.scanning) {
      this.scanning = false;
      await getBluetoothManager().stopDeviceScan();
    }
  }

  async connect(id: string): Promise<void> {
    if (this.connecting) throw new Error('A Fitbit connection is already in progress.');
    this.connecting = true;
    try {
      await this.stopScan();
      const ble = await prepareBluetooth();
      await this.disconnect();
      this.update({ error: null });
      try {
        const device = await ble.connectToDevice(id, { timeout: 15_000 });
        await device.discoverAllServicesAndCharacteristics();
        const characteristics = await device.characteristicsForService(HEART_RATE_SERVICE);
        const measurement = characteristics.find(
          (item) => item.uuid.toLowerCase() === HEART_RATE_MEASUREMENT
        );
        if (!measurement?.isNotifiable) {
          throw new Error(
            'This device is not sharing live heart rate. Enable Share heart rate in Google Health and retry.'
          );
        }
        this.update({ device, bpm: null, receivedAt: null });
        this.disconnectListener = ble.onDeviceDisconnected(id, () => {
          this.clearConnection();
          this.update({ error: 'Fitbit disconnected. Enable heart-rate sharing and reconnect.' });
        });
        this.monitor = device.monitorCharacteristicForService(
          HEART_RATE_SERVICE,
          HEART_RATE_MEASUREMENT,
          (error, characteristic) => {
            if (this.state.device?.id !== id) return;
            if (error) {
              this.update({
                bpm: null,
                receivedAt: null,
                error: `Heart-rate stream stopped: ${error.message}. Disconnect and reconnect.`,
              });
              return;
            }
            if (!characteristic?.value) return;
            try {
              const bpm = decodeHeartRate(characteristic.value);
              this.update({ bpm, receivedAt: Date.now(), error: null });
            } catch {
              this.update({
                bpm: null,
                receivedAt: null,
                error: 'Could not decode the heart-rate reading.',
              });
            }
          }
        );
      } catch (error) {
        this.clearConnection();
        await ble.cancelDeviceConnection(id).catch(() => undefined);
        throw error;
      }
    } finally {
      this.connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    const device = this.state.device;
    if (device) await getBluetoothManager().cancelDeviceConnection(device.id);
    this.clearConnection();
  }

  private clearConnection() {
    this.disconnectListener?.remove();
    this.disconnectListener = null;
    this.monitor?.remove();
    this.monitor = null;
    this.update({ device: null, bpm: null, receivedAt: null, error: null });
  }
}

export const fitbitBluetoothService = new FitbitBluetoothService();
