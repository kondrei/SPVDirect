import { useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import type { LineSuggestion } from '../../api/types';
import { decimalText, formatAmount, formatIsoDate } from '../../lib/format';

export function LineDescriptionField({
  label,
  value,
  suggestions,
  onChange,
  onPick,
  onOpen,
  placeholder,
}: {
  label: string;
  value: string;
  suggestions: LineSuggestion[];
  onChange: (value: string) => void;
  onPick: (suggestion: LineSuggestion) => void;
  onOpen: () => void;
  placeholder?: string;
}) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const query = value.trim().toLocaleLowerCase('ro');
  const matches = suggestions.filter((s) =>
    s.description.toLocaleLowerCase('ro').includes(query),
  );
  const shown = open && matches.length > 0;

  const options = () =>
    Array.from(box.current?.querySelectorAll<HTMLButtonElement>('.line-suggest-option') ?? []);
  const focusOption = (index: number) => options()[index]?.focus();
  const backToInput = () => {
    setOpen(false);
    input.current?.focus();
  };
  const pick = (suggestion: LineSuggestion) => {
    onPick(suggestion);
    backToInput();
  };
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
  };
  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && !shown) {
      e.preventDefault();
      setOpen(true);
      onOpen();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusOption(0);
    } else if (e.key === 'Escape' && shown) {
      e.preventDefault();
      setOpen(false);
    }
  };
  const onOptionKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusOption(Math.min(index + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (index === 0) input.current?.focus();
      else focusOption(index - 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      backToInput();
    }
  };

  return (
    <div ref={box} className="spv-field line-suggest" onBlur={onBlur}>
      <label className="spv-field-label" htmlFor={id}>
        {label}
      </label>
      <input
        ref={input}
        id={id}
        className="spv-input"
        autoComplete="off"
        value={value}
        maxLength={500}
        placeholder={placeholder}
        onFocus={onOpen}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          onOpen();
        }}
        onClick={() => {
          setOpen(true);
          onOpen();
        }}
        onKeyDown={onInputKeyDown}
      />
      {shown ? (
        <ul className="line-suggest-list" aria-label="Facturate anterior acestui client">
          {matches.map((s, index) => (
            <li key={`${s.currency}-${s.description}`}>
              <button
                type="button"
                className="line-suggest-option"
                onClick={() => pick(s)}
                onKeyDown={(e) => onOptionKeyDown(e, index)}
              >
                <span className="line-suggest-name">{s.description}</span>
                <span className="line-suggest-meta">
                  {decimalText(s.quantity)} {s.unit} ×{' '}
                  {formatAmount(s.unitPrice)} {s.currency} · ultima dată{' '}
                  {formatIsoDate(s.issueDate)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
