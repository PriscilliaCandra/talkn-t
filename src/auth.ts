import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from './config/env.js';
import { dbService } from './db.js';
import { logger } from './utils/logger.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

export class AuthService {
  /**
   * Mendaftarkan pengguna baru dengan enkripsi password bcrypt ke PostgreSQL via Prisma.
   */
  public static async register(name: string, email: string, password: string) {
    if (!name || !email || !password) {
      throw new Error('Nama, email, dan password wajib diisi.');
    }

    if (password.length < 6) {
      throw new Error('Password minimal 6 karakter.');
    }

    // 1. Hash password mentah menggunakan bcryptjs
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 2. Simpan user ke PostgreSQL via Prisma
    const user = await dbService.createUser(name, email, passwordHash);

    // 3. Terbitkan JWT Token
    const token = this.generateToken(user.id, user.name, user.email);

    logger.info(`[AuthService] ✅ Registrasi Berhasil untuk ${user.email} (ID: ${user.id})`);

    return {
      user: { id: user.id, name: user.name, email: user.email },
      token,
    };
  }

  /**
   * Mengautentikasi pengguna dari PostgreSQL dan mengembalikan JWT token.
   */
  public static async login(email: string, password: string) {
    if (!email || !password) {
      throw new Error('Email dan password wajib diisi.');
    }

    // 1. Cari user di PostgreSQL via Prisma
    const user = await dbService.findUserByEmail(email);
    if (!user) {
      throw new Error('Email atau password tidak sesuai.');
    }

    // 2. Verifikasi password hash bcrypt
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new Error('Email atau password tidak sesuai.');
    }

    // 3. Terbitkan JWT Token
    const token = this.generateToken(user.id, user.name, user.email);
    logger.info(`[AuthService] ✅ Login Berhasil untuk ${user.email}`);

    return {
      user: { id: user.id, name: user.name, email: user.email },
      token,
    };
  }

  public static generateToken(id: string, name: string, email: string): string {
    return jwt.sign({ id, name, email }, env.JWT_SECRET, { expiresIn: '7d' });
  }

  /**
   * Middleware Express untuk verifikasi JWT token.
   */
  public static verifyTokenMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Akses ditolak. Token tidak ditemukan.' });
    }

    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as { id: string; name: string; email: string };
      req.user = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Token tidak valid atau telah kadaluwarsa.' });
    }
  }
}
