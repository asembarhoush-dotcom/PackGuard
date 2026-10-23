import { useEffect } from 'react';

/**
 * Hook for handling global keyboard shortcuts (VS Code Style)
 * Supports standard modifiers and ensures execution even within inputs for Command/Ctrl shortcuts.
 * @param {Array<{ keys: string[], action: () => void }>} shortcuts
 */
export const useGlobalShortcuts = (shortcuts) => {
  useEffect(() => {
    const handleKeyDown = (event) => {
      const { tagName, isContentEditable } = event.target;
      const isInput = ['INPUT', 'TEXTAREA'].includes(tagName) || isContentEditable;

      const key = event.key.toLowerCase();
      const modifiers = {
        meta: event.metaKey,
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
        alt: event.altKey,
      };

      shortcuts.forEach(({ keys, action }) => {
        // Separate required modifiers and the primary key
        const requiredModifiers = keys.filter((k) => ['meta', 'ctrl', 'shift', 'alt'].includes(k));
        const requiredKey = keys.find((k) => !['meta', 'ctrl', 'shift', 'alt'].includes(k));

        // 1. Check Modifiers Match Exactness
        const modifiersMatch =
          requiredModifiers.every((mod) => modifiers[mod]) &&
          Object.keys(modifiers).filter((mod) => modifiers[mod]).length === requiredModifiers.length;

        // 2. Check Key Match
        const keyMatch = key === requiredKey?.toLowerCase();

        if (modifiersMatch && keyMatch) {
          // 3. Input Safety Check
          // Allow if Modifier (Cmd/Ctrl) is used (VS Code Style), otherwise block in inputs
          const hasCommandModifier = modifiers.meta || modifiers.ctrl;

          if (isInput && !hasCommandModifier) {
            return;
          }

          // 4. Execution & Override
          event.preventDefault();
          event.stopPropagation(); // Stop bubbling
          action();
        }
      });
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [shortcuts]);
};
