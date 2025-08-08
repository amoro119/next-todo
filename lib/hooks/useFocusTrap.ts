import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook for implementing focus trap within a modal
 * Ensures focus stays within the modal and handles Tab navigation
 */
export const useFocusTrap = (isOpen: boolean) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const firstFocusableElementRef = useRef<HTMLElement | null>(null);
  const lastFocusableElementRef = useRef<HTMLElement | null>(null);

  // Selector for focusable elements
  const focusableElementsSelector = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"]):not([disabled])',
    '[contenteditable="true"]'
  ].join(', ');

  const updateFocusableElements = useCallback(() => {
    if (!modalRef.current) return;

    const focusableElements = modalRef.current.querySelectorAll(
      focusableElementsSelector
    ) as NodeListOf<HTMLElement>;

    firstFocusableElementRef.current = focusableElements[0] || null;
    lastFocusableElementRef.current = focusableElements[focusableElements.length - 1] || null;
  }, [focusableElementsSelector]);

  const handleTabKey = useCallback((event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;

    const firstElement = firstFocusableElementRef.current;
    const lastElement = lastFocusableElementRef.current;

    if (!firstElement || !lastElement) return;

    if (event.shiftKey) {
      // Shift + Tab: moving backwards
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab: moving forwards
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    handleTabKey(event);
  }, [handleTabKey]);

  // Set up focus trap when modal opens
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    updateFocusableElements();

    // Focus the first focusable element when modal opens
    const firstElement = firstFocusableElementRef.current;
    if (firstElement) {
      // Use setTimeout to ensure the modal is fully rendered
      setTimeout(() => {
        firstElement.focus();
      }, 0);
    }

    // Add event listener for Tab key handling
    const modal = modalRef.current;
    modal.addEventListener('keydown', handleKeyDown);

    return () => {
      modal.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown, updateFocusableElements]);

  // Update focusable elements when modal content changes
  const refreshFocusableElements = useCallback(() => {
    if (isOpen) {
      updateFocusableElements();
    }
  }, [isOpen, updateFocusableElements]);

  return {
    modalRef,
    refreshFocusableElements,
  };
};