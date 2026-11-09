import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View, useAnimatedValue } from 'react-native';
import { StackActions, useNavigation } from '@react-navigation/native';
import { StyledView } from '@/components/StyledView';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import {
  getExposureVideo,
  requestExposureVideo,
  type ExposureVideo,
} from '@/services/ExposureVideoService';
import { fitbitBluetoothService } from '@/services/FitbitBluetoothService';
import { museBluetoothService } from '@/services/MuseBluetoothService';
import {
  handOffRecording,
  startSessionRecording,
  type SessionRecording,
} from '@/services/SessionRecording';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { endConquer } from '@/store/slices/userSlice';

// Breathing time before every session, even when the video is ready sooner.
const PREPARATION_DURATION_MS = 5000;
// With a sensor connected, the breathing is also the calm baseline the session is compared to.
const BASELINE_DURATION_MS = 60_000;
const POLL_INTERVAL_MS = 3000;
const MAX_WAIT_MS = 10 * 60 * 1000;
const MAX_POLL_FAILURES = 3;
const BREATH_MS = 4000;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "We couldn't create your video.";

const formatClock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const BreathingCircle = () => {
  const scale = useAnimatedValue(0.8);
  const [inhaling, setInhaling] = useState(true);

  useEffect(() => {
    const breathe = (toValue: number) =>
      Animated.timing(scale, {
        toValue,
        duration: BREATH_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      });
    const loop = Animated.loop(Animated.sequence([breathe(1), breathe(0.8)]));
    loop.start();
    const interval = setInterval(() => setInhaling((current) => !current), BREATH_MS);
    return () => {
      loop.stop();
      clearInterval(interval);
    };
  }, [scale]);

  return (
    <View className="items-center">
      <Animated.View style={{ transform: [{ scale }] }}>
        <View className="bg-primary/10 h-44 w-44 items-center justify-center rounded-full">
          <View className="bg-primary/20 h-28 w-28 items-center justify-center rounded-full">
            <View className="bg-primary h-16 w-16 rounded-full" />
          </View>
        </View>
      </Animated.View>
      <Text className="text-primary mt-6 font-semibold tracking-widest uppercase">
        {inhaling ? 'Breathe in' : 'Breathe out'}
      </Text>
    </View>
  );
};

export const Preparation = () => {
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const conquer = useAppSelector((state) => state.user.conquerRequest);
  const token = useAppSelector((state) => state.user.authToken);
  const [attempt, setAttempt] = useState(0);
  const [video, setVideo] = useState<ExposureVideo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [sensorConnected, setSensorConnected] = useState(false);
  // One idempotency key per attempt: re-running the effect never pays for a second video.
  const requestKeys = useRef<Record<number, string>>({});
  const recording = useRef<SessionRecording | null>(null);
  const setupError = !conquer
    ? 'Choose a fear to conquer first.'
    : !token
      ? 'Sign in to create your exposure video.'
      : null;
  const shownError = setupError ?? error;
  const preparationMs = sensorConnected ? BASELINE_DURATION_MS : PREPARATION_DURATION_MS;
  const prepared = elapsedMs >= preparationMs;
  const baselineSecondsLeft = sensorConnected
    ? Math.max(0, Math.ceil((BASELINE_DURATION_MS - elapsedMs) / 1000))
    : 0;

  // Record while the user breathes: this is the session's calm baseline. The video screen takes
  // the recording over; leaving from here discards it.
  useEffect(() => {
    const current = startSessionRecording();
    recording.current = current;
    const startedAt = Date.now();
    const tick = setInterval(() => setElapsedMs(Date.now() - startedAt), 500);
    let museConnected = false;
    let heartConnected = false;
    const stopMuse = museBluetoothService.subscribeToConnection((device) => {
      museConnected = !!device;
      setSensorConnected(museConnected || heartConnected);
    });
    const stopHeart = fitbitBluetoothService.subscribe(({ device }) => {
      heartConnected = !!device;
      setSensorConnected(museConnected || heartConnected);
    });
    return () => {
      clearInterval(tick);
      stopMuse();
      stopHeart();
      if (recording.current === current) {
        current.stop();
        recording.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!conquer || !token) return;
    const requestKey = (requestKeys.current[attempt] ??=
      `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const controller = new AbortController();
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const track = (next: ExposureVideo) => {
      if (next.status === 'ready' && next.stream_url) {
        setVideo(next);
      } else if (next.status === 'ready' || next.status === 'failed') {
        setError(next.error_message || "We couldn't create your video.");
      } else if (Date.now() - startedAt > MAX_WAIT_MS) {
        setError('Creating your video is taking longer than expected.');
      } else {
        timer = setTimeout(() => void poll(next.id), POLL_INTERVAL_MS);
      }
    };
    const poll = async (id: number) => {
      try {
        const next = await getExposureVideo(id, token, controller.signal);
        failures = 0;
        track(next);
      } catch (pollError) {
        if (controller.signal.aborted) return;
        failures += 1;
        if (failures >= MAX_POLL_FAILURES) setError(errorMessage(pollError));
        else timer = setTimeout(() => void poll(id), POLL_INTERVAL_MS);
      }
    };

    requestExposureVideo(conquer, requestKey, token, controller.signal)
      .then(track)
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(errorMessage(requestError));
      });

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [attempt, conquer, token]);

  useEffect(() => {
    if (!video || !prepared) return;
    if (recording.current) {
      handOffRecording(recording.current);
      recording.current = null;
    }
    navigation.dispatch(StackActions.replace('ConquerProcess', { video }));
  }, [navigation, prepared, video]);

  const retry = () => {
    setError(null);
    setVideo(null);
    setAttempt((current) => current + 1);
  };

  const status =
    shownError ??
    (video
      ? prepared
        ? 'Your video is ready. One more deep breath…'
        : 'Your video is ready. Keep breathing while we finish your baseline.'
      : `Creating your ${conquer?.fear.toLowerCase()} video. This can take a minute or two.`);

  return (
    <StyledView>
      <View className="flex-1 items-center justify-center px-2">
        <BreathingCircle />
        <Heading className="mt-8 text-center text-4xl font-bold">Preparation</Heading>
        <Text size="lg" className="mt-4 text-center">
          Stay calm and take slow, deep breaths.
        </Text>
        <Text
          accessibilityRole={shownError ? 'alert' : undefined}
          className={`mt-6 text-center ${shownError ? 'text-destructive' : 'text-neutral-500'}`}>
          {status}
        </Text>
        {!shownError && baselineSecondsLeft > 0 ? (
          <Text className="text-primary mt-2 text-center font-semibold">
            Measuring your calm baseline · {formatClock(baselineSecondsLeft)}
          </Text>
        ) : null}
      </View>
      <View className="gap-3">
        {error && !setupError ? (
          <Button size="lg" onPress={retry}>
            <ButtonText className="text-white">Try again</ButtonText>
          </Button>
        ) : null}
        <Button size="lg" variant="outline" onPress={() => dispatch(endConquer())}>
          <ButtonText>Back to my fears</ButtonText>
        </Button>
      </View>
    </StyledView>
  );
};
