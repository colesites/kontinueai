// "This project file just changed" signals, so open editors can refresh right
// away when Kode's own tools write a file. Changes from CLI agents and other
// apps are picked up by the editor's disk check instead.

export type ProjectFileChange = {
  root: string;
  path: string;
  kind: "write" | "delete";
};

type Listener = (change: ProjectFileChange) => void;

const listeners = new Set<Listener>();

export function emitProjectFileChange(change: ProjectFileChange) {
  for (const listener of listeners) {
    try {
      listener(change);
    } catch (error) {
      console.error(error);
    }
  }
}

export function onProjectFileChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
