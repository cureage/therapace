import { Button } from '@/components/ui/button';
import { Icon, ArrowLeftIcon } from '@/components/ui/icon';
import { useNavigation } from '@react-navigation/native';

export const BackButton = ({ className }: { className?: string }) => {
  const navigation = useNavigation();
  return (
    <Button
      size="icon"
      className={`h-16 w-16 border border-neutral-300 dark:border-neutral-700 bg-back-btn data-[active=true]:bg-back-btn/90 shadow-none ${className}`}
      onPress={() => navigation.goBack()}>
      <Icon as={ArrowLeftIcon} size="lg" className="text-neutral-500" />
    </Button>
  );
};
