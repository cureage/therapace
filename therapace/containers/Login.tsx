import { StyledView } from '../components/StyledView';
import { Title, StyledText } from '../components/Text';
import { Button } from '../components/ui/button';
import { Card } from '../components/Card';
import { TextInput } from '../components/TextInput';

export const Login = () => {
  return (
    <StyledView className="flex items-center justify-center">
      <Card className="flex w-[90%] flex-col">
        <Title className="text-center text-2xl font-bold">Login</Title>
        <StyledText className="text-neutral-800">
          Please enter your credentials to log in.
        </StyledText>
        <TextInput placeholder="Username" />
        <TextInput placeholder="Password" secureTextEntry />
        <Button>
          <StyledText>Login</StyledText>
        </Button>
      </Card>
    </StyledView>
  );
};
