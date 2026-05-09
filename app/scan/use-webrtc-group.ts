"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

type PC = {
  conn: RTCPeerConnection;
  makingOffer: boolean;
  ignoreOffer: boolean;
};

export function useWebRTCGroup(
  roomId: Id<"rooms">,
  mySessionId: string,
  otherSessionIds: string[],
  streamRef: React.RefObject<MediaStream | null>,
): Record<string, MediaStream | null> {
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream | null>>({});
  const pcsRef  = useRef<Record<string, PC>>({});
  const consumed = useRef<Set<string>>(new Set());

  const sendSignal   = useMutation(api.webrtc.sendSignal);
  const deleteSignal = useMutation(api.webrtc.deleteSignal);
  const inboundRaw   = useQuery(api.webrtc.getSignals, { roomId, to: mySessionId });

  // ── Create / remove peer connections as players join / leave ────────────────
  const getPc = useCallback((peerId: string): PC => {
    if (pcsRef.current[peerId]) return pcsRef.current[peerId];

    const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const pcEntry: PC = { conn, makingOffer: false, ignoreOffer: false };
    pcsRef.current[peerId] = pcEntry;

    // Add local tracks (may run before stream is ready — we re-add in effect below)
    const stream = streamRef.current;
    if (stream) stream.getTracks().forEach(t => conn.addTrack(t, stream));

    // Remote track → expose stream
    conn.ontrack = ({ streams }) => {
      setRemoteStreams(prev => ({ ...prev, [peerId]: streams[0] ?? null }));
    };

    // ICE candidates → Convex
    conn.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      void sendSignal({ roomId, from: mySessionId, to: peerId, type: "ice", payload: JSON.stringify(candidate) });
    };

    conn.onnegotiationneeded = async () => {
      try {
        pcEntry.makingOffer = true;
        await conn.setLocalDescription();
        void sendSignal({ roomId, from: mySessionId, to: peerId, type: "offer", payload: JSON.stringify(conn.localDescription) });
      } catch { /* ignore */ } finally {
        pcEntry.makingOffer = false;
      }
    };

    conn.onconnectionstatechange = () => {
      if (conn.connectionState === "failed") conn.restartIce();
    };

    // Polite-peer: lower sessionId is "polite" (will rollback on collision)
    // Trigger negotiation for the impolite peer (higher sessionId)
    if (mySessionId > peerId) {
      // We are the impolite peer — initiate offer via negotiationneeded
      const offer = conn.createOffer();
      offer.then(sdp => {
        pcEntry.makingOffer = true;
        return conn.setLocalDescription(sdp);
      }).then(() => {
        void sendSignal({ roomId, from: mySessionId, to: peerId, type: "offer", payload: JSON.stringify(conn.localDescription) });
        pcEntry.makingOffer = false;
      }).catch(() => { pcEntry.makingOffer = false; });
    }

    return pcEntry;
  }, [roomId, mySessionId, streamRef, sendSignal]);

  // Sync peer connections with current player list
  useEffect(() => {
    for (const peerId of otherSessionIds) getPc(peerId);

    // Remove connections for players who left
    for (const peerId of Object.keys(pcsRef.current)) {
      if (!otherSessionIds.includes(peerId)) {
        pcsRef.current[peerId].conn.close();
        delete pcsRef.current[peerId];
        setRemoteStreams(prev => { const n = { ...prev }; delete n[peerId]; return n; });
      }
    }
  }, [otherSessionIds, getPc]);

  // Add local tracks to all connections once stream is available
  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;
    for (const { conn } of Object.values(pcsRef.current)) {
      const senders = conn.getSenders();
      stream.getTracks().forEach(track => {
        if (!senders.find(s => s.track?.id === track.id)) {
          conn.addTrack(track, stream);
        }
      });
    }
  }, [streamRef]);

  // Process inbound signals (perfect-negotiation pattern)
  useEffect(() => {
    if (!inboundRaw) return;
    for (const sig of inboundRaw) {
      if (consumed.current.has(sig._id)) continue;
      consumed.current.add(sig._id);
      void deleteSignal({ id: sig._id });

      const pcEntry = getPc(sig.from);
      const { conn } = pcEntry;
      const polite = mySessionId < sig.from;

      void (async () => {
        try {
          if (sig.type === "offer") {
            const offerCollision = pcEntry.makingOffer || conn.signalingState !== "stable";
            pcEntry.ignoreOffer = !polite && offerCollision;
            if (pcEntry.ignoreOffer) return;
            await conn.setRemoteDescription(JSON.parse(sig.payload) as RTCSessionDescriptionInit);
            // Add local stream tracks if not yet added
            const stream = streamRef.current;
            if (stream) {
              const senders = conn.getSenders();
              stream.getTracks().forEach(track => {
                if (!senders.find(s => s.track?.id === track.id)) conn.addTrack(track, stream);
              });
            }
            await conn.setLocalDescription();
            void sendSignal({ roomId, from: mySessionId, to: sig.from, type: "answer", payload: JSON.stringify(conn.localDescription) });
          } else if (sig.type === "answer") {
            if (conn.signalingState === "have-local-offer") {
              await conn.setRemoteDescription(JSON.parse(sig.payload) as RTCSessionDescriptionInit);
            }
          } else if (sig.type === "ice") {
            try {
              await conn.addIceCandidate(JSON.parse(sig.payload) as RTCIceCandidateInit);
            } catch { if (!pcEntry.ignoreOffer) throw new Error("ice failed"); }
          }
        } catch { /* swallow — will retry on next renegotiation */ }
      })();
    }
  }, [inboundRaw, getPc, deleteSignal, sendSignal, roomId, mySessionId, streamRef]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const { conn } of Object.values(pcsRef.current)) conn.close();
    };
  }, []);

  return remoteStreams;
}
