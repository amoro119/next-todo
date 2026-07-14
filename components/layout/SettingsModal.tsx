'use client'
import React from 'react'
import { Dialog, DialogBody, DialogContent, DialogTitle } from '@/components/ui/dialog'
import SettingsShell from '@/components/settings/SettingsShell'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent size="xl" className="h-[80vh] w-full">
        <DialogTitle className="sr-only">设置</DialogTitle>
        <DialogBody className="p-0">
          <SettingsShell />
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
