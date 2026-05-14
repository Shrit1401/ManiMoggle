"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

const EMOJIS = ["🔥", "😮", "💀", "👑", "🎯", "😍"];

interface FloatingEmoji {
  id: string;
  emoji: string;
  x: number;
  name: string;
}

interface Props {
  roomCode: string;
  playerName: string;
}

export function EmojiReactionLayer({ roomCode, playerName }: Props) {
  const reactions   = useQuery(api.reactions.recent, { roomCode });
  const addReaction = useMutation(api.reactions.add);
  const seenIds     = useRef<Set<string>>(new Set());
  const [floating, setFloating] = useState<FloatingEmoji[]>([]);

  useEffect(() => {
    if (!reactions) return;
    const fresh = reactions.filter(r => !seenIds.current.has(r._id));
    if (!fresh.length) return;
    fresh.forEach(r => seenIds.current.add(r._id));
    setFloating(prev => [
      ...prev,
      ...fresh.map(r => ({
        id: r._id,
        emoji: r.emoji,
        x: 10 + Math.random() * 80,
        name: r.senderName,
      })),
    ]);
  }, [reactions]);

  const dismiss = (id: string) =>
    setFloating(prev => prev.filter(f => f.id !== id));

  const send = (emoji: string) =>
    void addReaction({ roomCode, emoji, senderName: playerName });

  return (
    <>
      {/* Floating emojis */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
        {floating.map(f => (
          <FloatingItem key={f.id} item={f} onDone={() => dismiss(f.id)} />
        ))}
      </div>

      {/* Send bar */}
      <div className="absolute bottom-24 right-3 z-30 flex flex-col gap-1.5">
        {EMOJIS.map(e => (
          <button
            key={e}
            onClick={() => send(e)}
            className="w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm
              ring-1 ring-white/15 flex items-center justify-center text-lg
              hover:scale-110 active:scale-95 transition-transform"
          >
            {e}
          </button>
        ))}
      </div>
    </>
  );
}

function FloatingItem({ item, onDone }: { item: FloatingEmoji; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const anim = el.animate(
      [
        { transform: "translateY(0) scale(1)", opacity: 1 },
        { transform: "translateY(-180px) scale(1.3)", opacity: 1, offset: 0.6 },
        { transform: "translateY(-240px) scale(0.8)", opacity: 0 },
      ],
      { duration: 2200, easing: "ease-out", fill: "forwards" },
    );
    anim.onfinish = onDone;
    return () => anim.cancel();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      className="absolute bottom-28 flex flex-col items-center gap-0.5"
      style={{ left: `${item.x}%` }}
    >
      <span className="text-2xl drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]">{item.emoji}</span>
      <span className="font-mono text-[7px] tracking-wide uppercase text-white/50 bg-black/40 px-1.5 py-0.5 rounded-full">
        {item.name}
      </span>
    </div>
  );
}
