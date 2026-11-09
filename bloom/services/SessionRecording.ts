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

export function startSessionRecording() {
  const startedAt = Date.now();
  const heart = new Map<string, HeartSample[]>();
  const eeg = new Map<string, EEGSample[]>();
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
    finish(partial: boolean, fear?: string) {
      const endedAt = Math.max(startedAt, Date.now());
      stop();
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
          session_data: { fear },
        },
        batches,
      };
    },
  };
}

export type CapturedSession = ReturnType<ReturnType<typeof startSessionRecording>['finish']>;

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

export async function saveSession(recording: CapturedSession, token: string) {
  const session = await post('/api/sessions/', recording.metadata, token);
  for (const batch of recording.batches) {
    for (let offset = 0; offset < batch.data.samples.length; offset += 500) {
      await post(
        `/api/sessions/${session.id}/readings/`,
        {
          session_id: session.id,
          ...batch,
          data: { ...batch.data, samples: batch.data.samples.slice(offset, offset + 500) },
        },
        token
      );
    }
  }
  return session as { id: number; user: { streak: number; max_streak: number } };
}
