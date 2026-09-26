import { createBrowserRouter } from 'react-router';
import { AppLayout } from './layout/AppLayout';
import { AuthLayout } from './layout/AuthLayout';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { CompaniesPage } from './pages/CompaniesPage';
import { CompanyPage } from './pages/CompanyPage';
import { ConnectionsPage } from './pages/ConnectionsPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
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
    element: <AppLayout />,
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/companies', element: <CompaniesPage /> },
      { path: '/companies/:id', element: <CompanyPage /> },
      { path: '/connections', element: <ConnectionsPage /> },
      {
        path: '/efactura',
        element: (
          <ComingSoonPage
            title="e-Factura"
            icon="invoice"
            what="Încărcarea facturilor XML, starea mesajelor și descărcarea facturilor primite vin în faza 2."
          />
        ),
      },
      {
        path: '/etransport',
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
];

export const router = createBrowserRouter(routes);
