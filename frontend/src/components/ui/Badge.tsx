import type { ReactNode } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

export function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: IconName;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cx('spv-badge', `spv-badge-${tone}`, className)}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </span>
  );
}

export type Status =
  | 'active'
  | 'expiring'
  | 'expired'
  | 'revoked'
  | 'ok'
  | 'nok'
  | 'processing'
  | 'pending'
  | 'none'
  | 'yes'
  | 'no'
  | 'inactive'
  | 'added'
  | 'duplicate'
  | 'notFound';

export const STATUS: Record<
  Status,
  { tone: Tone; icon: IconName; label: string }
> = {
  active: { tone: 'success', icon: 'check', label: 'Activ' },
  expiring: { tone: 'warning', icon: 'clock', label: 'Expiră curând' },
  expired: { tone: 'danger', icon: 'x', label: 'Expirat' },
  revoked: { tone: 'danger', icon: 'x', label: 'Revocat' },
  ok: { tone: 'success', icon: 'check', label: 'Acceptată' },
  nok: { tone: 'danger', icon: 'x', label: 'Respinsă' },
  processing: { tone: 'warning', icon: 'clock', label: 'În prelucrare' },
  pending: { tone: 'neutral', icon: 'clock', label: 'În așteptare' },
  none: { tone: 'neutral', icon: 'link', label: 'Fără certificat' },
  yes: { tone: 'success', icon: 'check', label: 'Da' },
  no: { tone: 'neutral', icon: 'x', label: 'Nu' },
  inactive: { tone: 'danger', icon: 'alert', label: 'Contribuabil inactiv' },
  added: { tone: 'success', icon: 'check', label: 'Adăugată' },
  duplicate: { tone: 'neutral', icon: 'info', label: 'Exista deja' },
  notFound: { tone: 'danger', icon: 'x', label: 'Negăsit la ANAF' },
};

export function StatusBadge({
  status,
  children,
}: {
  status: Status;
  children?: ReactNode;
}) {
  const s = STATUS[status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {children ?? s.label}
    </Badge>
  );
}
