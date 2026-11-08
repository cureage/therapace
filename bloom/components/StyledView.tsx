import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUnstableNativeVariable } from "nativewind";

export const StyledView: React.FC<
  React.PropsWithChildren<{ className?: string; backgroundColor?: string }>
> = ({ className, children, backgroundColor = 'var(--background)' }) => {
  const backgroundColorStyle = useUnstableNativeVariable("--background");
  return (
    <SafeAreaView className={`h-full`} style={{ flex: 1, backgroundColor: backgroundColorStyle }}>
      <View
        className={`bg-background flex h-full flex-1 flex-col px-4 py-8 ${className ? className : ''}`}>
        {children}
      </View>
    </SafeAreaView>
  );
};
