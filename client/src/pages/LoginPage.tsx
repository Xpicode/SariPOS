import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/context';
import { BrandMark } from '@/components/BrandMark';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { receiptStamp, useNow } from '@/lib/time';

const schema = z.object({
  username: z.string().trim().toLowerCase().min(1, 'Enter your username'),
  password: z.string().min(1, 'Enter your password'),
});
type FormValues = z.infer<typeof schema>;

// Only same-app paths like "/users". Blocks "//evil.com" (an open redirect after login).
const safeRedirect = (from: unknown) =>
  typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/';

export function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const now = useNow();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const redirectTo = safeRedirect((location.state as { from?: unknown } | null)?.from);
  if (status === 'authenticated') return <Navigate to={redirectTo} replace />;

  const onSubmit = handleSubmit(async ({ username, password }) => {
    setServerError(null);
    try {
      await login(username, password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    }
  });

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <ThemeToggle className="fixed top-3 right-3" />
      <div className="receipt-outline receipt-print w-full max-w-[400px]">
        <div className="receipt-edge rounded-t-2xl bg-card">
          {/* Printed header, like the top of a resibo */}
          <div className="flex items-center justify-between gap-3 px-6 pt-5 font-mono text-[11px] tracking-[0.14em] whitespace-nowrap text-muted-foreground uppercase">
            <span>Terminal login</span>
            <time dateTime={now.toISOString()}>{receiptStamp(now)}</time>
          </div>

          <div className="px-6 pt-7 pb-6">
            <BrandMark />
            <h1 className="mt-6 text-[26px] leading-tight font-semibold tracking-tight text-balance">
              Log in to open the store
            </h1>
            <p className="mt-1.5 text-[15px] text-muted-foreground">
              Use the account the owner set up for you.
            </p>
          </div>

          <div className="border-t border-dashed border-border" />

          <form onSubmit={onSubmit} noValidate className="grid gap-5 px-6 py-6">
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                className="h-12 font-mono"
                aria-invalid={errors.username ? true : undefined}
                aria-describedby={errors.username ? 'username-error' : undefined}
                {...register('username')}
              />
              {errors.username && (
                <p id="username-error" className="text-sm text-destructive">
                  {errors.username.message}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="h-12 pr-12"
                  aria-invalid={errors.password ? true : undefined}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" className="text-sm text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>

            {serverError && (
              <p
                role="alert"
                className="rounded-lg bg-destructive/10 px-3.5 py-3 text-sm font-medium text-destructive"
              >
                {serverError}
              </p>
            )}

            <Button type="submit" size="lg" disabled={isSubmitting} className="mt-1 w-full">
              {isSubmitting && <LoaderCircle className="animate-spin" aria-hidden />}
              {isSubmitting ? 'Logging in…' : 'Log in'}
            </Button>
          </form>

          <div className="border-t border-dashed border-border" />
          <p className="px-6 pt-4 pb-6 text-center font-mono text-[11px] leading-relaxed tracking-wide text-balance text-muted-foreground uppercase">
            Forgot your password? Ask the owner to reset it.
          </p>
        </div>
      </div>
    </main>
  );
}
