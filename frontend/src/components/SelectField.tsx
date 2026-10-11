import { useId, type SelectHTMLAttributes } from 'react';

export function SelectField({
  label,
  hint,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="spv-field">
      <label className="spv-field-label" htmlFor={id}>
        {label}
      </label>
      <select {...rest} id={id} className="spv-input">
        {children}
      </select>
      {hint ? <div className="spv-field-hint">{hint}</div> : null}
    </div>
  );
}
