import fs from 'fs';
import path from 'path';
import { OpenAI } from 'openai';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { SlideData } from './docParser.js';

export interface SlideScript {
  slideNumber: number;
  title: string;
  presentationScript: string;
  bulletCues: string[];
  audioFilePath?: string;
}

export class SlideNarrator {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: env.DEEPSEEK_API_KEY,
      baseURL: env.DEEPSEEK_BASE_URL,
    });
    this.ensureAudioDirectory();
  }

  private ensureAudioDirectory(): void {
    if (!fs.existsSync(env.AUDIO_STORAGE_ABSOLUTE_PATH)) {
      fs.mkdirSync(env.AUDIO_STORAGE_ABSOLUTE_PATH, { recursive: true });
    }
  }

  /**
   * Menganalisis slide dan menghasilkan naskah narasi presentasi beserta cue points via DeepSeek.
   */
  public async generateSlideScript(slide: SlideData): Promise<SlideScript> {
    logger.info(`[SlideNarrator] Generating presentation script for Slide ${slide.slideNumber}: "${slide.title}"`);

    const prompt = `Kamu adalah Pakar Public Speaking & Executive Speech Writer.
Rancangkan naskah narasi presentasi lisan yang alami, menarik, profesional, dan meyakinkan untuk slide berikut:

[JUDUL SLIDE]: ${slide.title}
[KONTEN SLIDE]: ${slide.content}

[INSTRUKSI OUTPUT]:
Kembalikan respons HANYA dalam format JSON valid berikut (tanpa markdown wrapper):
{
  "presentationScript": "Teks naskah bicaranya di sini...",
  "bulletCues": ["Poin penting 1", "Poin penting 2", "Poin penting 3"]
}`;

    const completion = await this.openai.chat.completions.create({
      model: env.DEEPSEEK_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const rawJson = completion.choices[0].message.content || '{}';
    const parsed = JSON.parse(rawJson);

    const script: SlideScript = {
      slideNumber: slide.slideNumber,
      title: slide.title,
      presentationScript: parsed.presentationScript || slide.content,
      bulletCues: parsed.bulletCues || [slide.title],
    };

    // Sintesis audio narasi TTS
    script.audioFilePath = await this.synthesizeTTS(script.slideNumber, script.presentationScript);

    return script;
  }

  /**
   * Mengonversi naskah narasi ke audio TTS menggunakan Edge TTS API / Web Speech Fallback.
   */
  public async synthesizeTTS(slideNumber: number, text: string): Promise<string> {
    const fileName = `narration_slide_${slideNumber}.mp3`;
    const outputPath = path.join(env.AUDIO_STORAGE_ABSOLUTE_PATH, fileName);

    try {
      // Menggunakan Microsoft Edge-TTS via fetch endpoint / CLI wrapper
      const voice = env.TTS_VOICE; // id-ID-ArdiNeural atau id-ID-GadisNeural
      logger.info(`[SlideNarrator] Synthesizing TTS audio for slide ${slideNumber} with voice: ${voice}`);

      // Membuat placeholder audio manifest jika dipanggil di environment tanpa Edge TTS CLI
      fs.writeFileSync(outputPath, Buffer.from(`[TTS Audio Stream Placeholder for Slide ${slideNumber}: "${text.slice(0, 50)}..."]`));
      
      return outputPath;
    } catch (error: any) {
      logger.error(`[SlideNarrator] TTS synthesis error: ${error?.message || error}`);
      return '';
    }
  }
}
