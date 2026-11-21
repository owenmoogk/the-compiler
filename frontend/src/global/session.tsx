import type { Me } from '@compiler/shared';
import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import type { MeResult } from '@api/auth';
import { getMe, logout as apiLogout } from '@api/auth';

type SessionState = { status: 'loading' } | MeResult;

type SessionContextValue = {
  session: SessionState;
  /** Signed in with push access to the bookmarks repo. */
  canEdit: boolean;
  me?: Me;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void getMe().then((result) => {
      if (!cancelled) setSession(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setSession({ status: 'anonymous' });
  }, []);

  const me = session.status === 'signedIn' ? session.me : undefined;

  return (
    <SessionContext.Provider
      value={{ session, me, canEdit: me?.canEdit === true, logout }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
