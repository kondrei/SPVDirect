import type { ReactNode } from 'react';
import { cx } from './cx';

export interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  flush?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Card({
  title,
  subtitle,
  actions,
  flush,
  className,
  children,
}: CardProps) {
  return (
    <section className={cx('spv-card', flush && 'spv-card-flush', className)}>
      {title || actions ? (
        <header className="spv-card-head">
          <div>
            {title ? <h2 className="spv-card-title">{title}</h2> : null}
            {subtitle ? <p className="spv-card-sub">{subtitle}</p> : null}
          </div>
          {actions ? <div className="spv-row">{actions}</div> : null}
        </header>
      ) : null}
      <div className="spv-card-body">{children}</div>
    </section>
  );
}
