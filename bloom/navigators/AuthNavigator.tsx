import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Landing } from '@/components/Landing';
import { Login } from '@/components/Login';
import { Signup } from '@/components/Signup';

const AuthStack = createNativeStackNavigator();

export function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Landing" component={Landing} />
      <AuthStack.Screen name="Login" component={Login} />
      <AuthStack.Screen name="Signup" component={Signup} />
    </AuthStack.Navigator>
  );
}
