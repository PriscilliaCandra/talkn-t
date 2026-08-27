import { OpenAI } from 'openai';

export type ChatCompletionTool = OpenAI.Chat.Completions.ChatCompletionTool;

export const AGENT_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'send_local_media',
      description: 'Mendapatkan dan mengirimkan file media lokal (foto, gambar, dokumen PDF, video, atau audio) dari direktori perangkat pengguna ke percakapan WhatsApp.',
      parameters: {
        type: 'object',
        properties: {
          mediaType: {
            type: 'string',
            enum: ['image', 'video', 'document', 'audio'],
            description: 'Jenis media yang ingin dikirim (image, video, document, audio).',
          },
          fileName: {
            type: 'string',
            description: 'Nama atau kata kunci nama file lokal (misal: "sample_doc.txt", "brosur", "foto_produk.jpg").',
          },
          caption: {
            type: 'string',
            description: 'Keterangan/caption teks opsional yang dilampirkan bersama media.',
          },
        },
        required: ['mediaType', 'fileName'],
      },
    },
  },
];
