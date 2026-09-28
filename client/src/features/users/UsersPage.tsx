import { useQuery } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/api/client';
import type { ManagedUser } from '@/api/types';
import { useAuth } from '@/auth/context';
import { Button } from '@/components/ui/button';
import { roleLabel } from '@/lib/roles';
import { formatClock } from '@/lib/time';
import { cn } from '@/lib/utils';
import { UserFormDialog } from './UserFormDialog';

function StatusBadge({ user }: { user: ManagedUser }) {
  const locked = user.lockedUntil && new Date(user.lockedUntil) > new Date();
  const [label, tone] = !user.isActive
    ? ['Deactivated', 'bg-muted text-muted-foreground']
    : locked
      ? [`Locked until ${formatClock(user.lockedUntil!)}`, 'bg-warning-soft text-warning']
      : ['Active', 'bg-accent text-accent-foreground'];
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium',
        tone,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}

export function UsersPage() {
  const { user: me } = useAuth();
  // undefined = dialog closed, null = adding, a user = editing
  const [editing, setEditing] = useState<ManagedUser | null | undefined>(undefined);

  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api<{ users: ManagedUser[] }>('/users').then((d) => d.users),
  });

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Users</h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            Everyone who can log in to this store.
          </p>
        </div>
        <Button onClick={() => setEditing(null)}>
          <Plus aria-hidden />
          Add user
        </Button>
      </header>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {users.isPending && (
          <ul aria-label="Loading users" className="divide-y">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-4 px-5 py-4">
                <span className="h-4 w-40 animate-pulse rounded bg-muted" />
                <span className="ml-auto h-7 w-20 animate-pulse rounded-full bg-muted" />
              </li>
            ))}
          </ul>
        )}

        {users.isError && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 p-5">
            <p className="text-[15px]">{users.error.message}</p>
            <Button variant="outline" onClick={() => users.refetch()}>
              Try again
            </Button>
          </div>
        )}

        {users.data && (
          <ul className="divide-y">
            {users.data.map((u) => (
              <li
                key={u.id}
                className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-4 sm:grid-cols-[1fr_7rem_auto_auto]"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate text-[15px] font-medium">
                    {u.fullName}
                    {u.id === me?.id && (
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                        You
                      </span>
                    )}
                  </p>
                  <p className="truncate font-mono text-sm text-muted-foreground">@{u.username}</p>
                </div>

                <p className="hidden font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase sm:block">
                  {roleLabel(u.role)}
                  {u.role === 'OWNER' && (
                    <span
                      className={cn(
                        'mt-1 flex items-center gap-1 normal-case',
                        !u.hasPin && 'text-warning',
                      )}
                    >
                      <KeyRound className="size-3" aria-hidden />
                      {u.hasPin ? 'PIN set' : 'No PIN'}
                    </span>
                  )}
                </p>

                <div className="col-start-1 row-start-2 sm:col-start-auto sm:row-start-auto">
                  <StatusBadge user={u} />
                </div>

                <Button
                  variant="ghost"
                  onClick={() => setEditing(u)}
                  aria-label={`Edit ${u.fullName}`}
                  className="row-span-2 sm:row-span-1"
                >
                  <Pencil aria-hidden />
                  <span className="hidden sm:inline">Edit</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing !== undefined && (
        <UserFormDialog
          key={editing?.id ?? 'new'}
          user={editing}
          isSelf={editing?.id === me?.id}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}
