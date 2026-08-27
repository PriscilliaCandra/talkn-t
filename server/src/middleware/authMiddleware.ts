import { Request, Response, NextFunction } from 'express';
import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

export interface AuthenticatedSocket extends Socket {
  user?: AuthenticatedUser;
}

export class AuthMiddleware {
  /**
   * Middleware Express REST API untuk verifikasi JWT Bearer token.
   */
  public static verifyRestToken(req: AuthRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Akses tidak diizinkan. Token autentikasi tidak ditemukan.',
      });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as AuthenticatedUser;
      req.user = decoded;
      next();
    } catch (error) {
      logger.warn(`[AuthMiddleware] REST JWT Token verification failed: ${error}`);
      return res.status(401).json({
        error: 'Token autentikasi tidak valid atau telah kadaluwarsa.',
      });
    }
  }

  /**
   * Middleware Socket.io untuk verifikasi JWT handshake token.
   */
  public static verifySocketToken(socket: AuthenticatedSocket, next: (err?: Error) => void) {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.split(' ')[1] ||
      socket.handshake.query?.token;

    if (!token) {
      logger.warn(`[AuthMiddleware] Socket connection rejected: Missing JWT token from ${socket.id}`);
      return next(new Error('Autentikasi Socket gagal. Token JWT tidak ditemukan.'));
    }

    try {
      const decoded = jwt.verify(token as string, env.JWT_SECRET) as AuthenticatedUser;
      socket.user = decoded;
      logger.info(`[AuthMiddleware] Authenticated Socket connection for user: ${decoded.email}`);
      next();
    } catch (error) {
      logger.warn(`[AuthMiddleware] Invalid Socket JWT token for ${socket.id}: ${error}`);
      next(new Error('Autentikasi Socket gagal. Token JWT tidak valid.'));
    }
  }
}
