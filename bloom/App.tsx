import './global.css';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { Landing } from './components/Landing';
import { Login } from './components/Login';
import { Signup } from './components/Signup';
import { Home } from './components/Home';
import { Profile } from './components/Profile';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';
import { store } from './store/store';
import { useAppSelector } from './store/hooks';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavBar } from './components/NavBar';
import { Leaderboard } from './components/Leaderboard';
import { Conquer } from './components/Conquer';

const AuthStack = createNativeStackNavigator();
const AppStack = createNativeStackNavigator();
const MainTabs = createBottomTabNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: 'transparent',
  },
};

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Landing" component={Landing} />
      <AuthStack.Screen name="Login" component={Login} />
      <AuthStack.Screen name="Signup" component={Signup} />
    </AuthStack.Navigator>
  );
}

function MainNavigator() {
  return (
    <MainTabs.Navigator
      screenOptions={{
        headerShown: false,
      }}
      tabBar={(props) => <NavBar {...props} />}>
      <MainTabs.Screen name="Home" component={Home} />
      <MainTabs.Screen name="Conquer" component={Conquer} />
      <MainTabs.Screen name="Profile" component={Profile} />
      <MainTabs.Screen name="Leaderboard" component={Leaderboard} />
    </MainTabs.Navigator>
  );
}

function AppContent() {
  const isAuthenticated = useAppSelector((state) => state.user.isAuthenticated);

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
