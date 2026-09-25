import { PageHead } from '../components/PageHead';
import { EmptyState } from '../components/EmptyState';
import { ButtonLink, Card, type IconName } from '../components/ui';

/** e-Factura and e-Transport arrive with the Phase 2 backend modules. */
export function ComingSoonPage({ title, icon, what }: { title: string; icon: IconName; what: string }) {
  return (
    <>
      <PageHead title={title} />
      <Card>
        <EmptyState icon={icon} title={`${title} este în lucru.`} actions={<ButtonLink to="/connections" icon="certificate">Pregătește certificatele</ButtonLink>}>
          {what} Până atunci, conectați certificatele și legați-le de firme: vor fi folosite automat.
        </EmptyState>
      </Card>
    </>
  );
}
