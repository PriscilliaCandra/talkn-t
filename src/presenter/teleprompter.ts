import http from 'http';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../utils/logger.js';
import { DocumentParser } from './docParser.js';
import { SlideNarrator, SlideScript } from './narrator.js';
import { RagQaEngine } from './ragQaEngine.js';

export class TeleprompterServer {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocketServer;
  private docParser: DocumentParser;
  private narrator: SlideNarrator;
  private qaEngine: RagQaEngine;

  private currentSlideIndex = 0;
  private activeScripts: SlideScript[] = [];

  constructor(app: express.Application, server: http.Server) {
    this.app = app;
    this.server = server;
    this.wss = new WebSocketServer({ server, path: '/ws/teleprompter' });

    this.docParser = new DocumentParser();
    this.narrator = new SlideNarrator();
    this.qaEngine = new RagQaEngine();

    this.setupRoutes();
    this.setupWebSockets();
  }

  private setupRoutes(): void {
    this.app.use(express.json());

    // API Upload & Process Document Presentasi
    this.app.post('/api/presenter/upload', async (req, res) => {
      try {
        const { filePath } = req.body;
        if (!filePath) {
          return res.status(400).json({ error: 'filePath wajib diisi' });
        }

        logger.info(`[TeleprompterServer] Processing uploaded document: ${filePath}`);
        const slides = await this.docParser.parsePresentation(filePath);

        // Load ke RAG QA Engine
        this.qaEngine.loadPresentationSlides(slides);

        // Generate Naskah Narasi per Slide
        this.activeScripts = [];
        for (const slide of slides) {
          const script = await this.narrator.generateSlideScript(slide);
          this.activeScripts.push(script);
        }

        this.currentSlideIndex = 0;
        this.broadcastState();

        return res.json({
          message: 'Dokumen presentasi berhasil diproses.',
          totalSlides: this.activeScripts.length,
          slides: this.activeScripts,
        });
      } catch (err: any) {
        logger.error(`[TeleprompterServer] Error processing upload: ${err?.message || err}`);
        return res.status(500).json({ error: err?.message || 'Gagal memproses dokumen' });
      }
    });

    // API Navigation Slide
    this.app.post('/api/presenter/navigate', (req, res) => {
      const { direction, slideNumber } = req.body;

      if (typeof slideNumber === 'number') {
        this.currentSlideIndex = Math.max(0, Math.min(slideNumber - 1, this.activeScripts.length - 1));
      } else if (direction === 'next') {
        this.currentSlideIndex = Math.min(this.currentSlideIndex + 1, this.activeScripts.length - 1);
      } else if (direction === 'prev') {
        this.currentSlideIndex = Math.max(this.currentSlideIndex - 1, 0);
      }

      this.broadcastState();
      return res.json({ currentSlide: this.currentSlideIndex + 1, activeScript: this.activeScripts[this.currentSlideIndex] });
    });

    // API Q&A Trigger dari Microphone STT
    this.app.post('/api/presenter/qa', async (req, res) => {
      try {
        const { questionText } = req.body;
        if (!questionText) {
          return res.status(400).json({ error: 'questionText wajib diisi' });
        }

        const qaResult = await this.qaEngine.answerAudienceQuestion(questionText);

        // Siarkan jawaban Q&A instan ke layar Teleprompter secara real-time
        this.broadcastEvent('qa_suggestion', qaResult);

        return res.json(qaResult);
      } catch (err: any) {
        logger.error(`[TeleprompterServer] Q&A error: ${err?.message || err}`);
        return res.status(500).json({ error: err?.message });
      }
    });

    // Web Teleprompter Dashboard HTML UI
    this.app.get('/teleprompter', (_req, res) => {
      res.send(this.renderTeleprompterHtml());
    });
  }

