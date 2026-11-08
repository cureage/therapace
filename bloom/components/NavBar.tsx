import { Pressable, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Icon } from '@/components/ui/icon';
import { Home, Search, User, Trophy, Settings } from 'lucide-react-native';
import { BloomIconColor, BloomIconMono } from '@/components/BloomIcon';

const ICONS: Record<string, any> = {
  index: Home,
  search: Search,
  profile: User,
  conquer: BloomIconMono,
  leaderboard: Trophy,
  settings: Settings,
};

const FOCUSED_ICONS: Record<string, any> = {
  conquer: BloomIconColor,
};

export function NavBar({ state, descriptors, navigation }: BottomTabBarProps) {
  return (
    <View className="flex-row border-t border-neutral-200 dark:border-neutral-700 bg-white dark:bg-background pt-3 pb-6">
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const { options } = descriptors[route.key];
        const label = options.tabBarLabel ?? options.title ?? route.name;
        const key = route.name.toLowerCase();
        const IconComponent = (focused ? FOCUSED_ICONS[key] : undefined) ?? ICONS[key] ?? Home;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            className="flex-1 items-center justify-center gap-1">
            <Icon
              as={IconComponent}
              size="xl"
              className={focused ? 'text-primary' : 'text-neutral-500'}
            />
            <Text
              className={focused ? 'text-primary text-xs font-medium' : 'text-xs text-neutral-500'}>
              {typeof label === 'string' ? label : route.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
