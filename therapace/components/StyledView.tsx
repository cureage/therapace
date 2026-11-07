import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

export const StyledView: React.FC<React.PropsWithChildren<{ className?: string }>> = ({
  className,
  children,
}) => {
  return (
    <SafeAreaProvider className={`h-screen`}>
      <SafeAreaView className={`flex h-screen flex-col px-4 py-8 bg-background ${className ? className : ''}`}>
        {children}
      </SafeAreaView>
    </SafeAreaProvider>
  );
};
