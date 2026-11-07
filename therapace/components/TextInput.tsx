import { TextInput as RNTextInput } from 'react-native';

interface TextInputProps {
  className?: string;
  children?: any;
  placeholder?: string;
  secureTextEntry?: boolean;
}

export const TextInput: React.FC<React.PropsWithChildren<TextInputProps>> = ({ className, children, placeholder, secureTextEntry }) => {
  return <RNTextInput className={`border border-gray-300 rounded-md p-2 ${className}`} placeholder={placeholder} secureTextEntry={secureTextEntry}>{children}</RNTextInput>;
};
