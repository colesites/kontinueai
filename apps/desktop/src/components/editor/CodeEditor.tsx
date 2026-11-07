import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror, { EditorView, keymap } from "@uiw/react-codemirror";
import { toggleComment } from "@codemirror/commands";
import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import type { Extension } from "@codemirror/state";

const mono =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

const surface = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
  },
  ".cm-scroller": { fontFamily: mono, fontSize: "12.5px", lineHeight: "1.55" },
  ".cm-gutters": {
    backgroundColor: "var(--background)",
    border: "none",
    color: "color-mix(in srgb, var(--foreground) 38%, transparent)",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--foreground) 5%, transparent)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "color-mix(in srgb, var(--foreground) 5%, transparent)",
  },
  "&.cm-focused": { outline: "none" },
});

function useDark() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains("dark"));
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

function useLanguage(path: string) {
  const [extension, setExtension] = useState<Extension[]>([]);
  useEffect(() => {
    const name = path.split("/").pop() ?? path;
    const description = LanguageDescription.matchFilename(languages, name);
    if (!description) {
      setExtension([]);
      return;
    }
    let cancelled = false;
    void description
      .load()
      .then((support) => {
        if (cancelled) return;
        const ext = support.extension;
        setExtension(Array.isArray(ext) ? ext : [ext]);
      })
      .catch(() => {
        if (!cancelled) setExtension([]);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return extension;
}

export function CodeEditor({
  path,
  value,
  onChange,
  onSave,
}: {
  path: string;
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
}) {
  const dark = useDark();
  const language = useLanguage(path);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  const extensions = useMemo(
    () => [
      keymap.of([
        { key: "Mod-/", run: toggleComment, preventDefault: true },
        {
          key: "Mod-s",
          preventDefault: true,
          run: () => {
            saveRef.current?.();
            return true;
          },
        },
      ]),
      ...language,
      surface,
    ],
    [language],
  );

  return (
    <CodeMirror
      value={value}
      height="100%"
      theme={dark ? "dark" : "light"}
      extensions={extensions}
      basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }}
      onChange={onChange}
      className="h-full min-h-0 bg-background text-[12.5px] text-foreground [&_.cm-editor]:h-full [&_.cm-editor]:!bg-background [&_.cm-editor]:!text-foreground [&_.cm-scroller]:!bg-background [&_.cm-gutters]:!border-0 [&_.cm-gutters]:!bg-background"
    />
  );
}
