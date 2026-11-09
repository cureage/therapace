import { StyledView } from './StyledView';
import { Button, ButtonText } from './ui/button';
import { Text } from './ui/text';
import { View } from 'react-native';
import { Heading } from '@/components/ui/heading';
import { useAppSelector } from '@/store/hooks';

export const Home = () => {
  const user = useAppSelector((state) => state.user.currentUser);
  return (
    <StyledView className="flex h-full flex-col gap-4">
      <Heading className="text-4xl font-bold">
        {user?.name ? `Hi, ${user.name} 👋` : `Welcome back 👋`}
      </Heading>
      <View className="bg-area-foreground rounded-lg p-4 shadow-md">
        <Text className="mb-3 font-semibold tracking-widest uppercase">Your Streak</Text>
        <Heading className="text-primary text-6xl font-semibold">
          {user?.streak ? user.streak : 0}
          <Heading className="text-xl font-semibold">{user?.streak !== null ? (user?.streak !== 1 ? ' days' : ' day') : null}</Heading>
        </Heading>
        {user?.streak === 0 ? (
          <Button>
            <ButtonText className='text-white'>
              Increase Streak
            </ButtonText>
          </Button>
        ) : null}
      </View>
      <View className="bg-area-foreground rounded-lg p-4 shadow-md">
        <Text className="mb-3 font-semibold tracking-widest uppercase">Your Progress</Text>
      </View>
    </StyledView>
  );
};
