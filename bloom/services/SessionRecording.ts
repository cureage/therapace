import { getApiUrl } from '@/utils/constants';
import { fitbitBluetoothService } from './FitbitBluetoothService';
import { museBluetoothService } from './MuseBluetoothService';
import { MUSE_EEG_SAMPLE_RATE_HZ } from './MuseEEGMeasurement';

type Batch =
  | { type: 'heart_rate'; device_id: string; data: { unit: 'bpm'; samples: HeartSample[] } }
  | {
      type: 'eeg';
      device_id: string;
      data: { unit: 'uV'; sampling_rate_hz: number; samples: EEGSample[] };
    };

type HeartSample = { timestamp: string; value: number };
type EEGSample = { timestamp: string; channel: string; sequence_id: number; samples: number[] };
type SavedSession = { id: number; user: { streak: number; max_streak: number } };

// The readings endpoint accepts up to 1000 samples per request.
const UPLOAD_BATCH_SIZE = 1000;
// Calm baseline kept before the video; the backend calibrates on at most the last 2 minutes.
const MAX_BASELINE_MS = 150_000;

const keepSince = <T extends { timestamp: string }>(byDevice: Map<string, T[]>, cutoff: number) => {
  for (const [device, samples] of byDevice) {
    byDevice.set(
      device,
      samples.filter((sample) => Date.parse(sample.timestamp) >= cutoff)
    );
  }
};

/**
 * Records Muse EEG and heart rate. Bloom starts it on the Preparation screen so the calm
 * breathing becomes the session's baseline, and marks when the exposure video starts.
 */
export function startSessionRecording() {
  let startedAt = Date.now();
  let exposureStartedAt: number | null = null;
  const heart = new Map<string, HeartSample[]>();
  const eeg = new Map<string, EEGSample[]>();
  // Muse timestamps come from the native module, so the latest one can be slightly ahead of
  // Date.now(); the session window is widened to include it.
  let lastSampleAt = startedAt;
  let museId: string | undefined;
  const stopConnection = museBluetoothService.subscribeToConnection((device) => {
    museId = device?.id;
  });
  const stopEEG = museBluetoothService.subscribeToEEG(({ reading }) => {
    if (
      !museId ||
      !reading ||
      reading.receivedAt < startedAt ||
      !Number.isFinite(reading.receivedAt)
    )
      return;
    lastSampleAt = Math.max(lastSampleAt, reading.receivedAt);
    const samples = eeg.get(museId) ?? [];
    samples.push({
      timestamp: new Date(reading.receivedAt).toISOString(),
      channel: reading.channel,
      sequence_id: reading.sequenceId,
      samples: reading.samples,
    });
    eeg.set(museId, samples);
  });
  let initialHeartState = true;
  const stopHeart = fitbitBluetoothService.subscribe(({ device, bpm, receivedAt }) => {
    if (initialHeartState) {
      initialHeartState = false;
      return;
    }
    if (!device || bpm === null || receivedAt === null || receivedAt < startedAt) return;
    lastSampleAt = Math.max(lastSampleAt, receivedAt);
    const samples = heart.get(device.id) ?? [];
    samples.push({ timestamp: new Date(receivedAt).toISOString(), value: bpm });
    heart.set(device.id, samples);
  });
  const stop = () => {
    stopHeart();
    stopEEG();
    stopConnection();
  };

  return {
    stop,
    /** Call when the video first plays; readings before this are the calm baseline. */
    markExposureStart() {
      if (exposureStartedAt !== null) return;
      exposureStartedAt = Date.now();
      const cutoff = exposureStartedAt - MAX_BASELINE_MS;
      if (cutoff > startedAt) {
        startedAt = cutoff;
        keepSince(eeg, cutoff);
        keepSince(heart, cutoff);
      }
    },
    finish(partial: boolean, sessionData: Record<string, unknown> = {}) {
      stop();
      // The backend rejects a batch with any sample after ended_at; round up past sub-ms times.
      const endedAt = Math.ceil(Math.max(Date.now(), lastSampleAt));
      const batches: Batch[] = [];
      for (const [device_id, samples] of heart) {
        batches.push({ type: 'heart_rate', device_id, data: { unit: 'bpm', samples } });
      }
      for (const [device_id, samples] of eeg) {
        batches.push({
          type: 'eeg',
          device_id,
          data: { unit: 'uV', sampling_rate_hz: MUSE_EEG_SAMPLE_RATE_HZ, samples },
        });
      }
      return {
        metadata: {
          recording_key: `${startedAt}-${Math.random().toString(36).slice(2)}`,
          status: partial ? 'partial' : 'complete',
          started_at: new Date(startedAt).toISOString(),
          ended_at: new Date(endedAt).toISOString(),
          session_data: {
            ...sessionData,
            ...(exposureStartedAt === null
              ? {}
              : { exposure_started_at: new Date(exposureStartedAt).toISOString() }),
          },
        },
        batches,
        // What the backend has acknowledged, so retrying a failed save skips finished requests.
        progress: { session: null as SavedSession | null, sentChunks: new Set<string>() },
      };
    },
  };
}

export type SessionRecording = ReturnType<typeof startSessionRecording>;
export type CapturedSession = ReturnType<SessionRecording['finish']>;

let handedOff: SessionRecording | null = null;

/** The Preparation screen passes its running recording to the video screen. */
export function handOffRecording(recording: SessionRecording) {
  if (handedOff !== recording) handedOff?.stop();
  handedOff = recording;
}

export function takeHandedOffRecording() {
  const recording = handedOff;
  handedOff = null;
  return recording;
}

async function post(path: string, body: object, token: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(getApiUrl(path), {
      method: 'POST',
      headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Could not save the session (HTTP ${response.status}).`);
    return await response.json();
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The upload timed out. Try saving again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Upload a finished recording: the session first, then its readings in chunks. Calling this
 * again after a failure resumes where it stopped (the backend also ignores duplicate samples).
 */
export async function saveSession(recording: CapturedSession, token: string) {
  const { progress } = recording;
  progress.session ??= (await post('/api/sessions/', recording.metadata, token)) as SavedSession;
  const session = progress.session;
  for (const [index, batch] of recording.batches.entries()) {
    for (let offset = 0; offset < batch.data.samples.length; offset += UPLOAD_BATCH_SIZE) {
      const chunk = `${index}:${offset}`;
      if (progress.sentChunks.has(chunk)) continue;
      await post(
        `/api/sessions/${session.id}/readings/`,
        {
          session_id: session.id,
          ...batch,
          data: {
            ...batch.data,
            samples: batch.data.samples.slice(offset, offset + UPLOAD_BATCH_SIZE),
          },
        },
        token
      );
      progress.sentChunks.add(chunk);
    }
  }
  return session;
}
