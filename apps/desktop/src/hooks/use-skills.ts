import { useCallback, useEffect, useRef, useState } from "react";
import { loadAllSkills, type KodeSkill } from "@/lib/kode-skills";

/**
 * Load installed skills and keep the list fresh without an app restart: re-checks
 * on window focus and on a slow interval (reads only SKILL.md frontmatter).
 */
export function useSkills(root: string | null) {
  const [skills, setSkills] = useState<KodeSkill[]>([]);
  const [loading, setLoading] = useState(true);
  // What the last load returned, to skip re-renders when nothing changed.
  const lastKey = useRef("");

  const reload = useCallback(
    async (background = false) => {
      // Background checks never flip the loading state: that alone
      // re-rendered every screen using skills every few seconds.
      if (!background) setLoading(true);
      try {
        const next = await loadAllSkills(root);
        const key = JSON.stringify(next.map((skill) => [skill.name, skill.scope, skill.description]));
        if (key !== lastKey.current) {
          lastKey.current = key;
          setSkills(next);
        }
      } catch {
        if (lastKey.current !== "[]") {
          lastKey.current = "[]";
          setSkills([]);
        }
      } finally {
        if (!background) setLoading(false);
      }
    },
    [root],
  );

  useEffect(() => {
    lastKey.current = "";
    void reload();
    // New or edited skills show up when the window regains focus, and on a
    // slow background check otherwise.
    const interval = setInterval(() => void reload(true), 15_000);
    const onFocus = () => void reload(true);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [reload]);

  return { skills, reload: () => reload(), loading };
}
