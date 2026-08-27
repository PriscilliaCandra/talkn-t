import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import officeParser from 'officeparser';
import { logger } from '../utils/logger.js';

export interface SlideData {
  slideNumber: number;
  title: string;
  content: string;
}

export class DocumentParser {
  /**
   * Mengekstrak konten per slide dari file PDF atau PPTX.
   */
  public async parsePresentation(filePath: string): Promise<SlideData[]> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File presentasi tidak ditemukan: ${filePath}`);
    }

    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.pdf') {
      return this.parsePdf(filePath);
    } else if (ext === '.pptx' || ext === '.docx') {
      return this.parseOffice(filePath);
    } else {
      throw new Error(`Format file ${ext} tidak didukung. Gunakan .pdf atau .pptx`);
    }
  }

  private async parsePdf(filePath: string): Promise<SlideData[]> {
    logger.info(`[DocumentParser] Parsing PDF file: ${filePath}`);
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);

    // Membagi teks halaman per Form Feed (\f) atau kata kunci 'Page'
    const pages = pdfData.text.split('\f').filter((p) => p.trim().length > 0);

    return pages.map((pageText, index) => {
      const lines = pageText.trim().split('\n').map((l) => l.trim()).filter(Boolean);
      const title = lines[0] || `Slide ${index + 1}`;
      const content = lines.slice(1).join(' ') || pageText.trim();

      return {
        slideNumber: index + 1,
        title,
        content,
      };
    });
  }

  private async parseOffice(filePath: string): Promise<SlideData[]> {
    logger.info(`[DocumentParser] Parsing Office/PPTX file: ${filePath}`);
    const rawText = await officeParser.parseOfficeAsync(filePath);
    const paragraphs = rawText.split('\n\n').filter((p) => p.trim().length > 0);

    if (paragraphs.length === 0) {
      return [{ slideNumber: 1, title: 'Slide 1', content: rawText }];
    }

    return paragraphs.map((para, index) => {
      const lines = para.split('\n').filter(Boolean);
      return {
        slideNumber: index + 1,
        title: lines[0] || `Slide ${index + 1}`,
        content: lines.join(' '),
      };
    });
  }
}
