"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

// STUN + TURN — TURN is required when both peers are behind symmetric NAT
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  // Free public TURN relay (openrelay.metered.ca) — handles symmetric NAT / strict firewalls
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turns:openrelay.metered.ca:443",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

type PC = {
  conn:              RTCPeerConnection;
  makingOffer:       boolean;
  ignoreOffer:       boolean;
  pendingCandidates: RTCIceCandidateInit[];  // queued before remote desc is set
  reconnectTimer:    ReturnType<typeof setTimeout> | null;
};

export function useWebRTCGroup(
  roomId: Id<"rooms">,
  mySessionId: string,
  otherSessionIds: string[],
  streamRef: React.RefObject<MediaStream | null>,
  streamReady: boolean = false,
): Record<string, MediaStream | null> {
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream | null>>({});
  const pcsRef   = useRef<Record<string, PC>>({});
  const consumed = useRef<Set<string>>(new Set());

  const sendSignal   = useMutation(api.webrtc.sendSignal);
  const deleteSignal = useMutation(api.webrtc.deleteSignal);
  const inboundRaw   = useQuery(api.webrtc.getSignals, { roomId, to: mySessionId });

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const addTracksToConn = useCallback((conn: RTCPeerConnection) => {
    const stream = streamRef.current;
    if (!stream) return;
    const existingIds = new Set(conn.getSenders().map(s => s.track?.id).filter(Boolean));
    stream.getTracks().forEach(track => {
      if (!existingIds.has(track.id)) conn.addTrack(track, stream);
    });
  }, [streamRef]);

  // ── Create / recreate peer connection ─────────────────────────────────────────

  const createPcEntry = useCallback((peerId: string): PC => {
    const old = pcsRef.current[peerId];
    if (old?.reconnectTimer) clearTimeout(old.reconnectTimer);
    old?.conn.close();

    const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const pcEntry: PC = {
      conn,
      makingOffer: false,
      ignoreOffer: false,
      pendingCandidates: [],
      reconnectTimer: null,
    };
    pcsRef.current[peerId] = pcEntry;

    // Add local tracks immediately
    addTracksToConn(conn);

    // Remote track → expose stream
    conn.ontrack = (ev) => {
      const stream = ev.streams[0];
      if (stream) {
        setRemoteStreams(prev => ({ ...prev, [peerId]: stream }));
      }
    };

    // ICE candidates → Convex
    conn.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      void sendSignal({
        roomId, from: mySessionId, to: peerId,
        type: "ice", payload: JSON.stringify(candidate),
      });
    };

    // Perfect negotiation — single source of offers
    conn.onnegotiationneeded = async () => {
      if (pcEntry.makingOffer) return;
      try {
        pcEntry.makingOffer = true;
        await conn.setLocalDescription();
        void sendSignal({
          roomId, from: mySessionId, to: peerId,
          type: "offer", payload: JSON.stringify(conn.localDescription),
        });
      } catch { /* negotiation aborted — onnegotiationneeded will retry */ }
      finally { pcEntry.makingOffer = false; }
    };

    // Connection state: attempt recovery before giving up
    conn.onconnectionstatechange = () => {
      const state = conn.connectionState;

      if (state === "disconnected") {
        // Give the browser 4s to self-recover before forcing ICE restart
        if (pcEntry.reconnectTimer) clearTimeout(pcEntry.reconnectTimer);
        pcEntry.reconnectTimer = setTimeout(() => {
          if (
            conn.connectionState === "disconnected" ||
            conn.connectionState === "failed"
          ) {
            try { conn.restartIce(); } catch { /* already closed */ }
          }
        }, 4000);
      }

      if (state === "failed") {
        if (pcEntry.reconnectTimer) clearTimeout(pcEntry.reconnectTimer);
        // ICE restart triggers onnegotiationneeded → sends fresh offer
        try { conn.restartIce(); } catch { /* already closed */ }
      }

      if (state === "connected") {
        if (pcEntry.reconnectTimer) clearTimeout(pcEntry.reconnectTimer);
        pcEntry.reconnectTimer = null;
      }
    };

    return pcEntry;
  }, [roomId, mySessionId, addTracksToConn, sendSignal]);

  const getPc = useCallback((peerId: string): PC => {
    return pcsRef.current[peerId] ?? createPcEntry(peerId);
  }, [createPcEntry]);

  // ── Sync peer list ───────────────────────────────────────────────────────────
  useEffect(() => {
    for (const peerId of otherSessionIds) getPc(peerId);

    // Only prune stale PCs when we have a known peer list — if the list is empty
    // (camera not yet ready) the inbound signal handler may have already created
    // a PC for the remote peer, and closing it here would kill that connection.
    if (otherSessionIds.length > 0) {
      for (const peerId of Object.keys(pcsRef.current)) {
        if (!otherSessionIds.includes(peerId)) {
          const entry = pcsRef.current[peerId];
          if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
          entry.conn.close();
          delete pcsRef.current[peerId];
          setRemoteStreams(prev => { const n = { ...prev }; delete n[peerId]; return n; });
        }
      }
    }
  }, [otherSessionIds, getPc]);

  // ── Sync local tracks whenever peer list or stream becomes ready ─────────────
  // streamReady flips true once camera is up — triggers track addition on any
  // PCs that were created before the camera was available.
  const otherIdsKey = otherSessionIds.join(",");
  useEffect(() => {
    for (const { conn } of Object.values(pcsRef.current)) {
      addTracksToConn(conn);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherIdsKey, streamReady, addTracksToConn]);


  // ── Process inbound signals (perfect-negotiation pattern) ────────────────────
  useEffect(() => {
    if (!inboundRaw) return;

    for (const sig of inboundRaw) {
      if (consumed.current.has(sig._id)) continue;
      consumed.current.add(sig._id);

      // Fire-and-forget delete; server try/catches duplicate deletes
      void deleteSignal({ id: sig._id }).catch(() => {});

      const pcEntry = getPc(sig.from);
      const { conn } = pcEntry;
      // Polite peer: the one with the lexicographically lower sessionId yields on collision
      const polite = mySessionId < sig.from;

      void (async () => {
        try {
          if (sig.type === "offer") {
            const collision = pcEntry.makingOffer || conn.signalingState !== "stable";
            pcEntry.ignoreOffer = !polite && collision;
            if (pcEntry.ignoreOffer) return;

            await conn.setRemoteDescription(JSON.parse(sig.payload) as RTCSessionDescriptionInit);

            // Drain any ICE candidates that arrived before the remote description
            for (const c of pcEntry.pendingCandidates) {
              try { await conn.addIceCandidate(c); } catch { /* stale candidate */ }
            }
            pcEntry.pendingCandidates = [];

            // Ensure local tracks are added before sending answer
            addTracksToConn(conn);

            await conn.setLocalDescription();
            void sendSignal({
              roomId, from: mySessionId, to: sig.from,
              type: "answer", payload: JSON.stringify(conn.localDescription),
            });

          } else if (sig.type === "answer") {
            if (conn.signalingState === "have-local-offer") {
              await conn.setRemoteDescription(JSON.parse(sig.payload) as RTCSessionDescriptionInit);

              // Drain queued ICE candidates
              for (const c of pcEntry.pendingCandidates) {
                try { await conn.addIceCandidate(c); } catch { /* stale */ }
              }
              pcEntry.pendingCandidates = [];
            }

          } else if (sig.type === "ice") {
            const candidate = JSON.parse(sig.payload) as RTCIceCandidateInit;
            if (conn.remoteDescription) {
              try { await conn.addIceCandidate(candidate); } catch { /* stale */ }
            } else {
              // Queue until remote description is set
              pcEntry.pendingCandidates.push(candidate);
            }
          }
        } catch { /* swallow — will recover via renegotiation */ }
      })();
    }
  }, [inboundRaw, getPc, deleteSignal, sendSignal, roomId, mySessionId, addTracksToConn]);

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      for (const entry of Object.values(pcsRef.current)) {
        if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
        entry.conn.close();
      }
    };
  }, []);

  return remoteStreams;
}
