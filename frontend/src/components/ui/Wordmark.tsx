export function Wordmark({ className }: Readonly<{ className?: string }>) {
  return (
    <span className={className ?? 'spv-wordmark'}>
      SPV<b>Direct</b>
    </span>
  );
}
