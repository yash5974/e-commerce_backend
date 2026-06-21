import { AuthPayload } from "./auth.interface";

// urlencoded: {
//   extended: boolean;
// }

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}
