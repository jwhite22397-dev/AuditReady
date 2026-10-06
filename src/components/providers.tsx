"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DemoRepository } from "@/lib/data/demo-repository";
import { SupabaseRepository } from "@/lib/data/supabase-repository";
import { isSupabaseMode } from "@/lib/supabase/env";

interface WorkspaceContextValue {
  repo: DemoRepository | null;
  nonce: number;
  ready: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({ repo: null, nonce: 0, ready: false });

export function Providers({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<DemoRepository | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const instance = isSupabaseMode() ? new SupabaseRepository() : new DemoRepository();
    const unsubscribe = instance.subscribe(() => setNonce((value) => value + 1));
    let active = true;
    instance.init().then(() => {
      if (active) setRepo(instance);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return <WorkspaceContext.Provider value={{ repo, nonce, ready: Boolean(repo) }}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
