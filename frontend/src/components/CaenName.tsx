import type { CaenInfo } from '../api/types';
import { Badge } from './ui';

export function CaenName({
  caen,
  code,
}: {
  caen: CaenInfo | null | undefined;
  code?: string | null;
}) {
  if (!caen) {
    return code ? (
      <span>
        <span className="mono">{code}</span>{' '}
        <span className="muted">· cod necunoscut în nomenclatorul CAEN</span>
      </span>
    ) : (
      <span className="muted">—</span>
    );
  }
  return (
    <span className="stack-sm">
      <span>
        <span className="mono">{caen.code}</span> {caen.name}{' '}
        <Badge tone={caen.revision === 3 ? 'neutral' : 'warning'}>
          CAEN Rev. {caen.revision}
        </Badge>
      </span>
      {caen.revision === 2 ? (
        <span className="muted small">
          Codul nu mai există în CAEN Rev. 3; firma trebuie să își actualizeze
          obiectul de activitate.
        </span>
      ) : null}
      {caen.rev2Name ? (
        <span className="muted small">
          În CAEN Rev. 2, același cod însemna: {caen.rev2Name}
        </span>
      ) : null}
    </span>
  );
}
