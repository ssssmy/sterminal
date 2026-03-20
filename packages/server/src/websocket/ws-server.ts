import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import {
  authenticateWsClient,
  handleSyncMessage,
  sendMessage,
  type AuthenticatedWsClient,
  type WsMessage,
} from './sync-handler.js';
import { logger } from '../utils/logger.js';

/**
 * 所有已认证的 WebSocket 连接
 * Map<userId, Set<AuthenticatedWsClient>>
 */
const clients = new Map<string, Set<AuthenticatedWsClient>>();

/**
 * 初始化 WebSocket 服务器
 * 挂载到已有的 HTTP Server 上
 */
export function createWsServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    logger.debug({ ip: req.socket.remoteAddress }, 'WebSocket 新连接');

    let client: AuthenticatedWsClient | null = null;

    // 设置认证超时（10秒内未认证则断开）
    const authTimeout = setTimeout(() => {
      if (!client) {
        sendMessage(ws, { type: 'error', data: { message: '认证超时' } });
        ws.close(1008, '认证超时');
      }
    }, 10_000);

    ws.on('message', (rawData) => {
      let message: WsMessage;

      try {
        message = JSON.parse(rawData.toString()) as WsMessage;
      } catch {
        sendMessage(ws, { type: 'error', data: { message: '消息格式错误，需要 JSON' } });
        return;
      }

      // 首条消息必须是认证
      if (!client) {
        if (message.type !== 'auth') {
          sendMessage(ws, { type: 'error', data: { message: '请先发送认证消息' } });
          return;
        }

        const authData = message.data as { token?: string; deviceId?: string } | undefined;
        if (!authData?.token || !authData?.deviceId) {
          sendMessage(ws, { type: 'error', data: { message: '认证消息缺少 token 或 deviceId' } });
          ws.close(1008, '认证参数不完整');
          return;
        }

        const authResult = authenticateWsClient(authData.token);
        if (!authResult) {
          sendMessage(ws, { type: 'error', data: { message: 'Token 无效或已过期' } });
          ws.close(1008, '认证失败');
          return;
        }

        clearTimeout(authTimeout);

        client = {
          ws,
          userId: authResult.userId,
          deviceId: authData.deviceId,
        };

        // 注册到全局连接池
        if (!clients.has(client.userId)) {
          clients.set(client.userId, new Set());
        }
        clients.get(client.userId)!.add(client);

        sendMessage(ws, { type: 'pong', data: { message: '认证成功' } });
        logger.info({ userId: client.userId, deviceId: client.deviceId }, 'WebSocket 认证成功');
        return;
      }

      // 处理已认证客户端的消息
      handleSyncMessage(client, message, clients);
    });

    ws.on('close', () => {
      if (client) {
        const userClients = clients.get(client.userId);
        if (userClients) {
          userClients.delete(client);
          if (userClients.size === 0) {
            clients.delete(client.userId);
          }
        }
        logger.debug({ userId: client.userId, deviceId: client.deviceId }, 'WebSocket 连接关闭');
      }
    });

    ws.on('error', (err) => {
      logger.error({ err }, 'WebSocket 连接错误');
    });
  });

  logger.info('WebSocket 服务器已启动，路径: /ws');

  return wss;
}

/**
 * 获取当前连接池（供同步通知使用）
 */
export function getClients(): Map<string, Set<AuthenticatedWsClient>> {
  return clients;
}
