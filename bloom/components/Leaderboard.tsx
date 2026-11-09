import { useState } from 'react';
import { StyledView } from '@/components/StyledView';
import { Heading } from '@/components/ui/heading';
import { useQuery } from '@tanstack/react-query';
import { ScrollView, View } from 'react-native';
import { Text } from './ui/text';
import { ProfilePicture } from './ProfilePicture';
import { Icon } from './ui/icon';
import { Shield, Flame } from 'lucide-react-native';
import { Table, TableBody, TableRow, TableData } from '@/components/ui/table';
import { useAppSelector } from '@/store/hooks';
import { ButtonGroup, Button, ButtonText } from './ui/button';
import {
  fetchLeaderboard,
  type LeaderboardEntry,
  type LeaderboardSort,
} from '@/services/LeaderboardService';

const TopLeader = ({
  user,
  index,
  myUserId,
}: {
  user: LeaderboardEntry;
  index: number;
  myUserId?: string;
}) => {
  const size = index === 0 ? 125 : 100;
  return (
    <View
      className={`flex items-center justify-center gap-2 p-3 ${user.id === myUserId ? 'bg-primary/10 rounded-lg' : ''}`}>
      <ProfilePicture name={user?.name} size={size} />
      <Heading>{user?.name}</Heading>
      <View className="flex items-center justify-center gap-2">
        <View className="flex-row items-center gap-1">
          <Icon as={Shield} size="xs" />
          <Text className="text-xs">{user?.conquered} fears conquered</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Icon as={Flame} size="xs" />
          <Text className="text-xs">{user?.streak}-day streak</Text>
        </View>
      </View>
    </View>
  );
};

const LeaderRow = ({
  user,
  index,
  myUserId,
}: {
  user: LeaderboardEntry;
  index: number;
  myUserId?: string;
}) => {
  const isCurrentUser = user.id === myUserId;
  return (
    <TableRow className={`flex flex-row gap-4 ${isCurrentUser ? 'bg-primary/10 rounded-lg' : ''}`}>
      <TableData className="flex-[2] text-sm">#{index + 1}</TableData>
      <TableData className={`flex-[4] text-sm ${isCurrentUser ? 'text-primary font-bold' : ''}`}>
        {user.name}
        {isCurrentUser ? ' (You)' : ''}
      </TableData>
      <TableData className="flex-[2] flex-row items-center">
        <Icon as={Shield} size="xs" className="translate-y-[1px]" />
        <Text className="text-sm">{user?.conquered}</Text>
      </TableData>
      <TableData className="flex-[2] flex-row items-center">
        <Icon as={Flame} size="xs" className="translate-y-[1px]" />
        <Text className="text-sm">{user?.streak}</Text>
      </TableData>
    </TableRow>
  );
};

export const Leaderboard = () => {
  const [sortBy, setSortBy] = useState<LeaderboardSort>('streak');
  const currentUser = useAppSelector((state) => state.user.currentUser);
  const authToken = useAppSelector((state) => state.user.authToken);
  const userId = currentUser?.id;
  const { data, isLoading, isError } = useQuery({
    queryKey: ['leaderboard', sortBy, userId],
    queryFn: () => {
      if (!authToken) throw new Error('Sign in to load the leaderboard.');
      return fetchLeaderboard(sortBy, authToken);
    },
    enabled: Boolean(authToken),
    staleTime: 60 * 1000, // treat data as fresh for 60s
  });
  const entries = data ?? [];
  const currentEntry = entries.find((entry) => entry.id === userId);

  return (
    <StyledView className="flex h-full flex-col justify-between">
      <Heading className="text-4xl font-bold">Leaderboard</Heading>
      <ButtonGroup flexDirection="row" className="w-full pt-4">
        <Button
          className="flex-1"
          variant={sortBy === 'streak' ? 'default' : 'outline'}
          onPress={() => setSortBy('streak')}>
          <ButtonText className={sortBy === 'streak' ? 'text-white' : undefined}>Streak</ButtonText>
        </Button>
        <Button
          className="flex-1"
          variant={sortBy === 'conquered' ? 'default' : 'outline'}
          onPress={() => setSortBy('conquered')}>
          <ButtonText className={sortBy === 'conquered' ? 'text-white' : undefined}>
            Fears conquered
          </ButtonText>
        </Button>
      </ButtonGroup>
      <View className="min-h-0 flex-1 pt-4">
        {!authToken ? (
          <Text className="text-center">Sign in to view the leaderboard.</Text>
        ) : isLoading ? (
          <Text className="text-center">Loading leaderboard...</Text>
        ) : isError ? (
          <Text className="text-center">Could not load the leaderboard. Please try again.</Text>
        ) : entries.length === 0 ? (
          <Text className="text-center">No leaderboard activity yet.</Text>
        ) : entries.length >= 3 ? (
          <View className="flex w-full flex-row justify-around">
            {[1, 0, 2].map((index) => {
              const user = entries[index];
              return user ? (
                <TopLeader key={user.id} user={user} index={index} myUserId={userId} />
              ) : null;
            })}
          </View>
        ) : null}
        <ScrollView className="flex-1">
          <Table className="w-full">
            <TableBody>
              {(entries.length >= 3 ? entries.slice(3) : entries).map((item, index) => (
                <LeaderRow
                  key={item.id}
                  user={item}
                  index={index + (entries.length >= 3 ? 3 : 0)}
                  myUserId={userId}
                />
              ))}
            </TableBody>
          </Table>
        </ScrollView>
      </View>
      {currentUser ? (
        <View className="border-primary/20 bg-primary/10 mt-4 rounded-xl border p-4">
          <Text className="mb-3 text-base font-semibold">You</Text>
          <View className="flex-row gap-4">
            <View className="flex-row items-center gap-2">
              <Icon as={Flame} className="text-accent" />
              <Text>{currentEntry?.streak ?? currentUser.streak} day streak</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Icon as={Shield} className="text-primary" />
              <Text>
                {currentEntry?.conquered ?? currentUser.numConquered ?? 0} fears conquered
              </Text>
            </View>
          </View>
        </View>
      ) : null}
    </StyledView>
  );
};
