import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StyledView } from '@/components/StyledView';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';

export const Thanks = () => {
  const navigation = useNavigation();

  return (
    <StyledView className="justify-between">
      <View className="mt-5 flex-row gap-2">
        {[1, 2, 3, 4, 5].map((step) => (
          <View
            key={step}
            className={`h-2 flex-1 rounded-full ${step <= 3 ? 'bg-primary' : 'bg-neutral-200'}`}
          />
        ))}
      </View>
      <View className="items-center px-2">
        <View className="bg-primary/10 mb-8 h-32 w-32 items-center justify-center rounded-full">
          <View className="bg-primary h-20 w-20 items-center justify-center rounded-full">
            <Text className="text-3xl text-white">♥</Text>
          </View>
        </View>
        <Heading size="3xl" className="text-center text-neutral-900">
          Thank you for trusting us.
        </Heading>
        <Text size="lg" className="mt-4 text-center leading-7 text-neutral-600">
          Sharing what scares you takes courage. We promise to keep what you share private and use
          it only to shape your care.
        </Text>
        <View className="bg-primary/10 mt-6 rounded-full px-5 py-3">
          <Text className="text-primary font-semibold">Your privacy matters</Text>
        </View>
      </View>
      <Button size="lg" onPress={() => navigation.navigate('Overview' as never)}>
        <ButtonText className="text-white">What happens next?</ButtonText>
      </Button>
    </StyledView>
  );
};
