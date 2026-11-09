import { useCallback, useEffect, useState } from "react";
import { loadAllSkills, type KodeSkill } from "@/lib/kode-skills";

/**
 * Load installed skills and keep the list fresh without an app restart: re-checks
 * on window focus and on a short interval (cheap — reads only SKILL.md frontmatter).
 */
export function useSkills(root: string | null) {
  const [skills, setSkills] = useState<KodeSkill[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setSkills(await loadAllSkills(root));
    } catch {
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, [root]);

  useEffect(() => {
    void reload();
    const interval = setInterval(() => void reload(), 3000);
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [reload]);

  return { skills, reload, loading };
}
