import { View } from 'react-native';

export const Card: React.FC<React.PropsWithChildren<{ className?: string }>> = ({
  className,
  children,
}) => {
  return <View className={`rounded-lg bg-white p-4 shadow-md ${className}`}>{children}</View>;
};
