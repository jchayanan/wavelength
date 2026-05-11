import {
  useState,
  useTransition,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGameRoom } from "../hooks/useGameRoom";
import { getIdentity } from "../lib/identity";
import { getRandomClue } from "../data/thaiClues";
import Dial from "../components/Dial";
import { supabase } from "../lib/supabase";

export default function GameRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const identity = useMemo(() => getIdentity(), []);
  const {
    room,
    isLoading,
    error,
    otherPlayersAngles,
    broadcastDial,
    submitGuess,
    submitClue,
    nextRound,
    joinAsGuest,
  } = useGameRoom(roomId, identity.userId);

  const [dialAngle, setDialAngle] = useState(90);
  const [isPending, startTransition] = useTransition();
  const [clueInput, setClueInput] = useState("");

  // Auto-join guest if needed
  useEffect(() => {
    if (
      room &&
      room.status === "waiting" &&
      room.host_id !== identity.userId &&
      room.guest_nickname === null
    ) {
      joinAsGuest(identity.nickname);
    }
  }, [room, identity, joinAsGuest]);

  // ── Role assignment ──────────────────────────────────────────────────
  // When the round starts (clue=null), assign Psychic automatically:
  // - Turn 1 → host is Psychic; Turn 2 → non-host; alternating.
  // We determine this locally based on current_turn parity and host_id.
  // The actual psychic_id gets written to DB when Psychic submits clue.
  const isHost = useMemo(
    () => room?.host_id === identity.userId,
    [room, identity],
  );

  const isMyTurnToBePsychic = useMemo(() => {
    if (!room) return false;
    const turn = room.current_turn ?? 1;
    // Odd turns → host is psychic; even turns → guest is psychic
    return turn % 2 === 1 ? isHost : !isHost;
  }, [room, isHost]);

  const isRevealed = room?.status === "revealed";
  const isPlaying = room?.status === "playing";

  // Who is currently the psychic?
  const isPsychic = useMemo(() => {
    if (!room) return false;
    // If clue already submitted, use the DB psychic_id
    if (room.clue !== null) return room.psychic_id === identity.userId;
    // Otherwise, use parity rule
    return isMyTurnToBePsychic;
  }, [room, identity, isMyTurnToBePsychic]);

  // Check game over
  const totalTurns = (room?.max_rounds || 5) * 2;
  const isGameOver = room ? room.current_turn > totalTurns : false;

  const hasClue =
    room?.clue !== null && room?.clue !== undefined && room?.clue !== "";
  const canGuess = isPlaying && hasClue && !isPsychic && !isGameOver;
  const isWaitingForClue = isPlaying && !hasClue && isPsychic && !isGameOver;
  const isWaitingAsGuesser = isPlaying && !hasClue && !isPsychic && !isGameOver;

  // Show target to psychic always; show scoring zones on reveal
  const shouldShowTarget = isRevealed || (isPsychic && isPlaying) || isGameOver;
  const isDialDisabled = !canGuess || isGameOver; // only guessers can move during playing

  // ── Dial sync: if I'm the Guesser, mirror the Psychic's ghost angle ──
  // The guesser's own needle = their guess; ghost = psychic's position.
  // Actually we want the GUESSER to control their own needle → no change needed there.
  // But we DO want the Guesser to SEE the Psychic moving the dial (for feedback).
  // The ghost needles already handle this via otherPlayersAngles.

  const handleDialChange = useCallback(
    (angle: number) => {
      setDialAngle(angle);
      broadcastDial(angle);
    },
    [broadcastDial],
  );

  const handleSubmitClue = useCallback(() => {
    if (!clueInput.trim()) return;
    startTransition(async () => {
      await submitClue(clueInput.trim());
      setClueInput("");
    });
  }, [clueInput, submitClue]);

  const handleSubmit = useCallback(() => {
    const guessPercent = Math.round((dialAngle / 180) * 100);
    startTransition(async () => {
      await submitGuess(guessPercent);
    });
  }, [submitGuess, dialAngle]);

  const handleNextRound = useCallback(() => {
    if (!room) return;
    startTransition(async () => {
      const clue = getRandomClue();
      await nextRound(Math.floor(Math.random() * 101), clue.left, clue.right);
      if (room.current_turn + 1 <= totalTurns) {
        setDialAngle(90);
      }
    });
  }, [nextRound, room, totalTurns]);

  const handleStartGame = useCallback(() => {
    if (!room) return;
    startTransition(async () => {
      await supabase
        .from("rooms")
        .update({ status: "playing" })
        .eq("id", room.id);
    });
  }, [room]);

  const score = useMemo(() => {
    if (!room || room.status !== "revealed" || room.guess_value === null)
      return null;
    const diff = Math.abs(room.guess_value - room.target_value);
    if (diff <= 2) return { points: 4, label: "🎯 สุดยอด!", color: "#22c55e" };
    if (diff <= 6) return { points: 3, label: "👏 เก่งมาก!", color: "#06b6d4" };
    if (diff <= 10) return { points: 2, label: "👍 ไม่เลว!", color: "#f59e0b" };
    return { points: 0, label: "😅 พลาดไป", color: "#ef4444" };
  }, [room]);

  if (isLoading) {
    return (
      <div className="bg-mesh min-h-dvh flex items-center justify-center">
        <div className="text-center animate-fade-in-up">
          <div className="w-12 h-12 border-3 border-accent-purple border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-text-secondary">กำลังเข้าห้อง...</p>
        </div>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="bg-mesh min-h-dvh flex items-center justify-center p-6">
        <div className="glass-card p-8 text-center max-w-sm w-full animate-fade-in-up">
          <div className="text-4xl mb-4">😕</div>
          <h2 className="text-xl font-bold mb-2">เกิดข้อผิดพลาด</h2>
          <p className="text-text-secondary mb-6">{error || "ไม่พบห้องนี้"}</p>
          <button className="btn-glow w-full" onClick={() => navigate("/")}>
            กลับหน้าหลัก
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-mesh min-h-dvh flex flex-col">
      {/* Header */}
      <header className="px-4 pt-4 pb-2 flex items-center justify-between animate-fade-in-up">
        <button
          onClick={() => navigate("/")}
          className="text-text-muted hover:text-text-primary transition-colors p-2 -ml-2"
          id="back-button"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Scoreboard */}
        <div className="flex-1 flex justify-center px-4">
          <div className="flex items-center gap-2 bg-white/5 rounded-full px-4 py-1.5 border border-white/10 shadow-lg">
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-text-muted uppercase tracking-wider max-w-[80px] truncate">
                {room.host_nickname || "Host"}
              </span>
              <span className="text-sm font-bold text-accent-purple">
                {room.host_score || 0}
              </span>
            </div>
            <div className="w-px h-6 bg-border-subtle mx-1" />
            <div className="flex flex-col items-start">
              <span className="text-[10px] text-text-muted uppercase tracking-wider max-w-[80px] truncate">
                {room.guest_nickname || "Guest"}
              </span>
              <span className="text-sm font-bold text-accent-cyan">
                {room.guest_score || 0}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div
            className={`status-chip ${isGameOver ? "finished" : room.status}`}
          >
            <span
              className={`player-dot ${isGameOver ? "bg-red-500" : room.status === "waiting" ? "bg-accent-amber" : room.status === "playing" ? "bg-success" : "bg-accent-purple"}`}
            />
            {isGameOver
              ? "จบเกม"
              : room.status === "waiting"
                ? "รอผู้เล่น"
                : room.status === "playing"
                  ? "กำลังเล่น"
                  : "เฉลยแล้ว"}
          </div>
        </div>
      </header>

      {/* Spectrum + Clue card */}
      <div className="px-4 py-3 animate-fade-in-up animate-delay-100">
        <div className="glass-card p-4">
          {!isGameOver ? (
            <div className="text-center mb-2 flex items-center justify-center gap-3">
              <span className="text-xs text-text-muted uppercase tracking-wider">
                รอบที่ {Math.min(room.current_turn || 1, totalTurns)} /{" "}
                {totalTurns}
              </span>
              {isPlaying && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isPsychic ? "bg-accent-purple/20 text-accent-purple" : "bg-accent-cyan/20 text-accent-cyan"}`}
                >
                  {isPsychic ? "🧠 คุณให้คำใบ้" : "🎯 คุณทาย"}
                </span>
              )}
            </div>
          ) : (
            <div className="text-center mb-2">
              <span className="text-sm font-bold text-success uppercase tracking-wider">
                🎉 จบเกมแล้ว! 🎉
              </span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 text-left">
              <span className="inline-block bg-accent-purple/15 text-accent-purple px-3 py-1.5 rounded-lg text-sm font-semibold">
                ◀ {room.left_label}
              </span>
            </div>
            <div className="w-px h-8 bg-border-subtle" />
            <div className="flex-1 text-right">
              <span className="inline-block bg-accent-cyan/15 text-accent-cyan px-3 py-1.5 rounded-lg text-sm font-semibold">
                {room.right_label} ▶
              </span>
            </div>
          </div>

          {hasClue && (
            <div className="mt-4 pt-3 border-t border-border-subtle text-center">
              <span className="text-xs text-text-muted uppercase tracking-wider block mb-1">
                คำใบ้
              </span>
              <div className="text-2xl font-bold text-accent-amber">
                "{room.clue}"
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dial */}
      <div className="flex-1 flex items-center justify-center px-4 animate-fade-in-up animate-delay-200">
        <Dial
          value={dialAngle}
          onChange={handleDialChange}
          otherAngles={
            isPsychic
              ? Object.keys(otherPlayersAngles).length > 0
                ? otherPlayersAngles
                : { default: 90 }
              : {}
          }
          disabled={isDialDisabled}
          targetValue={room.target_value}
          showTarget={shouldShowTarget}
          showNeedle={!isPsychic}
        />
      </div>

      {/* Score and Game Over */}
      {isGameOver ? (
        <div className="px-4 pb-2 animate-slide-up">
          <div className="glass-card p-6 text-center">
            <h2 className="text-2xl font-bold mb-4 gradient-text">
              สรุปผลคะแนน
            </h2>
            <div className="flex justify-center items-center gap-8 mb-6">
              <div className="flex flex-col">
                <span className="text-sm text-text-secondary">
                  {room.host_nickname || "Host"}
                </span>
                <span className="text-4xl font-extrabold text-accent-purple">
                  {room.host_score}
                </span>
              </div>
              <div className="text-xl text-text-muted">VS</div>
              <div className="flex flex-col">
                <span className="text-sm text-text-secondary">
                  {room.guest_nickname || "Guest"}
                </span>
                <span className="text-4xl font-extrabold text-accent-cyan">
                  {room.guest_score}
                </span>
              </div>
            </div>
            {room.host_score === room.guest_score ? (
              <div className="text-xl text-accent-amber font-bold">
                🤝 เสมอกัน!
              </div>
            ) : (
              <div className="text-xl text-success font-bold">
                🏆{" "}
                {room.host_score > room.guest_score
                  ? room.host_nickname
                  : room.guest_nickname}{" "}
                ชนะ!
              </div>
            )}
            {isHost && (
              <button
                id="restart-game-button"
                className="btn-glow w-full mt-6"
                onClick={() => navigate("/")}
              >
                กลับหน้าหลักเพื่อสร้างห้องใหม่
              </button>
            )}
          </div>
        </div>
      ) : (
        isRevealed &&
        score && (
          <div className="px-4 pb-2 animate-slide-up">
            <div className="glass-card p-4 text-center">
              <div className="text-3xl mb-1">{score.label}</div>
              <div className="mt-2">
                <span className="score-badge" style={{ color: score.color }}>
                  +{score.points} คะแนน
                </span>
              </div>
            </div>
          </div>
        )
      )}

      {/* Controls */}
      {!isGameOver && (
        <div className="px-4 pb-6 pt-2 animate-fade-in-up animate-delay-300">
          {/* Psychic: input clue */}
          {isWaitingForClue && (
            <div className="glass-card p-4 mb-4 border border-accent-purple">
              <h3 className="text-lg font-bold text-accent-purple mb-1 text-center">
                คุณคือคนให้คำใบ้ 🧠
              </h3>
              <p className="text-sm text-text-secondary mb-4 text-center">
                เป้าหมายอยู่ที่:{" "}
                <span className="text-xl font-bold text-success">
                  {room.target_value}%
                </span>
              </p>
              <input
                type="text"
                placeholder="พิมพ์คำใบ้ของคุณ..."
                value={clueInput}
                onChange={(e) => setClueInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmitClue();
                }}
                className="input-glass w-full mb-3"
                autoFocus
              />
              <button
                id="submit-clue-button"
                className="btn-glow w-full"
                onClick={handleSubmitClue}
                disabled={isPending || !clueInput.trim()}
              >
                {isPending ? "กำลังส่ง..." : "ส่งคำใบ้ ✓"}
              </button>
              <button
                id="skip-clue-button"
                className="btn-secondary w-full mt-3"
                onClick={() => {
                  startTransition(async () => {
                    await submitClue("(พูดให้ฟังแล้ว)");
                    setClueInput("");
                  });
                }}
                disabled={isPending}
              >
                ข้าม
              </button>
            </div>
          )}

          {/* Guesser: waiting for clue */}
          {isWaitingAsGuesser && (
            <div className="text-center py-4">
              <div className="w-8 h-8 border-2 border-accent-amber border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-text-secondary text-sm">รอคนให้คำใบ้...</p>
            </div>
          )}

          {/* Psychic: waiting for guess */}
          {isPlaying && isPsychic && hasClue && (
            <div className="text-center py-4">
              <p className="text-text-secondary text-sm">รอให้เพื่อนทาย...</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {/* Guesser confirms */}
            {canGuess && (
              <button
                id="submit-guess-button"
                className="btn-glow w-full text-lg py-4 pulse-glow"
                onClick={handleSubmit}
                disabled={isPending}
              >
                {isPending ? "กำลังส่ง..." : "🎯 ยืนยันคำทาย"}
              </button>
            )}

            {/* Waiting room */}
            {room.status === "waiting" && isHost && (
              <button
                id="start-game-button"
                className="btn-glow w-full text-lg py-4 pulse-glow"
                onClick={handleStartGame}
                disabled={isPending}
              >
                {isPending ? "กำลังเริ่ม..." : "🚀 เริ่มเกม"}
              </button>
            )}
            {room.status === "waiting" && !isHost && (
              <div className="text-center py-4">
                <div className="w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-text-secondary text-sm">
                  รอเจ้าของห้องเริ่มเกม...
                </p>
              </div>
            )}

            {/* Next round */}
            {isRevealed && isHost && (
              <button
                id="next-round-button"
                className="btn-glow w-full text-lg py-4"
                onClick={handleNextRound}
                disabled={isPending}
              >
                {isPending ? "กำลังเตรียม..." : "🔄 รอบถัดไป"}
              </button>
            )}
            {isRevealed && !isHost && (
              <div className="text-center py-3">
                <p className="text-text-secondary text-sm">
                  รอเจ้าของห้องเริ่มรอบถัดไป...
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 pb-6 text-center">
        <span className="text-xs text-text-muted">
          เล่นในชื่อ:{" "}
          <span className="text-text-secondary">{identity.nickname}</span>
        </span>
      </div>
    </div>
  );
}
