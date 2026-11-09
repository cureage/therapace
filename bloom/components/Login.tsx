import { useState } from 'react';
import { StyledView } from './StyledView';
import { Card } from './ui/card';
import { Button, ButtonText } from './ui/button';
import { Image, View } from 'react-native';
import { Heading } from './ui/heading';
import {
  FormControl,
  FormControlLabel,
  FormControlError,
  FormControlErrorText,
  FormControlLabelText,
} from '@/components/ui/form-control';
import { Input, InputField } from '@/components/ui/input';
import { BackButton } from '@/components/BackButton';
import { endpoints, EMAIL_REGEX } from '@/utils/constants';
import { useNavigation } from '@react-navigation/native';
import { setUser } from '@/store/slices/userSlice';
import { useAppDispatch } from '@/store/hooks';

export const Login = () => {
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const navigation = useNavigation();
  const dispatch = useAppDispatch();

  const handleSubmit = () => {
    let hasError = false;
    // if (!EMAIL_REGEX.test(loginData.email)) {
    //   setErrors({ ...errors, email: 'Please enter a valid email address.' });
    //   hasError = true;
    // }
    // if (loginData.password.length == 0) {
    //   setErrors({ ...errors, password: 'Please enter your password.' });
    //   hasError = true;
    // }
    // if (loginData.email.length == 0) {
    //   setErrors({ ...errors, email: 'Please enter your email address.' });
    //   hasError = true;
    // }

    if (!hasError) {
      setErrors({ ...errors, email: '', password: '' });
      // fetch(endpoints.login, {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify(loginData),
      // })
      //   .then((res) => res.json())
      //   .then((data) => {
      //     // Handle successful login, e.g., navigate to another screen or store token
      //   });
      const placeholderData = {
        id: '2',
        email: 'tammy@test.com',
        name: 'Tammy Young',
        isOnboarding: false,
        streak: 0,
        maxStreak: 10,
        fears: ['Spiders', 'Clowns'],
      };
      dispatch(setUser(placeholderData));
      navigation.navigate('Landing' as never);
    }
  };

  return (
    <StyledView className="flex h-full flex-col">
      <BackButton />
      <View className="flex-1 items-center justify-center">
        <Card size="sm" className="-mt-12 w-full items-stretch px-4 py-8">
          <Image
            source={require('../assets/bloom-logo.png')}
            className="h-24 w-full"
            resizeMode="contain"
          />
          <Heading className="text-center text-2xl font-bold">Login</Heading>

          {/* Email */}
          <FormControl className="w-full" isRequired={true} isInvalid={!!errors.email}>
            <FormControlLabel>
              <FormControlLabelText>Email</FormControlLabelText>
            </FormControlLabel>
            <Input className="my-1">
              <InputField
                type="text"
                placeholder="example@domain.com"
                value={loginData.email}
                onChangeText={(text) => setLoginData({ ...loginData, email: text })}
              />
            </Input>
            <FormControlError className="w-full items-start">
              <FormControlErrorText className="text-left">{errors.email}</FormControlErrorText>
            </FormControlError>
          </FormControl>

          {/* Password */}
          <FormControl className="w-full" isRequired={true} isInvalid={!!errors.password}>
            <FormControlLabel>
              <FormControlLabelText>Password</FormControlLabelText>
            </FormControlLabel>
            <Input className="my-1">
              <InputField
                type="password"
                value={loginData.password}
                onChangeText={(text) => setLoginData({ ...loginData, password: text })}
              />
            </Input>
            <FormControlError className="w-full items-start">
              <FormControlErrorText className="text-left">{errors.password}</FormControlErrorText>
            </FormControlError>
          </FormControl>
          <Button size="lg" onPress={handleSubmit}>
            <ButtonText className="text-white">Login</ButtonText>
          </Button>
        </Card>
      </View>
    </StyledView>
  );
};
