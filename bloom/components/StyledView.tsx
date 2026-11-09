import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUnstableNativeVariable } from 'nativewind';
import { KeyboardAvoidingView } from 'react-native';

export const StyledView: React.FC<
  React.PropsWithChildren<{ className?: string; backgroundColor?: string }>
> = ({ className, children, backgroundColor = 'var(--background)' }) => {
  const backgroundColorStyle = useUnstableNativeVariable('--background');
  return (
    <SafeAreaView className={`h-full`} style={{ flex: 1, backgroundColor: backgroundColorStyle }}>
      <KeyboardAvoidingView behavior='padding' className={`bg-background flex h-full flex-1 flex-col px-4 py-8 ${className ? className : ''}`}>
        {children}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};
