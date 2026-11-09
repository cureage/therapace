import { View } from 'react-native';
import { StyledView } from '@/components/StyledView';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { useAppDispatch } from '@/store/hooks';
import { endConquer } from '@/store/slices/userSlice';

const GOOD_JOB_MESSAGES = [
  'Great job facing your fear!',
  'You did it—well done!',
  'Amazing work, you showed real courage!',
  'Look at you—one brave step forward!',
  'You should be proud of yourself!',
];

const GOOD_JOB_MESSAGE =
  GOOD_JOB_MESSAGES[Math.floor(Math.random() * GOOD_JOB_MESSAGES.length)];

export const Complete = () => {
  const dispatch = useAppDispatch();

  return (
    <StyledView className="justify-between">
      <View className="items-center px-2 top-1/4">
        <View className="bg-primary/10 mb-8 h-32 w-32 items-center justify-center rounded-full">
          <View className="bg-primary h-20 w-20 items-center justify-center rounded-full">
            <Text className="text-3xl text-white">✓</Text>
          </View>
        </View>
        <Heading size="3xl" className="text-center text-neutral-900">
          {GOOD_JOB_MESSAGE}
        </Heading>
        <Text size="lg" className="mt-4 text-center leading-7 text-neutral-600">
          You showed courage by taking this step. Every exposure helps you build confidence and
          become more comfortable facing your fears.
        </Text>
        <View className="bg-primary/10 mt-6 rounded-full px-5 py-3">
          <Text className="text-primary font-semibold">Session complete</Text>
        </View>
      </View>
      <Button size="lg" onPress={() => dispatch(endConquer())}>
        <ButtonText className="text-white">Back to my fears</ButtonText>
      </Button>
    </StyledView>
  );
};
