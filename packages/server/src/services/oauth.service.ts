import passport from 'passport';
import {
  Strategy as GitHubStrategy,
  type Profile as GitHubProfile,
} from 'passport-github2';
import {
  Strategy as GoogleStrategy,
  type Profile as GoogleProfile,
} from 'passport-google-oauth20';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection.js';
import { signToken } from '../utils/jwt.js';
import { sha256 } from '../utils/hash.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import type { UserRecord } from './auth.service.js';

/**
 * OAuth 用户信息结构
 */
interface OAuthProfile {
  provider: string;
  id: string;
  username: string;
  email: string;
  avatarUrl?: string;
}

/**
 * 根据 OAuth 信息查找或创建用户
 */
async function findOrCreateOAuthUser(profile: OAuthProfile): Promise<{
  token: string;
  user: Omit<UserRecord, 'password_hash' | 'verify_token'>;
}> {
  // 查找现有 OAuth 绑定
  let user = db.prepare(
    'SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?'
  ).get(profile.provider, profile.id) as UserRecord | undefined;

  if (!user) {
    // 查找同邮箱的用户（绑定 OAuth）
    user = db.prepare('SELECT * FROM users WHERE email = ?').get(profile.email) as UserRecord | undefined;

    if (user) {
      // 绑定 OAuth 到已有账号
      db.prepare(`
        UPDATE users SET oauth_provider = ?, oauth_id = ?, avatar_url = COALESCE(avatar_url, ?), updated_at = datetime('now')
        WHERE id = ?
      `).run(profile.provider, profile.id, profile.avatarUrl ?? null, user.id);
    } else {
      // 创建新账号
      const userId = uuidv4();
      let username = profile.username.replace(/[^a-zA-Z0-9_-]/g, '_');

      // 确保用户名唯一
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (existing) {
        username = `${username}_${Date.now()}`;
      }

      db.prepare(`
        INSERT INTO users (id, username, email, password_hash, avatar_url, email_verified, oauth_provider, oauth_id)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        userId,
        username,
        profile.email,
        '',  // OAuth 用户无密码
        profile.avatarUrl ?? null,
        profile.provider,
        profile.id,
      );

      user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRecord;
      logger.info({ userId, provider: profile.provider }, 'OAuth 新用户创建成功');
    }
  }

  // 创建会话
  const sessionId = uuidv4();
  const jwtToken = signToken({ userId: user.id, sessionId, email: user.email });
  const tokenHash = sha256(jwtToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, device_name, remember, expires_at)
    VALUES (?, ?, ?, ?, 1, ?)
  `).run(sessionId, user.id, tokenHash, `${profile.provider} OAuth`, expiresAt);

  const { password_hash, verify_token, ...safeUser } = user;
  return { token: jwtToken, user: safeUser };
}

/**
 * 初始化 Passport OAuth 策略
 */
export function initOAuthStrategies(): void {
  // GitHub OAuth 策略
  if (config.github.clientId) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: config.github.clientId,
          clientSecret: config.github.clientSecret,
          callbackURL: config.github.callbackUrl,
          scope: ['user:email'],
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (_accessToken: string, _refreshToken: string, profile: GitHubProfile, done: any) => {
          try {
            const email =
              (profile.emails?.[0]?.value) ??
              `${profile.username}@github.local`;

            const result = await findOrCreateOAuthUser({
              provider: 'github',
              id: profile.id,
              username: profile.username ?? `github_${profile.id}`,
              email,
              avatarUrl: profile.photos?.[0]?.value,
            });
            done(null, result);
          } catch (err) {
            done(err as Error);
          }
        },
      ),
    );
    logger.info('GitHub OAuth 策略已注册');
  }

  // Google OAuth 策略
  if (config.google.clientId) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: config.google.clientId,
          clientSecret: config.google.clientSecret,
          callbackURL: config.google.callbackUrl,
        },
        // done 参数 passport 各 strategy 的具体签名差异较大，
        // 用 unknown 函数签名最稳，能同时满足 GitHubStrategy / GoogleStrategy 的 overload。
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (_accessToken: string, _refreshToken: string, profile: GoogleProfile, done: any) => {
          try {
            const email = profile.emails?.[0]?.value;
            if (!email) {
              done(new Error('无法获取 Google 邮箱'));
              return;
            }

            const result = await findOrCreateOAuthUser({
              provider: 'google',
              id: profile.id,
              username: profile.displayName.replace(/\s+/g, '_') || `google_${profile.id}`,
              email,
              avatarUrl: profile.photos?.[0]?.value,
            });
            done(null, result);
          } catch (err) {
            done(err as Error);
          }
        },
      ),
    );
    logger.info('Google OAuth 策略已注册');
  }
}
