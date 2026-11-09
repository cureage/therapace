import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import { StyledView } from '@/components/StyledView';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';

const PREPARATION_DURATION_MS = 5000;

export const Preparation = () => {
  const navigation = useNavigation();

  useEffect(() => {
    const timeout = setTimeout(() => {
      navigation.replace('ConquerProcess' as never);
    }, PREPARATION_DURATION_MS);

    return () => clearTimeout(timeout);
  }, [navigation]);

  return (
    <StyledView className="flex h-full flex-col items-center justify-center px-6">
      <Heading className="text-center text-4xl font-bold">Preparation</Heading>
      <Text size="lg" className="mt-4 text-center">
        Stay calm and take slow, deep breaths.
      </Text>
    </StyledView>
  );
};