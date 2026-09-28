import {
  ChartColumn,
  HandCoins,
  House,
  LogOut,
  Menu,
  NotebookPen,
  Package,
  PackagePlus,
  ReceiptText,
  ShoppingCart,
  Smartphone,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useState } from 'react';
import { NavLink, Outlet, useMatch } from 'react-router';
import type { Role } from '@/api/types';
import { useAuth } from '@/auth/context';
import { BrandMark } from '@/components/BrandMark';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { roleLabel } from '@/lib/roles';
import { cn } from '@/lib/utils';

type NavItem = { label: string; icon: LucideIcon; to?: string; roles?: Role[] };

// No `to` = module not built yet (shown, but not clickable). No `roles` = everyone.
const NAV: NavItem[] = [
  { label: 'Home', icon: House, to: '/' },
  { label: 'Sell', icon: ShoppingCart, to: '/sell' },
  { label: 'Sales', icon: ReceiptText, to: '/sales' },
  { label: 'Products', icon: Package, to: '/products' },
  { label: 'Stock in', icon: PackagePlus, to: '/stock-in', roles: ['OWNER'] },
  { label: 'Utang', icon: NotebookPen, to: '/customers' },
  { label: 'GCash & Load', icon: Smartphone },
  { label: 'Cash drawer', icon: Wallet, to: '/drawer' },
  { label: 'Expenses', icon: HandCoins, to: '/expenses', roles: ['OWNER'] },
  { label: 'Reports', icon: ChartColumn, roles: ['OWNER'] },
  { label: 'Users', icon: Users, to: '/users', roles: ['OWNER'] },
];

function NavList({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const items = NAV.filter((i) => !i.roles || i.roles.includes(role));
  return (
    <nav aria-label="Main" className="grid gap-1">
      {items.map(({ label, icon: Icon, to }) =>
        to ? (
          <NavLink
            key={label}
            to={to}
            end={to === '/'} // only Home needs an exact match; /products/5 keeps Products lit
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'relative flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                isActive
                  ? 'bg-accent text-accent-foreground before:absolute before:inset-y-2.5 before:left-0 before:w-[3px] before:rounded-full before:bg-primary'
                  : 'text-foreground/80 hover:bg-muted hover:text-foreground',
              )
            }
          >
            <Icon className="size-[18px]" aria-hidden />
            {label}
          </NavLink>
        ) : (
          <span
            key={label}
            aria-disabled="true"
            className="flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] text-muted-foreground/70"
          >
            <Icon className="size-[18px]" aria-hidden />
            {label}
            <span className="ml-auto font-mono text-[10px] tracking-[0.14em] uppercase">Soon</span>
          </span>
        ),
      )}
    </nav>
  );
}

function UserCard() {
  const { user, logout } = useAuth();
  if (!user) return null;
  const initials = user.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-background/60 p-2.5">
      <span
        className="grid size-10 shrink-0 place-items-center rounded-full bg-accent font-mono text-sm font-medium text-accent-foreground"
        aria-hidden
      >
        {initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{user.fullName}</span>
        <span className="block font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
          {roleLabel(user.role)}
        </span>
      </span>
      <Button variant="ghost" size="icon" onClick={logout} aria-label="Log out" title="Log out">
        <LogOut className="size-[18px]" />
      </Button>
    </div>
  );
}

export function AppLayout() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const register = useMatch('/sell'); // the register uses the full width for its cart column
  if (!user) return null;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[256px_1fr]">
      {/* Tablet / desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r bg-card px-3 py-5 md:flex">
        <div className="flex items-center justify-between pl-2">
          <BrandMark />
          <ThemeToggle />
        </div>
        <NavList role={user.role} />
        <div className="mt-auto">
          <UserCard />
        </div>
      </aside>

      {/* Phone top bar + slide-in menu (Radix Dialog: focus trap, Esc to close) */}
      <DialogPrimitive.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-card/90 px-2 backdrop-blur md:hidden">
          <DialogPrimitive.Trigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu className="size-5" />
            </Button>
          </DialogPrimitive.Trigger>
          <BrandMark />
          <ThemeToggle className="ml-auto" />
        </header>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 md:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(300px,85vw)] flex-col gap-6 bg-card px-3 py-4 shadow-xl outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:animate-in data-[state=open]:slide-in-from-left md:hidden">
            <div className="flex items-center justify-between pl-2">
              <DialogPrimitive.Title asChild>
                <span>
                  <BrandMark />
                </span>
              </DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Close menu">
                  <X className="size-5" />
                </Button>
              </DialogPrimitive.Close>
            </div>
            <DialogPrimitive.Description className="sr-only">Main menu</DialogPrimitive.Description>
            <NavList role={user.role} onNavigate={() => setMenuOpen(false)} />
            <div className="mt-auto">
              <UserCard />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-10">
        <div className={cn('mx-auto', register ? 'max-w-7xl' : 'max-w-5xl')}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
