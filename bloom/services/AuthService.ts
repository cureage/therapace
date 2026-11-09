import { getApiUrl } from '@/utils/constants';

export async function authenticate(path: string, credentials: object, isOnboarding: boolean) {
  const response = await fetch(getApiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  const result = await response.json();
  if (!response.ok) {
    const message = Object.values(result)
      .flat()
      .find((value) => typeof value === 'string');
    throw new Error(typeof message === 'string' ? message : 'Authentication failed.');
  }
  const user = result.user;
  return {
    id: String(user.id),
    email: user.email,
    name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email,
    isOnboarding,
    streak: user.streak,
    maxStreak: user.max_streak,
    // Keep the existing demo choices available until onboarding persists fears.
    fears: isOnboarding ? [] : ['Spiders', 'Clowns'],
    isConquering: false,
    authToken: result.token as string,
  };
}
