import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function Stat({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="spv-card spv-stat">
      <div className="spv-stat-label">
        {icon ? <Icon name={icon} /> : null}
        {label}
      </div>
      <div className="spv-stat-value">{value}</div>
      {note ? <div className="spv-stat-note">{note}</div> : null}
    </div>
  );
}
