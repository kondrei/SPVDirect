import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface CommonProps {
  variant?: Variant;
  size?: 'md' | 'sm';
  icon?: IconName;
  children?: ReactNode;
  className?: string;
}

function classes(p: CommonProps) {
  return cx('spv-btn', `spv-btn-${p.variant ?? 'secondary'}`, p.size === 'sm' && 'spv-btn-sm', p.className);
}

export type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean };

/** One `primary` per view. Labels are Romanian imperatives in sentence case. */
export function Button({ variant, size, icon, children, className, loading, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button {...rest} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={classes({ variant, size, className })}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

/** In-app navigation styled as a button. */
export function ButtonLink({ variant, size, icon, children, className, to }: CommonProps & { to: string }) {
  return (
    <Link to={to} className={classes({ variant, size, className })}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </Link>
  );
}

/**
 * A full-page navigation styled as a button: for backend routes that redirect
 * (GET /anaf/connect goes to logincert.anaf.ro), which fetch() cannot follow.
 */
export function ButtonAnchor({ variant, size, icon, children, className, ...rest }: CommonProps & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a {...rest} className={classes({ variant, size, className })}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </a>
  );
}
