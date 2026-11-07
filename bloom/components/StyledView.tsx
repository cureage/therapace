import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const StyledView: React.FC<React.PropsWithChildren<{ className?: string }>> = ({
  className,
  children,
}) => {
  return (
      <View
        className={`bg-background h-full flex-1 flex flex-col px-4 py-8 ${className ? className : ''}`}>
        <SafeAreaView className={`h-full`}></SafeAreaView>
        {children}
      </View>
    // </SafeAreaView>
  );
};
