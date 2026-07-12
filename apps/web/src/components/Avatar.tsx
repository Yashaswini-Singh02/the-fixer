import clsx from "clsx";

type Ring = "none" | "gold" | "red" | "chalk";

const SIZE = {
  xs: "h-7 w-7 text-base",
  sm: "h-9 w-9 text-lg",
  md: "h-11 w-11 text-2xl",
  lg: "h-14 w-14 text-3xl",
  xl: "h-20 w-20 text-5xl",
} as const;

const RING = {
  none: "ring-1 ring-white/10",
  gold: "ring-2 ring-gold shadow-[0_0_18px_-4px_rgba(255,197,49,0.7)]",
  red: "ring-2 ring-vermilion shadow-[0_0_18px_-4px_rgba(255,68,56,0.7)]",
  chalk: "ring-2 ring-chalk/70",
} as const;

export function Avatar({
  emoji,
  size = "md",
  ring = "none",
  crown = false,
  dim = false,
  className,
}: {
  emoji: string;
  size?: keyof typeof SIZE;
  ring?: Ring;
  crown?: boolean;
  dim?: boolean;
  className?: string;
}) {
  return (
    <span className={clsx("relative inline-grid shrink-0", className)}>
      {crown && (
        <span className="pointer-events-none absolute -top-3 left-1/2 z-10 -translate-x-1/2 text-lg drop-shadow">
          👑
        </span>
      )}
      <span
        className={clsx(
          "grid place-items-center rounded-2xl bg-gradient-to-b from-pitch-3 to-pitch-2 leading-none transition-opacity",
          SIZE[size],
          RING[ring],
          dim && "opacity-35 grayscale",
        )}
      >
        <span className="translate-y-[1px]">{emoji}</span>
      </span>
    </span>
  );
}
