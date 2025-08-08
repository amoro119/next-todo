import { useCallback, useEffect } from 'react';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useFocusTrap } from './useFocusTrap';

interface ModalKeyboardManagerOptions {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}

/**
 * Comprehensive keyboard management for modal components
 * Combines keyboard shortcuts and focus trap functionality
 */
export const useModalKeyboardManager = ({
  isOpen,
  onOpen,
  onClose,
}: ModalKeyboardManagerOptions) => {
  // Handle modal close with focus restoration
  const handleCloseModal = useCallback(() => {
    onClose();
  }, [onClose]);

  // Handle modal toggle
  const handleToggleModal = useCallback(() => {
    if (isOpen) {
      handleCloseModal();
    } else {
      onOpen();
    }
  }, [isOpen, onOpen, handleCloseModal]);

  // Set up keyboard shortcuts
  const { restoreFocus } = useKeyboardShortcuts({
    isModalOpen: isOpen,
    onToggleModal: handleToggleModal,
    onCloseModal: handleCloseModal,
  });

  // Set up focus trap
  const { modalRef, refreshFocusableElements } = useFocusTrap(isOpen);

  // Handle focus restoration when modal closes
  useEffect(() => {
    if (!isOpen) {
      restoreFocus();
    }
  }, [isOpen, restoreFocus]);

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      // Store original overflow style
      const originalOverflow = document.body.style.overflow;
      
      // Prevent background scrolling
      document.body.style.overflow = 'hidden';
      
      return () => {
        // Restore original overflow style
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  return {
    modalRef,
    refreshFocusableElements,
    handleCloseModal,
  };
};