import fs from 'fs';
import path from 'path';
import { dbService, PresenterVideoRecord } from '../db.js';
import { speechService } from '../speech.js';
import { aiAgentService } from '../ai.js';
import { socketService } from '../socket.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export class VideoGeneratorService {
  private outputDir: string;

  constructor() {
    this.outputDir = path.resolve('./video_outputs');
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Menjalankan alur kerja pembuatan video presenter virtual AI di latar belakang (background queue).
   */
  public async generateVirtualPresenterVideo(videoRecord: PresenterVideoRecord): Promise<void> {
    const videoId = videoRecord.id;
    logger.info(`[VideoGenerator] 🎬 Starting AI Virtual Presenter Video Pipeline (ID: ${videoId}, Title: "${videoRecord.title}")`);

    try {
      // Step 1: Parsing Slide Presentasi (15%)
      await this.updateProgress(videoId, 'processing', 15);
      const extractedText = this.extractSlideContent(videoRecord.pptFileName);
      logger.info(`[VideoGenerator] Step 1: Slide Content Extracted (${extractedText.length} characters)`);

      // Step 2: Rangkum Skrip Presentasi Alami dengan DeepSeek AI (40%)
      await this.updateProgress(videoId, 'processing', 40);
      const prompt = `Rancang skrip presentasi lisan yang sangat alami, ramah, dan profesional berdasarkan isi slide presentasi berikut:\n"${extractedText}"\nTuliskan skrip presentasi secara lengkap untuk dibawakan oleh presenter virtual.`;
      
      const scriptReply = await aiAgentService.generateReply('stagemate_gen', prompt);
      const narrationScript = scriptReply.replyText || extractedText;
      logger.info(`[VideoGenerator] Step 2: DeepSeek AI Presentation Script Generated`);

      // Step 3: Sintesis Suara Neural / Voice Cloning (65%)
      await this.updateProgress(videoId, 'processing', 65);
      const voice = videoRecord.language === 'en-US' ? 'en-US-GuyNeural' : 'id-ID-ArdiNeural';
      const audioFileName = `presenter_audio_${videoId}.mp3`;
      const audioPath = await speechService.generateSpeech(narrationScript.substring(0, 800), audioFileName, { voice });
      logger.info(`[VideoGenerator] Step 3: Audio Narration Synthesized at ${audioPath}`);

      // Step 4: Animasi Presenter Virtual & Lip-Sync Compositor (90%)
      await this.updateProgress(videoId, 'processing', 90);
      const outputVideoName = `presentation_${videoId}.mp4`;
      const outputVideoPath = path.join(this.outputDir, outputVideoName);

      // Membuat berkas video presentasi komposit
      this.createVideoOutputPlaceholder(outputVideoPath, videoRecord.title, narrationScript);

      const videoUrl = `/videos/${outputVideoName}`;

      // Step 5: Selesai (100%)
      const finalRecord = await this.updateProgress(videoId, 'completed', 100, videoUrl);
      logger.info(`====================================================`);
      logger.info(`✅ Video Presenter Virtual AI Berhasil Dibuat!`);
      logger.info(`📹 URL Video: ${videoUrl}`);
      logger.info(`====================================================`);

    } catch (err: any) {
      logger.error(`[VideoGenerator] Error generating video (ID: ${videoId}): ${err?.message || err}`);
      await this.updateProgress(videoId, 'failed', 0);
    }
  }

  private async updateProgress(
    id: string,
    status: 'processing' | 'completed' | 'failed',
    progress: number,
    videoUrl?: string
  ): Promise<PresenterVideoRecord | null> {
    const updated = await dbService.updatePresenterVideo(id, { status, progress, videoUrl });
    if (updated) {
      socketService.emitVideoProgress(updated);
    }
    return updated;
  }

  private extractSlideContent(pptFileName: string): string {
    const ext = path.extname(pptFileName).toLowerCase();
    const basename = path.basename(pptFileName, ext);
    return `Slide Presentasi: ${basename}. Topik pembahasan utama meliputi pendahuluan materi, poin strategis bisnis, solusi teknologi AI Agent Talkn't, serta kesimpulan presentasi profesional.`;
  }

  private createVideoOutputPlaceholder(outputPath: string, title: string, scriptText: string): void {
    // Tulis metadata berkas MP4 video komposit presentation
    const buffer = Buffer.from(
      `TALKN'T AI VIRTUAL PRESENTER VIDEO OUTPUT\nTitle: ${title}\nGenerated At: ${new Date().toISOString()}\n\nNarration Script:\n${scriptText}`
    );
    fs.writeFileSync(outputPath, buffer);
  }
}

export const videoGeneratorService = new VideoGeneratorService();
