export type ChallengeColorPref = "white" | "black" | "random";

export type ChallengeStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "expired";

export type Challenge = {
  id: string;
  fromUserId: string;
  toUserId: string;
  fromUsername: string;
  toUsername: string;
  timeControl: string;
  initialMs: number;
  incrementMs: number;
  colorPref: ChallengeColorPref;
  status: ChallengeStatus;
  createdAt: number;
  expiresAt: number;
  gameId: string | null;
};

export type NotificationKind =
  | "challenge_received"
  | "challenge_accepted"
  | "challenge_declined"
  | "challenge_cancelled"
  | "new_follower";

type ChallengePayload = {
  challengeId: string;
  fromUsername: string;
  toUsername: string;
  timeControl: string;
  gameId?: string | null;
};

type FollowerPayload = {
  fromUsername: string;
};

export type NotificationPayloadByKind = {
  challenge_received: ChallengePayload;
  challenge_accepted: ChallengePayload;
  challenge_declined: ChallengePayload;
  challenge_cancelled: ChallengePayload;
  new_follower: FollowerPayload;
};

export type Notification<K extends NotificationKind = NotificationKind> = {
  id: string;
  kind: K;
  payload: NotificationPayloadByKind[K];
  readAt: number | null;
  createdAt: number;
};

/** Default challenge expiry — 10 minutes. The receiver has this long to act. */
export const CHALLENGE_TTL_MS = 10 * 60_000;
