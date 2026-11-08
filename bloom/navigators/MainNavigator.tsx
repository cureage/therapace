import { Home } from '@/components/Home';
import { Profile } from '@/components/Profile';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavBar } from '@/components/NavBar';
import { Leaderboard } from '@/components/Leaderboard';
import { Conquer } from '@/components/Conquer';
import { Settings } from '@/components/Settings';

const MainTabs = createBottomTabNavigator();

export function MainNavigator() {
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
      <MainTabs.Screen name="Settings" component={Settings} />
    </MainTabs.Navigator>
  );
}
