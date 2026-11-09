import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StyledView } from '@/components/StyledView';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useAppDispatch } from '@/store/hooks';
import { setFears as storeFears } from '@/store/slices/userSlice';
import { MAX_FEARS } from '@/utils/constants';

export const Fears = () => {
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const [fear, setFear] = useState('');
  const [fears, setFears] = useState<string[]>([]);
  const addFear = () => {
    const cleanFear = fear.trim();
    if (!cleanFear || fears.length >= MAX_FEARS || fears.includes(cleanFear)) return;
    setFears([...fears, cleanFear]);
    setFear('');
  };

  return (
    <StyledView>
      <View className="mt-5 flex-row gap-2">
        {[1, 2, 3, 4, 5].map((step) => (
          <View
            key={step}
            className={`h-2 flex-1 rounded-full ${step <= 2 ? 'bg-primary' : 'bg-neutral-200'}`}
          />
        ))}
      </View>
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <View className="pt-10 pb-6">
          <Text className="text-primary mb-3 font-semibold tracking-widest uppercase">
            Your story
          </Text>
          <Heading size="3xl" className="text-neutral-900">
            What are you afraid of?
          </Heading>
          <Text size="lg" className="mt-4 leading-7 text-neutral-600">
            This is a safe, judgment-free space. Share a little or as much as feels comfortable.
          </Text>
          <View className="mt-8 gap-3">
            {fears.map((item, index) => (
              <View
                key={item}
                className="flex-row items-center rounded-2xl border border-neutral-200 bg-white px-4 py-3">
                <View className="bg-primary/10 mr-3 h-7 w-7 items-center justify-center rounded-full">
                  <Text className="text-primary font-bold">{index + 1}</Text>
                </View>
                <Text className="flex-1 text-base text-neutral-800 dark:text-neutral-200">{item}</Text>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => setFears(fears.filter((fearItem) => fearItem !== item))}>
                  <ButtonText className="text-neutral-500">Remove</ButtonText>
                </Button>
              </View>
            ))}
          </View>
          {fears.length < MAX_FEARS && (
            <View className="mt-4">
              <Input className="min-h-14 rounded-2xl border-neutral-200 bg-white px-4">
                <InputField
                  placeholder={
                    fears.length ? 'Add another fear' : 'For example, insects or deep water'
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
                  {fears.length} of {MAX_FEARS} added
                </Text>
                <Button size="sm" variant="secondary" className='bg-white border border-neutral-200 shadow-sm' isDisabled={!fear.trim()} onPress={addFear}>
                  <ButtonText>Add fear</ButtonText>
                </Button>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
      <Button
        size="lg"
        isDisabled={!fears.length}
        onPress={() => {
          dispatch(storeFears(fears));
          navigation.navigate('Thanks' as never);
        }}>
        <ButtonText className="text-white">Continue</ButtonText>
      </Button>
    </StyledView>
  );
};
