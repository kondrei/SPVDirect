import { useState } from 'react';
import { Button } from './ui';

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the text is selectable */
    }
  };
  return (
    <div className="copy-box">
      <code aria-label={label} title={value}>{value}</code>
      <Button size="sm" icon={copied ? 'check' : 'copy'} onClick={copy}>
        {copied ? 'Copiat' : 'Copiază'}
      </Button>
    </div>
  );
}
