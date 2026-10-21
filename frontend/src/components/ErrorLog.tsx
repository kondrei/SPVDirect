export function ErrorLog({ lines }: Readonly<{ lines: string[] }>) {
  if (lines.length === 0) return null;
  return (
    <pre className="error-log">
      {lines.join('\n')}
    </pre>
  );
}
