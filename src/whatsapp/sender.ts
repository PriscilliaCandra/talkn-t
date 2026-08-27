import fs from 'fs';
import { WASocket, AnyMessageContent } from '@whiskeysockets/baileys';
import { logger } from '../utils/logger.js';
import { DeepSeekResponse } from '../ai/deepseek.js';

export class WhatsAppSender {
  private sock: WASocket;

  constructor(sock: WASocket) {
    this.sock = sock;
  }

  /**
   * Mengirimkan teks balasan dasar ke JID tertentu.
   */
  public async sendTextMessage(jid: string, text: string): Promise<void> {
    if (!text.trim()) return;

    try {
      await this.sock.sendMessage(jid, { text });
      logger.info(`[WhatsAppSender] Sent text reply to ${jid}`);
    } catch (error: any) {
      logger.error(`[WhatsAppSender] Failed to send text message to ${jid}: ${error?.message || error}`);
    }
  }

  /**
   * Mengirimkan paket balasan AI (teks + media opsional).
   */
  public async sendAIResponse(jid: string, response: DeepSeekResponse, prefix: string = ''): Promise<void> {
    const textToSend = prefix ? `${prefix}${response.text}` : response.text;

    // 1. Jika ada media yang dihasilkan dari function call
    if (response.mediaFileToSend) {
      const media = response.mediaFileToSend;
      logger.info(`[WhatsAppSender] Preparing to send media (${media.mediaType}): ${media.fileName} to ${jid}`);

      if (fs.existsSync(media.filePath)) {
        const fileBuffer = fs.readFileSync(media.filePath);
        let content: AnyMessageContent;

        switch (media.mediaType) {
          case 'image':
            content = {
              image: fileBuffer,
              caption: media.caption || textToSend || undefined,
              mimetype: media.mimeType,
            };
            break;
          case 'video':
            content = {
              video: fileBuffer,
              caption: media.caption || textToSend || undefined,
              mimetype: media.mimeType,
            };
            break;
          case 'audio':
            content = {
              audio: fileBuffer,
              mimetype: media.mimeType,
              ptt: true,
            };
            break;
          case 'document':
          default:
            content = {
              document: fileBuffer,
              fileName: media.fileName,
              mimetype: media.mimeType,
              caption: media.caption || textToSend || undefined,
            };
            break;
        }

        await this.sock.sendMessage(jid, content);
        logger.info(`[WhatsAppSender] Successfully sent media ${media.fileName} to ${jid}`);

        // Jika teks balasan belum dikirim sebagai caption (misal audio atau tidak ada caption), kirim teks terpisah
        if (textToSend && media.mediaType === 'audio') {
          await this.sendTextMessage(jid, textToSend);
        }
        return;
      } else {
        logger.warn(`[WhatsAppSender] File path non-existent: ${media.filePath}`);
      }
    }

    // 2. Jika hanya pesan teks murni
    if (textToSend) {
      await this.sendTextMessage(jid, textToSend);
    }
  }
}
