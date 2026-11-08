import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Device } from 'react-native-ble-plx';
import { fitbitBluetoothService, type HeartRateState } from '@/services/FitbitBluetoothService';

type Props = { otherDeviceBusy: boolean; onBusyChange: (busy: boolean) => void };

export function FitbitConnection({ otherDeviceBusy, onBusyChange }: Props) {
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
    const unsubscribe = fitbitBluetoothService.subscribe(setState);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const appState = AppState.addEventListener('change', (next) => {
      setForeground(next === 'active');
      setNow(Date.now());
    });
    return () => {
      unsubscribe();
      clearInterval(timer);
      appState.remove();
      void fitbitBluetoothService.stopScan().catch(console.warn);
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
      await fitbitBluetoothService.startScan({
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
      setError(scanError instanceof Error ? scanError.message : 'Could not scan for Fitbit.');
    }
  };

  const connect = async (device: Device) => {
    setConnecting(true);
    setError(null);
    try {
      await fitbitBluetoothService.connect(device.id);
    } catch (connectionError) {
      setError(
        connectionError instanceof Error ? connectionError.message : 'Could not connect to Fitbit.'
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
      await fitbitBluetoothService.disconnect();
    } catch (disconnectError) {
      setError(
        disconnectError instanceof Error ? disconnectError.message : 'Could not disconnect Fitbit.'
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
        <Text style={styles.title}>Fitbit Air · Heart rate</Text>
        {(scanning || connecting) && <ActivityIndicator color="#426b54" />}
      </View>
      <Text style={styles.detail}>
        In Google Health, open Connections → your Fitbit Air → Share heart rate → Get started. Keep
        the Air nearby and wear it snugly, then scan below.
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
            <Text style={styles.buttonText}>Disconnect Fitbit</Text>
          </Pressable>
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void scan()}
        style={[styles.button, busy && styles.disabled]}>
        <Text style={styles.buttonText}>
          {scanning
            ? 'Scanning…'
            : connecting
              ? 'Connecting…'
              : 'Scan for Fitbit / heart-rate sensors'}
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
              disabled={busy}
              onPress={() => void connect(device)}
              style={[styles.button, busy && styles.disabled]}>
              <Text style={styles.buttonText}>Connect</Text>
            </Pressable>
          </View>
        ))}
      {!scanning && devices.length === 0 && !state.device && (
        <Text style={styles.detail}>
          No sensors listed yet. Enable heart-rate sharing and scan. Other Bluetooth Heart Rate
          Profile sensors may also appear.
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
