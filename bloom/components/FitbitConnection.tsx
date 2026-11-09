import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, Text, View } from 'react-native';
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
    <View className="bg-area-foreground mt-6 gap-4 rounded-[20px] p-[18px]">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-foreground flex-1 text-lg font-bold">Fitbit Air · Heart rate</Text>
        {(scanning || connecting) && <ActivityIndicator color="#426b54" />}
      </View>
      <Text className="text-[13px] leading-5 text-neutral-500 dark:text-neutral-400">
        In Google Health, open Connections → your Fitbit Air → Share heart rate → Get started. Keep
        the Air nearby and wear it snugly, then scan below.
      </Text>
      {state.device && (
        <View className="bg-primary/10 gap-2 rounded-[14px] p-4">
          <Text className="text-foreground text-sm font-semibold">
            {state.device.name ?? state.device.localName ?? 'Heart-rate sensor'}
          </Text>
          <Text
            accessibilityLabel={
              live ? `${state.bpm} beats per minute` : 'No live heart-rate reading'
            }
            className="text-primary text-5xl font-bold">
            {live ? state.bpm : '—'} <Text className="text-base">BPM</Text>
          </Text>
          <Text className="text-[13px] leading-5 text-neutral-500 dark:text-neutral-400">
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
            className="bg-primary min-h-11 items-center justify-center rounded-xl px-[14px] py-3 active:opacity-80 disabled:opacity-50">
            <Text className="text-sm font-semibold text-white">Disconnect Fitbit</Text>
          </Pressable>
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void scan()}
        className="bg-primary min-h-11 items-center justify-center rounded-xl px-[14px] py-3 active:opacity-80 disabled:opacity-50">
        <Text className="text-sm font-semibold text-white">
          {scanning
            ? 'Scanning…'
            : connecting
              ? 'Connecting…'
              : 'Scan for Fitbit / heart-rate sensors'}
        </Text>
      </Pressable>
      {otherDeviceBusy && (
        <Text className="text-[13px] leading-5 text-neutral-500 dark:text-neutral-400">
          Wait for the Muse scan or connection to finish.
        </Text>
      )}
      {(error || state.error) && (
        <Text accessibilityRole="alert" className="text-[13px] leading-5 text-red-700">
          {error ?? state.error}
        </Text>
      )}
      {devices
        .filter((device) => device.id !== state.device?.id)
        .map((device) => (
          <View
            key={device.id}
            className="border-primary-10 flex-row items-center justify-between gap-3 border-t-[0.5px] py-2">
            <View className="flex-1">
              <Text className="text-foreground text-sm font-semibold">
                {device.name ?? device.localName ?? 'Bluetooth heart-rate sensor'}
              </Text>
              <Text className="text-[13px] leading-5 text-neutral-500 dark:text-neutral-400">
                {device.id}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Connect ${device.name ?? 'heart-rate sensor'}`}
              disabled={busy}
              onPress={() => void connect(device)}
              className="bg-primary min-h-11 items-center justify-center rounded-xl px-[14px] py-3 active:opacity-80 disabled:opacity-50">
              <Text className="text-sm font-semibold text-white">Connect</Text>
            </Pressable>
          </View>
        ))}
      {!scanning && devices.length === 0 && !state.device && (
        <Text className="text-[13px] leading-5 text-neutral-500 dark:text-neutral-400">
          No sensors listed yet. Enable heart-rate sharing and scan. Other Bluetooth Heart Rate
          Profile sensors may also appear.
        </Text>
      )}
    </View>
  );
}
