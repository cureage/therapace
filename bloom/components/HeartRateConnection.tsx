import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { Device } from 'react-native-ble-plx';
import { useHeartRate } from '@/hooks/useHeartRate';
import { heartRateBluetoothService } from '@/services/HeartRateBluetoothService';

type Props = { otherDeviceBusy: boolean; onBusyChange: (busy: boolean) => void };

export function HeartRateConnection({ otherDeviceBusy, onBusyChange }: Props) {
  const [devices, setDevices] = useState<Device[]>([]);
  const { state, fresh, live } = useHeartRate();
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      void heartRateBluetoothService.stopScan().catch(console.warn);
    },
    []
  );

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
  return (
    <View className="bg-area-foreground mt-6 gap-4 rounded-[20px] p-[18px]">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-foreground flex-1 text-lg font-bold">Heart-rate monitor</Text>
        {(scanning || connecting) && <ActivityIndicator color="#426b54" />}
      </View>
      <Text className="text-[13px] leading-5 text-neutral-500 dark:text-neutral-400">
        Scan for any monitor that broadcasts the standard Bluetooth Heart Rate Service. On Garmin,
        enable Broadcast Heart Rate. Apple Watch does not broadcast heart rate natively; use a watch
        app that advertises the standard BLE Heart Rate Service. Fitbit Air users can enable Share
        heart rate in Google Health.
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
            <Text className="text-sm font-semibold text-white">Disconnect monitor</Text>

          </Pressable>
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void scan()}
        className="bg-primary min-h-11 items-center justify-center rounded-xl px-[14px] py-3 active:opacity-80 disabled:opacity-50">
        <Text className="text-sm font-semibold text-white">
          {scanning ? 'Scanning…' : connecting ? 'Connecting…' : 'Scan for heart-rate monitors'}
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
              disabled={connecting || otherDeviceBusy}
              onPress={() => void connect(device)}
              className="bg-primary min-h-11 items-center justify-center rounded-xl px-[14px] py-3 active:opacity-80 disabled:opacity-50">
              <Text className="text-sm font-semibold text-white">{connecting ? 'Connecting…' : 'Connect'}</Text>
            </Pressable>
          </View>
        ))}
      {!scanning && devices.length === 0 && !state.device && (
        <Text className="text-[13px] leading-5 text-neutral-500 dark:text-neutral-400">
          No sensors listed yet. Enable heart-rate broadcasting on your monitor, keep it nearby, and
          scan again. Monitors should advertise the standard Bluetooth Heart Rate Service.
        </Text>
      )}
    </View>
  );
}
