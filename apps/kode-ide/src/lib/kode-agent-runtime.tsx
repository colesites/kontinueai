import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { KodeToolStep } from "./kode-agent";

// Cross-project agent runtime. A chat's run can keep going (and stay
// answerable) while the user is looking at a different project, so the run
// status + any pending question (tool approval / option elicitation) and their
// resolvers live here, above the chat view, keyed by chatId. Both the chat view
// and the sidebar read this store and resolve the same pending question.

export type ChatRunStatus = "idle" | "running" | "awaiting";

const isPendingStep = (s: KodeToolStep) =>
  s.state === "pending-approval" || s.state === "pending-options";

type RuntimeValue = {
  statusByChat: Record<string, ChatRunStatus>;
  pendingByChat: Record<string, KodeToolStep[]>;
  setRunning: (chatId: string, running: boolean) => void;
  /** Mirror a tool step into the store so pending questions surface in the sidebar. */
  syncStep: (chatId: string, step: KodeToolStep) => void;
  /** Drop all run state for a chat (run finished / errored / migrated key). */
  clearChat: (chatId: string) => void;
  registerApproval: (id: string, resolver: (approved: boolean) => void) => void;
  registerOptions: (id: string, resolver: (values: string[]) => void) => void;
  resolveApproval: (id: string, approved: boolean) => void;
  resolveOptions: (id: string, values: string[]) => void;
};

const KodeAgentRuntimeContext = createContext<RuntimeValue | null>(null);

export function KodeAgentRuntimeProvider({ children }: { children: ReactNode }) {
  const [running, setRunningState] = useState<Record<string, boolean>>({});
  const [pendingByChat, setPendingByChat] = useState<
    Record<string, KodeToolStep[]>
  >({});
  const approvalResolvers = useRef(new Map<string, (a: boolean) => void>());
  const optionsResolvers = useRef(new Map<string, (v: string[]) => void>());

  const setRunning = useCallback((chatId: string, value: boolean) => {
    setRunningState((current) => ({ ...current, [chatId]: value }));
  }, []);

  const syncStep = useCallback((chatId: string, step: KodeToolStep) => {
    setPendingByChat((current) => {
      const list = current[chatId] ?? [];
      const idx = list.findIndex((s) => s.id === step.id);
      if (isPendingStep(step)) {
        const next =
          idx >= 0
            ? list.map((s) => (s.id === step.id ? step : s))
            : [...list, step];
        return { ...current, [chatId]: next };
      }
      // Step resolved/advanced — remove it from the pending set.
      if (idx < 0) return current;
      return { ...current, [chatId]: list.filter((s) => s.id !== step.id) };
    });
  }, []);

  const removePending = useCallback((id: string) => {
    setPendingByChat((current) => {
      let changed = false;
      const next: Record<string, KodeToolStep[]> = {};
      for (const [chatId, steps] of Object.entries(current)) {
        const filtered = steps.filter((s) => s.id !== id);
        if (filtered.length !== steps.length) changed = true;
        next[chatId] = filtered;
      }
      return changed ? next : current;
    });
  }, []);

  const clearChat = useCallback((chatId: string) => {
    setPendingByChat((current) => {
      if (!(chatId in current)) return current;
      const next = { ...current };
      delete next[chatId];
      return next;
    });
    setRunningState((current) => ({ ...current, [chatId]: false }));
  }, []);

  const registerApproval = useCallback(
    (id: string, resolver: (approved: boolean) => void) => {
      approvalResolvers.current.set(id, resolver);
    },
    [],
  );
  const registerOptions = useCallback(
    (id: string, resolver: (values: string[]) => void) => {
      optionsResolvers.current.set(id, resolver);
    },
    [],
  );

  const resolveApproval = useCallback(
    (id: string, approved: boolean) => {
      const resolver = approvalResolvers.current.get(id);
      if (resolver) {
        resolver(approved);
        approvalResolvers.current.delete(id);
      }
      removePending(id);
    },
    [removePending],
  );
  const resolveOptions = useCallback(
    (id: string, values: string[]) => {
      const resolver = optionsResolvers.current.get(id);
      if (resolver) {
        resolver(values);
        optionsResolvers.current.delete(id);
      }
      removePending(id);
    },
    [removePending],
  );

  const statusByChat = useMemo<Record<string, ChatRunStatus>>(() => {
    const out: Record<string, ChatRunStatus> = {};
    const keys = new Set([
      ...Object.keys(running),
      ...Object.keys(pendingByChat),
    ]);
    for (const chatId of keys) {
      out[chatId] =
        (pendingByChat[chatId]?.length ?? 0) > 0
          ? "awaiting"
          : running[chatId]
            ? "running"
            : "idle";
    }
    return out;
  }, [running, pendingByChat]);

  const value = useMemo<RuntimeValue>(
    () => ({
      statusByChat,
      pendingByChat,
      setRunning,
      syncStep,
      clearChat,
      registerApproval,
      registerOptions,
      resolveApproval,
      resolveOptions,
    }),
    [
      statusByChat,
      pendingByChat,
      setRunning,
      syncStep,
      clearChat,
      registerApproval,
      registerOptions,
      resolveApproval,
      resolveOptions,
    ],
  );

  return (
    <KodeAgentRuntimeContext.Provider value={value}>
      {children}
    </KodeAgentRuntimeContext.Provider>
  );
}

export function useKodeAgentRuntime() {
  const ctx = useContext(KodeAgentRuntimeContext);
  if (!ctx) {
    throw new Error(
      "useKodeAgentRuntime must be used within KodeAgentRuntimeProvider",
    );
  }
  return ctx;
}
