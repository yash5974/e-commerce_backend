import express from "express";
import {
  getCurrentUser,
  login,
  logout,
  refreshToken,
  register,
} from "../controller/authController.js";
import { authMiddleware } from "../middleware/middleware.js";
const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refreshToken);
router.post("/logout", authMiddleware("USER", "ADMIN"), logout);
router.get("/me", authMiddleware("USER", "ADMIN"), getCurrentUser);

export default router;
