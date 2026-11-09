import { View } from 'react-native';

import Avatar from '@mealection/react-native-boring-avatars';

export const ProfilePicture = ({ name, className, size }: { name?: string; className?: string, size?: number }) => {
  return (
    <Avatar
      size={size || 150}
      name={name}
      // variant="pixel"
      colors={['#92A1C6', '#146A7C', '#F0AB3D', '#C271B4', '#C20D90']}
    />
  );
};