  private setupWebSockets(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      logger.info('[TeleprompterServer] Client Teleprompter UI connected via WebSocket');
      
      // Kirim state saat ini ke client yang baru terhubung
      ws.send(JSON.stringify({ event: 'state_update', data: this.getCurrentState() }));

      ws.on('message', (message: string) => {
        try {
          const parsed = JSON.parse(message);
          if (parsed.event === 'next_slide') {
            this.currentSlideIndex = Math.min(this.currentSlideIndex + 1, this.activeScripts.length - 1);
            this.broadcastState();
          } else if (parsed.event === 'prev_slide') {
            this.currentSlideIndex = Math.max(this.currentSlideIndex - 1, 0);
            this.broadcastState();
          }
        } catch (e) {
          logger.warn(`[TeleprompterServer] Invalid WebSocket message received: ${message}`);
        }
      });
    });
  }

  private getCurrentState() {
    return {
      currentSlideIndex: this.currentSlideIndex,
      currentSlideNumber: this.currentSlideIndex + 1,
      totalSlides: this.activeScripts.length,
      currentScript: this.activeScripts[this.currentSlideIndex] || null,
    };
  }

  private broadcastState(): void {
    this.broadcastEvent('state_update', this.getCurrentState());
  }

  private broadcastEvent(event: string, data: any): void {
    const payload = JSON.stringify({ event, data });
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  private renderTeleprompterHtml(): string {
    return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Talkn't Public Speaking Teleprompter & Live Cue</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
    .container { max-width: 1000px; margin: 0 auto; display: grid; grid-template-columns: 2fr 1fr; gap: 20px; }
    .card { background: #1e293b; border-radius: 12px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
    h1, h2, h3 { color: #38bdf8; margin-top: 0; }
    .script-box { font-size: 1.6rem; line-height: 1.6; color: #e2e8f0; background: #020617; padding: 20px; border-radius: 8px; border-left: 5px solid #38bdf8; min-height: 200px; }
    .cue-list { list-style-type: square; font-size: 1.2rem; color: #facc15; }
    .qa-box { background: #312e81; border-radius: 8px; padding: 15px; border-left: 5px solid #818cf8; margin-top: 15px; }
    .controls { display: flex; gap: 10px; margin-top: 15px; }
    button { background: #0284c7; color: white; border: none; padding: 12px 24px; font-size: 1rem; border-radius: 6px; cursor: pointer; }
    button:hover { background: #0369a1; }
  </style>
</head>
<body>
  <h1>🎤 Talkn't Public Speaking Co-Pilot</h1>
  <div class="container">
    <div class="card">
      <h2 id="slideTitle">Judul Slide</h2>
      <div class="script-box" id="scriptText">Memuat naskah presentasi...</div>
      <div class="controls">
        <button onclick="sendNav('prev_slide')">⬅ Slide Sebelumnya</button>
        <button onclick="sendNav('next_slide')">Slide Berikutnya ➡</button>
      </div>
    </div>
    <div class="card">
      <h3>📌 Live Cue Points</h3>
      <ul class="cue-list" id="cueList"><li>Siap presentasi</li></ul>
      <h3>💡 Live Q&A Suggestion</h3>
      <div class="qa-box" id="qaBox">Pertanyaan audiens akan muncul di sini secara instan via RAG...</div>
    </div>
  </div>

  <script>
    const ws = new WebSocket('ws://' + window.location.host + '/ws/teleprompter');
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.event === 'state_update' && msg.data.currentScript) {
        const s = msg.data.currentScript;
        document.getElementById('slideTitle').innerText = 'Slide ' + s.slideNumber + ': ' + s.title;
        document.getElementById('scriptText').innerText = s.presentationScript;
        document.getElementById('cueList').innerHTML = s.bulletCues.map(c => '<li>' + c + '</li>').join('');
      } else if (msg.event === 'qa_suggestion') {
        const q = msg.data;
        document.getElementById('qaBox').innerHTML = '<strong>Q: ' + q.questionText + '</strong><br><br>👉 <em>' + q.answerText + '</em> (Ref Slide: ' + q.referencedSlides.join(', ') + ')';
      }
    };
    function sendNav(ev) { ws.send(JSON.stringify({ event: ev })); }
  </script>
</body>
</html>`;
  }
}
