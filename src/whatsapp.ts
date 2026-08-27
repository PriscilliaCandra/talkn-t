import fs from 'fs';
import path from 'path';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  fetchLatestBaileysVersion,
  BaileysEventMap,
  WAMessage,
  AnyMessageContent,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { Boom } from '@hapi/boom';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { dbService } from './db.js';
import { aiAgentService } from './ai.js';
import { socketService } from './socket.js';

/**
 * Helper untuk memformat JID WhatsApp mentah menjadi nomor HP yang rapi & membedakan Chat Group vs Personal.
 */
export function formatWaNumber(jid: string): { formattedNumber: string; isGroup: boolean; defaultName: string } {
  if (!jid) return { formattedNumber: 'Unknown', isGroup: false, defaultName: 'Kontak WhatsApp' };

  if (jid.endsWith('@g.us')) {
    const groupId = jid.split('@')[0];
    const shortId = groupId.length > 8 ? `${groupId.substring(0, 6)}...` : groupId;
    return {
      formattedNumber: `Grup (${shortId})`,
      isGroup: true,
      defaultName: `👥 Grup WhatsApp (${shortId})`,
    };
  }

  const rawNumber = jid.split('@')[0].replace(/\D/g, '');
  if (!rawNumber) return { formattedNumber: jid, isGroup: false, defaultName: 'Kontak WhatsApp' };

  let formatted = `+${rawNumber}`;
  if (rawNumber.startsWith('62') && rawNumber.length >= 10) {
    const prefix = rawNumber.substring(0, 2); // 62
    const mid = rawNumber.substring(2, 5);   // 8xx
    const rest1 = rawNumber.substring(5, 9);
    const rest2 = rawNumber.substring(9);
    formatted = `+${prefix} ${mid}-${rest1}${rest2 ? '-' + rest2 : ''}`;
  }

  return {
    formattedNumber: formatted,
    isGroup: false,
    defaultName: formatted,
  };
}

export class WhatsAppConnector {
  private sock: WASocket | null = null;

  public async init(): Promise<WASocket> {
    logger.info(`[WhatsAppConnector] Initializing Baileys session at: ${env.SESSION_ABSOLUTE_PATH}`);
    socketService.updateWaStatus('connecting', 'Menyiapkan sesi Baileys WhatsApp...');

    const { state, saveCreds } = await useMultiFileAuthState(env.SESSION_ABSOLUTE_PATH);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    logger.info(`[WhatsAppConnector] Baileys v${version.join('.')}, isLatest: ${isLatest}`);

    this.sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: logger.child({ module: 'baileys' }) as any,
      browser: ['Talkn\'t AI Agent', 'Chrome', '1.0.0'],
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        logger.info('[WhatsAppConnector] Pindai Kode QR berikut untuk menghubungkan WhatsApp:');
        qrcode.generate(qr, { small: true });
        socketService.emitQrCode(qr);
      }

