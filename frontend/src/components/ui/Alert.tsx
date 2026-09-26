import type { ReactNode } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';

type AlertTone = 'info' | 'success' | 'warning' | 'danger';
const ICON: Record<AlertTone, IconName> = {
  info: 'info',
  success: 'check',
  warning: 'alert',
  danger: 'x',
};

export interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: AlertProps) {
  return (
    <div
      className={cx('spv-alert', `spv-alert-${tone}`, className)}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <Icon name={ICON[tone]} />
      <div>
        {title ? <p className="spv-alert-title">{title}</p> : null}
        {children ? <p className="spv-alert-text">{children}</p> : null}
      </div>
      {action ? <div className="spv-alert-action">{action}</div> : null}
    </div>
  );
}
