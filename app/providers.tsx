"use client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = url ? new ConvexReactClient(url) : null;

export function Providers({ children }: { children: ReactNode }) {
  if (!convex) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <p className="font-mono text-[11px] tracking-[0.22em] uppercase text-white/50">
          Run <span className="text-cyan-400">npx convex dev</span> then restart
        </p>
      </div>
    );
  }
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
