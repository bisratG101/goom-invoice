import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { HomePage } from '../features/landing/HomePage';
import { HealthPage } from '../features/health/HealthPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/health',
    element: <HealthPage />,
  },
  {
    path: '*',
    element: <HomePage />,
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
