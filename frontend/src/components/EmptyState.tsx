import type { ReactNode } from 'react';
import { Icon, type IconName } from './ui';

export function EmptyState({ icon, title, children, actions }: { icon: IconName; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {actions ? <div className="spv-row">{actions}</div> : null}
    </div>
  );
}
