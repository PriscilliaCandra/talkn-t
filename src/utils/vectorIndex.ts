import { logger } from './logger.js';

export interface DocumentChunk {
  id: string;
  slideNumber: number;
  title: string;
  content: string;
}

export class InMemoryVectorIndex {
  private chunks: DocumentChunk[] = [];

  /**
   * Menambahkan kumpulan chunk slide ke dalam memori pencarian RAG.
   */
  public indexDocuments(chunks: DocumentChunk[]): void {
    this.chunks = chunks;
    logger.info(`[InMemoryVectorIndex] Indexed ${chunks.length} slide document chunks.`);
  }

  /**
   * Mengambil chunk teratas yang paling relevan dengan query menggunakan TF-IDF / Term Frequency scoring sederhana.
   */
  public searchRelevantChunks(query: string, topK: number = 3): DocumentChunk[] {
    if (this.chunks.length === 0) return [];

    const queryTerms = this.tokenize(query);

    const scored = this.chunks.map((chunk) => {
      const chunkTerms = this.tokenize(`${chunk.title} ${chunk.content}`);
      let score = 0;

      for (const term of queryTerms) {
        const freq = chunkTerms.filter((t) => t === term).length;
        if (freq > 0) {
          score += freq * (term.length > 3 ? 2 : 1);
        }
      }

      return { chunk, score };
    });

    return scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((item) => item.chunk);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/gi, '')
      .split(/\s+/)
      .filter((w) => w.length > 1);
  }

  public clear(): void {
    this.chunks = [];
  }
}
