import { useCallback, useEffect, useRef, useState } from 'react';
import { StackActions, useNavigation } from '@react-navigation/native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { StatusBar } from 'expo-status-bar';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { Button, ButtonText } from '@/components/ui/button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { updateStreak } from '@/store/slices/userSlice';
import {
  saveSession,
  startSessionRecording,
  type CapturedSession,
} from '@/services/SessionRecording';

const PLACEHOLDER_VIDEOS = [
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
];
const VIDEO_URL = PLACEHOLDER_VIDEOS[Math.floor(Math.random() * PLACEHOLDER_VIDEOS.length)];

export const Conquer = () => {
  const navigation = useNavigation();
  const player = useVideoPlayer(VIDEO_URL);
  const dispatch = useAppDispatch();
  const fear = useAppSelector((state) => state.user.conqueringFear);
  const token = useAppSelector((state) => state.user.authToken);
  const active = useRef<ReturnType<typeof startSessionRecording> | null>(null);
  const finished = useRef(false);
  const saving = useRef(false);
  const [pending, setPending] = useState<CapturedSession | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        navigation.dispatch(
          StackActions.replace('Complete', {
            cancelled: recording.metadata.status === 'partial',
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
      const recording = (active.current ?? startSessionRecording()).finish(partial, fear);
      active.current = null;
      player.pause();
      setPending(recording);
      void upload(recording);
    },
    [fear, player, upload]
  );

  useEffect(() => {
    const playback = player.addListener('playingChange', ({ isPlaying }) => {
      if (isPlaying && !finished.current && !active.current) {
        active.current = startSessionRecording();
      }
    });
    const ended = player.addListener('playToEnd', () => finish(false));
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
  }, [finish, player]);

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <VideoView
        player={player}
        nativeControls={false}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.cancelButtonContainer}>
        {error && (
          <Text accessibilityRole="alert" style={styles.error}>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  cancelButtonContainer: {
    position: 'absolute',
    right: 20,
    bottom: 40,
    left: 20,
  },
  error: { color: 'white', backgroundColor: '#222', padding: 12 },
});
