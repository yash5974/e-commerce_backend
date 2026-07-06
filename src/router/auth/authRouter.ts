import express from "express";
import {
  login,
  logout,
  refreshToken,
  register,
} from "../../controller/authController";
const router = express.Router();

router.post("/register", register);
router.post("/refresh-token", refreshToken);
router.post("/login", login);
router.post("/logout", logout);

export default router;
