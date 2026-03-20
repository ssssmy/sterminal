import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * Nodemailer 邮件传输实例
 */
const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.port === 465,
  auth: config.smtp.user
    ? { user: config.smtp.user, pass: config.smtp.pass }
    : undefined,
});

/**
 * 发送邮件的基础方法
 */
async function sendMail(options: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  if (!config.smtp.host) {
    logger.warn({ to: options.to, subject: options.subject }, '邮件服务未配置，跳过发送');
    return;
  }

  try {
    await transporter.sendMail({
      from: config.smtp.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    logger.info({ to: options.to, subject: options.subject }, '邮件发送成功');
  } catch (err) {
    logger.error({ err, to: options.to }, '邮件发送失败');
    throw err;
  }
}

/**
 * 发送邮箱验证邮件
 */
export async function sendVerifyEmail(to: string, username: string, token: string): Promise<void> {
  const verifyUrl = `${config.baseUrl}/api/v1/auth/verify-email?token=${token}`;

  await sendMail({
    to,
    subject: '验证您的 STerminal 账号邮箱',
    html: `
      <h2>欢迎使用 STerminal！</h2>
      <p>您好，${username}！</p>
      <p>请点击下方链接验证您的邮箱：</p>
      <p><a href="${verifyUrl}" style="color:#6366f1">验证邮箱</a></p>
      <p>链接有效期为 24 小时。</p>
      <p>如果您没有注册 STerminal，请忽略此邮件。</p>
    `,
    text: `验证您的 STerminal 账号邮箱\n\n请访问以下链接验证：${verifyUrl}\n\n链接有效期为 24 小时。`,
  });
}

/**
 * 发送密码重置邮件
 */
export async function sendPasswordResetEmail(to: string, username: string, token: string): Promise<void> {
  const resetUrl = `${config.baseUrl}/reset-password?token=${token}`;

  await sendMail({
    to,
    subject: '重置您的 STerminal 账号密码',
    html: `
      <h2>重置密码</h2>
      <p>您好，${username}！</p>
      <p>我们收到了您重置密码的请求，请点击下方链接：</p>
      <p><a href="${resetUrl}" style="color:#6366f1">重置密码</a></p>
      <p>链接有效期为 1 小时。</p>
      <p>如果您没有请求重置密码，请忽略此邮件，您的账号是安全的。</p>
    `,
    text: `重置您的 STerminal 账号密码\n\n请访问以下链接重置密码：${resetUrl}\n\n链接有效期为 1 小时。`,
  });
}
