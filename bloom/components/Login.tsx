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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const Login = () => {
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({ email: '', password: '' });

  const handleSubmit = () => {
    if (!EMAIL_REGEX.test(loginData.email)) {
      setErrors({ ...errors, email: 'Please enter a valid email address.' });
    } else {
      setErrors({ ...errors, email: '' });
    }
  };

  return (
    <StyledView className="flex h-full flex-col">
      <BackButton />
      <View className="flex-1 items-center justify-center">
        <Card size="sm" className="w-full items-stretch px-4 py-8 -mt-12">
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
