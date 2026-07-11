import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AppSection = 'todo' | 'goals' | 'calendar'

interface UIState {
  activeSection: AppSection
  activeViewOption: string
  isCommandPaletteOpen: boolean
  modalStack: string[]
  isMobile: boolean

  setActiveSection: (section: AppSection) => void
  setActiveViewOption: (option: string) => void
  setCommandPaletteOpen: (open: boolean) => void
  toggleCommandPalette: () => void
  pushModal: (modalId: string) => void
  popModal: () => void
  closeModal: (modalId: string) => void
  closeAllModals: () => void
  setIsMobile: (isMobile: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      activeSection: 'todo',
      activeViewOption: 'today',
      isCommandPaletteOpen: false,
      modalStack: [],
      isMobile: false,

      setActiveSection: (section) => set({ activeSection: section }),
      setActiveViewOption: (option) => set({ activeViewOption: option }),
      setCommandPaletteOpen: (open) => set({ isCommandPaletteOpen: open }),
      toggleCommandPalette: () =>
        set((state) => ({ isCommandPaletteOpen: !state.isCommandPaletteOpen })),
      pushModal: (modalId) =>
        set((state) => ({
          modalStack: [...state.modalStack, modalId],
        })),
      popModal: () =>
        set((state) => ({
          modalStack: state.modalStack.slice(0, -1),
        })),
      closeModal: (modalId) =>
        set((state) => ({
          modalStack: state.modalStack.filter((id) => id !== modalId),
        })),
      closeAllModals: () => set({ modalStack: [] }),
      setIsMobile: (isMobile) => set({ isMobile }),
    }),
    {
      name: 'ui-store',
      // Only persist navigation state, not modal stack or isMobile
      partialize: (state) => ({
        activeSection: state.activeSection,
        activeViewOption: state.activeViewOption,
      }),
    }
  )
)
