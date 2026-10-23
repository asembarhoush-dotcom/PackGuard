import { useEffect, useRef } from 'react';
import { registryStore } from '../contexts/OmniSearchRegistryContext';

/**
 * Hook to register commands dynamically in the Distributed Command Registry.
 * Commands registered here will appear in OmniSearch.
 * They are automatically unregistered when the component unmounts.
 *
 * @param {Array|Object} commands - Single command object or array of command objects
 * @param {Array} deps - Dependencies that should trigger a re-registration (e.g. if action closes over props)
 */
export const useOmniSearchRegisterCommand = (commands, deps = []) => {
  // Keep track of registered IDs for cleanup
  const registeredIds = useRef([]);

  useEffect(() => {
    const cmds = Array.isArray(commands) ? commands : [commands];

    // 1. Register
    registryStore.register(cmds);
    // Store IDs for cleanup
    registeredIds.current = cmds.map((c) => c.id);

    // 2. Cleanup on unmount or deps change
    return () => {
      if (registeredIds.current.length > 0) {
        registryStore.unregister(registeredIds.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps]);
};
