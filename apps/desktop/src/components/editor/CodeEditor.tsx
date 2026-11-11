// The Files panel's editor. Monaco is large, so it loads on first use.

import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import type { FileEditorProps } from "./monaco/MonacoFileEditor";

const MonacoFileEditor = lazy(() => import("./monaco/MonacoFileEditor"));

export type { FileEditorProps };

export function FileEditor(props: FileEditorProps) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center bg-background">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <MonacoFileEditor {...props} />
    </Suspense>
  );
}
