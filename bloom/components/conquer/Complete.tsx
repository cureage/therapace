import { useRoute } from '@react-navigation/native';
import { ScrollView, View } from 'react-native';
import { StyledView } from '@/components/StyledView';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import type { SessionAnalysis } from '@/services/SessionAnalysis';
import { useAppDispatch } from '@/store/hooks';
import { endConquer } from '@/store/slices/userSlice';

const GOOD_JOB_MESSAGES = [
  'Great job facing your fear!',
  'You did it—well done!',
  'Amazing work, you showed real courage!',
  'Look at you—one brave step forward!',
  'You should be proud of yourself!',
];

const GOOD_JOB_MESSAGE = GOOD_JOB_MESSAGES[Math.floor(Math.random() * GOOD_JOB_MESSAGES.length)];
const NEXT_TIME_MESSAGES = [
  'That was a brave start—try again when you feel ready.',
  'Every step counts, and your next attempt will be worth it.',
  'Be kind to yourself. There is always another chance to try.',
  'You listened to yourself today. We can take the next step together another time.',
];

const NEXT_TIME_MESSAGE = NEXT_TIME_MESSAGES[Math.floor(Math.random() * NEXT_TIME_MESSAGES.length)];

type CompleteParams = { cancelled?: boolean; analysis?: SessionAnalysis | null };

const Stat = ({ label, value, detail }: { label: string; value: string; detail: string }) => (
  <View className="bg-primary/10 flex-1 rounded-xl p-3">
    <Text className="text-xs font-semibold tracking-widest text-neutral-600 uppercase">
      {label}
    </Text>
    <Text className="text-primary mt-1 text-2xl font-bold">{value}</Text>
    <Text className="text-xs text-neutral-500">{detail}</Text>
  </View>
);

const SessionResults = ({ analysis }: { analysis: SessionAnalysis }) => {
  const { heart_rate: heart, fear, notes } = analysis;
  const timeline = fear?.timeline ?? [];
  return (
    <View className="bg-area-foreground mt-8 w-full gap-4 rounded-2xl p-4 shadow-md">
      <Text className="font-semibold tracking-widest uppercase">How your body responded</Text>
      {heart || fear ? (
        <View className="flex-row gap-3">
          {heart ? (
            heart.change_bpm === null || heart.baseline_bpm === null ? (
              <Stat
                label="Heart rate"
                value={`${Math.round(heart.exposure_mean_bpm)}`}
                detail="bpm average"
              />
            ) : (
              <Stat
                label="Heart rate"
                value={`${heart.change_bpm >= 0 ? '+' : ''}${Math.round(heart.change_bpm)}`}
                detail={`bpm vs. ${Math.round(heart.baseline_bpm)} calm`}
              />
            )
          ) : null}
          {fear ? (
            <>
              <Stat
                label="Peak fear"
                value={`${Math.round((fear.max_p_fear_smoothed ?? 0) * 100)}%`}
                detail="estimated"
              />
              <Stat
                label="In fear"
                value={`${Math.round(fear.pct_windows_fear ?? 0)}%`}
                detail="of the video"
              />
            </>
          ) : null}
        </View>
      ) : null}
      {fear && timeline.length > 1 ? (
        <View>
          <Text className="mb-2 text-sm text-neutral-600">Estimated fear during the video</Text>
          <View className="h-20 flex-row items-end gap-1">
            {timeline.map((point) => (
              <View
                key={point.seconds}
                className={`flex-1 rounded-t-md ${
                  point.p_fear >= fear.threshold ? 'bg-primary' : 'bg-primary/40'
                }`}
                style={{ height: `${Math.max(point.p_fear * 100, 4)}%` as const }}
              />
            ))}
          </View>
          <View className="mt-1 flex-row justify-between">
            <Text className="text-xs text-neutral-500">Start</Text>
            <Text className="text-xs text-neutral-500">End</Text>
          </View>
        </View>
      ) : null}
      {notes.map((note) => (
        <Text key={note} className="text-sm text-neutral-600">
          {note}
        </Text>
      ))}
    </View>
  );
};

export const Complete = () => {
  const dispatch = useAppDispatch();
  const route = useRoute();
  const params = route.params as CompleteParams | undefined;
  const wasCancelled = params?.cancelled === true;
  const analysis = params?.analysis ?? null;

  return (
    <StyledView>
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow items-center justify-center px-2 py-6"
        showsVerticalScrollIndicator={false}>
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
        {analysis ? <SessionResults analysis={analysis} /> : null}
      </ScrollView>
      <Button size="lg" onPress={() => dispatch(endConquer())}>
        <ButtonText className="text-white">Back to my fears</ButtonText>
      </Button>
    </StyledView>
  );
};
