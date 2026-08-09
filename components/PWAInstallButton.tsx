'use client';

import { useState, useEffect, useCallback } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/common/cn';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PWAInstallButtonProps {
  isCollapsed?: boolean;
  mobile?: boolean;
}

/**
 * PWA install button.
 * Listens for the `beforeinstallprompt` event and shows a button to trigger
 * the browser's native PWA install dialog. Hidden when the app is already
 * running in standalone mode (installed) or when installation is unavailable.
 */
export function PWAInstallButton({ isCollapsed = false, mobile = false }: PWAInstallButtonProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already running as installed PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const installedHandler = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  // Don't render if already installed or no install prompt available
  if (isInstalled || !deferredPrompt) return null;

  return (
    <Button
      type="button"
      onClick={handleInstall}
      variant="ghost"
      size={mobile ? 'mobileIcon' : 'default'}
      className={cn(
        'text-[oklch(var(--muted-foreground))]',
        mobile
          ? 'shrink-0'
          : cn('w-full', isCollapsed ? 'justify-center px-0' : 'justify-start px-3')
      )}
      aria-label="安装为桌面应用"
      title={isCollapsed || mobile ? '安装为桌面应用' : undefined}
    >
      <Download size={16} />
      <span className={cn((isCollapsed || mobile) && 'sr-only')}>安装为桌面应用</span>
    </Button>
  );
}
