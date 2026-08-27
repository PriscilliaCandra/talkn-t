import { OpenAI } from 'openai';
import { logger } from '../utils/logger.js';

export type ChatCompletionMessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export class MemoryBuffer {
  private memoryMap = new Map<string, ChatCompletionMessageParam[]>();
  private maxHistoryPerJid: number;

  constructor(maxHistoryPerJid = 15) {
    this.maxHistoryPerJid = maxHistoryPerJid;
  }

  /**
   * Menambahkan pesan baru ke memori percakapan untuk JID tertentu.
   */
  public addMessage(jid: string, message: ChatCompletionMessageParam): void {
    if (!this.memoryMap.has(jid)) {
      this.memoryMap.set(jid, []);
    }

    const history = this.memoryMap.get(jid)!;
    history.push(message);

    // Truncate jika melampaui batas riwayat maks
    if (history.length > this.maxHistoryPerJid) {
      this.memoryMap.set(jid, history.slice(history.length - this.maxHistoryPerJid));
    }

    logger.debug(`[MemoryBuffer] Updated context for ${jid}, total messages: ${this.getHistory(jid).length}`);
  }

  /**
   * Mengambil riwayat percakapan untuk JID tertentu.
   */
  public getHistory(jid: string): ChatCompletionMessageParam[] {
    return this.memoryMap.get(jid) || [];
  }

  /**
   * Mengosongkan riwayat percakapan JID.
   */
  public clearHistory(jid: string): void {
    this.memoryMap.delete(jid);
    logger.info(`[MemoryBuffer] Cleared history for ${jid}`);
  }
}