      if (connection === 'close') {
        const shouldReconnect =
          (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;

        logger.warn(`[WhatsAppConnector] Connection closed. Reconnecting: ${shouldReconnect}`);
        socketService.updateWaStatus('disconnected', 'Koneksi WhatsApp terputus.');

        if (shouldReconnect) {
          setTimeout(() => this.init(), 3000);
        }
      } else if (connection === 'open') {
        logger.info('====================================================');
        logger.info('✅ WhatsApp Agent Talkn\'t Berhasil Terhubung!');
        logger.info('====================================================');
        socketService.updateWaStatus('connected', 'Terhubung ke WhatsApp');
      }
    });

    // 1. SINKRONISASI INITIAL CHAT HISTORY (Initial Sync saat WA terhubung)
    this.sock.ev.on('messaging-history.set', async ({ messages, chats }) => {
      logger.info(`[WhatsAppConnector] Initial History Sync: ${chats?.length || 0} chats, ${messages?.length || 0} messages.`);
      
      if (chats && chats.length > 0) {
        for (const chat of chats) {
          if (!chat.id || chat.id === 'status@broadcast') continue;
          const { formattedNumber, defaultName } = formatWaNumber(chat.id);
          const contactName = chat.name || defaultName;

          await dbService.saveMessage({
            jid: chat.id,
            senderNumber: formattedNumber,
            senderName: contactName,
            body: chat.unreadCount ? `[Unread Chat Sync: ${chat.unreadCount} message(s)]` : `[Obrolan WhatsApp Terhubung]`,
            isFromMe: false,
            isAi: false,
          });
        }
      }

      if (messages && messages.length > 0) {
        for (const msg of messages) {
          try {
            await this.processMessage(msg, true);
          } catch (e) {
            // ignore individual sync errors
          }
        }
      }
    });

    // 2. SINKRONISASI CHATS.UPSERT (Tarik kontak & obrolan baru)
    this.sock.ev.on('chats.upsert', async (chats) => {
      logger.info(`[WhatsAppConnector] Syncing chats.upsert (${chats.length} chats)...`);
      for (const chat of chats) {
        if (!chat.id || chat.id === 'status@broadcast') continue;
        const { formattedNumber, defaultName } = formatWaNumber(chat.id);
        const contactName = chat.name || defaultName;

        await dbService.saveMessage({
          jid: chat.id,
          senderNumber: formattedNumber,
          senderName: contactName,
          body: `[Obrolan WhatsApp Aktif]`,
          isFromMe: false,
          isAi: false,
        });
      }
    });

    this.sock.ev.on('messages.upsert', (m) => this.handleMessagesUpsert(m));

    return this.sock;
  }

  public async disconnectSession(): Promise<void> {
    logger.info('[WhatsAppConnector] Disconnecting active WhatsApp session & clearing session storage...');

    try {
      if (this.sock) {
        this.sock.end(new Error('User requested session disconnect'));
        this.sock = null;
      }

      if (fs.existsSync(env.SESSION_ABSOLUTE_PATH)) {
        fs.rmSync(env.SESSION_ABSOLUTE_PATH, { recursive: true, force: true });
        fs.mkdirSync(env.SESSION_ABSOLUTE_PATH, { recursive: true });
      }

      socketService.updateWaStatus('disconnected', 'Sesi WhatsApp berhasil diputuskan.');
      logger.info('[WhatsAppConnector] WhatsApp session successfully disconnected & cleared.');
    } catch (err: any) {
      logger.error(`[WhatsAppConnector] Error disconnecting session: ${err?.message || err}`);
      throw err;
    }
  }

  private async handleMessagesUpsert(event: BaileysEventMap['messages.upsert']): Promise<void> {
    if (event.type !== 'notify') return;

    for (const msg of event.messages) {
      try {
        await this.processMessage(msg);
      } catch (error: any) {
        logger.error(`[WhatsAppConnector] Error handling message: ${error?.message || error}`);
      }
    }
  }

  private async processMessage(msg: WAMessage, isHistorySync = false): Promise<void> {
    if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

    const jid = msg.key.remoteJid;
    if (!jid) return;

    const isFromMe = msg.key.fromMe || false;
    const textContent = this.extractMessageText(msg);

    if (!textContent) return;

    // 1. Parsing Nama & Nomor Telepon (Personal vs Group)
    const { formattedNumber, isGroup, defaultName } = formatWaNumber(jid);
    const senderName = msg.pushName ? msg.pushName : defaultName;

    // 2. Simpan ke PostgreSQL / Database Service
    const savedMsg = await dbService.saveMessage({
      jid,
      senderNumber: formattedNumber,
      senderName,
      body: textContent,
      isFromMe,
      isAi: false,
    });

    // 3. Emit event new_message real-time
    socketService.emitNewMessage(savedMsg);

    // 4. Jika bukan history sync & pesan dari pengirim lain (Personal), jalankan AI Auto-Reply
    if (!isFromMe && !isHistorySync && !isGroup) {
      const autoReplySetting = dbService.getSetting('auto_reply_mode', 'true');
      const isAutoReplyActive = autoReplySetting === 'true' && env.AUTO_REPLY_MODE;

      if (isAutoReplyActive && this.sock) {
        logger.info(`[WhatsAppConnector] Incoming chat from ${senderName} (${formattedNumber}): "${textContent}"`);

        await this.sock.sendPresenceUpdate('composing', jid);
        const aiResponse = await aiAgentService.generateReply(jid, textContent);
        await this.sock.sendPresenceUpdate('paused', jid);

        const replyWithPrefix = env.AUTO_REPLY_PREFIX
          ? `${env.AUTO_REPLY_PREFIX}${aiResponse.replyText}`
          : aiResponse.replyText;

        // Media dispatch
        if (aiResponse.mediaFile) {
          const media = aiResponse.mediaFile;
          if (fs.existsSync(media.filePath)) {
            const buffer = fs.readFileSync(media.filePath);
            let content: AnyMessageContent;

            if (media.mediaType === 'image') {
              content = { image: buffer, caption: media.caption || replyWithPrefix, mimetype: media.mimeType };
            } else if (media.mediaType === 'video') {
              content = { video: buffer, caption: media.caption || replyWithPrefix, mimetype: media.mimeType };
            } else {
              content = { document: buffer, fileName: media.fileName, mimetype: media.mimeType, caption: media.caption || replyWithPrefix };
            }

            await this.sock.sendMessage(jid, content);

            const savedAiMediaMsg = await dbService.saveMessage({
              jid,
              senderNumber: 'Me (AI)',
              senderName: env.BOT_NAME,
              body: `[Media Sent: ${media.fileName}] ${media.caption || ''}`,
              isFromMe: true,
              isAi: true,
            });
            socketService.emitNewMessage(savedAiMediaMsg);
            return;
          }
        }

        // Text reply
        if (replyWithPrefix) {
          await this.sock.sendMessage(jid, { text: replyWithPrefix });

          const savedAiMsg = await dbService.saveMessage({
            jid,
            senderNumber: 'Me (AI)',
            senderName: env.BOT_NAME,
            body: replyWithPrefix,
            isFromMe: true,
            isAi: true,
          });
          socketService.emitNewMessage(savedAiMsg);
        }
      }
    }
  }

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

export const waConnector = new WhatsAppConnector();
