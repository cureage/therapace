import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StyledView } from '@/components/StyledView';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { useAppSelector } from '@/store/hooks';

export const Welcome = () => {
  const navigation = useNavigation();
  const name = useAppSelector((state) => state.user.currentUser?.name ?? 'friend').split(' ')[0];

  return (
    <StyledView className="justify-between">
      <View className="mt-5 flex-row items-center gap-2">
        <View className="bg-primary h-2 w-8 rounded-full" />
        {[2, 3, 4, 5].map((step) => (
          <View key={step} className="h-2 w-2 rounded-full bg-neutral-200" />
        ))}
      </View>
      <View className="items-center px-2">
        <View className="bg-primary/10 mb-8 h-44 w-44 items-center justify-center rounded-full">
          <View className="bg-primary/20 h-28 w-28 items-center justify-center rounded-full">
            <View className="bg-primary h-16 w-16 rounded-full" />
          </View>
        </View>
        <Text className="text-primary mb-3 font-semibold tracking-widest uppercase">
          A gentle beginning
        </Text>
        <Heading size="3xl" className="text-center text-foreground">
          Welcome, {name}.
        </Heading>
        <Text size="lg" className="mt-4 max-w-md text-center leading-7 text-muted-foreground">
          Let's learn more about you so we can create an experience that feels personal, safe, and
          at your pace.
        </Text>
      </View>
      <Button size="lg" onPress={() => navigation.navigate('Fears' as never)}>
        <ButtonText className="text-white">Let's begin</ButtonText>
      </Button>
    </StyledView>
  );
};
