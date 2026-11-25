import { Router } from "express";
import { authMiddleware } from "../middleware/middleware.js";
import { sendTestEmail } from "../controller/email.controller.js";

const emailRouter = Router();

emailRouter.post("/test", authMiddleware("ADMIN"), sendTestEmail);

export default emailRouter;
