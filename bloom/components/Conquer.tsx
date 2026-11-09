import { Heading } from '@/components/ui/heading';
import { View, TouchableOpacity, ScrollView } from 'react-native';
import { Text } from '@/components/ui/text';
import { useAppSelector } from '@/store/hooks';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUnstableNativeVariable } from 'nativewind';
import { useAppDispatch } from '@/store/hooks';
import { startConquer } from '@/store/slices/userSlice';

export const Conquer = () => {
  const fears = useAppSelector((state) => state.user.currentUser?.fears || []);
  const backgroundColorStyle = useUnstableNativeVariable('--background');
  const dispatch = useAppDispatch();

  return (
    <SafeAreaView className={`h-full`} style={{ flex: 1, backgroundColor: backgroundColorStyle }}>
      <ScrollView contentContainerClassName="flex h-full flex-col gap-6 bg-background px-4 py-8">
        <View className="items-center px-2">
          <View className="bg-primary/10 mb-8 h-44 w-44 items-center justify-center rounded-full">
            <View className="bg-primary/20 h-28 w-28 items-center justify-center rounded-full">
              <View className="bg-primary h-16 w-16 rounded-full" />
            </View>
          </View>
          <Heading size="3xl" className="text-center">
            Conquer Your Fears
          </Heading>
          <Text size="lg" className="mt-4 max-w-md text-center leading-7 text-muted-foreground">
            Face what scares you, one small step at a time. Exposure therapy helps you build
            confidence by gradually getting used to the things that make you anxious, at a pace that
            feels right for you.
          </Text>
          <Text size="lg" className="mt-4 max-w-md text-center leading-7 text-muted-foreground">
            You're always in control. Pause, slow down, or stop whenever you need to.
          </Text>
          <Text
            size="lg"
            className="mt-4 max-w-md text-center leading-7 font-bold text-muted-foreground">
            What do you want to conquer today?
          </Text>
        </View>
        <View className="gap-3">
          {fears.map((item: any, index: any) => (
            <TouchableOpacity
              key={item}
              className="flex-row items-center rounded-2xl border border-neutral-200 dark:border-neutral-600 bg-area-foreground px-4 py-3"
              onPress={() => {
                dispatch(startConquer(item))
              }}>
              <View className="bg-primary/10 mr-3 h-7 w-7 items-center justify-center rounded-full">
                <Text className="text-primary font-bold">{index + 1}</Text>
              </View>
              <Text className="flex-1 text-base text-neutral-800 dark:text-neutral-200">
                {item}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};
