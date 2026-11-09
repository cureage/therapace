import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { StyledView } from './StyledView';
import { Text } from './ui/text';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Heading } from '@/components/ui/heading';
import { useAppSelector } from '@/store/hooks';
import { Flame, ShieldCheck } from 'lucide-react-native';
import { Icon } from './ui/icon';
import { Card } from './ui/card';
import { ProfilePicture } from './ProfilePicture';
import { HeartRateChart } from '@/components/HeartRateChart';
import { fetchSessionHistory } from '@/services/SessionAnalysis';

const COURAGE_QUOTES = [
  'Courage is taking the next step, even when you cannot see the whole path.',
  'You grow stronger each time you meet a fear with patience.',
  'Bravery is not the absence of fear; it is choosing what matters alongside it.',
  'Every small act of courage makes room for a bigger one.',
  'You do not have to feel ready to begin.',
];

const getDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const Home = () => {
  const user = useAppSelector((state) => state.user.currentUser);
  const token = useAppSelector((state) => state.user.authToken);
  const [quote] = useState(() => COURAGE_QUOTES[Math.floor(Math.random() * COURAGE_QUOTES.length)]);
  const {
    data: sessions = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['sessionHistory', user?.id],
    queryFn: () => {
      if (!token) throw new Error('Sign in to load session history.');
      return fetchSessionHistory(token);
    },
    enabled: !!token,
  });
  const today = new Date();
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6 + index);
    const dateKey = getDateKey(date);
    return {
      date,
      sessions: sessions.filter((session) => {
        const recordedAt = session.started_at ?? session.created_at;
        return getDateKey(new Date(recordedAt)) === dateKey;
      }).length,
    };
  });
  const maxSessions = Math.max(1, ...week.map((day) => day.sessions));
  const analyzedSessions = sessions.filter((session) => session.analysis !== null);

  return (
    <StyledView className="gap-0 px-4 py-6">
      <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-8">
        <Heading className="text-4xl font-bold">
          {user?.name ? `Hi, ${user.name} 👋` : `Welcome back 👋`}
        </Heading>
        <View className="flex items-center justify-center gap-4 pb-4">
          <ProfilePicture name={user?.name} className="!h-36 !w-36" />
          <Text className="text-sm font-medium text-neutral-500 uppercase">
            Your Current Journey
          </Text>
        </View>
        <View className="flex flex-row justify-between">
          <Card className="flex w-[49%] flex-row">
            <View className="flex items-center justify-center">
              <Icon as={Flame} className="text-accent" />
            </View>
            <View>
              <Heading>
                {user?.streak} {user?.streak === 1 ? 'day' : 'days'}
              </Heading>
              <Text className="text-sm text-neutral-500">Current Streak</Text>
            </View>
          </Card>
          <Card className="flex w-[49%] flex-row">
            <View className="flex items-center justify-center">
              <Icon as={ShieldCheck} className="text-primary" />
            </View>
            <View>
              <Heading>
                {user?.numConquered} {user?.numConquered === 1 ? 'fear' : 'fears'}
              </Heading>
              <Text className="text-sm text-neutral-500">Conquered</Text>
            </View>
          </Card>
        </View>

        <Card>
          <Text className="mb-3 font-semibold tracking-widest uppercase">Your Progress</Text>
          {isLoading ? (
            <ActivityIndicator accessibilityLabel="Loading weekly progress" />
          ) : isError ? (
            <Text className="text-center text-neutral-500">
              Could not load your weekly progress.
            </Text>
          ) : (
            <View className="flex-row items-end justify-between gap-2">
              {week.map(({ date, sessions }) => (
                <View key={getDateKey(date)} className="flex-1 items-center gap-2">
                  <Text className="text-xs text-neutral-600">{sessions}</Text>
                  <View className="bg-area-foreground h-28 w-full justify-end overflow-hidden rounded-t-md">
                    <View
                      className="bg-primary w-full rounded-t-md"
                      style={{ height: `${Math.max((sessions / maxSessions) * 100, 4)}%` }}
                    />
                  </View>
                  <Text className="text-xs text-neutral-600">
                    {date.toLocaleDateString(undefined, { weekday: 'short' })}
                  </Text>
                </View>
              ))}
            </View>
          )}
          <Text className="text-center text-xs text-neutral-500">Sessions per day</Text>
        </Card>
        <View className="gap-3">
          <Heading size="lg">Session insights</Heading>
          {isLoading ? (
            <ActivityIndicator accessibilityLabel="Loading session insights" />
          ) : isError ? (
            <Text className="text-center text-neutral-500">
              Could not load your session insights.
            </Text>
          ) : analyzedSessions.length === 0 ? (
            <Text className="text-center text-neutral-500">
              Your completed session insights will appear here.
            </Text>
          ) : (
            analyzedSessions.map((session) => {
              const analysis = session.analysis;
              if (!analysis) return null;
              const startedAt = session.started_at ?? session.created_at;
              const fearName =
                typeof session.session_data.fear === 'string'
                  ? session.session_data.fear
                  : 'Exposure';
              const heart = analysis.heart_rate;
              const fear = analysis.fear;
              return (
                <Card key={session.id} className="gap-4">
                  <View>
                    <Heading size="md">{fearName}</Heading>
                    <Text className="text-sm text-neutral-500">
                      {new Date(startedAt).toLocaleString()} ·{' '}
                      {session.status === 'partial' ? 'Partial session' : 'Completed'}
                    </Text>
                  </View>
                  {heart ? (
                    <View className="gap-2">
                      <View>
                        <Text className="text-primary text-xl font-bold">
                          {Math.round(heart.exposure_mean_bpm)} bpm average during exposure
                        </Text>
                        <Text className="text-sm text-neutral-500">
                          Peak {Math.round(heart.exposure_max_bpm)} bpm
                          {heart.baseline_bpm === null
                            ? ''
                            : ` · calm average ${Math.round(heart.baseline_bpm)} bpm`}
                          {heart.change_bpm === null
                            ? ''
                            : ` · ${heart.change_bpm >= 0 ? '+' : ''}${Math.round(heart.change_bpm)} bpm`}
                        </Text>
                      </View>
                      <HeartRateChart points={heart.timeline} />
                    </View>
                  ) : null}
                  {fear ? (
                    <View className="gap-2">
                      <Text className="font-semibold">Estimated fear</Text>
                      <Text className="text-sm text-neutral-600">
                        Average{' '}
                        {fear.mean_p_fear === null ? '—' : `${Math.round(fear.mean_p_fear * 100)}%`}
                        {' · '}peak{' '}
                        {fear.max_p_fear_smoothed === null
                          ? '—'
                          : `${Math.round(fear.max_p_fear_smoothed * 100)}%`}
                        {' · '}
                        {fear.pct_windows_fear === null
                          ? '—'
                          : `${Math.round(fear.pct_windows_fear)}%`}{' '}
                        of windows above threshold
                      </Text>
                      {fear.timeline.length > 1 ? (
                        <View>
                          <Text className="mb-2 text-sm text-neutral-600">
                            Fear over the exposure
                          </Text>
                          <View className="h-20 flex-row items-end gap-1">
                            {fear.timeline.map((point) => (
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
                      <Text className="text-sm text-neutral-600">
                        Average estimated mood: valence{' '}
                        {fear.affect.mean_valence?.toFixed(2) ?? '—'}, arousal{' '}
                        {fear.affect.mean_arousal?.toFixed(2) ?? '—'}
                      </Text>
                    </View>
                  ) : null}
                  {analysis.notes.map((note) => (
                    <Text key={note} className="text-sm text-neutral-600">
                      {note}
                    </Text>
                  ))}
                </Card>
              );
            })
          )}
        </View>
        <Card className="items-center gap-1">
          <Text className="text-primary text-2xl">“</Text>
          <Text className="text-center font-medium italic">{quote}</Text>
          <Text className="text-primary text-xs">—</Text>
        </Card>
      </ScrollView>
    </StyledView>
  );
};
