// One icon set for the actions under chat messages: same family, size and
// stroke, so the row reads as a single quiet toolbar.
import { Check, Copy, PencilLine, Split, Square, Undo2, Volume2, type LucideProps } from "lucide-react";

const ICON: LucideProps = { size: 14, strokeWidth: 1.75, "aria-hidden": true };

export const CopyIcon = ({ copied }: { copied?: boolean }) =>
  copied ? <Check {...ICON} /> : <Copy {...ICON} />;

export const RewindIcon = () => <Undo2 {...ICON} />;

/** A stem from the left splitting in two: the chat continues on a new branch. */
export const ForkIcon = () => <Split {...ICON} className="rotate-90" />;

export const EditIcon = () => <PencilLine {...ICON} />;

export const SpeakIcon = ({ speaking }: { speaking?: boolean }) =>
  speaking ? <Square {...ICON} size={12} /> : <Volume2 {...ICON} />;
