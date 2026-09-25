import { useId, type InputHTMLAttributes } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  /** Replaces the hint, turns the border danger and sets aria-invalid. */
  error?: string;
  /** Identifiers: CUI, certificate serials, ANAF indexes. */
  mono?: boolean;
  icon?: IconName;
}

export function TextField({ label, hint, error, mono, icon, className, id, ...rest }: TextFieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = `${inputId}-hint`;
  const input = (
    <input
      {...rest}
      id={inputId}
      className={cx('spv-input', mono && 'spv-input-mono')}
      aria-invalid={error ? true : undefined}
      aria-describedby={error || hint ? hintId : undefined}
    />
  );
  return (
    <div className={cx('spv-field', error && 'spv-field-invalid', className)}>
      {label ? (
        <label className="spv-field-label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      {icon ? (
        <div className="spv-input-wrap">
          <Icon name={icon} />
          {input}
        </div>
      ) : (
        input
      )}
      {error || hint ? (
        <div id={hintId} className="spv-field-hint">
          {error ?? hint}
        </div>
      ) : null}
    </div>
  );
}
