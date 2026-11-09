import { Button } from '@/components/ui/button';
import { Icon, ArrowLeftIcon } from '@/components/ui/icon';
import { useNavigation } from '@react-navigation/native';

export const BackButton = ({
  className,
  onPress,
}: {
  className?: string;
  onPress?: () => void;
}) => {
  const navigation = useNavigation();
  return (
    <Button
      size="icon"
      className={`bg-back-btn data-[active=true]:bg-back-btn/90 h-16 w-16 border border-neutral-300 shadow-none dark:border-neutral-700 ${className}`}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      onPress={onPress ?? (() => navigation.goBack())}>
      <Icon as={ArrowLeftIcon} size="lg" className="text-neutral-500" />
    </Button>
  );
};
