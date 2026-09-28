import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/api/client';
import type { ManagedUser, Role } from '@/api/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { roleLabel } from '@/lib/roles';
import { formatClock } from '@/lib/time';

// Mirrors the server rules (users.schema.ts). The server re-checks everything anyway.
const USERNAME_RE = /^[a-z0-9_.]{3,50}$/;
const ROLES: Role[] = ['CASHIER', 'OWNER'];
const ROLE_HINT: Record<Role, string> = {
  CASHIER: 'Sells and records payments. Can’t change prices or see profit.',
  OWNER: 'Full access, including prices, reports and users.',
};

function makeSchema(mode: 'create' | 'edit') {
  return z.object({
    fullName: z.string().trim().min(1, 'Enter a name').max(100, 'Name is too long'),
    username:
      mode === 'create'
        ? z
            .string()
            .trim()
            .toLowerCase()
            .regex(USERNAME_RE, 'Use 3–50 lowercase letters, numbers, _ or .')
        : z.string(),
    role: z.enum(['OWNER', 'CASHIER']),
    password:
      mode === 'create'
        ? z.string().min(8, 'Use at least 8 characters').max(128, 'Password is too long')
        : z
            .string()
            .max(128, 'Password is too long')
            .refine((v) => v === '' || v.length >= 8, 'Use at least 8 characters'),
    pin: z.string().refine((v) => v === '' || /^\d{4,6}$/.test(v), 'PIN must be 4 to 6 digits'),
    isActive: z.boolean(),
    removePin: z.boolean(),
  });
}
type FormValues = z.infer<ReturnType<typeof makeSchema>>;

type Props = {
  user: ManagedUser | null; // null = add a new user
  isSelf: boolean;
  onClose: () => void;
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

export function UserFormDialog({ user, isSelf, onClose }: Props) {
  const mode = user ? 'edit' : 'create';
  const queryClient = useQueryClient();
  const schema = useMemo(() => makeSchema(mode), [mode]);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: user?.fullName ?? '',
      username: user?.username ?? '',
      role: user?.role ?? 'CASHIER',
      password: '',
      pin: '',
      isActive: user?.isActive ?? true,
      removePin: false,
    },
  });
  const role = useWatch({ control, name: 'role' });
  const removePin = useWatch({ control, name: 'removePin' });

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const pinAllowed = v.role === 'OWNER';
      if (!user) {
        return api('/users', {
          method: 'POST',
          body: {
            username: v.username,
            fullName: v.fullName,
            password: v.password,
            role: v.role,
            pin: pinAllowed && v.pin ? v.pin : undefined,
          },
        });
      }
      // Send only what changed. JSON.stringify drops the undefined keys.
      const patch = {
        fullName: v.fullName !== user.fullName ? v.fullName : undefined,
        role: v.role !== user.role ? v.role : undefined,
        isActive: v.isActive !== user.isActive ? v.isActive : undefined,
        password: v.password || undefined,
        pin: !pinAllowed ? undefined : v.removePin ? null : v.pin || undefined,
      };
      if (Object.values(patch).every((x) => x === undefined)) return Promise.resolve();
      return api(`/users/${user.id}`, { method: 'PATCH', body: patch });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
  });

  const locked = user?.lockedUntil && new Date(user.lockedUntil) > new Date();
  const aria = (field: keyof FormValues) =>
    errors[field] ? { 'aria-invalid': true as const, 'aria-describedby': `${field}-error` } : {};

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{user ? `Edit ${user.fullName}` : 'Add a user'}</DialogTitle>
          <DialogDescription>
            {user ? (
              <span className="font-mono">@{user.username}</span>
            ) : (
              'They’ll log in with this username and password.'
            )}
          </DialogDescription>
        </DialogHeader>

        {locked && (
          <p className="rounded-lg bg-warning-soft px-3.5 py-3 text-sm text-warning">
            Locked until {formatClock(user!.lockedUntil!)} after 5 wrong passwords. Setting a new
            password unlocks it now.
          </p>
        )}

        <form
          id="user-form"
          noValidate
          onSubmit={handleSubmit((v) => save.mutate(v))}
          className="grid gap-5"
        >
          <div className="grid gap-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              autoComplete="off"
              {...aria('fullName')}
              {...register('fullName')}
            />
            <FieldError id="fullName-error" message={errors.fullName?.message} />
          </div>

          {!user && (
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className="font-mono"
                {...aria('username')}
                {...register('username')}
              />
              <FieldError id="username-error" message={errors.username?.message} />
            </div>
          )}

          <fieldset disabled={isSelf} className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Role</legend>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((r) => (
                <label
                  key={r}
                  className="flex h-11 cursor-pointer items-center justify-center rounded-lg border text-[15px] font-medium transition-colors has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50 has-disabled:cursor-not-allowed has-disabled:opacity-60"
                >
                  <input type="radio" value={r} className="sr-only" {...register('role')} />
                  {roleLabel(r)}
                </label>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {isSelf ? 'You can’t change your own role.' : ROLE_HINT[role]}
            </p>
          </fieldset>

          <div className="grid gap-2">
            <Label htmlFor="password">{user ? 'New password' : 'Password'}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              {...aria('password')}
              {...register('password')}
            />
            <FieldError id="password-error" message={errors.password?.message} />
            {user && !errors.password && (
              <p className="text-sm text-muted-foreground">Leave blank to keep the current one.</p>
            )}
          </div>

          {role === 'OWNER' && (
            <div className="grid gap-2">
              <Label htmlFor="pin">{user?.hasPin ? 'New owner PIN' : 'Owner PIN'}</Label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                disabled={removePin}
                className="font-mono tracking-[0.3em]"
                {...aria('pin')}
                {...register('pin')}
              />
              <FieldError id="pin-error" message={errors.pin?.message} />
              {!errors.pin && (
                <p className="text-sm text-muted-foreground">
                  4–6 digits. Entered at the counter to approve voids.
                  {user?.hasPin && ' Leave blank to keep the current PIN.'}
                </p>
              )}
              {user?.hasPin && (
                <label className="mt-1 flex items-center gap-3 text-[15px]">
                  <input
                    type="checkbox"
                    className="size-5 accent-primary"
                    {...register('removePin')}
                  />
                  Remove this PIN
                </label>
              )}
            </div>
          )}

          {user && (
            <label className="flex items-start gap-3 rounded-lg border p-3.5 has-disabled:opacity-60">
              <input
                type="checkbox"
                disabled={isSelf}
                className="mt-0.5 size-5 accent-primary"
                {...register('isActive')}
              />
              <span>
                <span className="block text-[15px] font-medium">Can log in</span>
                <span className="block text-sm text-muted-foreground">
                  {isSelf
                    ? 'You can’t deactivate your own account.'
                    : 'Turn off when someone leaves. Their history stays.'}
                </span>
              </span>
            </label>
          )}

          {save.error && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3.5 py-3 text-sm font-medium text-destructive"
            >
              {save.error.message}
            </p>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" disabled={save.isPending}>
            {save.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
            {user ? 'Save changes' : 'Add user'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
