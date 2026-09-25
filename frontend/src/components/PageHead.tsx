import type { ReactNode } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function PageHead({ title, context, crumbs, actions }: { title: string; context?: ReactNode; crumbs?: ReactNode; actions?: ReactNode }) {
  useDocumentTitle(title);
  return (
    <div className="page-head">
      <div>
        {crumbs ? <div className="crumbs">{crumbs}</div> : null}
        <h1>{title}</h1>
        {context ? <p>{context}</p> : null}
      </div>
      {actions ? <div className="spv-row">{actions}</div> : null}
    </div>
  );
}
