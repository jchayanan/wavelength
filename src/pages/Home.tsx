import { useState, useTransition, useCallback, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getIdentity, updateNickname } from "../lib/identity";
import { getRandomClue } from "../data/thaiClues";

function generateRoomCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export default function Home() {
  const navigate = useNavigate();
  const [identity, setIdentity] = useState(() => getIdentity());
  const [joinCode, setJoinCode] = useState("");
  const [roundsPerPlayer, setRoundsPerPlayer] = useState(5);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Nickname editing state
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState(identity.nickname);

  const handleSaveNickname = useCallback(() => {
    const trimmed = nicknameInput.trim();
    if (!trimmed) return;
    const updated = updateNickname(trimmed);
    setIdentity(updated);
    setIsEditingNickname(false);
  }, [nicknameInput]);

  const handleNicknameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSaveNickname();
    if (e.key === "Escape") {
      setNicknameInput(identity.nickname);
      setIsEditingNickname(false);
    }
  }, [handleSaveNickname, identity.nickname]);

  const handleCreateRoom = () => {
    startTransition(async () => {
      setError(null);
      const code = generateRoomCode();
      const clue = getRandomClue();
      const targetValue = Math.floor(Math.random() * 101);

      const { error: insertError } = await supabase.from("rooms").insert({
        code,
        status: "waiting",
        target_value: targetValue,
        left_label: clue.left,
        right_label: clue.right,
        current_turn: 1,
        host_id: identity.userId,
        guess_value: null,
        clue: null,
        psychic_id: null,
        max_rounds: roundsPerPlayer,
        host_score: 0,
        guest_score: 0,
        host_nickname: identity.nickname,
        guest_nickname: null,
      });

      if (insertError) {
        setError("สร้างห้องไม่สำเร็จ ลองใหม่อีกครั้ง");
        return;
      }
      navigate(`/room/${code}`);
    });
  };

  const handleJoinRoom = (e: FormEvent) => {
    e.preventDefault();
    if (joinCode.length !== 4) {
      setError("กรุณากรอกรหัสห้อง 4 หลัก");
      return;
    }
    setError(null);
    navigate(`/room/${joinCode}`);
  };

  return (
    <div className="bg-mesh min-h-dvh flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm flex flex-col gap-6">

        {/* Logo & Title */}
        <div className="text-center animate-fade-in-up">
          <div className="mb-4">
            <svg width="72" height="72" viewBox="0 0 64 64" className="mx-auto drop-shadow-lg">
              <defs>
                <linearGradient id="logoG" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#a855f7"/>
                  <stop offset="100%" stopColor="#06b6d4"/>
                </linearGradient>
              </defs>
              <circle cx="32" cy="32" r="30" fill="#1a1230" stroke="#2e2250" strokeWidth="1"/>
              <path d="M8 32 Q16 16, 24 32 Q32 48, 40 32 Q48 16, 56 32" stroke="url(#logoG)" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="text-4xl font-extrabold font-[var(--font-display)] gradient-text mb-1">
            Wavelength
          </h1>
          <p className="text-text-secondary text-sm">เกมทายใจ — คุณอยู่คลื่นเดียวกันไหม?</p>
        </div>

        {/* Nickname Card */}
        <div className="glass-card p-4 animate-fade-in-up">
          <p className="text-xs text-text-muted mb-2 uppercase tracking-wider">ชื่อของคุณ</p>
          {isEditingNickname ? (
            <div className="flex gap-2">
              <input
                id="nickname-input"
                type="text"
                value={nicknameInput}
                onChange={e => setNicknameInput(e.target.value)}
                onKeyDown={handleNicknameKeyDown}
                className="input-glass flex-1"
                maxLength={20}
                autoFocus
              />
              <button
                id="save-nickname-button"
                className="btn-glow px-4"
                onClick={handleSaveNickname}
                disabled={!nicknameInput.trim()}
              >
                ✓
              </button>
              <button
                id="cancel-nickname-button"
                className="btn-secondary px-3"
                onClick={() => {
                  setNicknameInput(identity.nickname);
                  setIsEditingNickname(false);
                }}
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold text-text-primary">{identity.nickname}</span>
              <button
                id="edit-nickname-button"
                className="text-xs text-accent-purple hover:text-accent-cyan transition-colors px-2 py-1 rounded-md hover:bg-accent-purple/10"
                onClick={() => {
                  setNicknameInput(identity.nickname);
                  setIsEditingNickname(true);
                }}
              >
                ✏️ แก้ไข
              </button>
            </div>
          )}
        </div>

        {/* Create Room */}
        <div className="glass-card p-5 flex flex-col gap-4 animate-fade-in-up animate-delay-100">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-text-secondary font-medium text-center">จำนวนรอบ</label>
            <div className="flex gap-2">
              {[3, 5, 10].map(n => (
                <button
                  key={n}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${roundsPerPlayer === n ? "bg-accent-purple text-white" : "bg-white/5 text-text-secondary hover:bg-white/10"}`}
                  onClick={() => setRoundsPerPlayer(n)}
                >
                  {n} รอบ
                </button>
              ))}
            </div>
          </div>
          <button
            id="create-room-button"
            className="btn-glow w-full text-lg py-4 mt-2"
            onClick={handleCreateRoom}
            disabled={isPending}
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                กำลังสร้าง...
              </span>
            ) : (
              "🎮 สร้างห้องใหม่"
            )}
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 animate-fade-in-up animate-delay-200">
          <div className="flex-1 h-px bg-border-subtle" />
          <span className="text-text-muted text-xs">หรือ</span>
          <div className="flex-1 h-px bg-border-subtle" />
        </div>

        {/* Join Room */}
        <form onSubmit={handleJoinRoom} className="animate-fade-in-up animate-delay-300">
          <div className="glass-card p-5 flex flex-col gap-4">
            <label htmlFor="room-code-input" className="text-sm text-text-secondary font-medium">
              เข้าร่วมห้อง
            </label>
            <input
              id="room-code-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              placeholder="0000"
              value={joinCode}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                setJoinCode(v);
                setError(null);
              }}
              className="input-glass"
              autoComplete="off"
            />
            <button
              id="join-room-button"
              type="submit"
              className="btn-secondary w-full"
              disabled={joinCode.length !== 4}
            >
              🚪 เข้าร่วม
            </button>
          </div>
        </form>

        {/* Error */}
        {error && (
          <div className="text-center text-danger text-sm animate-fade-in-up">
            {error}
          </div>
        )}

      </div>
    </div>
  );
}
