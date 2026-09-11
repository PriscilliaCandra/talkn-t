import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { logger } from './utils/logger.js';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date | number;
}

export interface MessageRecord {
  id: string;
  userId?: string | null;
  jid: string;
  senderNumber: string;
  senderName?: string | null;
  body: string;
  isFromMe: boolean;
  isAi: boolean;
  createdAt: Date | number;
}

export interface ChatRecord {
  id: number;
  jid: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
}

export interface PresenterVideoRecord {
  id: string;
  userId?: string | null;
  title: string;
  pptFileName: string;
  facePhotoPath?: string | null;
  voiceSamplePath?: string | null;
  scriptText?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  status: 'uploading' | 'extracting' | 'scripting' | 'voice_cloning' | 'lip_syncing' | 'completed' | 'failed' | string;
  statusMessage?: string | null;
  progress: number;
  language: string;
  layoutPreset: string;
  createdAt: Date | number;
}

export class DatabaseService {
  public prisma: PrismaClient;
  private dbPath: string;
  private localData: {
    users: UserRecord[];
    messages: MessageRecord[];
    chats: ChatRecord[];
    settings: Record<string, string>;
    presenterVideos: PresenterVideoRecord[];
  };

  constructor() {
    this.prisma = new PrismaClient({
      log: ['query', 'info', 'warn', 'error'],
    });

    this.dbPath = path.resolve('./talknt_data.json');
    this.localData = {
      users: [],
      messages: [],
      chats: [],
      settings: {
        auto_reply_mode: 'true',
        active_persona: 'introvert_casual',
        system_prompt: 'Kamu adalah AI Assistant personal yang membalas chat WhatsApp secara ramah, santai, dan alami.',
      },
      presenterVideos: [],
    };

    this.initPrismaConnection();
  }

  private async initPrismaConnection() {
    try {
      await this.prisma.$connect();
      logger.info('====================================================');
      logger.info('✅ Prisma Client Berhasil Terhubung ke PostgreSQL!');
      logger.info('====================================================');
    } catch (err: any) {
      logger.warn(`[DatabaseService] PostgreSQL connection warning: ${err?.message || err}`);
      logger.warn('[DatabaseService] Mengaktifkan fallback persistent storage lokal.');
      this.loadLocalDatabase();
    }
  }

