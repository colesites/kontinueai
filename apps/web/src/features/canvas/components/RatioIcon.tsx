import { cn } from "@repo/ui/lib/utils";

interface RatioIconProps {
  ratio: string;
  className?: string;
}

export function RatioIcon({ ratio, className }: RatioIconProps) {
  return (
    <div className="flex h-5 w-5 items-center justify-center">
      <div
        className={cn(
          "rounded-[2px] border border-current opacity-60",
          ratio === "1:1" && "h-3 w-3",
          ratio === "16:9" && "h-2 w-[14px]",
          ratio === "9:16" && "h-[14px] w-2",
          ratio === "21:9" && "h-1.5 w-[14px]",
          ratio === "3:2" && "h-[10px] w-[15px]",
          ratio === "2:3" && "h-[15px] w-[10px]",
          ratio === "4:3" && "h-[11px] w-[14px]",
          ratio === "3:4" && "h-[14px] w-[11px]",
          className
        )}
      />
    </div>
  );
}
