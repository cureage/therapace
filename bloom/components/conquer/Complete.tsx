import { useRoute } from '@react-navigation/native';
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
const NEXT_TIME_MESSAGES = [
  'That was a brave start—try again when you feel ready.',
  'Every step counts, and your next attempt will be worth it.',
  'Be kind to yourself. There is always another chance to try.',
  'You listened to yourself today. We can take the next step together another time.',
];

const NEXT_TIME_MESSAGE = NEXT_TIME_MESSAGES[Math.floor(Math.random() * NEXT_TIME_MESSAGES.length)];

export const Complete = () => {
  const dispatch = useAppDispatch();
  const route = useRoute();
  const wasCancelled = (route.params as { cancelled?: boolean } | undefined)?.cancelled === true;

  return (
    <StyledView className="justify-between">
      <View className="items-center px-2 top-1/4">
        <View className="bg-primary/10 mb-8 h-32 w-32 items-center justify-center rounded-full">
          <View className="bg-primary h-20 w-20 items-center justify-center rounded-full">
            <Text className="text-3xl text-white">✓</Text>
          </View>
        </View>
        <Heading size="3xl" className="text-center text-foreground">
          {wasCancelled ? NEXT_TIME_MESSAGE : GOOD_JOB_MESSAGE}
        </Heading>
        <Text size="lg" className="mt-4 text-center leading-7 text-muted-foreground">
          {wasCancelled
            ? 'You can pause without judgment. Take care of yourself, and come back whenever you feel ready.'
            : 'You showed courage by taking this step. Every exposure helps you build confidence and become more comfortable facing your fears.'}
        </Text>
        <View className="bg-primary/10 mt-6 rounded-full px-5 py-3">
          <Text className="text-primary font-semibold">
            {wasCancelled ? 'Partial session saved' : 'Session complete'}
          </Text>
        </View>
      </View>
      <Button size="lg" onPress={() => dispatch(endConquer())}>
        <ButtonText className="text-white">Back to my fears</ButtonText>
      </Button>
    </StyledView>
  );
};
