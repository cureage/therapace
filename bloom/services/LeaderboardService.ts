import { endpoints, getApiUrl } from '@/utils/constants';

export type LeaderboardSort = 'streak' | 'conquered';

export type LeaderboardEntry = {
  id: string;
  name: string;
  conquered: number;
  streak: number;
};

type ApiLeaderboardEntry = {
  id: number;
  name: string;
  conquered: number;
  streak: number;
};

function isApiLeaderboardEntry(value: unknown): value is ApiLeaderboardEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'number' &&
    typeof entry.name === 'string' &&
    typeof entry.conquered === 'number' &&
    typeof entry.streak === 'number'
  );
}

export async function fetchLeaderboard(
  sort: LeaderboardSort,
  token: string
): Promise<LeaderboardEntry[]> {
  const url = `${getApiUrl(endpoints.leaderboard)}?sort=${encodeURIComponent(sort)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Token ${token}` },
  });
  const result: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`Could not load the leaderboard (HTTP ${response.status}).`);
  }
  if (!Array.isArray(result) || !result.every(isApiLeaderboardEntry)) {
    throw new Error('The leaderboard response was invalid.');
  }

  return result.map(({ id, name, conquered, streak }) => ({
    id: String(id),
    name,
    conquered,
    streak,
  }));
}
