declare module '@mealection/react-native-boring-avatars' {
  import { ComponentType } from 'react';

  export type AvatarVariant =
    | 'marble'
    | 'beam'
    | 'pixel'
    | 'sunset'
    | 'ring'
    | 'bauhaus';

  export interface AvatarProps {
    size?: number;
    name?: string;
    variant?: AvatarVariant;
    colors?: string[];
    square?: boolean;
  }

  const Avatar: ComponentType<AvatarProps>;
  export default Avatar;
}
