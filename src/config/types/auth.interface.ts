export type Role = "USER" | "ADMIN";

export type AuthPayload = {
  userId: string;
  role: Role;
  type: "ACCESS" | "REFRESH";
};

// 🔥 Extend Express Request (global typing recommended)
export interface AuthRequest extends Request {
  user?: AuthPayload;
}

export type RefreshPayload = {
  userId: string;
  tokenId: string;
  type: "ACCESS" | "REFRESH";
};
