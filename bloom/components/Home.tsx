import { StyledView } from './StyledView';
import { Button, ButtonText } from './ui/button';
import { View } from 'react-native';
import { Image } from 'react-native';
import { Heading } from '@/components/ui/heading';

export const Home = () => {
  return (
    <StyledView className="flex h-full flex-col gap-4">
      <Heading className="text-4xl font-bold">
        Home
      </Heading>
      <View className="bg-area-foreground p-8 rounded-lg shadow-md">

      </View>
    </StyledView>
  );
};
