import { Fragment, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

/**
 * Renders overlays at the app root without a `Modal`. On Android a Modal is a
 * separate window: opening one takes focus from the text field and closes the
 * keyboard. Overlays drawn through <Portal> stay in the app's own window.
 */
let nodes: ReadonlyMap<string, ReactNode> = new Map();
const listeners = new Set<() => void>();

function setNode(name: string, node: ReactNode | null) {
  const next = new Map(nodes);
  if (node === null) next.delete(name);
  else next.set(name, node);
  nodes = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => nodes;

/** Mount once near the root, after the screens. */
export function PortalHost() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (current.size === 0) return null;
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 600 }]}>
      {[...current].map(([name, node]) => (
        <Fragment key={name}>{node}</Fragment>
      ))}
    </View>
  );
}

/** Draws `children` in the PortalHost while mounted. */
export function Portal({ name, children }: { name: string; children: ReactNode }) {
  useEffect(() => {
    setNode(name, children);
  }, [name, children]);
  useEffect(() => () => setNode(name, null), [name]);
  return null;
}
