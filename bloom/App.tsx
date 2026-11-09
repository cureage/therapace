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
import { museBluetoothService, type MuseDevice } from '@/services/MuseBluetoothService';
import { reportSensorPayload } from '@/services/SensorReportingService';
import { buildMuseEEGPayload, type MuseEEGReading } from '@/services/MuseEEGMeasurement';
import { OnboardingNavigator } from '@/navigators/OnboardingNavigator';
import { ConquerNavigator } from './navigators/ConquerNavigator';


const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: 'transparent',
  },
};

function AppContent() {
  const isAuthenticated = useAppSelector((state) => state.user.isAuthenticated);
  const isConquering = useAppSelector((state) => state.user.isConquering);
  const authToken = useAppSelector((state) => state.user.authToken);
  const [connectedDevice, setConnectedDevice] = useState<MuseDevice | null>(null);

  useEffect(() => {
    return museBluetoothService.subscribeToConnection(setConnectedDevice);
  }, []);

  useEffect(() => {
    if (!connectedDevice || !authToken) return;

    let active = true;
    let reportInProgress = false;
    const pendingReadings: MuseEEGReading[] = [];
    const unsubscribe = museBluetoothService.subscribeToEEG(({ reading, error }) => {
      if (reading) pendingReadings.push(reading);
      if (error) console.warn('Muse EEG stream error.', error);
    });

    const reportSample = async () => {
      if (!active || reportInProgress) return;
      reportInProgress = true;
      const readings = pendingReadings.splice(0);
      try {
        let rssi: number | null = null;
        try {
          rssi = await museBluetoothService.readSignalStrength(connectedDevice);
        } catch (error) {
          if (active) console.warn('Could not read the Muse signal strength.', error);
        }
        if (active && (rssi !== null || readings.length > 0)) {
          const payload = buildMuseEEGPayload(connectedDevice.id, readings, rssi);
          console.info(
            '[Muse sensor payload sent to backend]\n%s',
            JSON.stringify(payload, null, 2)
          );
          await reportSensorPayload(payload, authToken);
        }
      } catch (error) {
        if (active) {
          console.warn('Could not report Muse EEG sensor data to the backend.', error);
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
      unsubscribe();
    };
  }, [authToken, connectedDevice]);

  const isOnboarding = useAppSelector((state) => state.user.isOnboarding);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <GluestackUIProvider>
        <NavigationContainer theme={navTheme}>
          {isAuthenticated ? (
            isConquering ? (
              <ConquerNavigator />
            ) : (
              <MainNavigator />
            )
          ) : isOnboarding ? (
            <OnboardingNavigator />
          ) : (
            <AuthNavigator />
          )}
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
