const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');

export const endpoints = {
  login: '/api/auth/login/',
  sensorIngest: '/api/sensors/',
  signup: '/api/auth/register/',
  leaderboard: '/api/leaderboard',
  progress: '/api/progress',
  videos: '/api/videos/',
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

// Conquer page choices: exposure intensity (1 = gentle … 5 = intense) and session length.
export const CONQUER_INTENSITY = { min: 1, max: 5, default: 1 };
export const CONQUER_DURATION_SECONDS = { min: 3, max: 60, default: 10 };
// Gemini generates clips of at most 15 seconds; longer sessions loop the clip.
export const GENERATED_CLIP_MAX_SECONDS = 15;
