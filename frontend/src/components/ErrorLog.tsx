export function ErrorLog({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <pre className="error-log">
      {lines.join('\n')}
    </pre>
  );
}
