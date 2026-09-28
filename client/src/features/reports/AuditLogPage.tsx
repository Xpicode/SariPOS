import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { api } from '@/api/client';
import type { AuditEntry, ManagedUser } from '@/api/types';
import { FormField } from '@/components/FormField';
import { NativeSelect } from '@/components/NativeSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDateTime, todayInManila } from '@/lib/time';
import { useAuditLog } from './queries';

// SALE_VOID -> "Sale void"
const actionLabel = (a: string) => a.charAt(0) + a.slice(1).toLowerCase().replace(/_/g, ' ');

// before/after as "key: value" lines. Rendered as text (React escapes it), never as HTML: a
// customer name typed by a cashier ends up in here.
function Values({ title, data }: { title: string; data: Record<string, unknown> | null }) {
  if (!data) return null;
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>
      <dl className="mt-1 grid gap-0.5 font-mono text-[13px]">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="shrink-0 text-muted-foreground">{k}:</dt>
            <dd className="break-all">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Entry({ e }: { e: AuditEntry }) {
  const hasDetail = e.before || e.after || e.ip;
  const summary = (
    <span className="grid gap-0.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <span className="text-sm text-muted-foreground tabular-nums">
        {formatDateTime(e.createdAt)}
      </span>
      <span className="min-w-0">
        <span className="font-semibold">{actionLabel(e.action)}</span>
        <span className="text-muted-foreground">
          {' · '}
          {e.userName ?? 'Unknown user'}
          {e.entity && ` · ${e.entity.replace(/_/g, ' ')}${e.entityId ? ` #${e.entityId}` : ''}`}
        </span>
      </span>
    </span>
  );
  if (!hasDetail) return <li className="px-5 py-3 text-[15px]">{summary}</li>;
  return (
    <li>
      <details className="group">
        <summary className="cursor-pointer list-none px-5 py-3 text-[15px] outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset">
          {summary}
        </summary>
        <div className="grid gap-4 bg-muted/40 px-5 py-4 sm:grid-cols-2">
          <Values title="Before" data={e.before} />
          <Values title="After" data={e.after} />
          {e.ip && <p className="text-sm text-muted-foreground sm:col-span-2">From IP {e.ip}</p>}
        </div>
      </details>
    </li>
  );
}

export function AuditLogPage() {
  const [params, setParams] = useSearchParams();
  const f = Object.fromEntries(
    ['userId', 'action', 'from', 'to'].flatMap((k) => (params.get(k) ? [[k, params.get(k)!]] : [])),
  );
  const log = useAuditLog(f);
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api<{ users: ManagedUser[] }>('/users').then((d) => d.users),
  });
  const setFilter = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next);
  };
  const entries = log.data?.pages.flatMap((p) => p.entries) ?? [];
  const actions = log.data?.pages[0]?.actions ?? [];
  const today = todayInManila();

  return (
    <div className="grid gap-6">
      <Link
        to="/reports"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Reports
      </Link>
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Audit log</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          Who did what, and when: voids, price and limit changes, money moved, logins. Entries can’t
          be edited or deleted.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        <FormField id="a-user" label="Person">
          <NativeSelect
            id="a-user"
            value={f.userId ?? ''}
            onChange={(e) => setFilter('userId', e.target.value)}
          >
            <option value="">Everyone</option>
            {users.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="a-action" label="Action">
          <NativeSelect
            id="a-action"
            value={f.action ?? ''}
            onChange={(e) => setFilter('action', e.target.value)}
          >
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {actionLabel(a)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="a-from" label="From">
          <Input
            id="a-from"
            type="date"
            max={f.to ?? today}
            value={f.from ?? ''}
            onChange={(e) => setFilter('from', e.target.value)}
          />
        </FormField>
        <FormField id="a-to" label="To">
          <Input
            id="a-to"
            type="date"
            min={f.from}
            max={today}
            value={f.to ?? ''}
            onChange={(e) => setFilter('to', e.target.value)}
          />
        </FormField>
      </div>

      <section
        aria-label="Entries"
        className="overflow-hidden rounded-2xl border bg-card shadow-sm"
      >
        {log.isPending ? (
          <p className="px-5 py-6 text-[15px] text-muted-foreground">Loading…</p>
        ) : log.isError ? (
          <p role="alert" className="px-5 py-6">
            {log.error.message}
          </p>
        ) : entries.length === 0 ? (
          <p className="px-5 py-6 text-[15px] text-muted-foreground">
            Nothing matches these filters.
          </p>
        ) : (
          <ul className="divide-y">
            {entries.map((e) => (
              <Entry key={e.id} e={e} />
            ))}
          </ul>
        )}
      </section>
      {log.hasNextPage && (
        <Button
          variant="outline"
          className="justify-self-center"
          onClick={() => log.fetchNextPage()}
          disabled={log.isFetchingNextPage}
        >
          {log.isFetchingNextPage ? 'Loading…' : 'Load older'}
        </Button>
      )}
    </div>
  );
}
