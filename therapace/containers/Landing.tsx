import { StyledView } from '../components/StyledView';
import { Title, StyledText } from '../components/Text';
import { Button } from '../components/Button';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export const Landing = () => {
  const navigation = useNavigation();

  return (
    <StyledView className="flex flex-col justify-between">
      <Title>Bloom</Title>
      <View className="flex flex-col gap-3">
        <Button className="bg-primary" onPress={() => navigation.navigate('Login' as never)}>
          <StyledText>Login</StyledText>
        </Button>
        <Button className="bg-neutral-200">
          <StyledText className="text-neutral-800">Sign Up</StyledText>
        </Button>
      </View>
    </StyledView>
  );
};
