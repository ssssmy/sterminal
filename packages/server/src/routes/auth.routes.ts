import { Router } from 'express';
import passport from 'passport';
import * as authController from '../controllers/auth.controller.js';
import { authLimiter } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  RegisterSchema,
  LoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  VerifyEmailSchema,
} from '../validators/auth.schema.js';

const router = Router();

// 注册
router.post('/register', authLimiter, validate(RegisterSchema), authController.register);

// 登录
router.post('/login', authLimiter, validate(LoginSchema), authController.login);

// 退出登录（需要认证）
router.post('/logout', authMiddleware, authController.logout);

// 验证邮箱
router.get('/verify-email', validate(VerifyEmailSchema, 'query'), authController.verifyEmail);

// 请求密码重置
router.post('/forgot-password', authLimiter, validate(ForgotPasswordSchema), authController.forgotPassword);

// 重置密码
router.post('/reset-password', authLimiter, validate(ResetPasswordSchema), authController.resetPassword);

// GitHub OAuth
router.get(
  '/github',
  passport.authenticate('github', { scope: ['user:email'], session: false }),
);

router.get(
  '/github/callback',
  passport.authenticate('github', { failureRedirect: '/login', session: false }),
  authController.oauthCallback,
);

// Google OAuth
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false }),
);

router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/login', session: false }),
  authController.oauthCallback,
);

export default router;
