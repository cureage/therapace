import {
  buildMuseEEGPayload,
  MUSE_EEG_CHANNELS,
  type MuseEEGChannel,
  type MuseEEGReading,
} from '@/services/MuseEEGMeasurement';
import { museBluetoothService } from '@/services/MuseBluetoothService';
import type { MuseDevice } from '@/services/MuseBluetoothService';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

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
    <View className="bg-area-foreground mt-6 gap-[18px] rounded-[20px] p-[18px]">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-foreground text-lg font-bold">Muse · EEG</Text>
        <View className="bg-primary/10 rounded-2xl px-[10px] py-[7px]">
          <Text className="text-primary text-xs font-semibold">
            {!device ? 'Disconnected' : fresh ? 'Live' : 'Waiting'}
          </Text>
        </View>
      </View>
      <Text className="text-[13px] leading-5 text-neutral-500 dark:text-neutral-400">
        Live EEG from the four Muse sensors, displayed in microvolts (µV).
      </Text>

      {device ? (
        <View className="flex-row flex-wrap gap-[10px]">
          {MUSE_EEG_CHANNELS.map((channel) => (
            <ChannelValue key={channel} channel={channel} reading={readings[channel]} />
          ))}
        </View>
      ) : (
        <Text className="text-[13px] leading-5 text-neutral-500 dark:text-neutral-400">
          Connect a Muse headband above to start the EEG stream.
        </Text>
      )}

      {streamError && (
        <Text accessibilityRole="alert" className="text-[13px] leading-5 text-red-700">
          {streamError}
        </Text>
      )}

      {payloadPreview && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showPayload }}
            onPress={() => setExpandedDeviceId(showPayload ? null : (device?.id ?? null))}
            className="border-primary/20 min-h-[42px] items-center justify-center rounded-xl border active:opacity-80">
            <Text className="text-primary text-[13px] font-bold">
              {showPayload ? 'Hide latest payload' : 'View latest payload JSON'}
            </Text>
          </Pressable>
          {showPayload && (
            <ScrollView className="max-h-[260px] rounded-xl bg-neutral-900 p-3" nestedScrollEnabled>
              <Text selectable className="font-mono text-[11px] leading-4 text-neutral-100">
                {payloadPreview}
              </Text>
            </ScrollView>
          )}
        </>
      )}
      <Text className="text-xs leading-[18px] text-neutral-500 dark:text-neutral-400">
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
    <View className="bg-primary/10 min-h-[104px] w-[48%] rounded-[14px] p-3">
      <Text className="text-xs font-bold text-neutral-500 dark:text-neutral-400">{channel}</Text>
      <Text className="text-primary mt-1.5 text-[30px] font-bold">
        {latestSample === undefined ? '—' : latestSample.toFixed(1)}
      </Text>
      <Text className="text-xs text-neutral-500 dark:text-neutral-400">µV</Text>
    </View>
  );
}
