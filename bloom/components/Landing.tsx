import { StyledView } from './StyledView';
import { useNavigation } from '@react-navigation/native';
import { Button, ButtonText } from './ui/button';
import { View } from 'react-native';
import { Image } from 'react-native';

export const Landing = () => {
  const navigation = useNavigation();

  return (
    <StyledView className="flex h-full flex-col justify-between">
      <Image
        source={require('../assets/bloom-logo.png')}
        className="!h-1/3 !w-full fixed top-1/4"
        resizeMode="contain"
      />
      <View className="flex w-full flex-col gap-3">
        <Button size="lg" onPress={() => navigation.navigate('Login' as never)}>
          <ButtonText>Login</ButtonText>
        </Button>
        <Button variant="outline" size="lg" onPress={() => navigation.navigate('Signup' as never)}>
          <ButtonText className="text-neutral-800">Sign Up</ButtonText>
        </Button>
      </View>
    </StyledView>
  );
};
