const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');

export const endpoints = {
  login: '/api/auth/login/',
  sensorIngest: '/api/sensors/',
  signup: '/api/auth/register/',
  leaderboard: '/api/leaderboard',
  progress: '/api/progress'
};

export function getApiUrl(path) {
  if (!API_BASE_URL) {
    throw new Error(
      'Set EXPO_PUBLIC_API_URL to the backend base URL before using Bloom API features.'
    );
  }

  return `${API_BASE_URL}${path}`;
}

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MAX_FEARS = 5;
