interface MonoLabelProps {
  children: React.ReactNode;
  className?: string;
  /** Opacity level for the text (default: 55 = text-white/55) */
  opacity?: "28" | "35" | "40" | "45" | "55" | "70";
}

const OPACITY: Record<string, string> = {
  "28": "text-white/[0.28]",
  "35": "text-white/35",
  "40": "text-white/40",
  "45": "text-white/45",
  "55": "text-white/55",
  "70": "text-white/70",
};

export function MonoLabel({ children, className = "", opacity = "55" }: MonoLabelProps) {
  return (
    <span className={`font-mono uppercase tracking-[0.25em] text-[10px] ${OPACITY[opacity]} ${className}`}>
      {children}
    </span>
  );
}
