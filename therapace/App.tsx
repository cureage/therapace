import { ScreenContent } from 'components/ScreenContent';
import { StatusBar } from 'expo-status-bar';

// import './global.css';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import '@/global.css';

export default function App() {
  return (
    <GluestackUIProvider mode="dark">
      <SafeAreaProvider>
      <ScreenContent title="Home" path="App.tsx"></ScreenContent>
      <StatusBar style="auto" />
    </SafeAreaProvider>
    </GluestackUIProvider>
  
  );
}
