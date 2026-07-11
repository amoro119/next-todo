'use client'
import React from 'react'
import { X } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import SettingsShell from '@/components/settings/SettingsShell'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-3xl w-full h-[80vh] p-0 overflow-hidden flex flex-col" showClose={false}>
        <DialogTitle className="sr-only">设置</DialogTitle>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-3 top-3 z-20"
          onClick={onClose}
          aria-label="关闭设置"
        >
          <X className="h-4 w-4" />
        </Button>
        <SettingsShell />
      </DialogContent>
    </Dialog>
  )
}
