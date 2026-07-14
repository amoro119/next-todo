'use client';

import React, { useEffect, useState } from 'react';
import { Check, Zap } from 'lucide-react';
import { useUserState } from '../lib/hooks/useAppConfig';
import { updateUserState } from '../lib/user/userState';
import { useAppDialog } from '@/lib/hooks/useAppDialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function UpgradePrompt() {
  const userState = useUserState();
  const { confirm } = useAppDialog();
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const showUpgradeIfFree = () => {
      if (userState.subscription === 'free') setShowPrompt(true);
    };

    window.addEventListener('showUpgradeDialog', showUpgradeIfFree);
    window.addEventListener('sync-attempt', showUpgradeIfFree);

    return () => {
      window.removeEventListener('showUpgradeDialog', showUpgradeIfFree);
      window.removeEventListener('sync-attempt', showUpgradeIfFree);
    };
  }, [userState.subscription]);

  const handleClose = () => {
    setShowPrompt(false);
  };

  const handleUpgrade = async () => {
    const confirmed = await confirm({
      title: '模拟升级',
      description: '这是一个演示。是否模拟升级到高级版本？',
      confirmLabel: '确认升级',
    });

    if (confirmed) {
      updateUserState({ subscription: 'premium' });
      setShowPrompt(false);
    }
  };

  if (!showPrompt || userState.subscription !== 'free') return null;

  return (
    <Dialog open={showPrompt} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent size="md">
        <DialogHeader>
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Zap className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle>解锁云同步功能</DialogTitle>
              <DialogDescription>升级到高级版本</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody>
          <p className="mb-4 text-sm text-foreground">升级到高级版本，享受以下功能：</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[
              '在所有设备间同步任务和数据',
              '实时数据备份和恢复',
              '离线工作，联网时自动同步',
              '高级导出和分享功能',
            ].map((feature) => (
              <li key={feature} className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                {feature}
              </li>
            ))}
          </ul>
        </DialogBody>

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={handleClose}>稍后再说</Button>
          <Button onClick={handleUpgrade}>立即升级</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
