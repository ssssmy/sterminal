import type WebSocket from 'ws';
import { verifyToken } from '../utils/jwt.js';
import { logger } from '../utils/logger.js';

/**
 * WebSocket 消息类型
 */
export type WsMessageType =
  | 'auth'           // 认证
  | 'sync_notify'    // 通知客户端有新数据
  | 'ping'           // 心跳
  | 'pong'           // 心跳响应
  | 'error';         // 错误

export interface WsMessage {
  type: WsMessageType;
  data?: unknown;
}

/**
 * 已认证的 WebSocket 连接信息
 */
export interface AuthenticatedWsClient {
  ws: WebSocket;
  userId: string;
  deviceId: string;
}

/**
 * 处理 WebSocket 同步消息
 */
export function handleSyncMessage(
  client: AuthenticatedWsClient,
  message: WsMessage,
  allClients: Map<string, Set<AuthenticatedWsClient>>,
): void {
  switch (message.type) {
    case 'ping':
      sendMessage(client.ws, { type: 'pong' });
      break;

    default:
      logger.warn({ type: message.type, userId: client.userId }, '未知的 WebSocket 消息类型');
      sendMessage(client.ws, {
        type: 'error',
        data: { message: `未知消息类型: ${message.type}` },
      });
  }
}

/**
 * 向指定用户的所有连接设备推送同步通知
 * 当有新数据推送时，通知其他设备拉取
 */
export function notifyUserDevices(
  userId: string,
  excludeDeviceId: string,
  allClients: Map<string, Set<AuthenticatedWsClient>>,
): void {
  const userClients = allClients.get(userId);
  if (!userClients) return;

  for (const client of userClients) {
    if (client.deviceId === excludeDeviceId) continue;
    sendMessage(client.ws, {
      type: 'sync_notify',
      data: { message: '有新的同步数据，请拉取' },
    });
  }
}

/**
 * 发送 WebSocket 消息（安全包装）
 */
export function sendMessage(ws: WebSocket, message: WsMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * 解析并验证 WebSocket 认证消息中的 Token
 */
export function authenticateWsClient(token: string): { userId: string; sessionId: string } | null {
  try {
    const payload = verifyToken(token);
    return { userId: payload.userId, sessionId: payload.sessionId };
  } catch {
    return null;
  }
}
