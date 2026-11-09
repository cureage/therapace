import { useState } from 'react';
import { StyledView } from './StyledView';
import { Card } from './ui/card';
import { Button, ButtonText } from './ui/button';
import { Image, Text, View } from 'react-native';
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
import { authenticate } from '@/services/AuthService';
import { setUser } from '@/store/slices/userSlice';
import { useAppDispatch } from '@/store/hooks';

export const Login = () => {
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({ email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const dispatch = useAppDispatch();

  const handleSubmit = async () => {
    const email = loginData.email.trim();
    const errors = {
      email: EMAIL_REGEX.test(email) ? '' : 'Please enter a valid email address.',
      password: loginData.password ? '' : 'Please enter your password.',
    };
    setErrors(errors);
    if (errors.email || errors.password || submitting) return;
    const credentials = { email, password: loginData.password };
    setSubmitting(true);
    setSubmitError('');
    try {
      dispatch(setUser(await authenticate(endpoints.login, credentials, false)));
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not connect to the server.');
    } finally {
      setSubmitting(false);
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
              <FormControlErrorText className="text-left text-red-700">{errors.email}</FormControlErrorText>
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
              <FormControlErrorText className="text-left text-red-700">{errors.password}</FormControlErrorText>
            </FormControlError>
          </FormControl>
          {submitError && <Text accessibilityRole="alert">{submitError}</Text>}
          <Button size="lg" isDisabled={submitting} onPress={() => void handleSubmit()}>
            <ButtonText className="text-white">Login</ButtonText>
          </Button>
        </Card>
      </View>
    </StyledView>
  );
};
