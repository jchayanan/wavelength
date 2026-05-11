/**
 * Identity is stored entirely in sessionStorage so each browser tab
 * is a fully independent player (unique userId + nickname).
 */

const SESSION_KEY = "wavelength_identity";

export interface Identity {
  userId: string;
  nickname: string;
}

const THAI_ADJECTIVES = [
  "เก่ง", "น่ารัก", "เท่", "สุดเจ๋ง", "ลึกลับ", "ร่าเริง",
  "ขยัน", "ฉลาด", "กล้าหาญ", "มีเสน่ห์", "สดใส", "ปัง",
];

const THAI_NOUNS = [
  "มังกร", "ยูนิคอร์น", "นินจา", "แมว", "หมาป่า", "นกฟีนิกซ์",
  "สิงโต", "กระต่าย", "หมีขาว", "เหยี่ยว", "ปลาโลมา", "เสือ",
];

function generateNickname(): string {
  const adj = THAI_ADJECTIVES[Math.floor(Math.random() * THAI_ADJECTIVES.length)];
  const noun = THAI_NOUNS[Math.floor(Math.random() * THAI_NOUNS.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}${noun}${num}`;
}

function generateUserId(): string {
  return crypto.randomUUID();
}

/**
 * Get or create the user's identity from sessionStorage.
 * Each tab gets its own userId and nickname (fully independent).
 */
export function getIdentity(): Identity {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Identity;
      if (parsed.userId && parsed.nickname) return parsed;
    }
  } catch {
    // corrupted storage, regenerate
  }

  const identity: Identity = {
    userId: generateUserId(),
    nickname: generateNickname(),
  };

  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
  } catch {}
  return identity;
}

/**
 * Update nickname and persist in sessionStorage.
 */
export function updateNickname(newNickname: string): Identity {
  const identity = getIdentity();
  identity.nickname = newNickname;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
  } catch {}
  return identity;
}
