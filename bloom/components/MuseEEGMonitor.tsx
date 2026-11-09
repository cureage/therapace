import {
  buildMuseEEGPayload,
  MUSE_EEG_CHANNELS,
  type MuseEEGChannel,
  type MuseEEGReading,
} from '@/services/MuseEEGMeasurement';
import { museBluetoothService } from '@/services/MuseBluetoothService';
import type { MuseDevice } from '@/services/MuseBluetoothService';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Props = { device: MuseDevice | null };
type ChannelReadings = Partial<Record<MuseEEGChannel, MuseEEGReading>>;
type StreamData = { deviceId: string; readings: ChannelReadings; error: string | null };

export function MuseEEGMonitor({ device }: Props) {
  const [streamData, setStreamData] = useState<StreamData>({
    deviceId: '',
    readings: {},
    error: null,
  });
  const [expandedDeviceId, setExpandedDeviceId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const lastLoggedAt = useRef(0);

  useEffect(() => {
    lastLoggedAt.current = 0;
    if (!device) return;

    const unsubscribe = museBluetoothService.subscribeToEEG(({ reading, error }) => {
      if (reading && reading.receivedAt - lastLoggedAt.current >= 5000) {
        const preview = buildMuseEEGPayload(device.id, [reading]);
        console.info('[Muse EEG sample payload preview]\n%s', JSON.stringify(preview, null, 2));
        lastLoggedAt.current = reading.receivedAt;
      }
      setStreamData((current) => {
        const currentReadings = current.deviceId === device.id ? current.readings : {};
        return {
          deviceId: device.id,
          readings: reading ? { ...currentReadings, [reading.channel]: reading } : currentReadings,
          error: error ?? (reading ? null : current.deviceId === device.id ? current.error : null),
        };
      });
    });

    return unsubscribe;
  }, [device]);

  useEffect(() => {
    if (!device) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [device]);

  const readings = streamData.deviceId === device?.id ? streamData.readings : {};
  const streamError = streamData.deviceId === device?.id ? streamData.error : null;
  const showPayload = device?.id !== undefined && expandedDeviceId === device.id;
  const latestReading = MUSE_EEG_CHANNELS.map((channel) => readings[channel])
    .filter((reading): reading is MuseEEGReading => reading !== undefined)
    .reduce<MuseEEGReading | null>(
      (latest, reading) =>
        latest === null || reading.receivedAt > latest.receivedAt ? reading : latest,
      null
    );
  const receivedAt = latestReading?.receivedAt ?? null;
  const fresh = receivedAt !== null && now - receivedAt < 5000;
  const payloadPreview =
    device && latestReading
      ? JSON.stringify(buildMuseEEGPayload(device.id, [latestReading]), null, 2)
      : null;

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text style={styles.title}>Muse · EEG</Text>
        <Text style={styles.status}>{!device ? 'Disconnected' : fresh ? 'Live' : 'Waiting'}</Text>
      </View>
      <Text style={styles.detail}>
        Live EEG from the four Muse sensors, displayed in microvolts (µV).
      </Text>

      {device ? (
        <View style={styles.channels}>
          {MUSE_EEG_CHANNELS.map((channel) => (
            <ChannelValue key={channel} channel={channel} reading={readings[channel]} />
          ))}
        </View>
      ) : (
        <Text style={styles.detail}>Connect a Muse headband above to start the EEG stream.</Text>
      )}

      {streamError && (
        <Text accessibilityRole="alert" style={styles.error}>
          {streamError}
        </Text>
      )}

      {payloadPreview && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showPayload }}
            onPress={() => setExpandedDeviceId(showPayload ? null : (device?.id ?? null))}
            style={styles.previewButton}>
            <Text style={styles.previewButtonText}>
              {showPayload ? 'Hide latest payload' : 'View latest payload JSON'}
            </Text>
          </Pressable>
          {showPayload && (
            <ScrollView style={styles.payload} nestedScrollEnabled>
              <Text selectable style={styles.payloadText}>
                {payloadPreview}
              </Text>
            </ScrollView>
          )}
        </>
      )}
      <Text style={styles.detail}>
        Sample payloads are also printed in Xcode’s device console; authenticated EEG batches are
        logged by the backend.
      </Text>
    </View>
  );
}

function ChannelValue({
  channel,
  reading,
}: {
  channel: MuseEEGChannel;
  reading: MuseEEGReading | undefined;
}) {
  const latestSample = reading?.samples.at(-1);
  return (
    <View style={styles.channel}>
      <Text style={styles.channelName}>{channel}</Text>
      <Text style={styles.value}>{latestSample === undefined ? '—' : latestSample.toFixed(1)}</Text>
      <Text style={styles.unit}>µV</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24, padding: 18, borderRadius: 20, backgroundColor: '#fff', gap: 14 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { color: '#24352a', fontSize: 18, fontWeight: '700' },
  status: { color: '#426b54', fontSize: 13, fontWeight: '700' },
  detail: { color: '#657168', fontSize: 13, lineHeight: 20 },
  channels: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  channel: {
    width: '48%',
    minHeight: 104,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#f5f9f5',
  },
  channelName: { color: '#657168', fontSize: 12, fontWeight: '700' },
  value: { marginTop: 6, color: '#426b54', fontSize: 30, fontWeight: '700' },
  unit: { color: '#657168', fontSize: 12 },
  previewButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#cbd9ce',
    borderRadius: 12,
  },
  previewButtonText: { color: '#426b54', fontSize: 13, fontWeight: '700' },
  payload: { maxHeight: 260, padding: 12, borderRadius: 12, backgroundColor: '#202923' },
  payloadText: { color: '#e5eee7', fontFamily: 'monospace', fontSize: 11, lineHeight: 16 },
  error: { color: '#a43d35', fontSize: 13, lineHeight: 20 },
});
