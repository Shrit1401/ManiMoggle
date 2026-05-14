"use client";

interface GlitchTitleProps {
  text?: string;
  className?: string;
}

export function GlitchTitle({ text = "MANIMOGGLE", className = "" }: GlitchTitleProps) {
  return (
    <div className={`relative select-none ${className}`} style={{ lineHeight: 1 }}>
      {/* Cyan ghost */}
      <span aria-hidden className="absolute inset-0 font-mono font-black tracking-[0.12em] uppercase pointer-events-none"
        style={{
          fontSize: "clamp(36px,10vw,62px)",
          background: "linear-gradient(180deg,#22d3ee 0%,#06b6d4 100%)",
          WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent",
          animation: "glitch-cyan 9s steps(1) 2s infinite",
          opacity: 0,
        }}>
        {text}
      </span>
      {/* Rose ghost */}
      <span aria-hidden className="absolute inset-0 font-mono font-black tracking-[0.12em] uppercase pointer-events-none"
        style={{
          fontSize: "clamp(36px,10vw,62px)",
          background: "linear-gradient(180deg,#fb7185 0%,#f43f5e 100%)",
          WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent",
          animation: "glitch-rose 9s steps(1) 2s infinite",
          opacity: 0,
        }}>
        {text}
      </span>
      {/* Main */}
      <h1 className="font-mono font-black tracking-[0.12em] uppercase"
        style={{
          fontSize: "clamp(36px,10vw,62px)",
          background: "linear-gradient(180deg,#ffffff 0%,#c8f5ff 60%,#7de8f8 100%)",
          WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent",
          animation: "glitch-main 9s steps(1) 2s infinite",
        }}>
        {text}
      </h1>
    </div>
  );
}
