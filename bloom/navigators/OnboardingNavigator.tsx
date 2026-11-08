import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Welcome } from '@/components/onboarding/Welcome';
import { Fears } from '@/components/onboarding/Fears';
import { Overview } from '@/components/onboarding/Overview';
import { DeviceSetup } from '@/components/onboarding/DeviceSetup';
import { Video } from '@/components/onboarding/Video';

const AuthStack = createNativeStackNavigator();

export function OnboardingNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Welcome" component={Welcome} />
      <AuthStack.Screen name="Fears" component={Fears} />
      <AuthStack.Screen name="Overview" component={Overview} />
      <AuthStack.Screen name="DeviceSetup" component={DeviceSetup} />
      <AuthStack.Screen name="Video" component={Video} />
    </AuthStack.Navigator>
  );
}
