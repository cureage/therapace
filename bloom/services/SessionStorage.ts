import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { PersistedSession, User } from '@/store/slices/userSlice';

const SESSION_KEY = 'bloom.user-session.v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUser(value: unknown): value is User {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === 'string' &&
    typeof value.email === 'string' &&
    typeof value.name === 'string' &&
    typeof value.isOnboarding === 'boolean' &&
    typeof value.streak === 'number' &&
    typeof value.maxStreak === 'number' &&
    Array.isArray(value.fears) &&
    typeof value.isConquering === 'boolean' &&
    (value.conqueringFear === undefined || typeof value.conqueringFear === 'string')
  );
}

function isPersistedSession(value: unknown): value is PersistedSession {
  if (!isRecord(value)) return false;
  return (
    typeof value.authToken === 'string' &&
    typeof value.isOnboarding === 'boolean' &&
    isUser(value.currentUser)
  );
}

async function getStoredValue(): Promise<string | null> {
  if (Platform.OS === 'web') return globalThis.localStorage.getItem(SESSION_KEY);
  return SecureStore.getItemAsync(SESSION_KEY);
}

export async function loadSession(): Promise<PersistedSession | null> {
  const value = await getStoredValue();
  if (value === null) return null;

  const parsed: unknown = JSON.parse(value);
  if (!isPersistedSession(parsed)) {
    throw new Error('Saved session data is invalid.');
  }

  return parsed;
}

export async function saveSession(session: PersistedSession | null): Promise<void> {
  if (session === null) {
    if (Platform.OS === 'web') {
      globalThis.localStorage.removeItem(SESSION_KEY);
      return;
    }
    await SecureStore.deleteItemAsync(SESSION_KEY);
    return;
  }

  const value = JSON.stringify(session);
  if (Platform.OS === 'web') {
    globalThis.localStorage.setItem(SESSION_KEY, value);
    return;
  }
  await SecureStore.setItemAsync(SESSION_KEY, value);
}
