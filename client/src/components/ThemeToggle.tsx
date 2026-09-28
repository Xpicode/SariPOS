import { Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';

// The theme lives on <html data-theme>, set before the first paint by the script in index.html.
// React only reads it, and re-renders when it changes (this button, or the device switching).
const root = document.documentElement;

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}
const isDark = () => root.dataset.theme === 'dark';

export function ThemeToggle({ className }: { className?: string }) {
  const dark = useSyncExternalStore(subscribe, isDark);
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';

  function toggle() {
    const next = dark ? 'light' : 'dark';
    root.dataset.theme = next;
    try {
      localStorage.setItem('theme', next); // only a display preference, nothing sensitive
    } catch {
      // storage blocked: the switch still works, it just isn't remembered
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={className}
    >
      {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </Button>
  );
}
