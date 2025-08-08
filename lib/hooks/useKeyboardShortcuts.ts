import { useEffect, useCallback, useRef } from 'react';

interface KeyboardShortcutOptions {
  isModalOpen: boolean;
  onToggleModal: () => void;
  onCloseModal: () => void;
}

/**
 * Hook for managing keyboard shortcuts for the task search modal
 * Handles Ctrl/Cmd+K to toggle modal and Escape to close modal
 */
export const useKeyboardShortcuts = ({
  isModalOpen,
  onToggleModal,
  onCloseModal,
}: KeyboardShortcutOptions) => {
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Handle Ctrl/Cmd+K shortcut
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        event.stopPropagation();
        
        if (isModalOpen) {
          onCloseModal();
        } else {
          // Store the currently focused element before opening modal
          previousActiveElementRef.current = document.activeElement as HTMLElement;
          onToggleModal();
        }
        return;
      }

      // Handle Escape key when modal is open
      if (event.key === 'Escape' && isModalOpen) {
        event.preventDefault();
        event.stopPropagation();
        onCloseModal();
        return;
      }
    },
    [isModalOpen, onToggleModal, onCloseModal]
  );

  // Set up global keyboard event listener
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [handleKeyDown]);

  // Focus restoration when modal closes
  const restoreFocus = useCallback(() => {
    if (previousActiveElementRef.current) {
      // Use setTimeout to ensure the modal is fully closed before restoring focus
      setTimeout(() => {
        if (previousActiveElementRef.current) {
          previousActiveElementRef.current.focus();
          previousActiveElementRef.current = null;
        }
      }, 0);
    }
  }, []);

  return {
    restoreFocus,
    previousActiveElementRef,
  };
};