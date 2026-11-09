import type { SensorPayload } from './SensorReportingService';

export const MUSE_EEG_CHANNELS = ['TP9', 'AF7', 'AF8', 'TP10'] as const;
export const MUSE_EEG_SAMPLE_RATE_HZ = 256;

export type MuseEEGChannel = (typeof MUSE_EEG_CHANNELS)[number];

export type MuseEEGReading = {
  channel: MuseEEGChannel;
  sequenceId: number;
  samples: number[];
  receivedAt: number;
};

export type MuseEEGEvent = {
  reading?: MuseEEGReading;
  error?: string;
};

/**
 * libmuse emits NaN-filled packets in place of dropped ones, and the backend rejects a readings
 * batch containing any non-finite sample. Drop each sample position that is not finite on every
 * channel, so the channels keep equal lengths (session analysis discards misaligned frames).
 */
export function keepFiniteSamples(
  channels: Partial<Record<MuseEEGChannel, number[]>>
): Partial<Record<MuseEEGChannel, number[]>> {
  const present = MUSE_EEG_CHANNELS.flatMap((channel) => {
    const samples = channels[channel];
    return samples?.length ? [[channel, samples] as const] : [];
  });
  const length = Math.max(0, ...present.map(([, samples]) => samples.length));
  const kept: number[] = [];
  for (let index = 0; index < length; index++) {
    if (present.every(([, samples]) => Number.isFinite(samples[index]))) kept.push(index);
  }
  return Object.fromEntries(
    present.map(([channel, samples]) => [channel, kept.map((index) => samples[index])])
  );
}

export function buildMuseEEGPayload(
  deviceId: string,
  readings: MuseEEGReading[],
  rssiDbm: number | null = null,
  timestamp = new Date().toISOString()
): SensorPayload {
  return {
    timestamp,
    device_id: deviceId,
    sensor_values: {
      ...(rssiDbm === null ? {} : { rssi_dbm: rssiDbm }),
      ...(readings.length === 0
        ? {}
        : {
            eeg: {
              sampling_rate_hz: MUSE_EEG_SAMPLE_RATE_HZ,
              units: 'µV',
              packets: readings.map((reading) => ({
                channel: reading.channel,
                sequence_id: reading.sequenceId,
                timestamp: new Date(reading.receivedAt).toISOString(),
                samples: reading.samples,
              })),
            },
          }),
    },
  };
}
