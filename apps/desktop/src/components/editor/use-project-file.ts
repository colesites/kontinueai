import { useEffect, useState } from "react";
import { errorText, readFile, writeFile } from "@/components/panel/panel-api";

export function useProjectFile(root: string, path: string) {
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const dirty = draft !== null && saved !== null && draft !== saved;

  useEffect(() => {
    let cancelled = false;
    setSaved(null);
    setDraft(null);
    setError(null);
    readFile(root, path)
      .then((text) => {
        if (cancelled) return;
        setSaved(text);
        setDraft(text);
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err));
      });
    return () => {
      cancelled = true;
    };
  }, [root, path]);

  const save = async () => {
    if (draft === null || !dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      await writeFile(root, path, draft);
      setSaved(draft);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 1200);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return { draft, setDraft, error, saving, justSaved, dirty, save };
}
