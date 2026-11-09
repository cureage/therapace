import './global.css';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';
import { store } from './store/store';
import { useAppSelector } from './store/hooks';
import { AuthNavigator } from '@/navigators/AuthNavigator';
import { MainNavigator } from '@/navigators/MainNavigator';
import { OnboardingNavigator } from '@/navigators/OnboardingNavigator';
import { ConquerNavigator } from './navigators/ConquerNavigator';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';


const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: 'transparent',
  },
};

const queryClient = new QueryClient();

function AppContent() {
  const isAuthenticated = useAppSelector((state) => state.user.isAuthenticated);
  const isConquering = useAppSelector((state) => state.user.isConquering);
  const isOnboarding = useAppSelector((state) => state.user.isOnboarding);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <GluestackUIProvider>
        <QueryClientProvider client={queryClient}>
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
        </QueryClientProvider>
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
