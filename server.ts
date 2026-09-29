import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  app.use(express.json());

  // Initialize Gemini client on server-side with recommended settings
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || 'dummy_key',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // API endpoint for Gemini High Thinking Operations Analysis
  app.post('/api/ai-analysis', async (req, res) => {
    try {
      const { prompt, contextData } = req.body;
      
      const systemInstruction = `You are Sarfaraz Nawab's Senior Operations Intelligence Agent for EMO Hub Wise. You analyze 19 delivery hubs with 100% accuracy. You provide expert logistical insights, root-cause analysis for critical hubs (<50% or delayed EMO), and actionable recommendations to achieve 100% on-time delivery.`;

      const userPrompt = `Context Data Summary: ${JSON.stringify(contextData || {})}
      
      User Query: ${prompt || "Analyze today's EMO Hub operations and identify bottlenecks."}`;

      // Using gemini-3.1-pro-preview with ThinkingLevel.HIGH and no maxOutputTokens as requested
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: userPrompt,
        config: {
          systemInstruction,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH,
          },
          temperature: 0.7,
        },
      });

      res.json({ analysis: response.text || 'No response generated.' });
    } catch (error: any) {
      console.error('Gemini AI Error:', error);
      res.status(500).json({ error: error.message || 'AI analysis failed' });
    }
  });

  // Vite middleware for development
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  app.use(vite.middlewares);

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
