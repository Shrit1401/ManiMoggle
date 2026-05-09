# Manimoggle

AI-powered face rating with real-time multiplayer. Scan your face, get a PSL score, and battle friends.

## What it does

- **1v1 Battle** — Split-screen duel. Both players scan, highest PSL wins. Queue up and challenge the winner.
- **Tournament** — Up to 32 players, single-elimination bracket. Host kicks off each round with one button.
- **Group Scan** — Up to 8 players scan simultaneously, ranked on a live leaderboard when results come in.

Scoring is built on MediaPipe's 478-point face mesh. Six traits are measured per frame (canthal tilt, jawline, symmetry, harmony, golden ratio, skin), quality-gated by pose angle and lighting, then median-aggregated over a 15-second scan window to produce a stable PSL score.

## Stack

- **Next.js 16** (App Router) + **React 19**
- **Convex** — real-time reactive backend (rooms, players, WebRTC signalling)
- **MediaPipe Tasks Vision** — client-side face landmarker (478 landmarks, GPU delegate)
- **WebRTC** — peer-to-peer video streams for the camera grid
- **Tailwind v4**

## Run locally

```bash
npm install
npx convex dev        # starts Convex dev backend + watches functions
npm run dev           # starts Next.js on localhost:3000
```

Camera access is required. Works best in Chrome/Safari on desktop and mobile.

## Project structure

```
app/
  page.tsx              # Home — create or join a room
  room/[code]/
    room-view.tsx       # Battle / Tournament / Group scan views
  scan/
    use-face-landmarker.ts   # Camera + MediaPipe hook, scan state machine
    face-rating.ts           # Scoring math, trait calculations
    hud.tsx                  # Score overlay UI
    room-scan-view.tsx       # Solo scan wrapper
convex/
  schema.ts             # Database schema
  rooms.ts              # Room mutations (create, join, battle, tournament, group)
  players.ts            # Player mutations (phase, snapshot, submitScore)
```
