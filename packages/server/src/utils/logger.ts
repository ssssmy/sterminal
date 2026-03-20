import pino from 'pino';
import { config } from '../config.js';

/**
 * 结构化日志工具 - 基于 pino
 */
export const logger = pino({
  level: config.isDev ? 'debug' : 'info',
  transport: config.isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    env: config.nodeEnv,
  },
});

export type Logger = typeof logger;
