import { createBrowserRouter } from 'react-router';
import { AccountRedirect } from './layout/AccountRedirect';
import { AppLayout } from './layout/AppLayout';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { CompaniesPage } from './pages/companies/CompaniesPage';
import { CompanyPage } from './pages/companies/CompanyPage';
import { ConnectionsPage } from './pages/ConnectionsPage';
import { DashboardPage } from './pages/DashboardPage';
import { EfacturaMessagesPage } from './pages/efactura/EfacturaMessagesPage';
import { EfacturaPage } from './pages/efactura/EfacturaPage';
import { EfacturaValidatorPage } from './pages/efactura/EfacturaValidatorPage';
import { InvoiceNewPage } from './pages/invoices/InvoiceNewPage';
import { InvoicesPage } from './pages/invoices/InvoicesPage';
import { AuthRedirect } from './pages/landing/AuthRedirect';
import { LandingPage } from './pages/LandingPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProfilePage } from './pages/ProfilePage';
import { SpvPage } from './pages/SpvPage';

export const routes = [
  { path: '/', element: <LandingPage /> },
  { path: '/login', element: <AuthRedirect tab="login" /> },
  { path: '/register', element: <AuthRedirect tab="register" /> },
  {
    path: '/accountants/:accountantId',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'companies', element: <CompaniesPage /> },
      { path: 'companies/:id', element: <CompanyPage /> },
      { path: 'connections', element: <ConnectionsPage /> },
      { path: 'invoices', element: <InvoicesPage /> },
      { path: 'invoices/new', element: <InvoiceNewPage /> },
      { path: 'spv', element: <SpvPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'efactura', element: <EfacturaPage /> },
      { path: 'efactura/messages', element: <EfacturaMessagesPage /> },
      { path: 'efactura/validator', element: <EfacturaValidatorPage /> },
      {
        path: 'etransport',
        element: (
          <ComingSoonPage
            title="e-Transport"
            icon="truck"
            what="Declararea transporturilor și codurile UIT vin în faza 2."
          />
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  { path: '*', element: <AccountRedirect /> },
];

export const router = createBrowserRouter(routes);
