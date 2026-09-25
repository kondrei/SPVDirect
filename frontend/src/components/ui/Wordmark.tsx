/** No logo yet: the name set in type, "Direct" in brand. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className ?? 'spv-wordmark'}>
      SPV<b>Direct</b>
    </span>
  );
}
