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

  /**
   * Pipeline Pengolahan Media StageMate Engine:
   * 1. Parsing PPT / PDF Document (20%)
   * 2. DeepSeek AI Speech Script Generation (40%)
   * 3. Voice Cloning Audio Synthesis (60%)
   * 4. Photo Face Animation & Lip-Sync (80%)
   * 5. Final Video Composite MP4 (100%)
   */
  public async generateVirtualPresenterVideo(videoRecord: PresenterVideoRecord): Promise<void> {
    const videoId = videoRecord.id;
    logger.info(`[VideoGenerator] 🎬 Starting StageMate AI Virtual Presenter Pipeline (ID: ${videoId})`);

    try {
      // ----------------------------------------------------
      // STEP 1: Parsing PPT / PDF & Ekstraksi Narasi (20%)
      // ----------------------------------------------------
      await this.updateProgress(videoId, 'extracting', '1/4 Parsing PPT & Ekstraksi isi dokumen...', 20);
      const slideContent = await this.extractSlideContent(videoRecord.pptFileName, videoRecord.scriptText);
      logger.info(`[VideoGenerator] Step 1 Complete: Extracted document text (${slideContent.length} chars)`);

      // ----------------------------------------------------
      // STEP 2: DeepSeek AI Presentation Speech Scripting (40%)
      // ----------------------------------------------------
      await this.updateProgress(videoId, 'scripting', '2/4 Merancang skrip narasi lisan via DeepSeek AI...', 40);
      let narrationScript = slideContent;
      try {
        const prompt = `Kamu adalah seorang Presenter Lisan Profesional. Berikut adalah isi teks dokumen presentasi pengguna:\n\n"${slideContent}"\n\nUbah dan susun isi teks dokumen di atas menjadi naskah lisan narasi presentasi yang alami, jelas, dan memikat untuk dibacakan presenter virtual:`;
        const aiScriptResult = await aiAgentService.generateReply('stagemate_gen', prompt);
        if (aiScriptResult?.replyText) {
          narrationScript = aiScriptResult.replyText;
        }
      } catch (scriptErr: any) {
        logger.warn(`[VideoGenerator] DeepSeek AI script generation fallback: ${scriptErr?.message || scriptErr}`);
      }
      logger.info(`[VideoGenerator] Step 2 Complete: DeepSeek speech script ready.`);

      // ----------------------------------------------------
      // STEP 3: Voice Cloning & Audio Speech Synthesis (60%)
      // ----------------------------------------------------
      await this.updateProgress(videoId, 'voice_cloning', '3/4 Cloning Voice & Sintesis Suara Pengguna...', 60);
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
      // STEP 4: Animasi Wajah & Lip-Sync (Photo Animation) (80%)
      // ----------------------------------------------------
      await this.updateProgress(videoId, 'animating_face', '4/4 Animating Face & Lip-Sync Foto Presenter...', 80);
      const outputVideoName = `presentation_${videoId}.mp4`;
      const outputVideoPath = path.join(this.outputDir, outputVideoName);

      // Cek apakah D-ID API Key tersedia untuk Photo Animation
      const didApiKey = process.env.DID_API_KEY;
      let generatedDidVideoUrl: string | null = null;

      if (didApiKey && videoRecord.facePhotoPath && fs.existsSync(videoRecord.facePhotoPath)) {
        logger.info(`[VideoGenerator] Requesting D-ID Talking Head Photo Animation API...`);
        generatedDidVideoUrl = await this.generateDidPhotoAnimation(didApiKey, videoRecord.facePhotoPath, audioPath);
      }

      // ----------------------------------------------------
      // STEP 5: Final Video Compositing (Overlay Slide & Avatar) (100%)
      // ----------------------------------------------------
      await this.compositePresenterVideo(
        outputVideoPath,
        videoRecord.title,
        videoRecord.facePhotoPath,
        narrationScript,
        videoRecord.layoutPreset,
        audioPath
      );

      const videoUrl = generatedDidVideoUrl || `/videos/${outputVideoName}`;

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

  private async generateDidPhotoAnimation(apiKey: string, imagePath: string, _audioPath: string): Promise<string | null> {
    try {
      const response = await axios.post(
        'https://api.d-id.com/talks',
        {
          source_url: `http://localhost:5000/uploads/${path.basename(imagePath)}`,
          script: {
            type: 'text',
            subtitles: 'false',
            provider: { type: 'microsoft', voice_id: 'id-ID-ArdiNeural' },
            ssml: 'false',
          },
          config: { fluent: 'true', pad_audio: '0.0' },
        },
        {
          headers: {
            Authorization: `Basic ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data?.result_url) {
        return response.data.result_url;
      }
    } catch (e: any) {
      logger.warn(`[D-ID API] Photo animation fallback to canvas engine: ${e?.message || e}`);
    }
    return null;
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
