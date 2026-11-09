import { Heading } from '@/components/ui/heading';
import { StyledView } from '@/components/StyledView';
import { museBluetoothService } from '@/services/MuseBluetoothService';
import { FitbitConnection } from '@/components/FitbitConnection';
import { MuseEEGMonitor } from '@/components/MuseEEGMonitor';
import type { MuseDevice } from '@/services/MuseBluetoothService';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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
  const [fitbitBusy, setFitbitBusy] = useState(false);
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
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Heading>Settings</Heading>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.eyebrow}>DEVICE</Text>
              <Text style={styles.title}>Headband Connection</Text>
            </View>
            <View style={styles.statusPill}>
              {scanning && <ActivityIndicator size="small" color="#426b54" />}
              <Text style={styles.statusText}>{status}</Text>
            </View>
          </View>

          {connectedDevice && (
            <View style={styles.connectedCard}>
              <View style={styles.connectedMark} />
              <View style={styles.deviceInfo}>
                <Text style={styles.deviceName}>
                  {connectedDevice.name ?? connectedDevice.localName ?? 'Muse headband'}
                </Text>
                <Text style={styles.deviceDetail}>
                  {signalStrength === null
                    ? 'Connected · signal unavailable'
                    : `Connected · ${getSignalQuality(signalStrength)} signal (${signalStrength} dBm)`}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => void toggleConnection(connectedDevice)}
                disabled={connectingDeviceId !== null || fitbitBusy}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.pressed,
                  (connectingDeviceId !== null || fitbitBusy) && styles.disabled,
                ]}>
                <Text style={styles.secondaryButtonText}>Disconnect</Text>
              </Pressable>
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            onPress={() => void scanForDevices()}
            disabled={scanning || connectingDeviceId !== null || fitbitBusy}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
              (scanning || connectingDeviceId !== null || fitbitBusy) && styles.disabled,
            ]}>
            {scanning && <ActivityIndicator size="small" color="#ffffff" />}
            <Text style={styles.primaryButtonText}>
              {scanning ? 'Scanning...' : 'Scan for Muse 2'}
            </Text>
          </Pressable>

          {errorMessage && (
            <Text accessibilityRole="alert" style={styles.error}>
              {errorMessage}
            </Text>
          )}

          {devices.length > 0 && (
            <View style={styles.deviceList}>
              <Text style={styles.listHeading}>Nearby Muse devices</Text>
              {devices.map((device) => {
                const isConnected = connectedDevice?.id === device.id;
                const isConnecting = connectingDeviceId === device.id;
                return (
                  <View key={device.id} style={styles.deviceRow}>
                    <View style={styles.deviceInfo}>
                      <Text style={styles.deviceName}>
                        {device.name ?? device.localName ?? 'Muse headband'}
                      </Text>
                      <Text style={styles.deviceDetail}>
                        {device.rssi === null
                          ? 'Muse device · signal unavailable'
                          : `Muse device · ${device.rssi} dBm`}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void toggleConnection(device)}
                      disabled={connectingDeviceId !== null || fitbitBusy}
                      style={({ pressed }) => [
                        isConnected ? styles.secondaryButton : styles.connectButton,
                        pressed && styles.pressed,
                        (connectingDeviceId !== null || fitbitBusy) && styles.disabled,
                      ]}>
                      {isConnecting && (
                        <ActivityIndicator
                          size="small"
                          color={isConnected ? '#426b54' : '#ffffff'}
                        />
                      )}
                      <Text
                        style={isConnected ? styles.secondaryButtonText : styles.connectButtonText}>
                        {isConnecting ? 'Connecting...' : isConnected ? 'Disconnect' : 'Connect'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}

          {!scanning && devices.length === 0 && !errorMessage && (
            <Text style={styles.emptyState}>Make sure your Muse 2 is powered on and nearby.</Text>
          )}

          <Text style={styles.note}>
            Devices are matched by the advertised “Muse” name, which can include other Muse models.
            BLE connects directly to the headband; it does not create an operating system Bluetooth
            pairing. Signal quality is based on received signal strength (RSSI).
            Bloom saves EEG and heart-rate readings captured during a video session.
          </Text>
        </View>
        <MuseEEGMonitor device={connectedDevice} />
        <FitbitConnection
          otherDeviceBusy={scanning || connectingDeviceId !== null}
          onBusyChange={setFitbitBusy}
        />
      </ScrollView>
    </StyledView>
  );
};

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: 32,
  },
  section: {
    marginTop: 24,
    padding: 18,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    gap: 18,
  },
  sectionHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  eyebrow: {
    color: '#728077',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    marginTop: 5,
    color: '#24352a',
    fontSize: 18,
    fontWeight: '700',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#edf3ee',
  },
  statusText: {
    color: '#426b54',
    fontSize: 12,
    fontWeight: '600',
  },
  connectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#dce9df',
    borderRadius: 14,
    backgroundColor: '#f5f9f5',
  },
  connectedMark: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#4d8a60',
  },
  deviceInfo: {
    flex: 1,
    gap: 4,
  },
  deviceName: {
    color: '#26372b',
    fontSize: 14,
    fontWeight: '600',
  },
  deviceDetail: {
    color: '#77827a',
    fontSize: 12,
  },
  primaryButton: {
    minHeight: 48,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 9,
    borderRadius: 13,
    backgroundColor: '#426b54',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  connectButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 13,
    borderRadius: 10,
    backgroundColor: '#426b54',
  },
  connectButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#cbd9ce',
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  secondaryButtonText: {
    color: '#426b54',
    fontSize: 12,
    fontWeight: '700',
  },
  deviceList: {
    gap: 8,
  },
  listHeading: {
    marginBottom: 3,
    color: '#526057',
    fontSize: 13,
    fontWeight: '600',
  },
  deviceRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e9e5',
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.55,
  },
  emptyState: {
    color: '#77827a',
    fontSize: 13,
    lineHeight: 19,
  },
  error: {
    color: '#a43d35',
    fontSize: 13,
    lineHeight: 19,
  },
  note: {
    color: '#77827a',
    fontSize: 12,
    lineHeight: 18,
  },
});
