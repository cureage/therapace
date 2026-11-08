import { StyledView } from '@/components/StyledView';
import { Heading } from '@/components/ui/heading';

export const Welcome = () => {
  return (
    <StyledView className="flex h-full flex-col justify-between">
      <Heading>Welcome</Heading>
    </StyledView>
  );
};
