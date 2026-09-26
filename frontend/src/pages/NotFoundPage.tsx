import { EmptyState } from '../components/EmptyState';
import { ButtonLink, Card } from '../components/ui';
import { useAppPath } from '../hooks/useAppPath';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Pagină inexistentă');
  const appPath = useAppPath();
  return (
    <Card>
      <EmptyState
        icon="search"
        title="Pagina nu există."
        actions={<ButtonLink to={appPath()}>Înapoi la panou</ButtonLink>}
      >
        Verificați adresa sau folosiți meniul din stânga.
      </EmptyState>
    </Card>
  );
}
