import { logger } from '../utils/logger.js';

export interface ChatMessageSample {
  sender: string;
  text: string;
  timestamp?: number;
}

export interface PersonaMetrics {
  totalMessagesAnalyzed: number;
  averageWordCount: number;
  lowercaseRatio: number;
  useEllipsisRatio: number;
  useExclamationRatio: number;
  topSlangWords: Array<{ word: string; count: number }>;
  styleDescription: string;
}

const COMMON_INDONESIAN_SLANG = [
  'wkwk', 'wkwkwk', 'wkwkwkwk', 'wkwkw', 'kwkw', 'hehe', 'haha', 'bjir', 'anjir',
  'yoi', 'siap', 'gas', 'mantap', 'gitu', 'gimana', 'aja', 'dulu', 'dah', 'deh',
  'dong', 'ya', 'gak', 'nggak', 'ga', 'bisa', 'kek', 'kayak', 'kan', 'lah'
];

export class PersonaParser {
  /**
   * Menganalisis sampel percakapan pengirim (user target) untuk mengekstrak gaya penulisan & persona.
   */
  public analyzeUserMessages(messages: string[]): PersonaMetrics {
    const validMessages = messages.filter((m) => m && m.trim().length > 0);

    if (validMessages.length === 0) {
      logger.warn('[PersonaParser] Tidak ada pesan valid untuk dianalisis.');
      return this.getDefaultMetrics();
    }

    let totalWords = 0;
    let lowercaseCount = 0;
    let ellipsisCount = 0;
    let exclamationCount = 0;
    const wordFrequency: Record<string, number> = {};

    for (const msg of validMessages) {
      const trimmed = msg.trim();
      const words = trimmed.toLowerCase().replace(/[^\w\s]/gi, '').split(/\s+/).filter(Boolean);

      totalWords += words.length;

      // Check lowercase style (pesan diawali huruf kecil atau hampir seluruhnya lowercase)
      if (trimmed === trimmed.toLowerCase()) {
        lowercaseCount++;
      }

      // Check punctuation
      if (trimmed.includes('...')) {
        ellipsisCount++;
      }
      if (trimmed.includes('!') || trimmed.includes('!!')) {
        exclamationCount++;
      }

      // Count slang frequency
      for (const word of words) {
        if (COMMON_INDONESIAN_SLANG.includes(word)) {
          wordFrequency[word] = (wordFrequency[word] || 0) + 1;
        }
      }
    }

    const total = validMessages.length;
    const avgWords = Math.round(totalWords / total);
    const lowercaseRatio = lowercaseCount / total;
    const ellipsisRatio = ellipsisCount / total;
    const exclamationRatio = exclamationCount / total;

    const sortedSlang = Object.entries(wordFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([word, count]) => ({ word, count }));

    const styleDescription = this.generateStylePromptSnippet({
      avgWords,
      lowercaseRatio,
      ellipsisRatio,
      exclamationRatio,
      topSlang: sortedSlang.map((s) => s.word),
    });

    return {
      totalMessagesAnalyzed: total,
      averageWordCount: avgWords,
      lowercaseRatio,
      useEllipsisRatio: ellipsisRatio,
      useExclamationRatio: exclamationRatio,
      topSlangWords: sortedSlang,
      styleDescription,
    };
  }

  private generateStylePromptSnippet(data: {
    avgWords: number;
    lowercaseRatio: number;
    ellipsisRatio: number;
    exclamationRatio: number;
    topSlang: string[];
  }): string {
    const rules: string[] = [];

    // Panjang kalimat
    if (data.avgWords <= 5) {
      rules.push('- Gunakan balasan yang ringkas dan singkat (sekitar 1-5 kata per pesan).');
    } else if (data.avgWords <= 12) {
      rules.push('- Jawab dengan panjang kalimat sedang dan langsung ke tujuan.');
    } else {
      rules.push('- Balas dengan kalimat yang lebih detail dan komprehensif.');
    }

    // Huruf kapital
    if (data.lowercaseRatio > 0.6) {
      rules.push('- Cenderung memakai huruf kecil semua (lowercase) tanpa memperdulikan kapitalisasi standar.');
    } else {
      rules.push('- Gunakan kapitalisasi huruf normal.');
    }

    // Tanda baca
    if (data.ellipsisRatio > 0.25) {
      rules.push('- Sering menyisipkan tanda titik-titik (...) di akhir kalimat atau jeda.');
    }
    if (data.exclamationRatio > 0.25) {
      rules.push('- Sering menggunakan tanda seru (!) untuk mengekspresikan antusiasme.');
    } else {
      rules.push('- Jarang memakai tanda baca formal atau titik di akhir balasan.');
    }

    // Kosakata / Slang favorit
    if (data.topSlang.length > 0) {
      rules.push(`- Kosakata & ekspresi favorit yang sering dipakai: ${data.topSlang.join(', ')}.`);
    }

    return rules.join('\n');
  }

  private getDefaultMetrics(): PersonaMetrics {
    return {
      totalMessagesAnalyzed: 0,
      averageWordCount: 6,
      lowercaseRatio: 0.8,
      useEllipsisRatio: 0.1,
      useExclamationRatio: 0.1,
      topSlangWords: [{ word: 'wkwk', count: 5 }, { word: 'siap', count: 3 }],
      styleDescription: '- Balas pesan dengan santai, singkat, huruf kecil, dan sesekali gunakan kata santai seperti "wkwk" atau "siap".',
    };
  }
}
