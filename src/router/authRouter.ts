import express from "express";
import {
  adminRegister,
  forgotPassword,
  getCurrentUser,
  login,
  logout,
  newPassword,
  refreshToken,
  register,
  resetPassword,
  updateProfile,
} from "../controller/authController.js";
import { authMiddleware } from "../middleware/middleware.js";
const router = express.Router();

router.post("/admin/register", adminRegister);
router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refreshToken);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/new-password", newPassword);
router.post("/logout", authMiddleware("USER", "ADMIN"), logout);
router.get("/me", authMiddleware("USER", "ADMIN"), getCurrentUser);
router.patch("/update/profile", authMiddleware("USER", "ADMIN"), updateProfile);

export default router;