  private loadLocalDatabase(): void {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.localData = {
          users: parsed.users || [],
          messages: parsed.messages || [],
          chats: parsed.chats || [],
          settings: {
            auto_reply_mode: 'true',
            active_persona: 'introvert_casual',
            system_prompt: 'Kamu adalah AI Assistant personal yang membalas chat WhatsApp secara ramah, santai, dan alami.',
            ...(parsed.settings || {}),
          },
          presenterVideos: parsed.presenterVideos || [],
        };
      }
    } catch (e) {
      logger.error(`[DatabaseService] Failed to load local database backup: ${e}`);
    }
  }

  private saveLocalDatabase(): void {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.localData, null, 2), 'utf-8');
    } catch (e) {
      logger.error(`[DatabaseService] Failed to save local database backup: ${e}`);
    }
  }

  // --- 1. USER MANAGEMENT ---
  public async createUser(name: string, email: string, passwordHash: string): Promise<UserRecord> {
    const cleanEmail = email.toLowerCase().trim();

    try {
      const existing = await this.prisma.user.findUnique({
        where: { email: cleanEmail },
      });

      if (existing) {
        throw new Error('Email sudah terdaftar. Silakan gunakan email lain atau login.');
      }

      const user = await this.prisma.user.create({
        data: {
          name,
          email: cleanEmail,
          passwordHash,
        },
      });

      logger.info(`[DatabaseService] ✅ SUCCESS: Saved User to PostgreSQL! ID: ${user.id}, Email: ${user.email}`);
      return user;
    } catch (err: any) {
      if (err?.message?.includes('sudah terdaftar')) {
        throw err;
      }

      logger.warn(`[DatabaseService] PostgreSQL insert fallback trigger: ${err?.message}`);

      const existingLocal = this.localData.users.find((u) => u.email === cleanEmail);
      if (existingLocal) {
        throw new Error('Email sudah terdaftar. Silakan gunakan email lain atau login.');
      }

      const localUser: UserRecord = {
        id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name,
        email: cleanEmail,
        passwordHash,
        createdAt: Date.now(),
      };

      this.localData.users.push(localUser);
      this.saveLocalDatabase();
      return localUser;
    }
  }

  public async findUserByEmail(email: string): Promise<UserRecord | null> {
    const cleanEmail = email.toLowerCase().trim();

    try {
      const user = await this.prisma.user.findUnique({
        where: { email: cleanEmail },
      });

      if (user) return user;
    } catch (err) {
      logger.warn(`[DatabaseService] Prisma findUserByEmail fallback: ${err}`);
    }

    const localUser = this.localData.users.find((u) => u.email === cleanEmail);
    return localUser || null;
  }

  // --- 2. LIVE CHAT MESSAGES ---
  public async saveMessage(msg: {
    userId?: string;
    jid: string;
    senderNumber: string;
    senderName?: string;
    body: string;
    isFromMe: boolean;
    isAi: boolean;
  }): Promise<MessageRecord> {
    try {
      const created = await this.prisma.message.create({
        data: {
          userId: msg.userId,
          jid: msg.jid,
          senderNumber: msg.senderNumber,
          senderName: msg.senderName || 'Kontak WhatsApp',
          body: msg.body,
          isFromMe: msg.isFromMe,
          isAi: msg.isAi,
        },
      });

      this.saveChatMessage(msg.jid, msg.isFromMe ? 'assistant' : 'user', msg.body);
      return created;
    } catch (err) {
      logger.warn(`[DatabaseService] Message save fallback: ${err}`);
      const localMsg: MessageRecord = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        ...msg,
        createdAt: Date.now(),
      };
      this.localData.messages.push(localMsg);
      this.saveLocalDatabase();
      this.saveChatMessage(msg.jid, msg.isFromMe ? 'assistant' : 'user', msg.body);
      return localMsg;
    }
  }

  public async getRecentMessages(limit = 50): Promise<MessageRecord[]> {
    try {
      const messages = await this.prisma.message.findMany({
        orderBy: { createdAt: 'asc' },
        take: limit,
      });
      if (messages.length > 0) return messages;
    } catch (e) {
      // Fallback
    }

    return this.localData.messages.slice(-limit);
  }

  // --- 3. VIRTUAL PRESENTER VIDEOS (STAGE MATE) ---
  public async createPresenterVideo(videoData: {
    userId?: string;
    title: string;
    pptFileName: string;
    facePhotoPath?: string;
    voiceSamplePath?: string;
    scriptText?: string;
    language?: string;
    layoutPreset?: string;
  }): Promise<PresenterVideoRecord> {
    try {
      const created = await this.prisma.virtualPresenterVideo.create({
        data: {
          userId: videoData.userId,
          title: videoData.title,
          pptFileName: videoData.pptFileName,
          facePhotoPath: videoData.facePhotoPath,
          voiceSamplePath: videoData.voiceSamplePath,
          scriptText: videoData.scriptText,
          language: videoData.language || 'id-ID',
          layoutPreset: videoData.layoutPreset || 'side_by_side',
          status: 'extracting',
          statusMessage: 'Mengekstrak teks slide presentasi...',
          progress: 10,
        },
      });
      return created;
    } catch (err) {
      logger.warn(`[DatabaseService] Presenter video create fallback: ${err}`);
      const localVideo: PresenterVideoRecord = {
        id: `vid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        ...videoData,
        status: 'extracting',
        statusMessage: 'Mengekstrak teks slide presentasi...',
        progress: 10,
        language: videoData.language || 'id-ID',
        layoutPreset: videoData.layoutPreset || 'side_by_side',
        createdAt: Date.now(),
      };
      this.localData.presenterVideos.push(localVideo);
      this.saveLocalDatabase();
      return localVideo;
    }
  }

  public async updatePresenterVideo(
    id: string,
    update: { status?: string; statusMessage?: string; progress?: number; videoUrl?: string; audioUrl?: string; scriptText?: string }
  ): Promise<PresenterVideoRecord | null> {
    try {
      const updated = await this.prisma.virtualPresenterVideo.update({
        where: { id },
        data: update,
      });
      return updated;
    } catch (err) {
      logger.warn(`[DatabaseService] Presenter video update fallback: ${err}`);
      const item = this.localData.presenterVideos.find((v) => v.id === id);
      if (item) {
        if (update.status) item.status = update.status;
        if (update.statusMessage) item.statusMessage = update.statusMessage;
        if (update.progress !== undefined) item.progress = update.progress;
        if (update.videoUrl) item.videoUrl = update.videoUrl;
        if (update.audioUrl) item.audioUrl = update.audioUrl;
        if (update.scriptText) item.scriptText = update.scriptText;
        this.saveLocalDatabase();
        return item;
      }
      return null;
    }
  }

  public async getPresenterVideos(userId?: string): Promise<PresenterVideoRecord[]> {
    try {
      const videos = await this.prisma.virtualPresenterVideo.findMany({
        where: userId ? { userId } : undefined,
        orderBy: { createdAt: 'desc' },
      });
      if (videos.length > 0) return videos;
    } catch (err) {
      // Fallback
    }

    return this.localData.presenterVideos.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  // --- 4. LEGACY CHAT LOGS FOR AI MEMORY ---
  public saveChatMessage(jid: string, role: 'user' | 'assistant' | 'system' | 'tool', content: string): number {
    const id = this.localData.chats.length + 1;
    const record: ChatRecord = {
      id,
      jid,
      role,
      content,
      timestamp: Date.now(),
    };
    this.localData.chats.push(record);
    this.saveLocalDatabase();
    return id;
  }

  public getRecentChatHistory(jid: string, limit: number = 15): ChatRecord[] {
    return this.localData.chats.filter((c) => c.jid === jid).slice(-limit);
  }

  // --- 5. SETTINGS ---
  public getSetting(key: string, defaultValue = ''): string {
    return this.localData.settings[key] !== undefined ? this.localData.settings[key] : defaultValue;
  }

  public setSetting(key: string, value: string): void {
    this.localData.settings[key] = value;
    this.saveLocalDatabase();
  }

  public getAllSettings(): Record<string, string> {
    return { ...this.localData.settings };
  }
}

export const dbService = new DatabaseService();
