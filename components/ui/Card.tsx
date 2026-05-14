interface CardProps {
  children: React.ReactNode;
  className?: string;
  /** Adds a subtle cyan glow shadow */
  glow?: boolean;
  as?: "div" | "section" | "article";
}

export function Card({ children, className = "", glow = false, as: Tag = "div" }: CardProps) {
  return (
    <Tag
      className={[
        "bg-black/70 backdrop-blur-2xl",
        "ring-1 ring-[var(--ring-1)]",
        "rounded-[var(--radius-card)]",
        glow ? "shadow-[0_0_40px_rgba(34,211,238,0.08)]" : "",
        className,
      ].join(" ")}
    >
      {children}
    </Tag>
  );
}
