/** Stem from the left, splitting into an up-right arrow and a down-right arrow. */
export function ForkIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 25" fill="none" aria-hidden="true">
      <path d="M1.7 12.5h9.4L21.5 2.1M15.8 2.1H21.5V8.2M11.1 12.5 21.5 22.9M15.8 22.9H21.5V16.8" stroke="currentColor" strokeWidth="2.15" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
