import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  JWT_SECRET: z.string().default('super_secret_jwt_key_talknt_2026'),
  DEEPSEEK_API_KEY: z.string().min(1, 'DEEPSEEK_API_KEY wajib diisi di .env'),
  DEEPSEEK_BASE_URL: z.string().default('https://api.deepseek.com'),
  DEEPSEEK_MODEL: z.string().default('deepseek-chat'),
  BOT_NAME: z.string().default('Talkn\'t Agent'),
  USER_NAME: z.string().default('Pengguna'),
  AUTO_REPLY_MODE: z.string().transform((val) => val === 'true').default('true'),
  AUTO_REPLY_PREFIX: z.string().default('🤖 '),
  PORT: z.string().transform((val) => parseInt(val, 10)).default('3000'),
  PRESENTATION_STORAGE_DIR: z.string().default('./storage/presentations'),
  AUDIO_STORAGE_DIR: z.string().default('./storage/audio'),
  TTS_VOICE: z.string().default('id-ID-ArdiNeural'),
  MEDIA_STORAGE_DIR: z.string().default('./media_assets'),
  SESSION_DIR: z.string().default('./sessions'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Configuration error (Konfigurasi .env tidak valid):');
  console.error(_env.error.format());
  process.exit(1);
}

export const env = {
  ..._env.data,
  MEDIA_STORAGE_ABSOLUTE_PATH: path.resolve(_env.data.MEDIA_STORAGE_DIR),
  PRESENTATION_STORAGE_ABSOLUTE_PATH: path.resolve(_env.data.PRESENTATION_STORAGE_DIR),
  AUDIO_STORAGE_ABSOLUTE_PATH: path.resolve(_env.data.AUDIO_STORAGE_DIR),
  SESSION_ABSOLUTE_PATH: path.resolve(_env.data.SESSION_DIR),
};
