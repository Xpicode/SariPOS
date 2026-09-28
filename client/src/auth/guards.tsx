import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import type { Role } from '@/api/types';
import { useAuth } from './context';

// UX only: these guards decide what to SHOW. The real protection is the server's
// auth + requireRole middleware, which answers 401/403 no matter what the browser does.

export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="grid min-h-dvh place-items-center" role="status">
        <span className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
          Opening store…
        </span>
      </div>
    );
  }
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

export function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}
