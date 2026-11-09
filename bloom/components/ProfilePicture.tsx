import { useUnstableNativeVariable } from 'nativewind';
import { View } from 'react-native';

export const ProfilePicture = ({ name }: any) => {
  const primaryColor = useUnstableNativeVariable('--primary');
  const accentColor = useUnstableNativeVariable('--accent');
  const backgroundColor = useUnstableNativeVariable('--background');
  return <View className="h-48 w-48 rounded-full bg-white"></View>;
};
