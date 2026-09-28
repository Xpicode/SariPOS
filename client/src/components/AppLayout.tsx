import {
  ChartColumn,
  ChevronDown,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Menu,
  NotebookPen,
  Package,
  PackagePlus,
  PanelLeftClose,
  PanelLeftOpen,
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
import { NavLink, Outlet } from 'react-router';
import type { Role } from '@/api/types';
import { useAuth } from '@/auth/context';
import { BrandMark } from '@/components/BrandMark';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { roleLabel } from '@/lib/roles';
import { cn } from '@/lib/utils';

type NavItem = { label: string; icon: LucideIcon; to: string; roles?: Role[] };
type NavGroup = { id: string; title?: string; items: NavItem[] };

// No `roles` = everyone. A group with nothing left for this role isn't shown at all.
const NAV: NavGroup[] = [
  { id: 'home', items: [{ label: 'Overview', icon: LayoutDashboard, to: '/' }] },
  {
    id: 'sales',
    title: 'Sales',
    items: [
      { label: 'Sell', icon: ShoppingCart, to: '/sell' },
      { label: 'Sales', icon: ReceiptText, to: '/sales' },
      { label: 'Utang', icon: NotebookPen, to: '/customers' },
      { label: 'GCash & Load', icon: Smartphone, to: '/ewallet' },
    ],
  },
  {
    id: 'inventory',
    title: 'Inventory',
    items: [
      { label: 'Products', icon: Package, to: '/products' },
      { label: 'Stock in', icon: PackagePlus, to: '/stock-in', roles: ['OWNER'] },
    ],
  },
  {
    id: 'finance',
    title: 'Finance',
    items: [
      { label: 'Cash drawer', icon: Wallet, to: '/drawer' },
      { label: 'Expenses', icon: HandCoins, to: '/expenses', roles: ['OWNER'] },
      { label: 'Reports', icon: ChartColumn, to: '/reports', roles: ['OWNER'] },
    ],
  },
  {
    id: 'store',
    title: 'Store',
    items: [{ label: 'Users', icon: Users, to: '/users', roles: ['OWNER'] }],
  },
];

// Which sections are folded: a per-device convenience, like the collapsed sidebar below.
const CLOSED_KEY = 'saripos.navGroupsClosed';
function readClosed(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CLOSED_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function NavItemLink({
  item: { label, icon: Icon, to },
  compact,
  onNavigate,
}: {
  item: NavItem;
  compact: boolean;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'} // only Overview needs an exact match; /products/5 keeps Products lit
      onClick={onNavigate}
      title={compact ? label : undefined}
      className={({ isActive }) =>
        cn(
          'flex h-10 items-center gap-3 rounded-lg text-[15px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          compact ? 'justify-center' : 'px-3',
          isActive
            ? 'bg-primary/12 font-semibold text-foreground'
            : 'font-medium text-foreground/80 hover:bg-muted hover:text-foreground',
        )
      }
    >
      <Icon className="size-[18px] shrink-0" aria-hidden />
      <span className={cn('truncate', compact && 'sr-only')}>{label}</span>
    </NavLink>
  );
}

// compact = icons only (collapsed sidebar): no section titles, just a thin line between sections.
// The label stays in each link for screen readers, and shows as a tooltip on hover.
function NavList({
  role,
  compact = false,
  onNavigate,
}: {
  role: Role;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const [closed, setClosed] = useState(readClosed);
  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.roles || i.roles.includes(role)),
  })).filter((g) => g.items.length > 0);

  function toggle(id: string) {
    setClosed((c) => {
      const next = c.includes(id) ? c.filter((x) => x !== id) : [...c, id];
      try {
        localStorage.setItem(CLOSED_KEY, JSON.stringify(next));
      } catch {
        // ignore: it just won't be remembered
      }
      return next;
    });
  }

  return (
    <nav aria-label="Main" className={cn('grid', compact ? 'gap-2' : 'gap-4')}>
      {groups.map((g, i) => {
        const open = compact || !g.title || !closed.includes(g.id);
        const listId = `nav-${g.id}`;
        return (
          <div key={g.id} className={cn(compact && i > 0 && 'border-t pt-2')}>
            {g.title && !compact && (
              <button
                type="button"
                onClick={() => toggle(g.id)}
                aria-expanded={open}
                aria-controls={listId}
                className="mb-1 flex h-8 w-full items-center justify-between rounded-md px-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {g.title}
                <ChevronDown
                  aria-hidden
                  className={cn('size-4 transition-transform', !open && '-rotate-90')}
                />
              </button>
            )}
            <ul id={listId} hidden={!open} className="grid gap-0.5">
              {g.items.map((item) => (
                <li key={item.label}>
                  <NavItemLink item={item} compact={compact} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function UserCard({ compact = false }: { compact?: boolean }) {
  const { user, logout } = useAuth();
  if (!user) return null;
  const initials = user.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border bg-background/60 p-2.5',
        compact && 'flex-col gap-2 p-1.5',
      )}
    >
      <span
        className="grid size-10 shrink-0 place-items-center rounded-full bg-accent font-mono text-sm font-medium text-accent-foreground"
        title={compact ? `${user.fullName} (${roleLabel(user.role)})` : undefined}
        aria-hidden
      >
        {initials}
      </span>
      <span className={cn('min-w-0 flex-1', compact && 'sr-only')}>
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

// The collapsed/expanded choice is a per-device convenience: kept in localStorage, and if the
// browser blocks storage the sidebar simply starts expanded.
const SIDEBAR_KEY = 'saripos.sidebarCollapsed';
function readCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
}

export function AppLayout() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  if (!user) return null;

  function toggleSidebar() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, c ? '0' : '1');
      } catch {
        // ignore: it just won't be remembered
      }
      return !c;
    });
  }

  return (
    <div
      className={cn(
        'min-h-dvh md:grid md:transition-[grid-template-columns]',
        collapsed ? 'md:grid-cols-[72px_minmax(0,1fr)]' : 'md:grid-cols-[232px_minmax(0,1fr)]',
      )}
    >
      {/* Tablet / desktop sidebar: full, or a narrow icon rail to give the page more room */}
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh flex-col gap-5 overflow-y-auto border-r bg-card py-4 md:flex',
          collapsed ? 'items-stretch px-2.5' : 'px-3',
        )}
      >
        <div
          className={cn('flex items-center', collapsed ? 'flex-col gap-3' : 'justify-between pl-2')}
        >
          <BrandMark compact={collapsed} />
          <ThemeToggle />
        </div>
        <NavList role={user.role} compact={collapsed} />
        <div className="mt-auto grid gap-2">
          <Button
            variant="ghost"
            onClick={toggleSidebar}
            aria-label={collapsed ? 'Expand the menu' : 'Collapse the menu'}
            title={collapsed ? 'Expand the menu' : 'Collapse the menu'}
            className={cn(
              'text-muted-foreground',
              collapsed ? 'justify-center px-0' : 'justify-start px-3',
            )}
          >
            {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
            {!collapsed && 'Collapse menu'}
          </Button>
          <UserCard compact={collapsed} />
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

      {/* The page uses the whole width (up to very wide monitors, where lines would get too long). */}
      <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="mx-auto w-full max-w-[1760px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
