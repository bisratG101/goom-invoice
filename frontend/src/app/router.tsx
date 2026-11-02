import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { HomePage } from '../features/landing/HomePage';
import { DemoPage } from '../features/landing/DemoPage';
import { HealthPage } from '../features/health/HealthPage';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { ClientsPage } from '../features/clients/ClientsPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { InvoicesListPage } from '../features/invoices/InvoicesListPage';
import { InvoiceEditorPage } from '../features/invoices/InvoiceEditorPage';
import { InvoiceDetailPage } from '../features/invoices/InvoiceDetailPage';
import { PublicInvoicePage } from '../features/public/PublicInvoicePage';
import { PaymentReturnPage } from '../features/public/PaymentReturnPage';
import { SimulatedPaymentPage } from '../features/public/SimulatedPaymentPage';
import { ProtectedRoute } from '../components/layout/ProtectedRoute';
import { PublicRoute } from '../components/layout/PublicRoute';
import { AppLayout } from '../components/layout/AppLayout';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/demo',
    element: <DemoPage />,
  },
  {
    path: '/login',
    element: (
      <PublicRoute>
        <LoginPage />
      </PublicRoute>
    ),
  },
  {
    path: '/register',
    element: (
      <PublicRoute>
        <RegisterPage />
      </PublicRoute>
    ),
  },
  {
    path: '/app',
    element: (
      <ProtectedRoute>
        <AppLayout>
          <DashboardPage />
        </AppLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: '/app/invoices',
    element: (
      <ProtectedRoute>
        <AppLayout>
          <InvoicesListPage />
        </AppLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: '/app/invoices/new',
    element: (
      <ProtectedRoute>
        <AppLayout>
          <InvoiceEditorPage />
        </AppLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: '/app/invoices/:id',
    element: (
      <ProtectedRoute>
        <AppLayout>
          <InvoiceDetailPage />
        </AppLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: '/app/invoices/:id/edit',
    element: (
      <ProtectedRoute>
        <AppLayout>
          <InvoiceEditorPage />
        </AppLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: '/app/clients',
    element: (
      <ProtectedRoute>
        <AppLayout>
          <ClientsPage />
        </AppLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: '/app/settings',
    element: (
      <ProtectedRoute>
        <AppLayout>
          <SettingsPage />
        </AppLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: '/health',
    element: <HealthPage />,
  },
  {
    path: '/i/:token',
    element: <PublicInvoicePage />,
  },
  {
    path: '/i/:token/return',
    element: <PaymentReturnPage />,
  },
  {
    path: '/pay/simulated/:txRef',
    element: <SimulatedPaymentPage />,
  },
  {
    path: '*',
    element: <HomePage />,
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
