import { Text } from 'react-native';

export const Title: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ className, children }) => {
  return <Text className={`text-2xl font-bold ${className}`}>{children}</Text>;
}

export const StyledText: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ className, children }) => {
  return <Text className={`text-base ${className}`}>{children}</Text>;
}
