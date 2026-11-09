import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { Button, ButtonText } from '@/components/ui/button';
import { useAppSelector } from '@/store/hooks';

const VIDEO_DURATION_MS = 10000;
const PLACEHOLDER_VIDEOS = [
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
];
const VIDEO_URL = PLACEHOLDER_VIDEOS[Math.floor(Math.random() * PLACEHOLDER_VIDEOS.length)];

export const Conquer = () => {
  const navigation = useNavigation();
  const player = useVideoPlayer(VIDEO_URL, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.play();
  });
  const fear = useAppSelector((state) => state.user.conqueringFear);

  console.log('fear', fear);

  useEffect(() => {
    const timeout = setTimeout(() => {
      navigation.replace('Complete' as never);
    }, VIDEO_DURATION_MS);

    return () => clearTimeout(timeout);
  }, [navigation]);

  const cancelSession = () => {
    navigation.replace('Complete', { cancelled: true } as never);
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <VideoView player={player} contentFit="cover" style={StyleSheet.absoluteFill} />
      <View style={styles.cancelButtonContainer}>
        <Button size="lg" variant="outline" onPress={cancelSession}>
          <ButtonText>Cancel session</ButtonText>
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
});
