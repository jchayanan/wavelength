import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import type { Room, RoomStatus } from "../types/game";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface UseGameRoomReturn {
  room: Room | null;
  isLoading: boolean;
  error: string | null;
  otherPlayersAngles: Record<string, number>;
  broadcastDial: (angle: number) => void;
  updateRoomStatus: (status: RoomStatus) => Promise<void>;
  submitGuess: (guessValue: number) => Promise<void>;
  submitClue: (clueText: string) => Promise<void>;
  nextRound: (newTarget: number, leftLabel: string, rightLabel: string) => Promise<void>;
  joinAsGuest: (nickname: string) => Promise<void>;
}

/**
 * Custom hook for managing game room state.
 *
 * PART 1 – Game State: Uses Supabase Database + Postgres Changes to sync
 *          room row (status, targetValue, labels, currentTurn).
 *
 * PART 2 – Dial Movement: Uses Supabase Realtime Broadcast (no DB writes)
 *          for low-latency, 60fps dial position streaming.
 */
export function useGameRoom(roomId: string | undefined, userId: string): UseGameRoomReturn {
  const [room, setRoom] = useState<Room | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [otherPlayersAngles, setOtherPlayersAngles] = useState<Record<string, number>>({});

  const channelRef = useRef<RealtimeChannel | null>(null);
  const dbChannelRef = useRef<RealtimeChannel | null>(null);

  // Clear ghost needles when a new round starts
  useEffect(() => {
    setOtherPlayersAngles({});
  }, [room?.current_turn]);

  // ─── PART 1: Database State (Postgres Changes) ──────────────────────
  useEffect(() => {
    if (!roomId) return;

    let mounted = true;

    // Initial fetch
    async function fetchRoom() {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", roomId)
        .single();

      if (!mounted) return;

      if (fetchError) {
        setError("ไม่พบห้องนี้ หรือเกิดข้อผิดพลาด");
        setIsLoading(false);
        return;
      }

      setRoom(data as Room);
      setError(null);
      setIsLoading(false);
    }

    fetchRoom();

    // Subscribe to row changes
    const dbChannel = supabase
      .channel(`db-room-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rooms",
          filter: `code=eq.${roomId}`,
        },
        (payload) => {
          if (!mounted) return;
          if (payload.eventType === "UPDATE" || payload.eventType === "INSERT") {
            setRoom(payload.new as Room);
          }
          if (payload.eventType === "DELETE") {
            setRoom(null);
            setError("ห้องนี้ถูกลบแล้ว");
          }
        }
      )
      .subscribe();

    dbChannelRef.current = dbChannel;

    return () => {
      mounted = false;
      dbChannel.unsubscribe();
    };
  }, [roomId]);

  // ─── PART 2: Dial Movement (Realtime Broadcast) ─────────────────────
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase.channel(`room-${roomId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "dial-move" }, (payload) => {
        const data = payload.payload as { userId: string; angle: number };
        if (data.userId !== userId) {
          setOtherPlayersAngles((prev) => ({
            ...prev,
            [data.userId]: data.angle,
          }));
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [roomId, userId]);

  /**
   * Broadcast dial angle to other players (no DB write).
   * Called at high frequency during drag/touch.
   */
  const broadcastDial = useCallback(
    (angle: number) => {
      if (!channelRef.current) return;
      channelRef.current.send({
        type: "broadcast",
        event: "dial-move",
        payload: { userId, angle },
      });
    },
    [userId]
  );

  /**
   * Update room status in the database.
   */
  const updateRoomStatus = useCallback(
    async (status: RoomStatus) => {
      if (!room) return;
      const { error: updateError } = await supabase
        .from("rooms")
        .update({ status })
        .eq("id", room.id);
      if (updateError) {
        setError("อัปเดตสถานะไม่สำเร็จ");
      }
    },
    [room]
  );

  /**
   * Join room as guest to set guest_nickname.
   */
  const joinAsGuest = useCallback(
    async (nickname: string) => {
      if (!room) return;
      const { error: updateError } = await supabase
        .from("rooms")
        .update({ guest_nickname: nickname })
        .eq("id", room.id);
      if (updateError) {
        setError("เข้าร่วมห้องไม่สำเร็จ");
      }
    },
    [room]
  );

  /**
   * Submit the team's guess value.
   * Uses React 19-compatible async action pattern.
   */
  const submitGuess = useCallback(
    async (guessValue: number) => {
      if (!room) return;

      const diff = Math.abs(guessValue - room.target_value);
      let pts = 0;
      if (diff <= 2) pts = 4;
      else if (diff <= 6) pts = 3;
      else if (diff <= 10) pts = 2;

      const isHost = userId === room.host_id;
      const updateData: Partial<Room> = {
        guess_value: guessValue,
        status: "revealed" as RoomStatus,
      };

      if (isHost) {
        updateData.host_score = (room.host_score || 0) + pts;
      } else {
        updateData.guest_score = (room.guest_score || 0) + pts;
      }

      const { error: updateError } = await supabase
        .from("rooms")
        .update(updateData)
        .eq("id", room.id);
      if (updateError) {
        setError("ส่งคำตอบไม่สำเร็จ");
      }
    },
    [room]
  );
  /**
   * Submit a clue and claim the Psychic role for this round.
   */
  const submitClue = useCallback(
    async (clueText: string) => {
      if (!room) return;
      const { error: updateError } = await supabase
        .from("rooms")
        .update({
          clue: clueText,
          psychic_id: userId,
        })
        .eq("id", room.id);
      if (updateError) {
        setError("ส่งคำใบ้ไม่สำเร็จ");
      }
    },
    [room, userId]
  );

  /**
   * Start a new round with fresh clue and target.
   */
  const nextRound = useCallback(
    async (newTarget: number, leftLabel: string, rightLabel: string) => {
      if (!room) return;
      const { error: updateError } = await supabase
        .from("rooms")
        .update({
          target_value: newTarget,
          left_label: leftLabel,
          right_label: rightLabel,
          guess_value: null,
          clue: null,
          psychic_id: null,
          status: "playing" as RoomStatus,
          current_turn: (room.current_turn || 0) + 1,
        })
        .eq("id", room.id);
      if (updateError) {
        setError("เริ่มรอบใหม่ไม่สำเร็จ");
      }
    },
    [room]
  );

  return {
    room,
    isLoading,
    error,
    otherPlayersAngles,
    broadcastDial,
    updateRoomStatus,
    submitGuess,
    submitClue,
    nextRound,
    joinAsGuest,
  };
}
