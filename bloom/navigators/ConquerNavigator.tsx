import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Preparation } from '@/components/conquer/Preparation';
import { Conquer } from '@/components/conquer/Conquer';
import { Complete } from '@/components/conquer/Complete';

const ConquerStack = createNativeStackNavigator();

export function ConquerNavigator() {
  return (
    <ConquerStack.Navigator screenOptions={{ headerShown: false, gestureEnabled: false, animation: 'fade' }}>
      <ConquerStack.Screen name="Preparation" component={Preparation} />
      <ConquerStack.Screen name="ConquerProcess" component={Conquer} />
      <ConquerStack.Screen name="Complete" component={Complete} />
    </ConquerStack.Navigator>
  );
}
