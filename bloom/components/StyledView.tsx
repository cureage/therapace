import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const StyledView: React.FC<React.PropsWithChildren<{ className?: string, backgroundColor?: string }>> = ({
  className,
  children,
  backgroundColor='#efefeb',
}) => {
  return (
    <SafeAreaView className={`h-full`} style={{ flex: 1, backgroundColor }}>
      <View
        className={`bg-background h-full flex-1 flex flex-col px-4 py-8 ${className ? className : ''}`}>
        {children}
      </View>
    </SafeAreaView>
  );
};
