import { Heading } from '@/components/ui/heading';
import { StyledView } from '@/components/StyledView';
import { museBluetoothService } from '@/services/MuseBluetoothService';
import { HeartRateConnection } from '@/components/HeartRateConnection';
import { MuseEEGMonitor } from '@/components/MuseEEGMonitor';
import type { MuseDevice } from '@/services/MuseBluetoothService';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

function getSignalQuality(rssi: number): string {
  if (rssi >= -60) return 'Excellent';
  if (rssi >= -70) return 'Good';
  if (rssi >= -80) return 'Fair';
  return 'Weak';
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected Bluetooth error occurred.';
}

export const Settings = () => {
  const [devices, setDevices] = useState<MuseDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<MuseDevice | null>(null);
  const [scanning, setScanning] = useState(false);
  const [heartRateBusy, setHeartRateBusy] = useState(false);
  const [connectingDeviceId, setConnectingDeviceId] = useState<string | null>(null);
  const [signalStrength, setSignalStrength] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = museBluetoothService.subscribeToConnection((device) => {
      setConnectedDevice(device);
      setSignalStrength(device?.rssi ?? null);
    });

    return () => {
      unsubscribe();
      void museBluetoothService.stopScan().catch((error: unknown) => {
        console.warn('Could not stop the Muse scan during cleanup.', error);
      });
    };
  }, []);

  const scanForDevices = useCallback(async () => {
    setErrorMessage(null);
    setDevices([]);
    setScanning(true);

    try {
      await museBluetoothService.startScan({
        onDevice: (device) => {
          setDevices((currentDevices) => {
            const existingIndex = currentDevices.findIndex(
              (currentDevice) => currentDevice.id === device.id
            );
            if (existingIndex < 0) {
              return [...currentDevices, device];
            }

            return currentDevices.map((currentDevice, index) =>
              index === existingIndex ? device : currentDevice
            );
          });
        },
        onComplete: () => setScanning(false),
        onError: (error) => {
          setScanning(false);
          setErrorMessage(getErrorMessage(error));
        },
      });
    } catch (error) {
      setScanning(false);
      setErrorMessage(getErrorMessage(error));
    }
  }, []);

  const toggleConnection = useCallback(
    async (device: MuseDevice) => {
      setErrorMessage(null);
      if (connectedDevice?.id === device.id) {
        setConnectingDeviceId(device.id);
        try {
          await museBluetoothService.disconnect();
          setSignalStrength(null);
        } catch (error) {
          setErrorMessage(getErrorMessage(error));
        } finally {
          setConnectingDeviceId(null);
        }
        return;
      }

      setScanning(false);
      setConnectingDeviceId(device.id);
      try {
        const connected = await museBluetoothService.connect(device.id);
        setConnectedDevice(connected);
        try {
          setSignalStrength(await museBluetoothService.readSignalStrength(connected));
        } catch (error) {
          setSignalStrength(null);
          setErrorMessage(
            `Connected, but signal strength is unavailable: ${getErrorMessage(error)}`
          );
        }
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setConnectingDeviceId(null);
      }
    },
    [connectedDevice]
  );

  const status = connectingDeviceId
    ? 'Connecting...'
    : scanning
      ? 'Scanning...'
      : connectedDevice
        ? 'Connected'
        : 'Disconnected';

  return (
    <StyledView className="flex h-full flex-col">
      <ScrollView className="flex-1" contentContainerClassName="pb-8">
        <Heading className="text-4xl font-bold">Settings</Heading>

        <View className="mt-6 gap-[18px] rounded-[20px] bg-area-foreground p-[18px]">
          <View className="flex-row items-center justify-between gap-3">
            <View>
              <Text className="text-[11px] font-bold tracking-[1.2px] text-neutral-500 dark:text-neutral-400">DEVICE</Text>
              <Text className="mt-[5px] text-lg font-bold text-foreground">Headband Connection</Text>
            </View>
            <View className="flex-row items-center gap-[7px] rounded-2xl bg-primary/10 px-[10px] py-[7px]">
              {scanning && <ActivityIndicator size="small" color="#426b54" />}
              <Text className="text-xs font-semibold text-primary">{status}</Text>
            </View>
          </View>

          {connectedDevice && (
            <View className="flex-row items-center gap-[10px] rounded-[14px] border border-primary/50 bg-primary/10 p-3">
              <View className="h-[9px] w-[9px] rounded-[5px] bg-primary" />
              <View className="flex-1 gap-1">
                <Text className="text-sm font-semibold">
                  {connectedDevice.name ?? connectedDevice.localName ?? 'Muse headband'}
                </Text>
                <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                  {signalStrength === null
                    ? 'Connected · signal unavailable'
                    : `Connected · ${getSignalQuality(signalStrength)} signal (${signalStrength} dBm)`}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => void toggleConnection(connectedDevice)}
                disabled={connectingDeviceId !== null || heartRateBusy}
                className="min-h-9 items-center justify-center rounded-[10px] border border-primary/10 bg-area-foreground px-3 active:opacity-80 disabled:opacity-[0.55]">
                <Text className={`text-xs font-bold ${
                          status === 'Connected' ? 'text-primary' : 'text-white'
                        }`}>Disconnect</Text>
              </Pressable>
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            onPress={() => void scanForDevices()}
            disabled={connectingDeviceId !== null || heartRateBusy}
            className="min-h-12 flex-row items-center justify-center gap-[9px] rounded-[13px] bg-primary active:opacity-80 disabled:opacity-[0.55]">
            {scanning && <ActivityIndicator size="small" color="#ffffff" />}
            <Text className="text-sm font-bold text-white">
              {scanning ? 'Scanning...' : 'Scan for Muse 2'}
            </Text>
          </Pressable>

          {errorMessage && (
            <Text accessibilityRole="alert" className="text-[13px] leading-[19px] text-red-700">
              {errorMessage}
            </Text>
          )}

          {devices.length > 0 && (
            <View className="gap-2">
              <Text className="mb-[3px] text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">
                Nearby Muse devices
              </Text>
              {devices.map((device) => {
                const isConnected = connectedDevice?.id === device.id;
                const isConnecting = connectingDeviceId === device.id;
                return (
                  <View
                    key={device.id}
                    className="min-h-[60px] flex-row items-center gap-[10px] border-t-[0.5px] border-primary-10 py-2">
                    <View className="flex-1 gap-1">
                      <Text className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                        {device.name ?? device.localName ?? 'Muse headband'}
                      </Text>
                      <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                        {device.rssi === null
                          ? 'Muse device · signal unavailable'
                          : `Muse device · ${device.rssi} dBm`}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void toggleConnection(device)}
                      disabled={connectingDeviceId !== null || heartRateBusy}
                      className={`min-h-9 flex-row items-center justify-center gap-[6px] rounded-[10px] px-[13px] active:opacity-80 disabled:opacity-[0.55] ${
                        isConnected ? 'border border-primary/10 bg-area-foreground' : 'bg-primary'
                      }`}>
                      {isConnecting && (
                        <ActivityIndicator
                          size="small"
                          color={isConnected ? '#426b54' : '#ffffff'}
                        />
                      )}
                      <Text
                        className={`text-xs font-bold ${
                          isConnected ? 'text-primary' : 'text-white'
                        }`}>
                        {isConnecting ? 'Connecting...' : isConnected ? 'Disconnect' : 'Connect'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}

          {!scanning && devices.length === 0 && !errorMessage && (
            <Text className="text-[13px] leading-[19px] text-neutral-500 dark:text-neutral-400">
              Make sure your Muse 2 is powered on and nearby.
            </Text>
          )}

          <Text className="text-xs leading-[18px] text-neutral-500 dark:text-neutral-400">
            Devices are matched by the advertised “Muse” name, which can include other Muse models.
            BLE connects directly to the headband; it does not create an operating system Bluetooth
            pairing. Signal quality is based on received signal strength (RSSI). Bloom saves EEG and
            heart-rate readings captured during a video session.
          </Text>
        </View>
        <MuseEEGMonitor device={connectedDevice} />
        <HeartRateConnection
          otherDeviceBusy={scanning || connectingDeviceId !== null}
          onBusyChange={setHeartRateBusy}
        />
      </ScrollView>
    </StyledView>
  );
};
