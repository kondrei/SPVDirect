import { createBrowserRouter } from 'react-router';
import { AccountRedirect } from './layout/AccountRedirect';
import { AppLayout } from './layout/AppLayout';
import { AuthLayout } from './layout/AuthLayout';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { CompaniesPage } from './pages/CompaniesPage';
import { CompanyPage } from './pages/CompanyPage';
import { ConnectionsPage } from './pages/ConnectionsPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProfilePage } from './pages/ProfilePage';
import { RegisterPage } from './pages/RegisterPage';

export const routes = [
  {
    element: <AuthLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    path: '/accountants/:accountantId',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'companies', element: <CompaniesPage /> },
      { path: 'companies/:id', element: <CompanyPage /> },
      { path: 'connections', element: <ConnectionsPage /> },
      { path: 'profile', element: <ProfilePage /> },
      {
        path: 'efactura',
        element: (
          <ComingSoonPage
            title="e-Factura"
            icon="invoice"
            what="Încărcarea facturilor XML, starea mesajelor și descărcarea facturilor primite vin în faza 2."
          />
        ),
      },
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
