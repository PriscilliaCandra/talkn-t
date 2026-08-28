import http from 'http';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { dbService } from './db.js';
import { AuthService, AuthRequest } from './auth.js';
import { socketService } from './socket.js';
import { speechService } from './speech.js';
import { waConnector } from './whatsapp.js';
import { videoGeneratorService } from './stagemate/videoGenerator.js';

async function main() {
  logger.info('====================================================');
  logger.info(`🤖 Starting ${env.BOT_NAME} Full-Stack Backend Engine`);
  logger.info(`🌐 Web & Socket.io Server : http://localhost:${env.PORT}`);
  logger.info('====================================================');

  const app = express();
  const server = http.createServer(app);

  app.use(cors());
  app.use(express.json());

  socketService.init(server);

  const uploadDir = env.PRESENTATION_STORAGE_ABSOLUTE_PATH;
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`),
  });
  const upload = multer({ storage });

  // --- API AUTHENTICATION ROUTES ---
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { name, email, password } = req.body;
      logger.info(`[API] Processing POST /api/auth/register for email: ${email}`);
      const result = await AuthService.register(name, email, password);
      return res.json(result);
    } catch (err: any) {
      logger.error(`[API] Registration Error: ${err?.message || err}`);
      return res.status(400).json({ error: err?.message || 'Gagal mendaftar' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password);
      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Login gagal' });
    }
  });

  app.get('/api/auth/me', AuthService.verifyTokenMiddleware, (req: AuthRequest, res) => {
    return res.json({ user: req.user });
  });

  // --- API WHATSAPP DISCONNECT SESSION ---
  app.post('/api/whatsapp/disconnect', AuthService.verifyTokenMiddleware, async (_req, res) => {
    try {
      await waConnector.disconnectSession();
      return res.json({ message: 'Sesi WhatsApp berhasil diputuskan.' });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Gagal memutuskan sesi WhatsApp.' });
    }
  });

  // --- API LIVE CHAT INBOX MESSAGES ---
  app.get('/api/chats/messages', AuthService.verifyTokenMiddleware, async (_req, res) => {
    try {
      const messages = await dbService.getRecentMessages(100);
      return res.json({ messages });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Gagal mengambil pesan chat.' });
    }
  });

  // --- API STAGEMATE: AI VIRTUAL PRESENTER GENERATOR ---
  app.post(
    '/api/stagemate/generate',
    AuthService.verifyTokenMiddleware,
    upload.fields([
      { name: 'presentation', maxCount: 1 },
      { name: 'script', maxCount: 1 },
      { name: 'facePhoto', maxCount: 1 },
      { name: 'voiceSample', maxCount: 1 },
    ]),
    async (req: AuthRequest, res) => {
      try {
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };
        const presentationFile = files?.presentation?.[0];
        const facePhotoFile = files?.facePhoto?.[0];
        const voiceSampleFile = files?.voiceSample?.[0];

        if (!presentationFile) {
          return res.status(400).json({ error: 'File presentasi (.ppt / .pptx / .pdf) wajib diunggah.' });
        }

        const title = req.body.title || presentationFile.originalname;
        const language = req.body.language || 'id-ID';
        const layoutPreset = req.body.layoutPreset || 'side_by_side';
        const scriptNotes = req.body.scriptNotes || undefined;

        const facePhotoPath = facePhotoFile?.path || undefined;
        const voiceSamplePath = voiceSampleFile?.path || undefined;

        // 1. Simpan metadata awal ke PostgreSQL via Prisma
        const videoRecord = await dbService.createPresenterVideo({
          userId: req.user?.id,
          title,
          pptFileName: presentationFile.originalname,
          facePhotoPath,
          voiceSamplePath,
          scriptText: scriptNotes,
          language,
          layoutPreset,
        });

        // 2. Jalankan alur kerja generasi video AI di latar belakang (background process)
        videoGeneratorService.generateVirtualPresenterVideo(videoRecord);

        return res.json({
          message: 'Proses generasi Video Presenter Virtual AI berhasil dimulai.',
          video: videoRecord,
        });
      } catch (err: any) {
        logger.error(`[API] StageMate generate error: ${err?.message || err}`);
        return res.status(500).json({ error: err?.message || 'Gagal memulai generasi video presenter.' });
      }
    }
  );

  app.get('/api/stagemate/videos', AuthService.verifyTokenMiddleware, async (req: AuthRequest, res) => {
    try {
      const videos = await dbService.getPresenterVideos(req.user?.id);
      return res.json({ videos });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Gagal mengambil daftar video.' });
    }
  });

  // --- API SETTINGS & SHADOWREPLY CONTROL PANEL ---
  app.get('/api/settings', AuthService.verifyTokenMiddleware, (_req, res) => {
    const settings = dbService.getAllSettings();
    return res.json(settings);
  });

  app.post('/api/settings', AuthService.verifyTokenMiddleware, (req, res) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'key wajib diisi' });
    dbService.setSetting(key, String(value));
    return res.json({ message: `Setting ${key} berhasil diperbarui`, settings: dbService.getAllSettings() });
  });

  // --- API MEDIA ASSETS LIST ---
  app.get('/api/media-assets', AuthService.verifyTokenMiddleware, (_req, res) => {
    const mediaDir = env.MEDIA_STORAGE_ABSOLUTE_PATH;
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    }
    const files = fs.readdirSync(mediaDir).map((fileName) => {
      const stat = fs.statSync(path.join(mediaDir, fileName));
      return {
        fileName,
        sizeBytes: stat.size,
        updatedAt: stat.mtimeMs,
      };
    });
    return res.json({ files });
  });

  // Static directory serving
  app.use('/audio', express.static(env.AUDIO_STORAGE_ABSOLUTE_PATH));
  app.use('/videos', express.static(path.resolve('./video_outputs')));

  try {
    waConnector.init();
  } catch (err: any) {
    logger.error(`Error starting WA Connector: ${err?.message || err}`);
  }

  server.listen(env.PORT, () => {
    logger.info(`[Server] Express & Socket.io server ready at http://localhost:${env.PORT}`);
  });

  const handleExit = (signal: string) => {
    logger.info(`[Main] Received ${signal}. Shutting down Talkn't...`);
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', () => handleExit('SIGINT'));
  process.on('SIGTERM', () => handleExit('SIGTERM'));
}

main().catch((err) => {
  logger.fatal(`Unhandled bootstrap error: ${err}`);
  process.exit(1);
});
