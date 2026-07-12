export type Role = "USER" | "ADMIN";

export type AuthPayload = {
  userId: string;
  role: Role;
};

// 🔥 Extend Express Request (global typing recommended)
export interface AuthRequest extends Request {
  user?: AuthPayload;
}

export type RefreshPayload = {
  userId: string;
  tokenId: string;
};
