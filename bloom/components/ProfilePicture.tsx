import { View } from 'react-native';

export const ProfilePicture = ({ name, className }: { name: string; className: string }) => {
  return <View className={`h-48 w-48 rounded-full bg-white ${className ?? ''}`}></View>;
};
