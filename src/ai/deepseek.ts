import { OpenAI } from 'openai';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { MemoryBuffer } from './memory.js';
import { PersonaBuilder } from './persona.js';
import { AGENT_TOOLS } from './tools/index.js';
import { LocalMediaTool, SendMediaParams } from './tools/mediaTool.js';

export interface DeepSeekResponse {
  text: string;
  mediaFileToSend?: {
    filePath: string;
    fileName: string;
    mimeType: string;
    caption?: string;
    mediaType: 'image' | 'video' | 'document' | 'audio';
  };
}

export class DeepSeekEngine {
  private openai: OpenAI;
  private memory: MemoryBuffer;
  private mediaTool: LocalMediaTool;
  private customStylisticRules?: string;

  constructor(memoryBuffer?: MemoryBuffer) {
    this.openai = new OpenAI({
      apiKey: env.DEEPSEEK_API_KEY,
      baseURL: env.DEEPSEEK_BASE_URL,
    });
    this.memory = memoryBuffer || new MemoryBuffer();
    this.mediaTool = new LocalMediaTool();
  }

  /**
   * Mengatur aturan gaya penulisan persona yang diperoleh dari PersonaParser.
   */
  public setStylisticRules(rules: string): void {
    this.customStylisticRules = rules;
    logger.info('[DeepSeekEngine] Updated dynamic persona stylistic rules.');
  }

  /**
   * Memproses pesan masuk dari WhatsApp dan mengembalikan respons teks beserta media (jika ada tool call).
   */
  public async generateResponse(jid: string, userMessageText: string): Promise<DeepSeekResponse> {
    try {
      logger.info(`[DeepSeekEngine] Generating response for JID: ${jid}`);

      // 1. Catat pesan user ke dalam memori
      this.memory.addMessage(jid, { role: 'user', content: userMessageText });

      // 2. Susun system prompt
      const systemPrompt = PersonaBuilder.buildSystemPrompt({
        stylisticRules: this.customStylisticRules,
      });

      // 3. Ambil riwayat obrolan terkini
      const history = this.memory.getHistory(jid);
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...history,
      ];

      // 4. Panggil DeepSeek API dengan Tool definitions
      let response = await this.openai.chat.completions.create({
        model: env.DEEPSEEK_MODEL,
        messages,
        tools: AGENT_TOOLS,
        tool_choice: 'auto',
      });

      let choice = response.choices[0];
      let assistantMsg = choice.message;
      let mediaToSendResult: DeepSeekResponse['mediaFileToSend'] = undefined;

      // 5. Tangani Function / Tool Calling jika dipicu oleh DeepSeek
      if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
        // Catat pesan assistant yang meminta tool call ke memori
        this.memory.addMessage(jid, assistantMsg);

        for (const toolCall of assistantMsg.tool_calls) {
          if (toolCall.function.name === 'send_local_media') {
            logger.info(`[DeepSeekEngine] Tool Call Triggered: send_local_media with args: ${toolCall.function.arguments}`);
            const args = JSON.parse(toolCall.function.arguments) as SendMediaParams;

            const toolResult = this.mediaTool.execute(args);

            if (toolResult.success && toolResult.filePath) {
              mediaToSendResult = {
                filePath: toolResult.filePath,
                fileName: toolResult.fileName!,
                mimeType: toolResult.mimeType!,
                caption: toolResult.caption,
                mediaType: toolResult.mediaType || args.mediaType,
              };
            }

            // Tambahkan hasil Tool Execution ke daftar pesan berikutnya ke DeepSeek
            this.memory.addMessage(jid, {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(toolResult),
            });
          }
        }

        // Panggil ulang DeepSeek untuk mendapatkan balasan teks final setelah tool execution
        const updatedHistory = this.memory.getHistory(jid);
        const secondResponse = await this.openai.chat.completions.create({
          model: env.DEEPSEEK_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            ...updatedHistory,
          ],
        });

        assistantMsg = secondResponse.choices[0].message;
      }

      const finalReplyText = assistantMsg.content || '';

      // Catat pesan balasan final assistant ke memori
      if (finalReplyText) {
        this.memory.addMessage(jid, { role: 'assistant', content: finalReplyText });
      }

      return {
        text: finalReplyText,
        mediaFileToSend: mediaToSendResult,
      };

    } catch (error: any) {
      logger.error(`[DeepSeekEngine] Error generating AI response: ${error?.message || error}`, error);
      return {
        text: 'Maaf, terjadi kendala teknis saat memproses respons AI.',
      };
    }
  }
}
