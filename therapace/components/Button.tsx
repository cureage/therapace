import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  Text,
} from "react-native";

type ButtonVariant = "filled" | "outlined";

export interface ButtonProps extends Omit<PressableProps, "children"> {
  variant?: ButtonVariant;
  loading?: boolean;
  className?: string;
  textClassName?: string;
  children?: any;
  onPress?: () => void;
}

const containerVariants: Record<ButtonVariant, string> = {
  filled: "bg-primary",
  outlined: "bg-transparent border-2 border-primary",
};

const textVariants: Record<ButtonVariant, string> = {
  filled: "text-white",
  outlined: "text-primary",
};

const spinnerColors: Record<ButtonVariant, string> = {
  filled: "#ffffff",
  outlined: "#2563eb",
};

export function Button({
  variant = "filled",
  loading = false,
  disabled,
  className = "",
  textClassName = "",
  children,
  onPress,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      className={`w-full flex-row items-center justify-center rounded-full px-6 py-3 active:opacity-80 ${
        containerVariants[variant]
      } ${isDisabled ? "opacity-50" : ""} ${className}`}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColors[variant]} />
      ) : (
        <Text
          className={`text-lg font-semibold ${textVariants[variant]} ${textClassName}`}
        >
          {children}
        </Text>
      )}
    </Pressable>
  );
}

export default Button;
