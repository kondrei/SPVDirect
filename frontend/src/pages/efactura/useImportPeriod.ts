import { useEffect, useRef, useState } from 'react';
import { ImportStatus } from '../../api/enums';
import {
  useImportPeriodRequest,
  useImportsDone,
} from '../../api/hooks/efacturaArchive';
import type { ImportPeriodState, ImportResult } from '../../api/types';
import { IMPORT_PROBLEM_STATUSES } from '../../common/constants';
import { countImports, emptyCounts } from '../../lib/efacturaArchive';

export function useImportPeriod() {
  const request = useImportPeriodRequest();
  const done = useImportsDone();
  const cancelled = useRef(false);
  const [state, setState] = useState<ImportPeriodState | null>(null);

  useEffect(
    () => () => {
      cancelled.current = true;
    },
    [],
  );

  const start = async (companyId: number, zile: number) => {
    cancelled.current = false;
    const results: ImportResult[] = [];
    let current: ImportPeriodState = {
      running: true,
      counts: emptyCounts(),
      found: null,
      remaining: null,
      problems: [],
      error: null,
    };
    setState(current);
    try {
      for (;;) {
        const round = await request(companyId, zile);
        results.push(...round.results);
        current = {
          ...current,
          counts: countImports(round.results, current.counts),
          found: round.found,
          remaining: round.remaining,
          problems: [
            ...current.problems,
            ...round.results.filter((r) => IMPORT_PROBLEM_STATUSES.has(r.status)),
          ],
        };
        setState(current);
        const progressed = round.results.some(
          (r) => r.status === ImportStatus.Imported,
        );
        if (!round.remaining || !progressed || cancelled.current) break;
      }
      current = { ...current, running: false };
    } catch (err) {
      current = { ...current, running: false, error: (err as Error).message };
    }
    setState(current);
    await done(results);
  };

  return {
    state,
    start,
    cancel: () => {
      cancelled.current = true;
    },
    reset: () => setState(null),
  };
}
