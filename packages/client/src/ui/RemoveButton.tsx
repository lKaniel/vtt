import { XIcon } from 'lucide-react';
import { Button } from './kit/button.tsx';

/** The small × that takes something off a list (a sheet's gear, an effect's change). */
export function RemoveButton({ onClick, className = '' }: Readonly<{ onClick: () => void; className?: string }>) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={`ed-remove ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label="Remove"
      title="Remove"
    >
      <XIcon />
    </Button>
  );
}
