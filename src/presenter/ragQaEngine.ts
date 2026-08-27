import { OpenAI } from 'openai';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { InMemoryVectorIndex, DocumentChunk } from '../utils/vectorIndex.js';
import { SlideData } from './docParser.js';

export interface QaAnswerResult {
  questionText: string;
  answerText: string;
  referencedSlides: number[];
}

export class RagQaEngine {
  private openai: OpenAI;
  private vectorIndex: InMemoryVectorIndex;

  constructor() {
    this.openai = new OpenAI({
      apiKey: env.DEEPSEEK_API_KEY,
      baseURL: env.DEEPSEEK_BASE_URL,
    });
    this.vectorIndex = new InMemoryVectorIndex();
  }

  /**
   * Mengisi indeks RAG dari slide presentasi yang diunggah.
   */
  public loadPresentationSlides(slides: SlideData[]): void {
    const chunks: DocumentChunk[] = slides.map((s) => ({
      id: `slide_${s.slideNumber}`,
      slideNumber: s.slideNumber,
      title: s.title,
      content: s.content,
    }));

    this.vectorIndex.indexDocuments(chunks);
  }

  /**
   * Memproses pertanyaan audiens (dari STT) menggunakan DeepSeek + RAG untuk memberikan jawaban instan bagi presenter.
   */
  public async answerAudienceQuestion(questionText: string): Promise<QaAnswerResult> {
    logger.info(`[RagQaEngine] Processing audience question: "${questionText}"`);

    // 1. Ambil chunk slide paling relevan dari memori RAG
    const relevantChunks = this.vectorIndex.searchRelevantChunks(questionText, 3);
    const referencedSlides = relevantChunks.map((c) => c.slideNumber);

    const contextText = relevantChunks.length > 0
      ? relevantChunks.map((c) => `[Slide ${c.slideNumber}: ${c.title}]\n${c.content}`).join('\n\n')
      : 'Tidak ada slide khusus yang cocok.';

    // 2. Susun prompt RAG untuk DeepSeek
    const systemPrompt = `Kamu adalah Co-Pilot Presenter Public Speaking.
Tugasmu adalah memberikan draf jawaban INSTAN, SINGKAT, TEGAS, dan JELAS (maksimal 2-3 kalimat) untuk menjawab pertanyaan audiens secara langsung berdasarkan dokumen presentasi.

[KONTEKS SLIDE PRESENTASI]:
${contextText}

[ATURAN]:
- Berikan jawaban yang tepat sasaran agar pembicara dapat langsung membacakannya atau menggunakannya sebagai acuan bicara.
- Jika dokumen tidak memuat info spesifik, berikan diplomasi jawaban yang profesional.`;

    const completion = await this.openai.chat.completions.create({
      model: env.DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Pertanyaan Audiens: "${questionText}"` },
      ],
    });

    const answerText = completion.choices[0].message.content || 'Maaf, data tidak ditemukan dalam slide.';

    return {
      questionText,
      answerText,
      referencedSlides,
    };
  }
}
