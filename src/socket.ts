import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { MessageRecord, PresenterVideoRecord } from './db.js';

export interface AuthenticatedSocket extends Socket {
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface WaStatusPayload {
  status: 'disconnected' | 'connecting' | 'connected';
  message?: string;
  qrCode?: string;
}

export class SocketService {
  private io: SocketIOServer | null = null;
  private currentWaStatus: WaStatusPayload = {
    status: 'disconnected',
    message: 'Belum terhubung ke WhatsApp',
  };

  public init(server: HttpServer): SocketIOServer {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.io.use((socket, next) => {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(' ')[1] ||
        socket.handshake.query?.token;

      if (!token) {
        return next();
      }

      try {
        const decoded = jwt.verify(token as string, env.JWT_SECRET) as any;
        (socket as AuthenticatedSocket).user = decoded;
        next();
      } catch (err) {
        next();
      }
    });

    this.io.on('connection', (socket: AuthenticatedSocket) => {
      logger.info(`[SocketService] Authenticated client connected: ${socket.user?.email || 'Guest'} (${socket.id})`);

      socket.emit('wa_status_update', this.currentWaStatus);

      socket.on('disconnect', () => {
        logger.info(`[SocketService] Client disconnected: ${socket.id}`);
      });
    });

    logger.info('[SocketService] Guarded Socket.io server initialized');
    return this.io;
  }

  public updateWaStatus(status: 'disconnected' | 'connecting' | 'connected', message?: string, qrCode?: string): void {
    this.currentWaStatus = { status, message, qrCode };
    if (this.io) {
      this.io.emit('wa_status_update', this.currentWaStatus);
    }
  }

  public emitQrCode(qrCode: string): void {
    this.currentWaStatus = { status: 'connecting', message: 'Silakan pindai kode QR', qrCode };
    if (this.io) {
      this.io.emit('wa_status_update', this.currentWaStatus);
      this.io.emit('wa_qr_code', { qrCode });
      logger.info('[SocketService] Emitted QR Code via Socket.io');
    }
  }

  public emitNewMessage(message: MessageRecord): void {
    if (this.io) {
      this.io.emit('new_message', message);
      logger.info(`[SocketService] Emitted real-time new_message event for JID: ${message.jid}`);
    }
  }

  /**
   * Memancarkan event progress video presenter virtual real-time ke frontend.
   */
  public emitVideoProgress(video: PresenterVideoRecord): void {
    if (this.io) {
      this.io.emit('video_progress', video);
      logger.info(`[SocketService] Emitted video_progress: ID ${video.id}, Status: ${video.status}, Progress: ${video.progress}%`);
    }
  }
}

export const socketService = new SocketService();
