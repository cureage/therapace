import './global.css';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { ActivityIndicator, Alert, View } from 'react-native';
import { Provider } from 'react-redux';
import { useEffect, useState } from 'react';
import { store } from './store/store';
import { useAppSelector } from './store/hooks';
import { AuthNavigator } from '@/navigators/AuthNavigator';
import { MainNavigator } from '@/navigators/MainNavigator';
import { OnboardingNavigator } from '@/navigators/OnboardingNavigator';
import { ConquerNavigator } from './navigators/ConquerNavigator';
import { loadSession, saveSession } from '@/services/SessionStorage';
import { restoreSession, type PersistedSession } from '@/store/slices/userSlice';

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: 'transparent',
  },
};

function getPersistedSession(): PersistedSession | null {
  const { currentUser, authToken, isOnboarding } = store.getState().user;
  return currentUser && authToken ? { currentUser, authToken, isOnboarding } : null;
}

function AppContent() {
  const [sessionRestored, setSessionRestored] = useState(false);
  const isAuthenticated = useAppSelector((state) => state.user.isAuthenticated);
  const isConquering = useAppSelector((state) => state.user.isConquering);
  const isOnboarding = useAppSelector((state) => state.user.isOnboarding);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};

    const restoreAndPersistSession = async () => {
      try {
        const session = await loadSession();
        if (!active) return;
        if (session) store.dispatch(restoreSession(session));
      } catch (error) {
        if (active) {
          Alert.alert(
            'Could not restore session',
            error instanceof Error ? error.message : 'Saved session data could not be read.'
          );
        }
      }

      if (!active) return;

      let previousSnapshot = JSON.stringify(getPersistedSession());
      let pendingWrites = Promise.resolve();
      unsubscribe = store.subscribe(() => {
        const session = getPersistedSession();
        const snapshot = JSON.stringify(session);
        if (snapshot === previousSnapshot) return;
        previousSnapshot = snapshot;

        pendingWrites = pendingWrites
          .then(() => saveSession(session))
          .catch((error: unknown) => {
            Alert.alert(
              'Could not save session',
              error instanceof Error ? error.message : 'Your session could not be saved.'
            );
          });
      });
      setSessionRestored(true);
    };

    void restoreAndPersistSession();
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <GluestackUIProvider>
        <NavigationContainer theme={navTheme}>
          {!sessionRestored ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator />
            </View>
          ) : isAuthenticated ? (
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
