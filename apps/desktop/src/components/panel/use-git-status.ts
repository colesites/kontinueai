import { useCallback, useEffect, useRef, useState } from "react";
import { errorText, gitStatus, type GitStatus } from "./panel-api";

const POLL_MS = 4000;

/** Git status for `root`, refreshed while `active` and the window is visible. */
export function useGitStatus(root: string | null, active: boolean) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const sequence = useRef(0);

  const refresh = useCallback(async () => {
    if (!root) return;
    const current = ++sequence.current;
    setLoading(true);
    try {
      const next = await gitStatus(root);
      if (current === sequence.current) {
        setStatus(next);
        setError(null);
      }
    } catch (err) {
      if (current === sequence.current) setError(errorText(err));
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [root]);

  useEffect(() => {
    setStatus(null);
    setError(null);
  }, [root]);

  useEffect(() => {
    if (!root || !active) return;
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [root, active, refresh]);

  return { status, error, loading, refresh };
}
