import { Button } from '@/components/ui/button';
import { Icon, ArrowLeftIcon } from '@/components/ui/icon';

export const BackButton = ({ className }: { className?: string }) => {
  return (
    <Button size="icon" className={`h-16 w-16 border border-neutral-300 bg-white shadow-none ${className}`}>
      <Icon as={ArrowLeftIcon} size="lg" className="text-neutral-500" />
    </Button>
  );
};
