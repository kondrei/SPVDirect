export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}
