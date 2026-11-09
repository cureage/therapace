import { useState } from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUnstableNativeVariable } from 'nativewind';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Slider, SliderFilledTrack, SliderThumb, SliderTrack } from '@/components/ui/slider';
import { Text } from '@/components/ui/text';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { startConquer } from '@/store/slices/userSlice';
import {
  CONQUER_DURATION_SECONDS,
  CONQUER_INTENSITY,
  GENERATED_CLIP_MAX_SECONDS,
} from '@/utils/constants';

const INTENSITY_LEVELS = [
  { label: 'Gentle', description: 'Cartoon-like, small and far away.' },
  { label: 'Mild', description: 'Realistic, at a comfortable distance.' },
  { label: 'Moderate', description: 'Clearly visible at an everyday distance.' },
  { label: 'Strong', description: 'A realistic close-up that sometimes moves toward you.' },
  { label: 'Intense', description: 'Right up close, filling the screen.' },
];

const formatDuration = (seconds: number) => (seconds >= 60 ? '1 min' : `${seconds}s`);

export const Conquer = () => {
  const fears: string[] = useAppSelector((state) => state.user.currentUser?.fears || []);
  const backgroundColorStyle = useUnstableNativeVariable('--background');
  const dispatch = useAppDispatch();
  const [selectedFear, setSelectedFear] = useState<string | null>(null);
  const [intensity, setIntensity] = useState(CONQUER_INTENSITY.default);
  const [durationSeconds, setDurationSeconds] = useState(CONQUER_DURATION_SECONDS.default);
  // Dragging a slider must not scroll the page underneath it.
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const fear = selectedFear && fears.includes(selectedFear) ? selectedFear : (fears[0] ?? null);
  const level = INTENSITY_LEVELS[intensity - 1];
  const holdScroll = {
    onTouchStart: () => setScrollEnabled(false),
    onTouchEnd: () => setScrollEnabled(true),
    onTouchCancel: () => setScrollEnabled(true),
  };

  return (
    <SafeAreaView className={`h-full`} style={{ flex: 1, backgroundColor: backgroundColorStyle }}>
      <ScrollView
        scrollEnabled={scrollEnabled}
        contentContainerClassName="grow gap-6 bg-background px-4 py-8">
        <View className="items-center px-2">
          <View className="bg-primary/10 mb-8 h-44 w-44 items-center justify-center rounded-full">
            <View className="bg-primary/20 h-28 w-28 items-center justify-center rounded-full">
              <View className="bg-primary h-16 w-16 rounded-full" />
            </View>
          </View>
          <Heading size="3xl" className="text-center text-neutral-900">
            Conquer Your Fears
          </Heading>
          <Text size="lg" className="mt-4 max-w-md text-center leading-7 text-neutral-600">
            Face what scares you, one small step at a time. Exposure therapy helps you build
            confidence by gradually getting used to the things that make you anxious, at a pace that
            feels right for you.
          </Text>
          <Text size="lg" className="mt-4 max-w-md text-center leading-7 text-neutral-600">
            You&apos;re always in control. Pause, slow down, or stop whenever you need to.
          </Text>
          <Text
            size="lg"
            className="mt-4 max-w-md text-center leading-7 font-bold text-neutral-600">
            What do you want to conquer today?
          </Text>
        </View>
        <View className="gap-3">
          {fears.map((item, index) => {
            const selected = item === fear;
            return (
              <TouchableOpacity
                key={item}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                className={`bg-area-foreground flex-row items-center rounded-2xl border px-4 py-3 ${
                  selected ? 'border-primary' : 'border-border'
                }`}
                onPress={() => setSelectedFear(item)}>
                <View
                  className={`mr-3 h-7 w-7 items-center justify-center rounded-full ${
                    selected ? 'bg-primary' : 'bg-primary/10'
                  }`}>
                  <Text className={`font-bold ${selected ? 'text-white' : 'text-primary'}`}>
                    {index + 1}
                  </Text>
                </View>
                <Text className="flex-1 text-base text-neutral-800 dark:text-neutral-200">
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {fear ? (
          <>
            <View className="bg-area-foreground gap-6 rounded-2xl p-4 shadow-md">
              <View>
                <View className="flex-row items-center justify-between">
                  <Text className="font-semibold tracking-widest uppercase">Intensity</Text>
                  <Text className="text-primary font-semibold">
                    {intensity} · {level.label}
                  </Text>
                </View>
                <View className="mt-2" {...holdScroll}>
                  <Slider
                    aria-label="Intensity"
                    value={intensity}
                    minValue={CONQUER_INTENSITY.min}
                    maxValue={CONQUER_INTENSITY.max}
                    step={1}
                    onChange={(value) => setIntensity(Math.round(value))}>
                    <SliderTrack>
                      <SliderFilledTrack />
                    </SliderTrack>
                    <SliderThumb />
                  </Slider>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-neutral-500">Gentle</Text>
                  <Text className="text-xs text-neutral-500">Intense</Text>
                </View>
                <Text className="mt-2 text-sm text-neutral-600">{level.description}</Text>
              </View>
              <View>
                <View className="flex-row items-center justify-between">
                  <Text className="font-semibold tracking-widest uppercase">Duration</Text>
                  <Text className="text-primary font-semibold">
                    {formatDuration(durationSeconds)}
                  </Text>
                </View>
                <View className="mt-2" {...holdScroll}>
                  <Slider
                    aria-label="Duration in seconds"
                    value={durationSeconds}
                    minValue={CONQUER_DURATION_SECONDS.min}
                    maxValue={CONQUER_DURATION_SECONDS.max}
                    step={1}
                    onChange={(value) => setDurationSeconds(Math.round(value))}>
                    <SliderTrack>
                      <SliderFilledTrack />
                    </SliderTrack>
                    <SliderThumb />
                  </Slider>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-neutral-500">
                    {formatDuration(CONQUER_DURATION_SECONDS.min)}
                  </Text>
                  <Text className="text-xs text-neutral-500">
                    {formatDuration(CONQUER_DURATION_SECONDS.max)}
                  </Text>
                </View>
                <Text className="mt-2 text-sm text-neutral-600">
                  {durationSeconds > GENERATED_CLIP_MAX_SECONDS
                    ? `Your ${GENERATED_CLIP_MAX_SECONDS}-second video repeats until the time is up.`
                    : 'How long you will watch your video.'}
                </Text>
              </View>
            </View>
            <Button
              size="lg"
              onPress={() => dispatch(startConquer({ fear, intensity, durationSeconds }))}>
              <ButtonText className="text-white">Start conquering</ButtonText>
            </Button>
          </>
        ) : (
          <Text className="text-center text-neutral-600">
            You haven&apos;t added any fears yet.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};
