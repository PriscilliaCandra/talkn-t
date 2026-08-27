import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { Boom } from '@hapi/boom';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { MessageHandler } from './handler.js';

export class WhatsAppClient {
  private sock: WASocket | null = null;
  private messageHandler: MessageHandler | null = null;

  public async connect(): Promise<WASocket> {
    logger.info(`[WhatsAppClient] Initializing Baileys session at: ${env.SESSION_ABSOLUTE_PATH}`);

    const { state, saveCreds } = await useMultiFileAuthState(env.SESSION_ABSOLUTE_PATH);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    logger.info(`[WhatsAppClient] Using Baileys v${version.join('.')}, isLatest: ${isLatest}`);

    this.sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false, // Digunakan kustom QR renderer qrcode-terminal
      logger: logger.child({ module: 'baileys' }) as any,
      browser: ['Talkn\'t AI Agent', 'Chrome', '1.0.0'],
    });

    this.messageHandler = new MessageHandler(this.sock);

    // Bind event listeners
    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        logger.info('[WhatsAppClient] Silakan pindai Kode QR di bawah untuk menghubungkan WhatsApp:');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        const shouldReconnect =
          (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;

        logger.warn(
          `[WhatsAppClient] Connection closed due to: ${
            lastDisconnect?.error
          }. Reconnecting: ${shouldReconnect}`
        );

        if (shouldReconnect) {
          setTimeout(() => this.connect(), 3000);
        } else {
          logger.error('[WhatsAppClient] Sesi terputus (logged out). Hapus folder sessions untuk scan ulang QR.');
        }
      } else if (connection === 'open') {
        logger.info('====================================================');
        logger.info('✅ WhatsApp Client Berhasil Terhubung ke Talkn\'t Agent!');
        logger.info('====================================================');
      }
    });

    // Listen incoming messages
    this.sock.ev.on('messages.upsert', (m) => {
      this.messageHandler?.handleMessagesUpsert(m);
    });

    return this.sock;
  }

  public getSocket(): WASocket | null {
    return this.sock;
  }
}
