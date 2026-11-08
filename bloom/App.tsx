import './global.css';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';
import { store } from './store/store';
import { useAppSelector } from './store/hooks';
import { AuthNavigator } from '@/navigators/AuthNavigator';
import { MainNavigator } from '@/navigators/MainNavigator';
import { useEffect, useState } from 'react';
import type { Device } from 'react-native-ble-plx';
import { museBluetoothService } from '@/services/MuseBluetoothService';
import { reportSensorPayload } from '@/services/SensorReportingService';

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: 'transparent',
  },
};

function AppContent() {
  const isAuthenticated = useAppSelector((state) => state.user.isAuthenticated);
  const authToken = useAppSelector((state) => state.user.authToken);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);

  useEffect(() => {
    return museBluetoothService.subscribeToConnection(setConnectedDevice);
  }, []);

  useEffect(() => {
    if (!connectedDevice || !authToken) return;

    let active = true;
    let reportInProgress = false;
    const reportSample = async () => {
      if (!active || reportInProgress) return;
      reportInProgress = true;
      try {
        const rssi = await museBluetoothService.readSignalStrength(connectedDevice);
        if (active && rssi !== null) {
          await reportSensorPayload(
            {
              timestamp: new Date().toISOString(),
              device_id: connectedDevice.id,
              sensor_values: { rssi_dbm: rssi },
            },
            authToken
          );
        }
      } catch (error) {
        if (active) {
          console.warn('Could not report Muse sensor data to the backend.', error);
        }
      } finally {
        reportInProgress = false;
      }
    };

    void reportSample();
    const interval = setInterval(() => void reportSample(), 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [authToken, connectedDevice]);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <GluestackUIProvider>
        <NavigationContainer theme={navTheme}>
          {isAuthenticated ? <MainNavigator /> : <AuthNavigator />}
        </NavigationContainer>
      </GluestackUIProvider>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <AppContent />
    </Provider>
  );
}
