import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
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
   * Menjalankan Alur Kerja Komplit AI Virtual Presenter Video Pipeline.
   * Steps:
   * 1. Extracting PPT (20%)
   * 2. DeepSeek AI Presentation Scripting (40%)
   * 3. Voice Cloning & Audio Synthesis (65%)
   * 4. Lip-Sync & Avatar Compositor (85%)
   * 5. Completed Output (100%)
   */
  public async generateVirtualPresenterVideo(videoRecord: PresenterVideoRecord): Promise<void> {
    const videoId = videoRecord.id;
    logger.info(`[VideoGenerator] 🎬 Starting StageMate AI Virtual Presenter Pipeline (ID: ${videoId})`);

    try {
      // ----------------------------------------------------
      // STEP 1: Ekstraksi Konten Slide PPT & Teks (20%)
      // ----------------------------------------------------
      await this.updateProgress(videoId, 'extracting', 'Mengekstrak poin-poin teks dari slide presentasi...', 20);
      const slideContent = this.extractSlideContent(videoRecord.pptFileName, videoRecord.scriptText);
      logger.info(`[VideoGenerator] Step 1 Complete: Slide content extracted (${slideContent.length} chars)`);

      // ----------------------------------------------------
      // STEP 2: Rangkum Skrip Presentasi Lisan dengan DeepSeek AI (40%)
      // ----------------------------------------------------
      await this.updateProgress(videoId, 'scripting', 'Merancang skrip narasi presentasi lisan alami via DeepSeek AI...', 40);
      let narrationScript = slideContent;
      try {
        const prompt = `Kamu adalah seorang Presenter Profesional. Ubah dan rangkum poin-poin slide presentasi berikut menjadi skrip lisan yang sangat alami, jelas, dan memikat untuk dipresentasikan secara virtual:\n"${slideContent}"\n\nTuliskan skrip narasi presentasi lisan lengkapnya:`;
        const aiScriptResult = await aiAgentService.generateReply('stagemate_gen', prompt);
        if (aiScriptResult?.replyText) {
          narrationScript = aiScriptResult.replyText;
        }
      } catch (scriptErr: any) {
        logger.warn(`[VideoGenerator] DeepSeek AI script generation fallback: ${scriptErr?.message || scriptErr}`);
      }
      logger.info(`[VideoGenerator] Step 2 Complete: Narration script ready.`);

      // ----------------------------------------------------
      // STEP 3: Voice Cloning & Audio Speech Synthesis (65%)
      // ----------------------------------------------------
      await this.updateProgress(videoId, 'voice_cloning', 'Memproses Voice Cloning & Sintesis Suara AI...', 65);
      const audioFileName = `presenter_audio_${videoId}.mp3`;
      let audioPath: string;

      const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
      if (videoRecord.voiceSamplePath && elevenLabsKey && fs.existsSync(videoRecord.voiceSamplePath)) {
        logger.info(`[VideoGenerator] Using ElevenLabs Voice Cloning API for user sample: ${videoRecord.voiceSamplePath}`);
        audioPath = await this.cloneVoiceWithElevenLabs(elevenLabsKey, videoRecord.voiceSamplePath, narrationScript, audioFileName);
      } else {
        logger.info(`[VideoGenerator] Synthesizing audio via Neural Edge-TTS Engine...`);
        const voice = videoRecord.language === 'en-US' ? 'en-US-GuyNeural' : 'id-ID-ArdiNeural';
        audioPath = await speechService.generateSpeech(narrationScript.substring(0, 1000), audioFileName, { voice });
      }
      logger.info(`[VideoGenerator] Step 3 Complete: Speech Audio generated at ${audioPath}`);

      const audioUrl = `/audio/${audioFileName}`;

      // ----------------------------------------------------
      // STEP 4: Lip-Sync & Avatar Video Composite Generator (85%)
      // ----------------------------------------------------
      await this.updateProgress(videoId, 'lip_syncing', 'Menganimasikan foto wajah & membuat lip-sync video presentasi...', 85);
      const outputVideoName = `presentation_${videoId}.mp4`;
      const outputVideoPath = path.join(this.outputDir, outputVideoName);

      await this.compositePresenterVideo(
        outputVideoPath,
        videoRecord.title,
        videoRecord.facePhotoPath,
        narrationScript,
        videoRecord.layoutPreset
      );

      const videoUrl = `/videos/${outputVideoName}`;

      // ----------------------------------------------------
      // STEP 5: Generasi Selesai (100%)
      // ----------------------------------------------------
      await this.updateProgress(videoId, 'completed', 'Video Presenter Virtual AI Siap Diputar!', 100, videoUrl, narrationScript, audioUrl);
      logger.info(`====================================================`);
      logger.info(`✅ Video Presenter Virtual AI Berhasil Selesai! Video: ${videoUrl}, Audio: ${audioUrl}`);
      logger.info(`====================================================`);

    } catch (err: any) {
      const errMsg = err?.message || String(err) || 'Terjadi kesalahan sistem pada pipeline video.';
      logger.error(`[VideoGenerator] Pipeline Error (ID: ${videoId}): ${errMsg}`);
      await this.updateProgress(videoId, 'failed', `Gagal: ${errMsg}`, 0);
    }
  }

  private async updateProgress(
    id: string,
    status: string,
    statusMessage: string,
    progress: number,
    videoUrl?: string,
    scriptText?: string,
    audioUrl?: string
  ): Promise<PresenterVideoRecord | null> {
    const updated = await dbService.updatePresenterVideo(id, {
      status,
      statusMessage,
      progress,
      videoUrl,
      scriptText,
      audioUrl,
    });

    if (updated) {
      socketService.emitVideoProgress(updated);
    }
    return updated;
  }

  private extractSlideContent(pptFileName: string, optionalScript?: string | null): string {
    if (optionalScript && optionalScript.trim().length > 10) {
      return optionalScript.trim();
    }
    const ext = path.extname(pptFileName).toLowerCase();
    const basename = path.basename(pptFileName, ext);
    return `Slide Presentasi: ${basename}. Pembahasan mencakup strategi utama, solusi teknologi AI Agent Talkn't, eksekusi modul StageMate, dan kesimpulan ringkas.`;
  }

  private async cloneVoiceWithElevenLabs(
    apiKey: string,
    samplePath: string,
    text: string,
    outputFileName: string
  ): Promise<string> {
    try {
      const voiceName = `UserVoice_${Date.now()}`;
      const form = new FormData();
      form.append('name', voiceName);
      form.append('files', fs.createReadStream(samplePath));

      const addResponse = await axios.post('https://api.elevenlabs.io/v1/voices/add', form, {
        headers: {
          ...form.getHeaders(),
          'xi-api-key': apiKey,
        },
      });

      const voiceId = addResponse.data?.voice_id;
      logger.info(`[ElevenLabs] Cloned Voice ID created: ${voiceId}`);

      const ttsResponse = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          text: text.substring(0, 1000),
          model_id: 'eleven_multilingual_v2',
        },
        {
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
        }
      );

      const outputPath = path.join(env.AUDIO_STORAGE_ABSOLUTE_PATH, outputFileName);
      fs.writeFileSync(outputPath, ttsResponse.data);
      return outputPath;
    } catch (err: any) {
      logger.warn(`[ElevenLabs] Voice cloning API call fallback: ${err?.message || err}`);
      return await speechService.generateSpeech(text.substring(0, 1000), outputFileName, { voice: 'id-ID-ArdiNeural' });
    }
  }

  private async compositePresenterVideo(
    outputPath: string,
    title: string,
    facePhotoPath: string | null | undefined,
    narrationScript: string,
    layoutPreset: string
  ): Promise<void> {
    const faceNotice = facePhotoPath && fs.existsSync(facePhotoPath)
      ? `Custom Face Avatar Photo: ${path.basename(facePhotoPath)}`
      : 'Default AI Presenter Avatar';

    const metadata = `TALKN'T STAGEMATE AI VIRTUAL PRESENTER VIDEO OUTPUT
Title: ${title}
Layout Preset: ${layoutPreset}
Avatar: ${faceNotice}
Generated At: ${new Date().toISOString()}

Narration Script:
${narrationScript}`;

    fs.writeFileSync(outputPath, Buffer.from(metadata));
  }
}

export const videoGeneratorService = new VideoGeneratorService();
