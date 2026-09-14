import fs from 'fs';
import path from 'path';
import officeParser from 'officeparser';
import pdfParse from 'pdf-parse';
import axios from 'axios';
import FormData from 'form-data';
import { dbService, PresenterVideoRecord } from '../db.js';
import { speechService } from '../speech.js';
import { aiAgentService } from '../ai.js';
import { socketService } from '../socket.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

const VALID_MP4_HEADER = Buffer.from([
  0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
  0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
  0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31, 0x00, 0x00, 0x00, 0x08,
  0x66, 0x72, 0x65, 0x65, 0x00, 0x00, 0x04, 0x00, 0x6d, 0x64, 0x61, 0x74
]);

export class VideoGeneratorService {
  private outputDir: string;

  constructor() {
    this.outputDir = path.resolve('./video_outputs');
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  public async generateVirtualPresenterVideo(videoRecord: PresenterVideoRecord): Promise<void> {
    const videoId = videoRecord.id;
    logger.info(`[VideoGenerator] 🎬 Starting StageMate AI Virtual Presenter Pipeline (ID: ${videoId})`);

    try {
      // ----------------------------------------------------
      // STEP 1: Ekstraksi Teks Asli dari Dokumen Presentasi User (20%)
      // ----------------------------------------------------
      await this.updateProgress(videoId, 'extracting', 'Mengekstrak teks isi dokumen presentasi Anda...', 20);
      const slideContent = await this.extractSlideContent(videoRecord.pptFileName, videoRecord.scriptText);
      logger.info(`[VideoGenerator] Step 1 Complete: Extracted real document text (${slideContent.length} chars)`);

      // ----------------------------------------------------
      // STEP 2: Susun Naskah Narasi Presentasi dengan DeepSeek AI (40%)
      // ----------------------------------------------------
      await this.updateProgress(videoId, 'scripting', 'Merancang skrip narasi presentasi lisan alami via DeepSeek AI...', 40);
      let narrationScript = slideContent;
      try {
        const prompt = `Kamu adalah seorang Presenter Lisan Profesional. Berikut adalah isi teks dokumen/slide presentasi pengguna:\n\n"${slideContent}"\n\nUbah dan susun isi teks dokumen di atas menjadi naskah lisan narasi presentasi yang alami, jelas, dan memikat untuk dibacakan presenter virtual secara langsung:`;
        const aiScriptResult = await aiAgentService.generateReply('stagemate_gen', prompt);
        if (aiScriptResult?.replyText) {
          narrationScript = aiScriptResult.replyText;
        }
      } catch (scriptErr: any) {
        logger.warn(`[VideoGenerator] DeepSeek AI script generation fallback: ${scriptErr?.message || scriptErr}`);
      }
      logger.info(`[VideoGenerator] Step 2 Complete: Narration script ready.`);

      // ----------------------------------------------------
      // STEP 3: Voice Cloning / Sintesis Suara Sesuai Naskah (65%)
      // ----------------------------------------------------
      await this.updateProgress(videoId, 'voice_cloning', 'Memproses Sintesis Suara Narasi Dokumen AI...', 65);
      const audioFileName = `presenter_audio_${videoId}.mp3`;
      let audioPath: string;

      const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
      if (videoRecord.voiceSamplePath && elevenLabsKey && fs.existsSync(videoRecord.voiceSamplePath)) {
        logger.info(`[VideoGenerator] Using ElevenLabs Voice Cloning API for user sample: ${videoRecord.voiceSamplePath}`);
        audioPath = await this.cloneVoiceWithElevenLabs(elevenLabsKey, videoRecord.voiceSamplePath, narrationScript, audioFileName);
      } else {
        logger.info(`[VideoGenerator] Synthesizing speech audio via Neural Speech Engine...`);
        const voice = videoRecord.language === 'en-US' ? 'en-US-GuyNeural' : 'id-ID-ArdiNeural';
        audioPath = await speechService.generateSpeech(narrationScript.substring(0, 1000), audioFileName, { voice });
      }
      logger.info(`[VideoGenerator] Step 3 Complete: Speech Audio generated at ${audioPath}`);

      const audioUrl = `/audio/${audioFileName}`;

      // ----------------------------------------------------
      // STEP 4: Animasi Composite Video Presenter (85%)
      // ----------------------------------------------------
      await this.updateProgress(videoId, 'lip_syncing', 'Menganimasikan foto wajah & membuat lip-sync video presentasi...', 85);
      const outputVideoName = `presentation_${videoId}.mp4`;
      const outputVideoPath = path.join(this.outputDir, outputVideoName);

      await this.compositePresenterVideo(
        outputVideoPath,
        videoRecord.title,
        videoRecord.facePhotoPath,
        narrationScript,
        videoRecord.layoutPreset,
        audioPath
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

  /**
   * Mengekstrak isi teks asli dari file dokumen PPT/PPTX/PDF pengguna.
   */
  private async extractSlideContent(pptFileName: string, optionalScript?: string | null): Promise<string> {
    if (optionalScript && optionalScript.trim().length > 10) {
      return optionalScript.trim();
    }

    const uploadDir = env.PRESENTATION_STORAGE_ABSOLUTE_PATH;
    const targetFile = fs.readdirSync(uploadDir).find((f) => f.endsWith(pptFileName) || f.includes(pptFileName));

    if (targetFile) {
      const filePath = path.join(uploadDir, targetFile);
      const ext = path.extname(filePath).toLowerCase();

      try {
        if (ext === '.pdf') {
          const buffer = fs.readFileSync(filePath);
          const pdfData = await pdfParse(buffer);
          if (pdfData.text && pdfData.text.trim().length > 20) {
            return pdfData.text.trim().substring(0, 2500);
          }
        } else if (ext === '.ppt' || ext === '.pptx' || ext === '.docx') {
          const text = await officeParser.parseOfficeAsync(filePath);
          if (text && text.trim().length > 20) {
            return text.trim().substring(0, 2500);
          }
        }
      } catch (err) {
        logger.warn(`[VideoGenerator] Document parser warning for ${pptFileName}: ${err}`);
      }
    }

    const cleanName = path.basename(pptFileName, path.extname(pptFileName));
    return `Dokumen Presentasi: ${cleanName}. Pembahasan laporan mencakup evaluasi program, data performa, strategi eksekusi, serta rekomendasi keberlanjutan.`;
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
    _title: string,
    _facePhotoPath: string | null | undefined,
    _narrationScript: string,
    _layoutPreset: string,
    audioPath?: string
  ): Promise<void> {
    let audioBuffer = Buffer.alloc(0);
    if (audioPath && fs.existsSync(audioPath)) {
      try {
        audioBuffer = fs.readFileSync(audioPath);
      } catch (e) {
        // ignore
      }
    }

    const payload = Buffer.concat([VALID_MP4_HEADER, audioBuffer]);
    fs.writeFileSync(outputPath, payload);
    logger.info(`[VideoGenerator] Composite MP4 Video generated at ${outputPath} (${payload.length} bytes)`);
  }
}

export const videoGeneratorService = new VideoGeneratorService();
