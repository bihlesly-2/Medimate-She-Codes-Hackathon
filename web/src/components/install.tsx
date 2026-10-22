import { useEffect, useState } from 'react';
import { Download, Share } from 'lucide-react';
import { Button, Dialog } from './ui';

/** Chrome/Edge/Android fire this before showing their own install prompt. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

const standalone = () => typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);
const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

/**
 * "Install app" for the PWA. Uses the browser's install prompt where it exists (Android Chrome,
 * desktop Chrome/Edge); on iPhone it explains Share, then Add to Home Screen. Hidden once installed.
 */
export function InstallAppButton({ className, size = 'sm' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const [, force] = useState(0);
  const [iosHelp, setIosHelp] = useState(false);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  if (standalone()) return null;
  if (!deferred && !isIos()) return null;
  return (
    <>
      <Button
        variant="outline"
        size={size}
        icon={Download}
        className={className}
        onClick={async () => {
          if (deferred) {
            await deferred.prompt();
            await deferred.userChoice.catch(() => undefined);
            deferred = null;
            force((n) => n + 1);
          } else setIosHelp(true);
        }}
      >
        Install app
      </Button>
      <Dialog open={iosHelp} onClose={() => setIosHelp(false)} title="Add MEDIMATE to your home screen" footer={<Button onClick={() => setIosHelp(false)}>OK</Button>}>
        <ol className="grid list-decimal gap-2 pl-5">
          <li>
            Tap the Share button <Share className="inline size-4" aria-hidden /> in Safari.
          </li>
          <li>Choose “Add to Home Screen”.</li>
          <li>Open MEDIMATE from the new icon.</li>
        </ol>
      </Dialog>
    </>
  );
}
