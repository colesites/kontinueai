// Selections the "Annotate" bubble can't see through the DOM, such as the
// code editor's (Monaco draws its own selection). Each source returns the
// selected text and where to show the bubble, or null.

export type AnnotationTarget = { source: string; quote: string; x: number; y: number };

type Source = () => AnnotationTarget | null;

const sources = new Set<Source>();

export function registerAnnotationSource(source: Source): () => void {
  sources.add(source);
  return () => {
    sources.delete(source);
  };
}

export function externalAnnotationTarget(): AnnotationTarget | null {
  for (const source of sources) {
    const target = source();
    if (target) return target;
  }
  return null;
}
