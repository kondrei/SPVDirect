import { PageHead } from '../components/PageHead';
import { EmptyState } from '../components/EmptyState';
import { ButtonLink, Card, type IconName } from '../components/ui';
import { useAppPath } from '../hooks/useAppPath';

export function ComingSoonPage({
  title,
  icon,
  what,
}: {
  title: string;
  icon: IconName;
  what: string;
}) {
  const appPath = useAppPath();
  return (
    <>
      <PageHead title={title} />
      <Card>
        <EmptyState
          icon={icon}
          title={`${title} este în lucru.`}
          actions={
            <ButtonLink to={appPath('/connections')} icon="certificate">
              Pregătește certificatele
            </ButtonLink>
          }
        >
          {what} Până atunci, conectați certificatele și legați-le de firme: vor
          fi folosite automat.
        </EmptyState>
      </Card>
    </>
  );
}
