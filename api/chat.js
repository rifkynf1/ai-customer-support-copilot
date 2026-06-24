import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'node:fs';
import path from 'node:path';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // Apply CORS headers to all responses
  Object.entries(CORS_HEADERS).forEach(([key, value]) => res.setHeader(key, value));

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const { message, history } = req.body ?? {};

  if (!message || typeof message !== 'string' || message.trim() === '') {
    res.status(400).json({ error: 'Field "message" wajib diisi dan tidak boleh kosong.' });
    return;
  }

  try {
    // Baca rules.md secara dinamis dari root project.
    // process.cwd() di Vercel Serverless selalu menunjuk ke root folder project,
    // bukan ke direktori file ini — inilah cara yang benar untuk membaca file statis.
    const rulesPath = path.join(process.cwd(), 'rules.md');
    const systemInstruction = await fs.promises.readFile(rulesPath, 'utf-8');

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: systemInstruction,
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 1024,
      },
    });

    // Bangun history dalam format yang dibutuhkan Gemini SDK.
    // Frontend mengirim array { role: 'user'|'model', parts: [{ text: string }] }
    const safeHistory = Array.isArray(history)
      ? history.filter(
          (turn) =>
            turn &&
            (turn.role === 'user' || turn.role === 'model') &&
            Array.isArray(turn.parts) &&
            turn.parts.length > 0
        )
      : [];

    const chat = model.startChat({ history: safeHistory });

    const result = await chat.sendMessage(message.trim());
    const responseText = result.response.text();

    res.status(200).json({ reply: responseText });
  } catch (err) {
    console.error('[KopiBot API Error]', err);

    const isApiKeyError =
      err.message?.includes('API_KEY') || err.message?.includes('API key');

    res.status(500).json({
      error: isApiKeyError
        ? 'Konfigurasi API key tidak valid. Periksa environment variable GEMINI_API_KEY.'
        : 'Terjadi kesalahan pada server. Silakan coba lagi.',
    });
  }
}
