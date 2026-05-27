'use client'
import React from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/common/Dialog'
import SettingsShell from '@/components/settings/SettingsShell'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-3xl w-full h-[80vh] p-0 overflow-hidden flex flex-col">
        <DialogTitle className="sr-only">设置</DialogTitle>
        <SettingsShell />
      </DialogContent>
    </Dialog>
  )
}
