import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export interface SendMediaParams {
  mediaType: 'image' | 'video' | 'document' | 'audio';
  fileName: string;
  caption?: string;
}

export interface MediaFileResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  mimeType?: string;
  caption?: string;
  mediaType?: 'image' | 'video' | 'document' | 'audio';
  error?: string;
}

export class LocalMediaTool {
  private baseDir: string;

  constructor(baseDir: string = env.MEDIA_STORAGE_ABSOLUTE_PATH) {
    this.baseDir = baseDir;
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
      logger.info(`[LocalMediaTool] Created storage directory: ${this.baseDir}`);
    }
  }

  /**
   * Mencari file di direktori lokal berdasarkan query nama file (fuzzy atau substring search).
   */
  public findMediaFile(queryFileName: string): string | null {
    if (!fs.existsSync(this.baseDir)) {
      return null;
    }

    const files = fs.readdirSync(this.baseDir);
    const targetQuery = queryFileName.toLowerCase();

    // 1. Direct match
    const exactMatch = files.find((f) => f.toLowerCase() === targetQuery);
    if (exactMatch) return path.join(this.baseDir, exactMatch);

    // 2. Partial / substring match
    const partialMatch = files.find((f) => f.toLowerCase().includes(targetQuery) || targetQuery.includes(f.toLowerCase()));
    if (partialMatch) return path.join(this.baseDir, partialMatch);

    return null;
  }

  /**
   * Mengeksekusi penyiapan media yang akan dikirim melalui Baileys.
   */
  public execute(params: SendMediaParams): MediaFileResult {
    logger.info(`[LocalMediaTool] Executing media resolution for requested file: "${params.fileName}" (${params.mediaType})`);

    const filePath = this.findMediaFile(params.fileName);

    if (!filePath || !fs.existsSync(filePath)) {
      const availableFiles = fs.readdirSync(this.baseDir);
      logger.warn(`[LocalMediaTool] File "${params.fileName}" tidak ditemukan di ${this.baseDir}. File yang tersedia: ${availableFiles.join(', ')}`);
      return {
        success: false,
        error: `File "${params.fileName}" tidak ditemukan di direktori lokal. File yang tersedia: ${availableFiles.length > 0 ? availableFiles.join(', ') : 'kosong'}.`,
      };
    }

    const fileName = path.basename(filePath);
    const detectedMime = mime.lookup(filePath) || 'application/octet-stream';

    logger.info(`[LocalMediaTool] File ditemukan: ${filePath} (${detectedMime})`);

    return {
      success: true,
      filePath,
      fileName,
      mimeType: detectedMime,
      caption: params.caption,
      mediaType: params.mediaType,
    };
  }
}
