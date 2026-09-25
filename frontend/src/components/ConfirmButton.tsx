import { useEffect, useState } from 'react';
import { Button } from './ui';

/**
 * Two-step destructive action: the first click arms it, the second confirms.
 * Disarms itself after 5 s. No modal needed for a single row action.
 */
export function ConfirmButton({ label, confirmLabel, onConfirm, loading }: { label: string; confirmLabel: string; onConfirm: () => void; loading?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);
  return armed ? (
    <Button size="sm" variant="danger" icon="trash" loading={loading} onClick={onConfirm}>
      {confirmLabel}
    </Button>
  ) : (
    <Button size="sm" variant="ghost" icon="trash" onClick={() => setArmed(true)}>
      {label}
    </Button>
  );
}
