import { useRef, useState } from 'react';
import { useBuyerLookup, useFindBuyer } from '../../api/hooks/invoices';
import type { FoundBuyer } from '../../api/types';
import { isValidCui, normalizeCui } from '../../lib/format';

export function useBuyerAutofill(
  cuiInput: string,
  apply: (cui: string, found: FoundBuyer) => void,
) {
  const lookup = useBuyerLookup();
  const findBuyer = useFindBuyer();
  const [found, setFound] = useState<FoundBuyer | null>(null);
  const latestRequest = useRef(0);
  const checkedCui = useRef('');
  const pressingSearch = useRef(false);
  const cuiFocused = useRef(false);

  const begin = (cui: string) => {
    checkedCui.current = cui;
    return ++latestRequest.current;
  };

  const accept = (cui: string, request: number, result: FoundBuyer) => {
    if (request !== latestRequest.current) return;
    apply(cui, result);
    setFound({ ...result, cui });
  };

  const search = (): boolean => {
    pressingSearch.current = false;
    if (!isValidCui(cuiInput)) return false;
    const cui = normalizeCui(cuiInput);
    const request = begin(cui);
    findBuyer.reset();
    lookup.mutate(cui, {
      onSuccess: (result) =>
        accept(cui, request, { ...result, anafChecked: true, source: 'anaf' }),
    });
    return true;
  };

  const fillFromCui = () => {
    cuiFocused.current = false;
    if (pressingSearch.current) {
      pressingSearch.current = false;
      return;
    }
    const cui = normalizeCui(cuiInput);
    if (!isValidCui(cui) || cui === checkedCui.current) return;
    const request = begin(cui);
    lookup.reset();
    findBuyer.mutate(cui, { onSuccess: (result) => accept(cui, request, result) });
  };

  const reset = () => {
    lookup.reset();
    findBuyer.reset();
    setFound(null);
    latestRequest.current += 1;
    checkedCui.current = '';
  };

  return {
    found: found?.cui === normalizeCui(cuiInput) ? found : null,
    lookup,
    findBuyer,
    search,
    reset,
    cuiFieldProps: {
      onFocus: () => {
        cuiFocused.current = true;
      },
      onBlur: fillFromCui,
    },
    searchButtonProps: {
      onPointerDown: () => {
        pressingSearch.current = cuiFocused.current;
      },
      onPointerCancel: () => {
        pressingSearch.current = false;
      },
    },
  };
}
