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

export const Signup = () => {
  const [signupData, setSignupData] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({ name: '', email: '', password: '' });
  const navigation = useNavigation();
  const dispatch = useAppDispatch();

  const handleSubmit = () => {
    let hasError = false;
    if (!EMAIL_REGEX.test(signupData.email)) {
      setErrors({ ...errors, email: 'Please enter a valid email address.' });
      hasError = true;
    }
    if (signupData.password.length == 0) {
      setErrors({ ...errors, password: 'Please enter your password.' });
      hasError = true;
    }
    if (signupData.email.length == 0) {
      setErrors({ ...errors, email: 'Please enter your email address.' });
      hasError = true;
    }
    if (signupData.name.length == 0) {
      setErrors({ ...errors, name: 'Please enter your name.' });
      hasError = true;
    }

    if (!hasError) {
      setErrors({ ...errors, email: '', password: '', name: '' });
      fetch(endpoints.signup, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(signupData),
      })
        .then((res) => res.json())
        .then((data) => {
          // Handle successful signup, e.g., navigate to another screen or store token
        });
      const placeholderData = {
        id: '1',
        email: 'tammy@test.com',
        name: 'Tammy Young',
        isOnboarding: true,
        streak: 1,
        maxStreak: 10
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
          <Heading className="text-center text-2xl font-bold">Sign Up</Heading>

          {/* Name */}
          <FormControl className="w-full" isRequired={true} isInvalid={!!errors.name}>
            <FormControlLabel>
              <FormControlLabelText>Name</FormControlLabelText>
            </FormControlLabel>
            <Input className="my-1">
              <InputField
                type="text"
                placeholder="Jane Doe"
                value={signupData.name}
                onChangeText={(text) => setSignupData({ ...signupData, name: text })}
              />
            </Input>
            <FormControlError className="w-full items-start">
              <FormControlErrorText className="text-left">{errors.name}</FormControlErrorText>
            </FormControlError>
          </FormControl>

          {/* Email */}
          <FormControl className="w-full" isRequired={true} isInvalid={!!errors.email}>
            <FormControlLabel>
              <FormControlLabelText>Email</FormControlLabelText>
            </FormControlLabel>
            <Input className="my-1">
              <InputField
                type="text"
                placeholder="example@domain.com"
                value={signupData.email}
                onChangeText={(text) => setSignupData({ ...signupData, email: text })}
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
                value={signupData.password}
                onChangeText={(text) => setSignupData({ ...signupData, password: text })}
              />
            </Input>
            <FormControlError className="w-full items-start">
              <FormControlErrorText className="text-left">{errors.password}</FormControlErrorText>
            </FormControlError>
          </FormControl>
          <Button size="lg" onPress={handleSubmit}>
            <ButtonText className="text-white">Sign Up</ButtonText>
          </Button>
        </Card>
      </View>
    </StyledView>
  );
};
