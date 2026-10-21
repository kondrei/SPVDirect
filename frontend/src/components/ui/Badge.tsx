import type { ReactNode } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

export function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
}: Readonly<{
  tone?: Tone;
  icon?: IconName;
  children: ReactNode;
  className?: string;
}>) {
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
  | 'sending'
  | 'pending'
  | 'none'
  | 'yes'
  | 'no'
  | 'inactive'
  | 'unverified'
  | 'added'
  | 'duplicate'
  | 'notFound'
  | 'stored'
  | 'emailed'
  | 'storno'
  | 'stornoed'
  | 'messageError'
  | 'messageReceived'
  | 'messageSent'
  | 'messageOther';

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
  sending: { tone: 'warning', icon: 'upload', label: 'Se trimite' },
  pending: { tone: 'neutral', icon: 'clock', label: 'În așteptare' },
  none: { tone: 'neutral', icon: 'link', label: 'Fără certificat' },
  yes: { tone: 'success', icon: 'check', label: 'Da' },
  no: { tone: 'neutral', icon: 'x', label: 'Nu' },
  inactive: { tone: 'danger', icon: 'alert', label: 'Contribuabil inactiv' },
  unverified: { tone: 'warning', icon: 'alert', label: 'Status neverificat la ANAF' },
  added: { tone: 'success', icon: 'check', label: 'Adăugată' },
  duplicate: { tone: 'neutral', icon: 'info', label: 'Exista deja' },
  notFound: { tone: 'danger', icon: 'x', label: 'Negăsit la ANAF' },
  stored: { tone: 'success', icon: 'check', label: 'În cloud' },
  emailed: { tone: 'brand', icon: 'check', label: 'Trimisă pe email' },
  storno: { tone: 'warning', icon: 'alert', label: 'Stornare' },
  stornoed: { tone: 'warning', icon: 'alert', label: 'Stornată' },
  messageError: { tone: 'danger', icon: 'alert', label: 'Erori de validare' },
  messageReceived: { tone: 'brand', icon: 'download', label: 'Factură primită' },
  messageSent: { tone: 'success', icon: 'upload', label: 'Factură trimisă' },
  messageOther: { tone: 'neutral', icon: 'info', label: 'Mesaj' },
};

export function StatusBadge({
  status,
  children,
}: Readonly<{
  status: Status;
  children?: ReactNode;
}>) {
  const s = STATUS[status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {children ?? s.label}
    </Badge>
  );
}
