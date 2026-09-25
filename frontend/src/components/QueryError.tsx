import { Alert, Button } from './ui';

export function QueryError({ error, retry }: { error: Error | null; retry?: () => void }) {
  return (
    <Alert
      tone="danger"
      title="Datele nu au putut fi încărcate."
      action={retry ? <Button size="sm" icon="refresh" onClick={retry}>Reîncearcă</Button> : undefined}
    >
      {error?.message}
    </Alert>
  );
}
