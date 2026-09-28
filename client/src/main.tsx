import '@fontsource-variable/open-sans';
import '@fontsource-variable/geist-mono';
import './index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { ApiError } from '@/api/client';
import { AuthProvider } from '@/auth/AuthProvider';
import { ProtectedRoute, RoleGate } from '@/auth/guards';
import { AppLayout } from '@/components/AppLayout';
import { AgingPage } from '@/features/customers/AgingPage';
import { CustomerPage } from '@/features/customers/CustomerPage';
import { CustomersPage } from '@/features/customers/CustomersPage';
import { DrawerPage } from '@/features/drawer/DrawerPage';
import { EndOfDayPage } from '@/features/drawer/EndOfDayPage';
import { ExpensesPage } from '@/features/drawer/ExpensesPage';
import { ShiftReportPage } from '@/features/drawer/ShiftReportPage';
import { EwalletPage } from '@/features/ewallet/EwalletPage';
import { FeeRulesPage } from '@/features/ewallet/FeeRulesPage';
import { StockInPage } from '@/features/inventory/StockInPage';
import { AuditLogPage } from '@/features/reports/AuditLogPage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { ProductDetailPage } from '@/features/products/ProductDetailPage';
import { ProductFormPage } from '@/features/products/ProductFormPage';
import { ProductsPage } from '@/features/products/ProductsPage';
import { SaleDetailPage } from '@/features/sales/SaleDetailPage';
import { SalesPage } from '@/features/sales/SalesPage';
import { SellPage } from '@/features/sales/SellPage';
import { UsersPage } from '@/features/users/UsersPage';
import { OverviewPage } from '@/pages/OverviewPage';
import { LoginPage } from '@/pages/LoginPage';

const isClientError = (err: unknown) =>
  err instanceof ApiError && err.status >= 400 && err.status < 500;

const queryClient = new QueryClient({
  defaultOptions: {
    // 4xx (403, 404, validation) won't fix itself by retrying; network/server errors might.
    queries: { retry: (count, err) => count < 2 && !isClientError(err) },
  },
});

const ownerOnly = (page: ReactNode) => <RoleGate roles={['OWNER']}>{page}</RoleGate>;

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <OverviewPage /> },
          { path: 'sell', element: <SellPage /> },
          { path: 'sales', element: <SalesPage /> },
          { path: 'sales/:id', element: <SaleDetailPage /> },
          { path: 'drawer', element: <DrawerPage /> },
          { path: 'drawer/close', element: <EndOfDayPage /> },
          { path: 'drawer/:id', element: ownerOnly(<ShiftReportPage />) },
          { path: 'expenses', element: ownerOnly(<ExpensesPage />) },
          { path: 'customers', element: <CustomersPage /> },
          { path: 'customers/aging', element: ownerOnly(<AgingPage />) },
          { path: 'customers/:id', element: <CustomerPage /> },
          { path: 'ewallet', element: <EwalletPage /> },
          { path: 'ewallet/fees', element: ownerOnly(<FeeRulesPage />) },
          { path: 'reports', element: ownerOnly(<ReportsPage />) },
          { path: 'reports/audit', element: ownerOnly(<AuditLogPage />) },
          { path: 'products', element: <ProductsPage /> },
          { path: 'products/new', element: ownerOnly(<ProductFormPage />) },
          { path: 'products/:id', element: <ProductDetailPage /> },
          { path: 'products/:id/edit', element: ownerOnly(<ProductFormPage />) },
          { path: 'stock-in', element: ownerOnly(<StockInPage />) },
          {
            path: 'users',
            element: (
              <RoleGate roles={['OWNER']}>
                <UsersPage />
              </RoleGate>
            ),
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
