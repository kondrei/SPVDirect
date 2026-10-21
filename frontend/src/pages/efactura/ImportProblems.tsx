import { ImportStatus } from '../../api/enums';
import type { ImportResult } from '../../api/types';

export function ImportProblems({
  problems,
}: Readonly<{ problems: ImportResult[] }>) {
  const shown = problems.filter(
    (p) => p.status === ImportStatus.Failed || p.status === ImportStatus.Skipped,
  );
  if (shown.length === 0) return null;
  return (
    <details>
      <summary>Mesaje neimportate ({shown.length})</summary>
      <ul className="plain-list">
        {shown.map((p) => (
          <li key={p.messageId}>
            <span className="mono">{p.messageId}</span>: {p.reason ?? 'necunoscut'}
          </li>
        ))}
      </ul>
    </details>
  );
}
