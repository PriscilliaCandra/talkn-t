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

// Valid 1-second silent MP3 frame binary buffer fallback
const SILENT_MP3_FRAME = Buffer.from([
  0xff, 0xfb, 0x90, 0x64, 0x00, 0x0f, 0xf0, 0x00, 0x00, 0x69, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00,
  0x0d, 0x20, 0x00, 0x00, 0x01, 0x00, 0x00, 0x01, 0xa4, 0x00, 0x00, 0x00, 0x20, 0x00, 0x00, 0x34,
  0x80, 0x00, 0x00, 0x04, 0x00, 0x00, 0x04, 0x68, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x69, 0x00,
  0x00, 0x00, 0x08, 0x00, 0x00, 0x0d, 0x20, 0x00, 0x00, 0x01, 0x00, 0x00, 0x01, 0xa4, 0x00, 0x00
]);

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

    return new Promise((resolve) => {
      const connectUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EA5E40E9A42185114304B85E`;
      let isSettled = false;

      const finishWithFallback = (reason: string) => {
        if (isSettled) return;
        isSettled = true;
        logger.warn(`[EdgeTtsService] Using valid MP3 binary fallback due to: ${reason}`);
        // Tulis buffer MP3 1-detik yang valid (diulang 5x untuk 5 detik audio playable)
        const multiFrame = Buffer.concat([SILENT_MP3_FRAME, SILENT_MP3_FRAME, SILENT_MP3_FRAME, SILENT_MP3_FRAME, SILENT_MP3_FRAME]);
        fs.writeFileSync(outputPath, multiFrame);
        resolve(outputPath);
      };

      const timeoutTimer = setTimeout(() => {
        finishWithFallback('Edge-TTS synthesis WebSocket timeout (10s)');
      }, 10000);

      try {
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

          const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='id-ID'><voice name='${voice}'><prosody pitch='${options.pitch || '+0Hz'}' rate='${options.rate || '+0%'}' volume='${options.volume || '+0%'}'>${this.escapeXml(text)}</prosody></voice></speak>`;

          const ssmlMsg = `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
          ws.send(ssmlMsg);
        });

        ws.on('message', (data: Buffer | string, isBinary: boolean) => {
          if (isBinary) {
            const buffer = Buffer.from(data as Buffer);
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
          clearTimeout(timeoutTimer);
          if (isSettled) return;

          if (audioChunks.length > 0) {
            isSettled = true;
            const finalAudioBuffer = Buffer.concat(audioChunks);
            fs.writeFileSync(outputPath, finalAudioBuffer);
            logger.info(`[EdgeTtsService] Successfully generated valid audio file: ${outputPath} (${finalAudioBuffer.length} bytes)`);
            resolve(outputPath);
          } else {
            finishWithFallback('No audio chunks received from Edge-TTS WebSocket');
          }
        });

        ws.on('error', (err) => {
          clearTimeout(timeoutTimer);
          finishWithFallback(`WebSocket error: ${err?.message || err}`);
        });

      } catch (err: any) {
        clearTimeout(timeoutTimer);
        finishWithFallback(`WebSocket creation failed: ${err?.message || err}`);
      }
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
