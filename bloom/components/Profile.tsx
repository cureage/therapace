import { useState } from 'react';
import { StyledView } from './StyledView';
import { Button, ButtonText } from './ui/button';
import { View, ScrollView } from 'react-native';
import { Heading } from '@/components/ui/heading';
import { ProfilePicture } from './ProfilePicture';
import {
  FormControl,
  FormControlLabel,
  FormControlError,
  FormControlErrorText,
  FormControlLabelText,
} from '@/components/ui/form-control';
import { Input, InputField } from '@/components/ui/input';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { Card } from './ui/card';
import { Text } from '@/components/ui/text';
import { MAX_FEARS } from '@/utils/constants';
import { SquarePen } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';

export const Profile = () => {
  const [isEdit, setIsEdit] = useState(false);
  const userData = useAppSelector((state) => state.user.currentUser);
  const [updateProfileData, setUpdateProfileData] = useState({
    ...userData,
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    fears: '',
  });
  const [fear, setFear] = useState('');
  const addFear = () => {
    const cleanFear = fear.trim();
    if (
      !cleanFear ||
      updateProfileData.fears.length >= MAX_FEARS ||
      updateProfileData.fears.includes(cleanFear)
    )
      return;
    setUpdateProfileData((curr) => ({ ...curr, fears: curr.fears.push(cleanFear) }));
    setFear('');
  };
  const dispatch = useAppDispatch();

  function saveProfile() {
    setIsEdit(false);
  }

  function cancelEdit() {
    setUpdateProfileData({
      ...userData,
      password: '',
      confirmPassword: '',
    });
    setIsEdit(false);
  }

  return (
    <StyledView className="flex h-full flex-col gap-8">
      <Heading className="text-4xl font-bold">Profile</Heading>
      <View className="flex items-center justify-center">
        <ProfilePicture />
      </View>
      <Card>
        <ScrollView contentContainerClassName="flex flex-col gap-4">
          {/* Name */}
          <FormControl className="w-full" isRequired={true && isEdit} isInvalid={!!errors.name}>
            <FormControlLabel>
              <FormControlLabelText>Name</FormControlLabelText>
            </FormControlLabel>
            {isEdit ? (
              <Input className="my-1">
                <InputField
                  type="text"
                  placeholder="Jane Doe"
                  value={updateProfileData.name}
                  onChangeText={(text) =>
                    setUpdateProfileData({ ...updateProfileData, name: text })
                  }
                />
              </Input>
            ) : (
              <Text>{updateProfileData.name}</Text>
            )}
            <FormControlError className="w-full items-start">
              <FormControlErrorText className="text-left">{errors.name}</FormControlErrorText>
            </FormControlError>
          </FormControl>

          {/* Email */}
          <FormControl
            className="w-full"
            isRequired={true && isEdit}
            isInvalid={!!errors.email}
            isReadOnly={!isEdit}>
            <FormControlLabel>
              <FormControlLabelText>Email</FormControlLabelText>
            </FormControlLabel>
            {isEdit ? (
              <Input className="my-1">
                <InputField
                  type="text"
                  placeholder="example@domain.com"
                  value={updateProfileData.email}
                  onChangeText={(text) =>
                    setUpdateProfileData({ ...updateProfileData, email: text })
                  }
                />
              </Input>
            ) : (
              <Text>{updateProfileData.email}</Text>
            )}
            <FormControlError className="w-full items-start">
              <FormControlErrorText className="text-left">{errors.email}</FormControlErrorText>
            </FormControlError>
          </FormControl>

          {/* Fears */}
          <FormControl
            className="w-full"
            isRequired={true && isEdit}
            isInvalid={!!errors.email}
            isReadOnly={!isEdit}>
            <FormControlLabel>
              <FormControlLabelText>Fears</FormControlLabelText>
            </FormControlLabel>
            <View className="mt-1 gap-3">
              {updateProfileData.fears.map((item: any, index: any) => (
                <View
                  key={item}
                  className="flex-row items-center rounded-2xl border border-neutral-200 bg-white px-4 py-3">
                  <View className="bg-primary/10 mr-3 h-7 w-7 items-center justify-center rounded-full">
                    <Text className="text-primary font-bold">{index + 1}</Text>
                  </View>
                  <Text className="flex-1 text-base text-neutral-800 dark:text-neutral-200">
                    {item}
                  </Text>
                  {isEdit ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() =>
                        setUpdateProfileData(
                          updateProfileData.fears.filter((fearItem: any) => fearItem !== item)
                        )
                      }>
                      <ButtonText className="text-neutral-500">Remove</ButtonText>
                    </Button>
                  ) : null}
                </View>
              ))}
              {updateProfileData.fears.length < MAX_FEARS && isEdit && (
                <View>
                  <Input className="min-h-14 rounded-2xl border-neutral-200 bg-white px-4">
                    <InputField
                      placeholder={
                        updateProfileData.fears.length
                          ? 'Add another fear'
                          : 'For example, insects or deep water'
                      }
                      value={fear}
                      onChangeText={setFear}
                      onSubmitEditing={addFear}
                      returnKeyType="done"
                      maxLength={80}
                    />
                  </Input>
                  <View className="mt-2 flex-row items-center justify-between">
                    <Text className="text-sm text-neutral-500">
                      {updateProfileData.fears.length} of {MAX_FEARS} added
                    </Text>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="border border-neutral-200 bg-white shadow-sm"
                      isDisabled={!fear.trim()}
                      onPress={addFear}>
                      <ButtonText>Add fear</ButtonText>
                    </Button>
                  </View>
                </View>
              )}
            </View>
          </FormControl>

          {isEdit ? (
            <View className="flex flex-col gap-4">
              <FormControl className="w-full" isRequired={false} isInvalid={!!errors.password}>
                <FormControlLabel>
                  <FormControlLabelText>Password</FormControlLabelText>
                </FormControlLabel>
                <Input className="my-1">
                  <InputField
                    type="password"
                    value={updateProfileData.password}
                    onChangeText={(text) =>
                      setUpdateProfileData({ ...updateProfileData, password: text })
                    }
                  />
                </Input>
                <FormControlError className="w-full items-start">
                  <FormControlErrorText className="text-left">
                    {errors.password}
                  </FormControlErrorText>
                </FormControlError>
              </FormControl>

              <FormControl className="w-full" isRequired={false} isInvalid={!!errors.password}>
                <FormControlLabel>
                  <FormControlLabelText>Confirm Password</FormControlLabelText>
                </FormControlLabel>
                <Input className="my-1">
                  <InputField
                    type="password"
                    value={updateProfileData.confirmPassword}
                    onChangeText={(text) =>
                      setUpdateProfileData({ ...updateProfileData, confirmPassword: text })
                    }
                  />
                </Input>
                <FormControlError className="w-full items-start">
                  <FormControlErrorText className="text-left">
                    {errors.confirmPassword}
                  </FormControlErrorText>
                </FormControlError>
              </FormControl>
            </View>
          ) : null}

          {!isEdit ? (
            <Button size="icon" variant="outline" onPress={() => setIsEdit(true)}>
              <Icon as={SquarePen} size="lg" />
            </Button>
          ) : null}

          {isEdit ? (
            <Button size="lg" onPress={() => saveProfile()}>
              <ButtonText className="text-foreground">Save</ButtonText>
            </Button>
          ) : null}

          {isEdit ? (
            <Button variant="outline" size="lg" onPress={() => cancelEdit()}>
              <ButtonText className="text-foreground">Cancel</ButtonText>
            </Button>
          ) : null}

          {isEdit ? <View className="h-48" /> : null}
        </ScrollView>
      </Card>
    </StyledView>
  );
};
