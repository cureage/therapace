import { useState } from 'react';
import { StyledView } from '@/components/StyledView';
import { Heading } from '@/components/ui/heading';
import { useQuery } from '@tanstack/react-query';
import { endpoints, getApiUrl } from '@/utils/constants';
import { ScrollView, View } from 'react-native';
import { Text } from './ui/text';
import { ProfilePicture } from './ProfilePicture';
import { Icon } from './ui/icon';
import { Shield, Flame } from 'lucide-react-native';
import { Table, TableBody, TableRow, TableData } from '@/components/ui/table';
import { useAppSelector } from '@/store/hooks';
import { ButtonGroup, Button, ButtonText } from './ui/button';

type LeaderboardSort = 'streak' | 'conquered';

type LeaderboardEntry = {
  id: string;
  name: string;
  conquered: number;
  streak: number;
};

const TopLeader = ({
  user,
  index,
  myUserId,
}: {
  user: LeaderboardEntry;
  index: number;
  myUserId?: string;
}) => {
  const sizeClasses = index === 0 ? '!h-28 !w-28' : '!h-24 !w-24';
  return (
    <View
      className={`flex items-center justify-center gap-2 p-3 ${user.id === myUserId ? 'bg-primary/10 rounded-lg' : ''}`}>
      <ProfilePicture className={sizeClasses} />
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

const LeaderRow = ({ user, index }: { user: LeaderboardEntry; index: number; myUserId: any }) => {
  return (
    <TableRow className={`flex flex-row gap-4`}>
      <TableData className="flex-[1] text-sm">#{index + 1}</TableData>
      <TableData className="flex-[4] text-sm">{user.name}</TableData>
      <TableData className="flex-[2] flex-row items-center">
        <Icon as={Shield} size="xs" />
        <Text className="text-sm">{user?.conquered}</Text>
      </TableData>
      <TableData className="flex-[2] flex-row items-center">
        <Icon as={Flame} size="xs" />
        <Text className="text-sm">{user?.streak}</Text>
      </TableData>
    </TableRow>
  );
};

export const Leaderboard = () => {
  const [sortBy, setSortBy] = useState<LeaderboardSort>('streak');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['leaderboard', sortBy],
    queryFn: () => fetchLeaderboard(sortBy),
    staleTime: 60 * 1000, // treat data as fresh for 60s
  });
  const entries = data ?? [];
  const currentUser = useAppSelector((state) => state.user.currentUser);
  const userId = currentUser?.id;

  async function fetchLeaderboard(sort: LeaderboardSort): Promise<LeaderboardEntry[]> {
    // const url = `${getApiUrl(endpoints.leaderboard)}?sort=${encodeURIComponent(sort)}`;
    // const response = await fetch(url);
    // if (!response.ok) {
    //   throw new Error(`Failed to fetch leaderboard (${response.status})`);
    // }
    // return response.json();
    if (sort == 'streak') {
      return [
        { name: 'Chidi', id: '10', conquered: 10, streak: 342 },
        { name: 'Yuki', id: '7', conquered: 8, streak: 301 },
        { name: 'Priya', id: '3', conquered: 9, streak: 214 },
        { name: 'Lena', id: '5', conquered: 7, streak: 156 },
        { name: 'Liam', id: '12', conquered: 5, streak: 128 },
        { name: 'Ahmed', id: '1', conquered: 11, streak: 100 },
        { name: 'Tammy', id: '2', conquered: 5, streak: 87 },
        { name: 'Oliver', id: '9', conquered: 6, streak: 73 },
        { name: 'Diego', id: '6', conquered: 4, streak: 45 },
        { name: 'Marcus', id: '4', conquered: 3, streak: 12 },
        { name: 'Fatima', id: '8', conquered: 2, streak: 9 },
        { name: 'Sofia', id: '11', conquered: 1, streak: 4 },
      ];
    }
    return [
      { name: 'Ahmed', id: '1', conquered: 11, streak: 100 },
      { name: 'Chidi', id: '10', conquered: 10, streak: 342 },
      { name: 'Priya', id: '3', conquered: 9, streak: 214 },
      { name: 'Yuki', id: '7', conquered: 8, streak: 301 },
      { name: 'Lena', id: '5', conquered: 7, streak: 156 },
      { name: 'Oliver', id: '9', conquered: 6, streak: 73 },
      { name: 'Liam', id: '12', conquered: 5, streak: 128 },
      { name: 'Tammy', id: '2', conquered: 5, streak: 87 },
      { name: 'Diego', id: '6', conquered: 4, streak: 45 },
      { name: 'Marcus', id: '4', conquered: 3, streak: 12 },
      { name: 'Fatima', id: '8', conquered: 2, streak: 9 },
      { name: 'Sofia', id: '11', conquered: 1, streak: 4 },
    ];
  }

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
        {isLoading ? (
          <Text className="text-center">Loading leaderboard...</Text>
        ) : isError ? (
          <Text className="text-center">Could not load the leaderboard. Please try again.</Text>
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
              <Text>{currentUser.streak} day streak</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Icon as={Shield} className="text-primary" />
              <Text>{currentUser.numConquered ?? 0} fears conquered</Text>
            </View>
          </View>
        </View>
      ) : null}
    </StyledView>
  );
};
