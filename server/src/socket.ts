import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { AuthMiddleware, AuthenticatedSocket } from './middleware/authMiddleware.js';
import { logger } from './utils/logger.js';

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

    // Pasang Security Middleware JWT Autentikasi untuk Socket.io
    this.io.use((socket, next) => {
      AuthMiddleware.verifySocketToken(socket as AuthenticatedSocket, next);
    });

    this.io.on('connection', (socket: AuthenticatedSocket) => {
      logger.info(`[SocketService] Authenticated client connected: ${socket.user?.email} (${socket.id})`);

      // Broadcast status WA saat ini ke user
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
}

export const socketService = new SocketService();
