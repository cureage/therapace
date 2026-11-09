import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StackActions, useNavigation, useRoute } from '@react-navigation/native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { StatusBar } from 'expo-status-bar';
import { BackHandler, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, ButtonText } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { LiveHeartRate } from '@/components/conquer/LiveHeartRate';
import { exposureVideoSource, type ExposureVideo } from '@/services/ExposureVideoService';
import { analyzeSession } from '@/services/SessionAnalysis';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { endConquer, updateStreak } from '@/store/slices/userSlice';
import {
  saveSession,
  startSessionRecording,
  takeHandedOffRecording,
  type CapturedSession,
} from '@/services/SessionRecording';
import { useShake } from '@/hooks/useShake';

const PROGRESS_TICK_MS = 250;

export const Conquer = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const video = (route.params as { video?: ExposureVideo } | undefined)?.video;
  const dispatch = useAppDispatch();
  const conquer = useAppSelector((state) => state.user.conquerRequest);
  const token = useAppSelector((state) => state.user.authToken);
  const insets = useSafeAreaInsets();
  // Streamed from the backend with range requests; the stream endpoint needs the auth token.
  const streamUrl = video?.stream_url ?? null;
  const source = useMemo(
    () => (streamUrl && token ? exposureVideoSource(streamUrl, token) : null),
    [streamUrl, token]
  );
  // The session lasts as long as the user chose. Clips are capped at 15 s, so shorter clips loop.
  const sessionSeconds = conquer?.durationSeconds ?? video?.duration_seconds ?? 0;
  const loops = !!video?.clip_duration_seconds && sessionSeconds > video.clip_duration_seconds;
  const player = useVideoPlayer(source, (newPlayer) => {
    newPlayer.loop = loops;
  });
  const active = useRef<ReturnType<typeof startSessionRecording> | null>(null);
  const finished = useRef(false);
  const saving = useRef(false);
  const watchedSeconds = useRef(0);
  const playingSince = useRef<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [pending, setPending] = useState<CapturedSession | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useShake(
    () => {
      if (pending) void upload(pending);
      else finish(true);
    },
    {
      threshold: 4.0,
      updateInterval: 80,
      cooldown: 1200,
    }
  );

  const upload = useCallback(
    async (recording: CapturedSession) => {
      if (saving.current) return;
      if (!token) {
        setError('Sign in to save recordings.');
        return;
      }
      saving.current = true;
      setIsSaving(true);
      setError(null);
      try {
        const result = await saveSession(recording, token);
        dispatch(updateStreak({ streak: result.user.streak, maxStreak: result.user.max_streak }));
        // The session is saved either way; results are a bonus if the analysis succeeds.
        const analysis = await analyzeSession(result.id, token).catch(() => null);
        navigation.dispatch(
          StackActions.replace('Complete', {
            cancelled: recording.metadata.status === 'partial',
            analysis,
          })
        );
      } catch (uploadError) {
        setError(
          uploadError instanceof Error ? uploadError.message : 'Could not save the session.'
        );
      } finally {
        saving.current = false;
        setIsSaving(false);
      }
    },
    [dispatch, navigation, token]
  );

  const finish = useCallback(
    (partial: boolean) => {
      if (finished.current) return;
      finished.current = true;
      const recording = (active.current ?? startSessionRecording()).finish(partial, {
        fear: conquer?.fear,
        intensity: conquer?.intensity,
        duration_seconds: sessionSeconds,
        video_id: video?.id,
      });
      active.current = null;
      player.pause();
      setPending(recording);
      void upload(recording);
    },
    [conquer?.fear, conquer?.intensity, player, sessionSeconds, upload, video?.id]
  );

  useEffect(() => {
    if (!source) return;
    // Started on the Preparation screen, so it already holds the calm baseline.
    active.current ??= takeHandedOffRecording();
    const playback = player.addListener('playingChange', ({ isPlaying }) => {
      if (isPlaying) {
        playingSince.current ??= Date.now();
        if (!finished.current) {
          active.current ??= startSessionRecording();
          active.current.markExposureStart();
        }
      } else if (playingSince.current !== null) {
        watchedSeconds.current += (Date.now() - playingSince.current) / 1000;
        playingSince.current = null;
      }
    });
    // A looping clip reaches its end on every repeat; only a single play-through ends here.
    const ended = player.addListener('playToEnd', () => {
      if (!loops) finish(false);
    });
    const status = player.addListener('statusChange', ({ status }) => {
      if (status === 'error' && !finished.current) {
        if (active.current) finish(true);
        else setError('The video could not play.');
      }
    });
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      finish(true);
      return true;
    });
    player.play();
    return () => {
      playback.remove();
      ended.remove();
      status.remove();
      back.remove();
      active.current?.stop();
      active.current = null;
    };
  }, [finish, loops, player, source]);

  // Count the time actually spent watching; looping sessions end once the chosen time has played.
  useEffect(() => {
    if (!source || sessionSeconds <= 0) return;
    const interval = setInterval(() => {
      if (finished.current) return;
      const since = playingSince.current;
      const watched = watchedSeconds.current + (since === null ? 0 : (Date.now() - since) / 1000);
      setProgress(Math.min(watched / sessionSeconds, 1));
      if (loops && watched >= sessionSeconds) finish(false);
    }, PROGRESS_TICK_MS);
    return () => clearInterval(interval);
  }, [finish, loops, sessionSeconds, source]);

  if (!source) {
    return (
      <View className="flex-1 items-center justify-center gap-6 bg-black px-6">
        <Text accessibilityRole="alert" className="text-center text-white">
          Your video could not be loaded.
        </Text>
        <Button size="lg" variant="outline" onPress={() => dispatch(endConquer())}>
          <ButtonText>Back to my fears</ButtonText>
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <StatusBar hidden />
      <VideoView
        player={player}
        nativeControls={false}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
      />
      <View
        className="absolute right-5 left-5 h-1 overflow-hidden rounded-full bg-white/30"
        style={{ top: insets.top + 12 }}>
        <View
          className="bg-primary h-full rounded-full"
          style={{ width: `${progress * 100}%` as const }}
        />
      </View>
      <View className="absolute right-5" style={{ top: insets.top + 28, pointerEvents: 'none' }}>
        <LiveHeartRate />
      </View>
      <View className="absolute right-5 bottom-10 left-5 gap-3">
        {error && (
          <Text accessibilityRole="alert" className="rounded-xl bg-neutral-900 p-3 text-white">
            {error}
          </Text>
        )}
        <Button
          size="lg"
          variant="outline"
          isDisabled={isSaving}
          onPress={() => {
            if (pending) void upload(pending);
            else finish(true);
          }}>
          <ButtonText>
            {isSaving ? 'Saving session…' : pending ? 'Retry save' : 'Cancel session'}
          </ButtonText>
        </Button>
      </View>
    </View>
  );
};
