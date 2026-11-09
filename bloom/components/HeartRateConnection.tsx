import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Device } from 'react-native-ble-plx';
import {
  heartRateBluetoothService,
  type HeartRateState,
} from '@/services/HeartRateBluetoothService';

type Props = { otherDeviceBusy: boolean; onBusyChange: (busy: boolean) => void };

export function HeartRateConnection({ otherDeviceBusy, onBusyChange }: Props) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [state, setState] = useState<HeartRateState>({
    device: null,
    bpm: null,
    receivedAt: null,
    error: null,
  });
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [foreground, setForeground] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const unsubscribe = heartRateBluetoothService.subscribe(setState);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const appState = AppState.addEventListener('change', (next) => {
      setForeground(next === 'active');
      setNow(Date.now());
    });
    return () => {
      unsubscribe();
      clearInterval(timer);
      appState.remove();
      void heartRateBluetoothService.stopScan().catch(console.warn);
    };
  }, []);

  useEffect(() => {
    onBusyChange(scanning || connecting);
    return () => onBusyChange(false);
  }, [scanning, connecting, onBusyChange]);

  const scan = async () => {
    setError(null);
    setDevices([]);
    setScanning(true);
    try {
      await heartRateBluetoothService.startScan({
        onDevice: (device) =>
          setDevices((current) => [...current.filter((item) => item.id !== device.id), device]),
        onComplete: () => setScanning(false),
        onError: (scanError) => {
          setScanning(false);
          setError(scanError.message);
        },
      });
    } catch (scanError) {
      setScanning(false);
      setError(
        scanError instanceof Error ? scanError.message : 'Could not scan for heart-rate monitors.'
      );
    }
  };

  const connect = async (device: Device) => {
    setConnecting(true);
    setError(null);
    try {
      await heartRateBluetoothService.connect(device.id);
    } catch (connectionError) {
      setError(
        connectionError instanceof Error
          ? connectionError.message
          : 'Could not connect to the heart-rate monitor.'
      );
    } finally {
      setScanning(false);
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      await heartRateBluetoothService.disconnect();
    } catch (disconnectError) {
      setError(
        disconnectError instanceof Error
          ? disconnectError.message
          : 'Could not disconnect the heart-rate monitor.'
      );
    } finally {
      setConnecting(false);
    }
  };

  const busy = scanning || connecting || otherDeviceBusy;
  const fresh = foreground && state.receivedAt !== null && now - state.receivedAt < 10_000;
  const live = fresh && state.bpm !== null;
  return (
    <View style={styles.section}>
      <View style={styles.row}>
        <Text style={styles.title}>Heart-rate monitor</Text>
        {(scanning || connecting) && <ActivityIndicator color="#426b54" />}
      </View>
      <Text style={styles.detail}>
        Scan for any monitor that broadcasts the standard Bluetooth Heart Rate Service. On Garmin,
        enable Broadcast Heart Rate. Apple Watch does not broadcast heart rate natively; use a watch
        app that advertises the standard BLE Heart Rate Service. Fitbit Air users can enable Share
        heart rate in Google Health.
      </Text>
      {state.device && (
        <View style={styles.reading}>
          <Text style={styles.name}>
            {state.device.name ?? state.device.localName ?? 'Heart-rate sensor'}
          </Text>
          <Text
            accessibilityLabel={
              live ? `${state.bpm} beats per minute` : 'No live heart-rate reading'
            }
            style={styles.bpm}>
            {live ? state.bpm : '—'} <Text style={styles.unit}>BPM</Text>
          </Text>
          <Text style={styles.detail}>
            {live
              ? 'Live heart rate'
              : fresh
                ? 'Check sensor contact on your wrist'
                : state.receivedAt
                  ? 'No recent reading'
                  : 'Connected · waiting for heart rate'}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void disconnect()}
            style={[styles.button, busy && styles.disabled]}>
            <Text style={styles.buttonText}>Disconnect monitor</Text>
          </Pressable>
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void scan()}
        style={[styles.button, busy && styles.disabled]}>
        <Text style={styles.buttonText}>
          {scanning ? 'Scanning…' : connecting ? 'Connecting…' : 'Scan for heart-rate monitors'}
        </Text>
      </Pressable>
      {otherDeviceBusy && (
        <Text style={styles.detail}>Wait for the Muse scan or connection to finish.</Text>
      )}
      {(error || state.error) && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error ?? state.error}
        </Text>
      )}
      {devices
        .filter((device) => device.id !== state.device?.id)
        .map((device) => (
          <View key={device.id} style={styles.row}>
            <View style={styles.device}>
              <Text style={styles.name}>
                {device.name ?? device.localName ?? 'Bluetooth heart-rate sensor'}
              </Text>
              <Text style={styles.detail}>{device.id}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Connect ${device.name ?? 'heart-rate sensor'}`}
              disabled={connecting || otherDeviceBusy}
              onPress={() => void connect(device)}
              style={[styles.button, (connecting || otherDeviceBusy) && styles.disabled]}>
              <Text style={styles.buttonText}>{connecting ? 'Connecting…' : 'Connect'}</Text>
            </Pressable>
          </View>
        ))}
      {!scanning && devices.length === 0 && !state.device && (
        <Text style={styles.detail}>
          No sensors listed yet. Enable heart-rate broadcasting on your monitor, keep it nearby, and
          scan again. Monitors should advertise the standard Bluetooth Heart Rate Service.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24, padding: 18, borderRadius: 20, backgroundColor: '#fff', gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { color: '#24352a', fontSize: 18, fontWeight: '700', flex: 1 },
  detail: { color: '#657168', fontSize: 13, lineHeight: 20 },
  name: { color: '#26372b', fontSize: 14, fontWeight: '600' },
  device: { flex: 1 },
  reading: { backgroundColor: '#f5f9f5', padding: 16, borderRadius: 14, gap: 8 },
  bpm: { color: '#426b54', fontSize: 48, fontWeight: '700' },
  unit: { fontSize: 16 },
  button: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#426b54',
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  disabled: { opacity: 0.5 },
  error: { color: '#a43d35', fontSize: 13, lineHeight: 20 },
});
