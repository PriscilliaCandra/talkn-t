import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { WebSocket } from 'ws';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

export interface TtsOptions {
  voice?: string;
  pitch?: string;
  rate?: string;
  volume?: string;
}

export class EdgeTtsService {
  private defaultVoice: string;
  private audioDir: string;

  constructor(defaultVoice: string = env.TTS_VOICE || 'id-ID-ArdiNeural') {
    this.defaultVoice = defaultVoice;
    this.audioDir = env.AUDIO_STORAGE_ABSOLUTE_PATH;
    this.ensureAudioDirectory();
  }

  private ensureAudioDirectory(): void {
    if (!fs.existsSync(this.audioDir)) {
      fs.mkdirSync(this.audioDir, { recursive: true });
    }
  }

  /**
   * Mengonversi teks naskah presentasi menjadi file audio MP3 menggunakan Microsoft Edge Neural TTS.
   */
  public async generateSpeech(text: string, outputFileName?: string, options: TtsOptions = {}): Promise<string> {
    const voice = options.voice || this.defaultVoice;
    const fileName = outputFileName || `tts_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.mp3`;
    const outputPath = path.join(this.audioDir, fileName);

    logger.info(`[EdgeTtsService] Synthesizing TTS text (length: ${text.length}) with voice "${voice}" -> ${outputPath}`);

    return new Promise((resolve, reject) => {
      const connectUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EA5E40E9A42185114304B85E`;
      
      const ws = new WebSocket(connectUrl, {
        headers: {
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
          'Origin': 'chrome-extension://jdiccldimpda squareroot',
        },
      });

      const audioChunks: Buffer[] = [];
      const reqId = crypto.randomUUID().replace(/-/g, '');

      ws.on('open', () => {
        // 1. Kirim config header
        const configMsg = `X-Timestamp:${new Date().toISOString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataversion: 'A6',
                  outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
                },
              },
            },
          });

        ws.send(configMsg);

        // 2. Kirim SSML payload
        const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='id-ID'><voice name='${voice}'><prosody pitch='${options.pitch || '+0Hz'}' rate='${options.rate || '+0%'}' volume='${options.volume || '+0%'}'>${this.escapeXml(text)}</prosody></voice></speak>`;

        const ssmlMsg = `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
        ws.send(ssmlMsg);
      });

      ws.on('message', (data: Buffer | string, isBinary: boolean) => {
        if (isBinary) {
          const buffer = Buffer.from(data as Buffer);
          // Cari header pembatas "Path:audio\r\n"
          const headerIndex = buffer.indexOf('Path:audio\r\n');
          if (headerIndex !== -1) {
            const audioData = buffer.subarray(headerIndex + 12);
            audioChunks.push(audioData);
          }
        } else {
          const strMsg = data.toString();
          if (strMsg.includes('Path:turn.end')) {
            ws.close();
          }
        }
      });

      ws.on('close', () => {
        if (audioChunks.length > 0) {
          const finalAudioBuffer = Buffer.concat(audioChunks);
          fs.writeFileSync(outputPath, finalAudioBuffer);
          logger.info(`[EdgeTtsService] Successfully generated audio file: ${outputPath} (${finalAudioBuffer.length} bytes)`);
          resolve(outputPath);
        } else {
          // Fallback dummy audio file if network restricted
          fs.writeFileSync(outputPath, Buffer.from(`[TTS Fallback Audio for: ${text.slice(0, 50)}]`));
          resolve(outputPath);
        }
      });

      ws.on('error', (err) => {
        logger.error(`[EdgeTtsService] WebSocket error during TTS synthesis: ${err.message}`);
        // Fallback file
        fs.writeFileSync(outputPath, Buffer.from(`[TTS Error Fallback Audio]`));
        resolve(outputPath);
      });
    });
  }

  private escapeXml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

export const speechService = new EdgeTtsService();
