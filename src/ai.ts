import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import { OpenAI } from 'openai';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { dbService, ChatRecord } from './db.js';

export interface AiResponseResult {
  replyText: string;
  mediaFile?: {
    filePath: string;
    fileName: string;
    mimeType: string;
    mediaType: 'image' | 'video' | 'document' | 'audio';
    caption?: string;
  };
}

export class AiAgentService {
  private openai: OpenAI;
  private mediaAssetsDir: string;

  constructor() {
    this.openai = new OpenAI({
      apiKey: env.DEEPSEEK_API_KEY,
      baseURL: env.DEEPSEEK_BASE_URL,
    });
    this.mediaAssetsDir = path.resolve('./media_assets');
    this.ensureMediaAssetsDirectory();
  }

  private ensureMediaAssetsDirectory(): void {
    if (!fs.existsSync(this.mediaAssetsDir)) {
      fs.mkdirSync(this.mediaAssetsDir, { recursive: true });
    }
  }

  /**
   * Menghasilkan balasan AI dari DeepSeek berdasarkan riwayat chat dari SQLite.
   */
  public async generateReply(jid: string, userMessageText: string): Promise<AiResponseResult> {
    logger.info(`[AiAgentService] Processing AI reply for JID ${jid}: "${userMessageText}"`);

    // 1. Ambil 15 riwayat pesan terakhir dari SQLite
    const historyRecords = dbService.getRecentChatHistory(jid, 15);

    // 2. Susun System Prompt Persona
    const systemPrompt = this.buildPersonaSystemPrompt();

    // 3. Format riwayat ke OpenAI message params
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...historyRecords
        .filter((r) => r.role === 'user' || r.role === 'assistant' || r.role === 'system')
        .map((r) => ({
          role: r.role as 'user' | 'assistant' | 'system',
          content: r.content,
        })),
      { role: 'user', content: userMessageText },
    ];

    // 4. Panggil DeepSeek API dengan Function Calling Tools
    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: 'function',
        function: {
          name: 'send_media_asset',
          description: 'Mengambil dan mengirimkan berkas media lokal (foto, PDF, dokumen, video, brosur) dari folder ./media_assets ke kontak WhatsApp.',
          parameters: {
            type: 'object',
            properties: {
              fileName: {
                type: 'string',
                description: 'Nama atau kata kunci file yang diminta (misal: "sample_brochure.pdf", "brosur", "katalog").',
              },
              mediaType: {
                type: 'string',
                enum: ['image', 'document', 'video', 'audio'],
                description: 'Jenis media file yang dikirim.',
              },
              caption: {
                type: 'string',
                description: 'Caption opsional yang dilampirkan bersama berkas.',
              },
            },
            required: ['fileName', 'mediaType'],
          },
        },
      },
    ];

    let completion = await this.openai.chat.completions.create({
      model: env.DEEPSEEK_MODEL,
      messages,
      tools,
      tool_choice: 'auto',
    });

    let assistantMsg = completion.choices[0].message;
    let resolvedMedia: AiResponseResult['mediaFile'] = undefined;

    // 5. Tangani Tool Calling jika dipicu oleh DeepSeek
    if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      for (const toolCall of assistantMsg.tool_calls) {
        if (toolCall.function.name === 'send_media_asset') {
          const args = JSON.parse(toolCall.function.arguments);
          logger.info(`[AiAgentService] DeepSeek Tool Call Triggered: send_media_asset (${args.fileName})`);

          const foundFile = this.resolveMediaAsset(args.fileName);

          if (foundFile) {
            const detectedMime = mime.lookup(foundFile) || 'application/octet-stream';
            resolvedMedia = {
              filePath: foundFile,
              fileName: path.basename(foundFile),
              mimeType: detectedMime,
              mediaType: args.mediaType || 'document',
              caption: args.caption,
            };
          }

          // Masukkan feedback tool execution
          messages.push(assistantMsg);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              success: !!foundFile,
              filePath: foundFile || 'File tidak ditemukan di ./media_assets',
            }),
          });

          // Re-query DeepSeek untuk balasan teks akhir
          const secondCompletion = await this.openai.chat.completions.create({
            model: env.DEEPSEEK_MODEL,
            messages,
          });

          assistantMsg = secondCompletion.choices[0].message;
        }
      }
    }

    return {
      replyText: assistantMsg.content || '',
      mediaFile: resolvedMedia,
    };
  }

  private buildPersonaSystemPrompt(): string {
    const activePersona = dbService.getSetting('active_persona', 'introvert_casual');

    return `Kamu adalah AI Agent Personal bernama "${env.BOT_NAME}" yang bertindak atas nama ${env.USER_NAME} di WhatsApp.

[GAYA BAHASA & PERSONA KAS ${env.USER_NAME} (${activePersona})]
- Berbicaralah dengan gaya santai, agak hemat kata (introvert casual), ramah, dan rendah hati.
- Hindari bahasa yang terlalu baku, formal, atau berbelit-belit seperti robot customer service.
- Sering gunakan huruf kecil, kata-kata santai Indonesia (seperti: "wkwk", "siap", "yoi", "gitu", "gak", "ya"), dan tanda baca yang luwes.
- Jika ada yang meminta brosur, dokumen, foto, atau katalog produk, GUNAKAN function tool \`send_media_asset\`.
`;
  }

  private resolveMediaAsset(queryFileName: string): string | null {
    if (!fs.existsSync(this.mediaAssetsDir)) return null;

    const files = fs.readdirSync(this.mediaAssetsDir);
    const target = queryFileName.toLowerCase();

    const exact = files.find((f) => f.toLowerCase() === target);
    if (exact) return path.join(this.mediaAssetsDir, exact);

    const partial = files.find((f) => f.toLowerCase().includes(target) || target.includes(f.toLowerCase()));
    if (partial) return path.join(this.mediaAssetsDir, partial);

    return null;
  }
}

export const aiAgentService = new AiAgentService();
