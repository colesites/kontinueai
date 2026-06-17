---
name: react-best-practices
description: Use when writing or reviewing React components — hooks, state, rendering, performance, accessibility.
appliesTo: [react, next, expo]
version: "1.0"
docs: [https://react.dev/reference/react]
---

# React Best Practices

## When to use
Writing, refactoring, or reviewing React components or hooks.

## When NOT to use
Pure backend/Node code, or non-React frameworks (Vue, Svelte).

## Rules
- Keep components small and focused; extract logic into custom hooks.
- Derive state during render instead of syncing it with effects. Most `useEffect`
  calls that "copy props to state" are bugs.
- `useEffect` is for synchronizing with external systems only (subscriptions,
  DOM, network), not for transforming data.
- Lists need stable, unique `key` props — never the array index when items reorder.
- Lift state only as high as needed; colocate state with the component that uses it.
- Memoize (`useMemo`/`useCallback`/`React.memo`) only after measuring a real
  problem, not preemptively.
- Type props explicitly; avoid `any`. Prefer discriminated unions over boolean soup.

## Examples
```tsx
// Good: derive, don't sync
function Cart({ items }: { items: Item[] }) {
  const total = items.reduce((s, i) => s + i.price, 0); // derived in render
  return <span>{total}</span>;
}
```

## Anti-patterns
```tsx
// Bad: effect to derive state
const [total, setTotal] = useState(0);
useEffect(() => setTotal(items.reduce((s, i) => s + i.price, 0)), [items]);
```
- Fetching in `useEffect` without cleanup or race handling.
- Giant components mixing data fetching, state, and presentation.

## Accessibility
- Use semantic elements (`button`, `nav`, `label`) before ARIA.
- Every interactive element must be keyboard-reachable and have an accessible name.

## Checklist
- [ ] No effect used purely to derive/copy state
- [ ] Stable keys on lists
- [ ] Props typed, no `any`
- [ ] Interactive elements keyboard-accessible
