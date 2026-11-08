import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StyledView } from '@/components/StyledView';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';

const steps = ['Notice the fear', 'Move at your own pace', 'Build lasting confidence'];

export const Overview = () => {
  const navigation = useNavigation();
  return (
    <StyledView className="justify-between">
      <View className="mt-5 flex-row gap-2">
        {[1, 2, 3, 4, 5].map((step) => (
          <View
            key={step}
            className={`h-2 flex-1 rounded-full ${step <= 4 ? 'bg-primary' : 'bg-neutral-200'}`}
          />
        ))}
      </View>
      <View>
        <View className="bg-primary/10 mb-8 rounded-3xl px-5 py-4">
          <Text className="text-primary font-bold">A little courage, repeated.</Text>
          <Text className="mt-2 text-neutral-600">
            Small steps create new patterns in the brain.
          </Text>
        </View>
        <Heading size="3xl" className="text-neutral-900">
          Facing fears, with support
        </Heading>
        <Text size="lg" className="mt-4 leading-7 text-neutral-600">
          Bloom uses guided exposure therapy, an evidence-informed approach shown to help people
          feel less controlled by anxiety. You choose the pace, and we help you take the next
          manageable step.
        </Text>
        <View className="mt-8 gap-4">
          {steps.map((step, index) => (
            <View key={step} className="flex-row items-center">
              <View className="bg-primary mr-4 h-10 w-10 items-center justify-center rounded-full">
                <Text className="font-bold text-white">{index + 1}</Text>
              </View>
              <Text className="flex-1 text-base font-semibold text-neutral-800 dark:text-neutral-200">{step}</Text>
            </View>
          ))}
        </View>
      </View>
      <Button size="lg" onPress={() => navigation.navigate('Video' as never)}>
        <ButtonText className="text-white">How does setup work?</ButtonText>
      </Button>
    </StyledView>
  );
};
