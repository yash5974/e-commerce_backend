import { AuthPayload } from "./auth.interface";
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}
