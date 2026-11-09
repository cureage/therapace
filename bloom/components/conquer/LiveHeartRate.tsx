import { useEffect, useState } from 'react';
import { Animated, Easing, View, useAnimatedValue } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Heart } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useHeartRate } from '@/hooks/useHeartRate';

// Matches the theme's --primary token; icon fills need a raw color rather than a class.
const HEART_COLOR = '#e43d7c';
const DIM_COLOR = 'rgba(255, 255, 255, 0.6)';
const BEAT_MS = 140;

/**
 * Compact live heart-rate readout for the exposure video. Renders nothing unless a heart-rate
 * monitor is connected, and stays up as "Disconnected" if that monitor drops mid-session.
 */
export function LiveHeartRate() {
  const { state, fresh, live } = useHeartRate();
  // Remember a monitor was connected, so a mid-session drop shows instead of vanishing.
  const [seenDevice, setSeenDevice] = useState(false);
  if (state.device && !seenDevice) setSeenDevice(true);
  const reduceMotion = useReducedMotion();
  const scale = useAnimatedValue(1);

  // One beat per reading, so the heart visibly moves while the stream is live.
  useEffect(() => {
    scale.setValue(1);
    if (!live || reduceMotion || state.receivedAt === null) return;
    const beat = Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.25,
        duration: BEAT_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: BEAT_MS * 2,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    beat.start();
    return () => beat.stop();
  }, [live, reduceMotion, scale, state.receivedAt]);

  if (!state.device && !seenDevice) return null;

  const status = !state.device
    ? 'Disconnected'
    : fresh
      ? 'Check contact'
      : state.receivedAt
        ? 'No signal'
        : 'Waiting…';

  return (
    <View
      accessible
      accessibilityLabel={
        live ? `Heart rate ${state.bpm} beats per minute` : `Heart rate unavailable. ${status}`
      }
      className="flex-row items-center gap-2 rounded-full bg-black/50 px-3 py-1.5">
      <Animated.View style={{ transform: [{ scale }] }}>
        <Heart
          size={18}
          color={live ? HEART_COLOR : DIM_COLOR}
          fill={live ? HEART_COLOR : 'transparent'}
        />
      </Animated.View>
      {live ? (
        <Text className="text-lg font-bold text-white tabular-nums">
          {state.bpm} <Text className="text-xs font-semibold text-white/70">BPM</Text>
        </Text>
      ) : (
        <Text className="text-sm font-semibold text-white/70">{status}</Text>
      )}
    </View>
  );
}
