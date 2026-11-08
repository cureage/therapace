import { useState } from 'react';
import { View } from 'react-native';
import { StyledView } from '@/components/StyledView';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { useAppDispatch } from '@/store/hooks';
import { completeOnboarding } from '@/store/slices/userSlice';

export const Video = () => {
  const dispatch = useAppDispatch();
  const [playing, setPlaying] = useState(false);
  return (
    <StyledView className="justify-between">
      <View className="mt-5 flex-row gap-2">
        {[1, 2, 3, 4, 5].map((step) => (
          <View key={step} className="bg-primary h-2 flex-1 rounded-full" />
        ))}
      </View>
      <View>
        <Text className="text-primary mb-3 font-semibold tracking-widest uppercase">
          Optional guide
        </Text>
        <Heading size="3xl" className="text-neutral-900">
          See Bloom in action
        </Heading>
        <Text size="lg" className="mt-3 leading-7 text-neutral-600">
          A quick walkthrough of your first session and headset setup.
        </Text>
        <Button
          size="lg"
          variant="outline"
          className="mt-8 h-56 rounded-3xl bg-neutral-900"
          onPress={() => setPlaying(!playing)}>
          <View className="h-16 w-16 items-center justify-center rounded-full bg-white/95">
            <Text className="text-primary ml-1 text-2xl">{playing ? 'Ⅱ' : '▶'}</Text>
          </View>
        </Button>
        <Text className="mt-4 text-center text-neutral-500">
          {playing ? 'Demo playing · 2 min' : 'Watch the 2-minute setup tutorial'}
        </Text>
      </View>
      <View className="gap-3">
        <Button size="lg" onPress={() => dispatch(completeOnboarding())}>
          <ButtonText className="text-white">Finish setup</ButtonText>
        </Button>
        <Button variant="ghost" onPress={() => dispatch(completeOnboarding())}>
          <ButtonText>Skip video for now</ButtonText>
        </Button>
      </View>
    </StyledView>
  );
};
