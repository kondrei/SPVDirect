import { useId, type SelectHTMLAttributes } from 'react';
import { cx } from './ui/cx';

export function SelectField({
  label,
  hint,
  error,
  id,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const auto = useId();
  const selectId = id ?? auto;
  const hintId = `${selectId}-hint`;
  return (
    <div className={cx('spv-field', error && 'spv-field-invalid')}>
      <label className="spv-field-label" htmlFor={selectId}>
        {label}
      </label>
      <select
        {...rest}
        id={selectId}
        className="spv-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? hintId : undefined}
      >
        {children}
      </select>
      {error || hint ? (
        <div id={hintId} className="spv-field-hint">
          {error ?? hint}
        </div>
      ) : null}
    </div>
  );
}
