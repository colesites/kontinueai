export function ScanningAnimation() {
  return (
    <div className="flex items-center gap-1 mt-1">
      <span className="text-xs text-primary">Reading</span>
      <span className="flex gap-0.5">
        <span className="w-1 h-1 rounded-full bg-primary typing-dot" />
        <span className="w-1 h-1 rounded-full bg-primary typing-dot" />
        <span className="w-1 h-1 rounded-full bg-primary typing-dot" />
      </span>
    </div>
  );
}

export function ScanningSkeleton() {
  return (
    <div className="px-4 py-6 border-t border-border bg-muted/50 relative overflow-hidden">
      {/* Scan line effect */}
      <div className="absolute left-0 right-0 h-0.5 bg-linear-to-r from-transparent via-primary to-transparent opacity-50 scan-line" />

      {/* Skeleton preview */}
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full shimmer" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-16 rounded shimmer" />
              <div className="h-4 w-full rounded shimmer" />
              <div className="h-4 w-3/4 rounded shimmer" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
