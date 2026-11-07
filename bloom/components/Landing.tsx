import { Text } from './ui/text';
import { StyledView } from './StyledView';
import { useNavigation } from '@react-navigation/native';
import { Button, ButtonText } from './ui/button';
import { View } from 'react-native';

export const Landing = () => {
  const navigation = useNavigation();

  return (
    <StyledView className="flex flex-col justify-between h-full">
      <Text size="2xl" className="text-black">
        Bloom
      </Text>
      <View className="flex w-full flex-col gap-3">
        <Button className="bg-primary w-full" onPress={() => navigation.navigate('Login' as never)}>
          <ButtonText>Login</ButtonText>
        </Button>
        <Button className="w-full bg-neutral-200" variant="secondary">
          <ButtonText className="text-neutral-800">Sign Up</ButtonText>
        </Button>
      </View>
    </StyledView>
  );
};
