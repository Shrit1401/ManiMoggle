"use client";

interface ScreenHeaderProps {
  /** Text + handler for the left back/exit button */
  onExit?: () => void;
  exitLabel?: string;
  /** Center title — rendered as mono uppercase */
  title?: React.ReactNode;
  /** Optional right slot (any element) */
  right?: React.ReactNode;
  className?: string;
}

export function ScreenHeader({
  onExit,
  exitLabel = "← Exit",
  title,
  right,
  className = "",
}: ScreenHeaderProps) {
  return (
    <div
      className={[
        "flex items-center justify-between px-4 pt-safe pt-4 pb-3 shrink-0",
        "border-b border-[var(--ring-1)] bg-black/40 backdrop-blur-sm",
        className,
      ].join(" ")}
    >
      {onExit ? (
        <button
          onClick={onExit}
          className="font-mono text-[8px] tracking-[0.25em] uppercase text-white/35 hover:text-white/65 transition-colors p-1"
        >
          {exitLabel}
        </button>
      ) : (
        <div className="w-14" />
      )}

      {title && (
        <div className="flex flex-col items-center gap-0.5">
          {typeof title === "string" ? (
            <span className="font-mono text-[8px] tracking-[0.4em] uppercase text-white/55">
              {title}
            </span>
          ) : (
            title
          )}
        </div>
      )}

      {right ?? <div className="w-14" />}
    </div>
  );
}
