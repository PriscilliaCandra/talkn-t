import { WASocket, BaileysEventMap, WAMessage } from '@whiskeysockets/baileys';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { DeepSeekEngine } from '../ai/deepseek.js';
import { WhatsAppSender } from './sender.js';
import { PersonaParser } from '../analytics/personaParser.js';

export class MessageHandler {
  private sock: WASocket;
  private deepseekEngine: DeepSeekEngine;
  private sender: WhatsAppSender;
  private personaParser: PersonaParser;
  private userMessageHistoryBuffer: string[] = [];

  constructor(sock: WASocket) {
    this.sock = sock;
    this.deepseekEngine = new DeepSeekEngine();
    this.sender = new WhatsAppSender(sock);
    this.personaParser = new PersonaParser();
  }

  /**
   * Listener utama penanganan pesan WhatsApp masuk (`messages.upsert`).
   */
  public async handleMessagesUpsert(event: BaileysEventMap['messages.upsert']): Promise<void> {
    if (event.type !== 'notify') return;

    for (const msg of event.messages) {
      try {
        await this.processSingleMessage(msg);
      } catch (error: any) {
        logger.error(`[MessageHandler] Error processing message: ${error?.message || error}`);
      }
    }
  }

  private async processSingleMessage(msg: WAMessage): Promise<void> {
    // Abaikan pesan jika tidak memiliki konten pesan atau merupakan pesan status/broadcast
    if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

    const jid = msg.key.remoteJid;
    if (!jid) return;

    const isFromMe = msg.key.fromMe || false;
    const messageContent = this.extractMessageText(msg);

    if (!messageContent) return;

    // Rekam pesan dari diri sendiri (pengguna) untuk pembelajaran gaya bahasa (Persona Adaption)
    if (isFromMe) {
      this.learnFromUserMessage(messageContent);
      return;
    }

    // Jika pesan masuk berasal dari kontak lain dan AUTO_REPLY_MODE diaktifkan
    if (env.AUTO_REPLY_MODE) {
      logger.info(`[MessageHandler] Incoming chat from ${jid}: "${messageContent}"`);

      // Tampilkan indikator mengetik di WhatsApp
      await this.sock.sendPresenceUpdate('composing', jid);

      // Minta respons dari DeepSeek Agent Engine
      const aiResult = await this.deepseekEngine.generateResponse(jid, messageContent);

      // Hentikan indikator mengetik
      await this.sock.sendPresenceUpdate('paused', jid);

      // Kirim pesan balasan teks & media via WhatsAppSender
      await this.sender.sendAIResponse(jid, aiResult, env.AUTO_REPLY_PREFIX);
    }
  }

  /**
   * Merekam percakapan pengguna untuk memperbarui prompt gaya penulisan secara dinamis.
   */
  private learnFromUserMessage(text: string): void {
    this.userMessageHistoryBuffer.push(text);
    // Jalankan analisis persona setiap kali terkumpul 10+ sampel pesan baru
    if (this.userMessageHistoryBuffer.length >= 10) {
      const metrics = this.personaParser.analyzeUserMessages(this.userMessageHistoryBuffer);
      logger.info(`[PersonaLearner] Dynamic style prompt updated based on ${metrics.totalMessagesAnalyzed} user messages.`);
      this.deepseekEngine.setStylisticRules(metrics.styleDescription);
    }
  }

  /**
   * Ekstraksi teks murni dari berbagai struktur objek pesan Baileys.
   */
  private extractMessageText(msg: WAMessage): string | null {
    const m = msg.message;
    if (!m) return null;

    return (
      m.conversation ||
      m.extendedTextMessage?.text ||
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      m.documentMessage?.caption ||
      null
    );
  }
}
