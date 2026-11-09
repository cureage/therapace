import { getApiUrl } from '@/utils/constants';

/** Result of POST /api/sessions/{id}/analysis/: calm baseline vs the exposure video. */
export type SessionAnalysis = {
  session_id: number;
  baseline_seconds: number | null;
  exposure_seconds: number | null;
  heart_rate: {
    baseline_bpm: number | null;
    exposure_mean_bpm: number;
    exposure_max_bpm: number;
    change_bpm: number | null;
  } | null;
  /** Estimated by the EEG fear model; null without enough Muse data. */
  fear: {
    threshold: number;
    mean_p_fear: number | null;
    max_p_fear_smoothed: number | null;
    /** 0–100 */
    pct_windows_fear: number | null;
    timeline: {
      seconds: number;
      p_fear: number;
      p_fear_smoothed: number;
      heart_rate_bpm: number | null;
    }[];
  } | null;
  /** Why something could not be measured, for the user. */
  notes: string[];
};

/** Analyze an uploaded session. Call after saveSession has finished. */
export async function analyzeSession(sessionId: number, token: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(getApiUrl(`/api/sessions/${sessionId}/analysis/`), {
      method: 'POST',
      headers: { Authorization: `Token ${token}` },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Could not analyze the session (HTTP ${response.status}).`);
    return (await response.json()) as SessionAnalysis;
  } finally {
    clearTimeout(timeout);
  }
}
