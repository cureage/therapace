import { StyledView } from './StyledView';
import { Button, ButtonText } from './ui/button';
import { View } from 'react-native';
import { Image } from 'react-native';
import { Heading } from '@/components/ui/heading';

export const Home = () => {
  return (
    <StyledView className="flex h-full flex-col justify-between">
      <Heading>
        Home
      </Heading>
    </StyledView>
  );
};
