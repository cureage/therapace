import { Modal, ScrollView, View } from 'react-native';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { HeartRateChart } from '@/components/HeartRateChart';
import { BackButton } from '@/components/BackButton';
import { StyledView } from '@/components/StyledView';
import type { SessionHistoryRecord } from '@/services/SessionAnalysis';

export const SessionDetails = ({
  session,
  onClose,
}: {
  session: SessionHistoryRecord | null;
  onClose: () => void;
}) => {
  if (!session) return null;

  const analysis = session.analysis;
  const fear = analysis?.fear;
  const heart = analysis?.heart_rate;
  const fearName =
    typeof session.session_data.fear === 'string' ? session.session_data.fear : 'Exposure';
  const recordedAt = session.started_at ?? session.created_at;
  const fearTimeline = fear?.timeline ?? [];

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} accessibilityViewIsModal>
      <StyledView className="gap-0 px-4 py-4">
        <View className="mb-4 flex-row items-center gap-3">
          <BackButton className="h-12 w-12" onPress={onClose} />
          <View className="flex-1">
            <Heading size="lg">{fearName} session</Heading>
            <Text className="text-sm text-neutral-500">
              {new Date(recordedAt).toLocaleString()} ·{' '}
              {session.status === 'partial' ? 'Partial session' : 'Completed'}
            </Text>
          </View>
        </View>
        <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-8">
          {!analysis ? (
            <Text className="text-neutral-600">
              Detailed analytics are not available for this session.
            </Text>
          ) : (
            <>
              {heart ? (
                <Card className="gap-3">
                  <Heading size="md">Heart rate during exposure</Heading>
                  <View className="flex-row flex-wrap gap-4">
                    <View>
                      <Text className="text-primary text-xl font-bold">
                        {Math.round(heart.exposure_mean_bpm)} bpm
                      </Text>
                      <Text className="text-xs text-neutral-500">Exposure average</Text>
                    </View>
                    <View>
                      <Text className="text-primary text-xl font-bold">
                        {Math.round(heart.exposure_max_bpm)} bpm
                      </Text>
                      <Text className="text-xs text-neutral-500">Exposure peak</Text>
                    </View>
                    {heart.baseline_bpm !== null ? (
                      <View>
                        <Text className="text-primary text-xl font-bold">
                          {Math.round(heart.baseline_bpm)} bpm
                        </Text>
                        <Text className="text-xs text-neutral-500">Calm baseline average</Text>
                      </View>
                    ) : null}
                    {heart.change_bpm !== null ? (
                      <View>
                        <Text className="text-primary text-xl font-bold">
                          {heart.change_bpm >= 0 ? '+' : ''}
                          {Math.round(heart.change_bpm)} bpm
                        </Text>
                        <Text className="text-xs text-neutral-500">Change from baseline</Text>
                      </View>
                    ) : null}
                  </View>
                  {heart.timeline?.length ? (
                    <HeartRateChart points={heart.timeline} />
                  ) : (
                    <Text className="text-sm text-neutral-500">
                      A heart-rate timeline was not saved for this session.
                    </Text>
                  )}
                  {analysis.exposure_seconds !== null ? (
                    <Text className="text-xs text-neutral-500">
                      Exposure duration: {analysis.exposure_seconds} seconds
                    </Text>
                  ) : null}
                </Card>
              ) : null}
              {fear ? (
                <Card className="gap-3">
                  <Heading size="md">Estimated fear during exposure</Heading>
                  <View className="flex-row flex-wrap gap-4">
                    <View>
                      <Text className="text-primary text-xl font-bold">
                        {fear.mean_p_fear === null ? '—' : `${Math.round(fear.mean_p_fear * 100)}%`}
                      </Text>
                      <Text className="text-xs text-neutral-500">Average fear estimate</Text>
                    </View>
                    <View>
                      <Text className="text-primary text-xl font-bold">
                        {fear.max_p_fear_smoothed === null
                          ? '—'
                          : `${Math.round(fear.max_p_fear_smoothed * 100)}%`}
                      </Text>
                      <Text className="text-xs text-neutral-500">Peak smoothed estimate</Text>
                    </View>
                    <View>
                      <Text className="text-primary text-xl font-bold">
                        {fear.pct_windows_fear === null
                          ? '—'
                          : `${Math.round(fear.pct_windows_fear)}%`}
                      </Text>
                      <Text className="text-xs text-neutral-500">Windows above threshold</Text>
                    </View>
                    <View>
                      <Text className="text-primary text-xl font-bold">
                        {Math.round(fear.threshold * 100)}%
                      </Text>
                      <Text className="text-xs text-neutral-500">Fear threshold</Text>
                    </View>
                  </View>
                  {fearTimeline.length ? (
                    <View className="gap-2">
                      <Text className="text-sm text-neutral-600">Fear level by time</Text>
                      <View className="h-28 flex-row items-end gap-1">
                        {fearTimeline.map((point) => (
                          <View
                            key={point.seconds}
                            accessibilityLabel={`${Math.round(point.p_fear * 100)} percent at ${point.seconds} seconds`}
                            className={`flex-1 rounded-t-md ${
                              point.p_fear >= fear.threshold ? 'bg-primary' : 'bg-primary/40'
                            }`}
                            style={{ height: `${Math.max(point.p_fear * 100, 4)}%` as const }}
                          />
                        ))}
                      </View>
                      <View className="flex-row justify-between">
                        <Text className="text-xs text-neutral-500">Start</Text>
                        <Text className="text-xs text-neutral-500">End</Text>
                      </View>
                      <View className="gap-1">
                        {fearTimeline.map((point) => (
                          <Text key={point.seconds} className="text-sm text-neutral-600">
                            {point.seconds}s · {Math.round(point.p_fear * 100)}% fear
                            {' · '}smoothed {Math.round(point.p_fear_smoothed * 100)}%
                            {point.heart_rate_bpm === null
                              ? ''
                              : ` · ${Math.round(point.heart_rate_bpm)} bpm`}
                          </Text>
                        ))}
                      </View>
                    </View>
                  ) : null}
                  {fear.affect ? (
                    <Text className="text-sm text-neutral-600">
                      Average estimated mood: valence {fear.affect.mean_valence?.toFixed(2) ?? '—'},{' '}
                      arousal {fear.affect.mean_arousal?.toFixed(2) ?? '—'}
                    </Text>
                  ) : null}
                </Card>
              ) : null}
              {!heart && !fear ? (
                <Text className="text-neutral-600">
                  No heart-rate or fear results were available for this session.
                </Text>
              ) : null}
              {analysis.notes.map((note) => (
                <Text key={note} className="text-sm text-neutral-600">
                  {note}
                </Text>
              ))}
            </>
          )}
        </ScrollView>
      </StyledView>
    </Modal>
  );
};
