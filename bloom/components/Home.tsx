import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { StyledView } from './StyledView';
import { Text } from './ui/text';
import { ActivityIndicator, View } from 'react-native';
import { Heading } from '@/components/ui/heading';
import { useAppSelector } from '@/store/hooks';
import { Flame, ShieldCheck } from 'lucide-react-native';
import { Icon } from './ui/icon';
import { Card } from './ui/card';
import { ProfilePicture } from './ProfilePicture';

type DailyFearSessions = {
  date: string;
  sessions: number;
};

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
  const [quote] = useState(() => COURAGE_QUOTES[Math.floor(Math.random() * COURAGE_QUOTES.length)]);
  const {
    data = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['weeklyFearSessions'],
    queryFn: fetchWeeklyFearSessions,
  });
  const today = new Date();
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6 + index);
    const dateKey = getDateKey(date);
    return {
      date,
      sessions: data.find((entry) => entry.date === dateKey)?.sessions ?? 0,
    };
  });
  const maxSessions = Math.max(1, ...week.map((day) => day.sessions));

  async function fetchWeeklyFearSessions(): Promise<DailyFearSessions[]> {
    // Replace the sample data with a backend request once the endpoint is available.
    // const response = await fetch(endpoints.progress);
    // if (!response.ok) throw new Error('Failed to fetch weekly fear sessions');
    // return response.json();
    const sampleSessions = [1, 0, 2, 1, 3, 0, 2];
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6 + index);
      return {
        date: getDateKey(date),
        sessions: sampleSessions[index] ?? 0,
      };
    });
  }

  return (
    <StyledView className="flex h-full flex-col gap-4">
      <Heading className="text-4xl font-bold">
        {user?.name ? `Hi, ${user.name} 👋` : `Welcome back 👋`}
      </Heading>
      <View className="flex items-center justify-center gap-2">
        <ProfilePicture name={user?.name} className="!h-36 !w-36" />
        <Text className="text-sm font-medium text-neutral-500 uppercase">Your Current Journey</Text>
      </View>
      <View className="flex flex-row justify-between">
        <Card className="flex w-[49%] flex-row">
          <View className="flex items-center justify-center">
            <Icon as={Flame} className="text-accent" />
          </View>
          <View>
            <Heading>{user?.streak} days</Heading>
            <Text className="text-sm text-neutral-500">Current Streak</Text>
          </View>
        </Card>
        <Card className="flex w-[49%] flex-row">
          <View className="flex items-center justify-center">
            <Icon as={ShieldCheck} className="text-primary" />
          </View>
          <View>
            <Heading>{user?.numConquered} fears</Heading>
            <Text className="text-sm text-neutral-500">Conquered</Text>
          </View>
        </Card>
      </View>

      <Card>
        <Text className="mb-3 font-semibold tracking-widest uppercase">Your Progress</Text>
        {isLoading ? (
          <ActivityIndicator accessibilityLabel="Loading weekly progress" />
        ) : isError ? (
          <Text className="text-center text-neutral-500">Could not load your weekly progress.</Text>
        ) : (
          <View className="flex-row items-end justify-between gap-2">
            {week.map(({ date, sessions }) => (
              <View key={getDateKey(date)} className="flex-1 items-center gap-2">
                <Text className="text-xs text-neutral-600">{sessions}</Text>
                <View className="h-28 w-full justify-end overflow-hidden rounded-t-md bg-area-foreground">
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
        <Text className="text-center text-xs text-neutral-500">Fear sessions per day</Text>
      </Card>
      <Card className="items-center gap-1">
        <Text className="text-primary text-2xl">“</Text>
        <Text className="text-center font-medium italic">{quote}</Text>
        <Text className="text-xs text-primary">—</Text>
      </Card>
    </StyledView>
  );
};
