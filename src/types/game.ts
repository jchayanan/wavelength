export type RoomStatus = "waiting" | "playing" | "revealed";

export interface Room {
  id: string;
  code: string;
  status: RoomStatus;
  target_value: number;
  left_label: string;
  right_label: string;
  current_turn: number;
  host_id: string;
  created_at: string;
  guess_value: number | null;
  clue: string | null;
  psychic_id: string | null;
  max_rounds: number;
  host_score: number;
  guest_score: number;
  host_nickname: string | null;
  guest_nickname: string | null;
}


export interface Player {
  userId: string;
  nickname: string;
}

export interface DialBroadcast {
  userId: string;
  angle: number;
}

export interface GameState {
  room: Room | null;
  isLoading: boolean;
  error: string | null;
  otherPlayerAngle: number | null;
}
