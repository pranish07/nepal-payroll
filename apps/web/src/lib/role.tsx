import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { loadRole, saveRole } from './api';
import type { Role } from './types';

interface RoleContextValue {
  role: Role;
  setRole: (role: Role) => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(() => loadRole());
  const queryClient = useQueryClient();

  const setRole = useCallback(
    (next: Role) => {
      setRoleState(next);
      saveRole(next);
      void queryClient.invalidateQueries();
    },
    [queryClient],
  );

  const value = useMemo(() => ({ role, setRole }), [role, setRole]);
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const value = useContext(RoleContext);
  if (!value) throw new Error('useRole must be used inside RoleProvider.');
  return value;
}
