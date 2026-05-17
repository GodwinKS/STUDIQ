import { useState, useEffect } from "react";

export function useSaathiSettings() {
  const [isLocal, setIsLocal] = useState(isLocalMode());
  const [model, setModel] = useState(getLocalModel());

  useEffect(() => {
    const handleUpdate = () => {
      setIsLocal(isLocalMode());
      setModel(getLocalModel());
    };
    window.addEventListener('saathi_settings_changed', handleUpdate);
    return () => window.removeEventListener('saathi_settings_changed', handleUpdate);
  }, []);

  return { isLocal, model };
}

function getGenAI() {
  // Client-side call to our proxy server
  return {
    models: {
      generateContent: async (data: any) => {
        const response = await fetch('/api/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || "Cloud AI Error");
        }
        const result = await response.json();
        return { text: result.text };
      }
    }
  };
}

const osControlTools: any = [
  {
    functionDeclarations: [
      {
        name: "dim_screen",
        description: "Dims the screen brightness to reduce eye strain or signal a distraction.",
        parameters: {
          type: "object",
          properties: {
            brightnessPercent: {
              type: "number",
              description: "The brightness level (0-100)",
            },
          },
          required: ["brightnessPercent"],
        },
      },
      {
        name: "mute_notifications",
        description: "Mutes all system notifications to enable deep focus mode.",
      },
    ],
  },
];

export const isLocalMode = () => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('saathi_local_mode') === 'true';
};

export const getLocalModel = () => {
  if (typeof window === 'undefined') return "gemma4:e4b";
  return localStorage.getItem('saathi_local_model') || "gemma4:e4b";
};

export const setLocalModel = (model: string) => {
  localStorage.setItem('saathi_local_model', model);
  window.dispatchEvent(new Event('saathi_settings_changed'));
};

export const setLocalMode = (enabled: boolean) => {
  localStorage.setItem('saathi_local_mode', String(enabled));
  window.dispatchEvent(new Event('saathi_settings_changed'));
};

const OLLAMA_URL = "/api/ollama/api/generate";

async function callOllama(prompt: string, images?: string[]) {
  const model = getLocalModel();
  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model,
      prompt: prompt,
      images: images || [],
      format: (prompt.toLowerCase().includes('json')) ? 'json' : undefined,
      stream: false,
    }),
  });
  
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "Local Ollama server reachable but responded with error.");
  }
  const data = await response.json();
  return { text: () => data.response };
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 10): Promise<T> {
  if (isLocalMode()) return fn();
  
  let lastError: any;
  const initialDelay = 1000;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const originalMessage = err?.message || String(err);
      const errorMessage = originalMessage.toLowerCase();
      
      const isQuotaError = errorMessage.includes("resource_exhausted") || 
                           errorMessage.includes("429") ||
                           err?.status === 429;
      
      const isTransientError = errorMessage.includes("failed to fetch") || 
                               errorMessage.includes("connection");

      if ((isQuotaError || isTransientError) && i < maxRetries - 1) {
        const delay = (initialDelay * Math.pow(1.5, i)) + (Math.random() * i * 200);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export type TaskType = 'explain' | 'focus';
export type Language = 'hindi' | 'malayalam' | 'english' | 'tamil' | 'punjabi' | 'kannada' | 'telugu';

export async function generateSmartNotes(fileBase64: string, mimeType: string, isHandwritten: boolean = false) {
  try {
    const isAudioVideo = mimeType.startsWith('audio/') || mimeType.startsWith('video/');
    let prompt = `Act as Saathi-OS Study Assistant. Transform this media into structured study notes with core summary, detailed breakdown, and recall questions. Use Markdown.`;

    if (isLocalMode()) {
      const cleanBase64 = fileBase64.replace(/^data:image\/\w+;base64,/, "");
      const response = await callOllama(prompt, [cleanBase64]);
      return response.text();
    }

    const mediaPart = { inlineData: { mimeType, data: fileBase64.replace(/^data:.*?;base64,/, "") } };
    const ai = getGenAI();
    const response = await withRetry(() => ai.models.generateContent({
      prompt,
      fileBase64: mediaPart.inlineData.data,
      mimeType: mediaPart.inlineData.mimeType
    }));
    return typeof response === 'string' ? response : response.text;
  } catch (err: any) {
    return handleApiError(err);
  }
}

export async function generateSmartNotesFromUrl(url: string) {
  try {
    const promptPrefix = `Act as Saathi-OS. Transform the following web content into comprehensive study notes. Use Markdown with clear headings and bullet points. Output only the study notes. CONTENT: `;
    let scrapedContent = "";
    
    if (isLocalMode()) {
      // Offline mode: Attempt to scrape using the bridge
      try {
        const scrapeRes = await fetch('/api/bridge/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        if (scrapeRes.ok) {
          const scrapeData = await scrapeRes.json();
          scrapedContent = scrapeData.text;
        }
      } catch (scrapeErr) {
        console.warn("Bridge scraper failed, falling back to basic prompt.", scrapeErr);
      }
    } else {
      // Cloud mode: Use our server proxy scraper
      try {
        const scrapeRes = await fetch('/api/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        if (scrapeRes.ok) {
          const scrapeData = await scrapeRes.json();
          scrapedContent = scrapeData.text;
        }
      } catch (scrapeErr) {
        console.warn("Cloud scraper failed.", scrapeErr);
      }
    }

    if (!scrapedContent) {
      throw new Error("Unable to fetch website content. Please ensure the URL is valid and accessible.");
    }

    const ai = getGenAI();
    const response = await withRetry(() => ai.models.generateContent({
      prompt: `${promptPrefix}\n\n${scrapedContent}`
    }));
    return typeof response === 'string' ? response : response.text;
  } catch (err: any) {
    return handleApiError(err);
  }
}

export async function transcribeAudioToText(audioBase64: string, mimeType: string, language: Language) {
  try {
    if (isLocalMode()) {
      const byteCharacters = atob(audioBase64.replace(/^data:audio\/\w+;base64,/, ""));
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) { byteNumbers[i] = byteCharacters.charCodeAt(i); }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });
      const formData = new FormData();
      formData.append('file', blob, 'audio.wav');

      const response = await fetch('/api/bridge/transcribe', {
        method: 'POST',
        body: formData
      });
      if (!response.ok) throw new Error("Local Transcription Bridge failing.");
      const data = await response.json();
      return data.text;
    }

    const langName = language === 'hindi' ? 'Hindi' : language === 'malayalam' ? 'Malayalam' : language === 'tamil' ? 'Tamil' : 'English';
    const prompt = `Transcribe this audio in ${langName}. Only return text.`;
    const ai = getGenAI();
    const response = await withRetry(() => ai.models.generateContent({
      prompt,
      fileBase64: audioBase64.replace(/^data:.*?;base64,/, ""),
      mimeType: mimeType
    }));
    return typeof response === 'string' ? response : response.text;
  } catch (err: any) {
    return handleApiError(err);
  }
}

export async function analyzeFocus(imageBase64: string, mimeType: string) {
  try {
    const isLocal = isLocalMode();
    const prompt = isLocal 
      ? `Analyzing screen image. YOU MUST RETURN JSON ONLY. 
         JSON Schema: {"thought": "reasoning", "focusScore": 0-10, "subject": "current activity name", "distractionType": "none|social|entertainment|gaming|other", "advice": "short tip", "actionsRequired": ["dim_screen" or "mute_notifications"]}.
         Current screenshot follows.`
      : `Act as Saathi-OS Vision intelligence. Analyze this student's screen.
         Detect if they are studying (reading docs, writing code, taking notes, watching educational lectures) or distracted (social media, entertainment, non-study YouTube, gaming).
         RETURN JSON ONLY:
         {
           "thought": "Briefly explain what you see",
           "focusScore": number (0-10, 10 is deep focus),
           "subject": "Activity name (e.g. VS Code, Calculus Lecture)",
           "distractionType": "none" | "social" | "entertainment" | "gaming" | "other",
           "advice": "Contextual advice to stay focused",
           "actionsRequired": ["dim_screen"] if distracted
         }
         Be strict about distraction types.`;

    if (isLocal) {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const response = await callOllama(prompt, [cleanBase64]);
      return response.text();
    }

    const ai = getGenAI();
    const response = await withRetry(() => ai.models.generateContent({ 
      prompt,
      fileBase64: imageBase64.replace(/^data:image\/\w+;base64,/, ""),
      mimeType: mimeType
    }));
    return typeof response === 'string' ? response : response.text;
  } catch (err: any) {
    return handleApiError(err);
  }
}

export async function explainImage(imageBase64: string, mimeType: string, language: Language, customPrompt?: string) {
  try {
    const langName = language === 'hindi' ? 'Hindi' 
      : language === 'malayalam' ? 'Malayalam'
      : language === 'tamil' ? 'Tamil'
      : language === 'kannada' ? 'Kannada'
      : language === 'telugu' ? 'Telugu'
      : language === 'punjabi' ? 'Punjabi'
      : 'English';
    let prompt = `Explain this image clearly in ${langName}. Use simple language a student can understand.`;
    if (customPrompt) prompt += `\n\nStudent Request: "${customPrompt}"`;

    if (isLocalMode()) {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const response = await callOllama(prompt, [cleanBase64]);
      return response.text();
    }

    const ai = getGenAI();
    const response = await withRetry(() => ai.models.generateContent({
      prompt,
      fileBase64: imageBase64.replace(/^data:image\/\w+;base64,/, ""),
      mimeType: mimeType
    }));
    return typeof response === 'string' ? response : response.text;
  } catch (err: any) {
    return handleApiError(err);
  }
}

function handleApiError(err: any): never {
  let rawMessage = err?.message || String(err);
  const errorMessage = rawMessage.toLowerCase();
  
  if (errorMessage.includes("quota") || errorMessage.includes("429")) {
    throw new Error("Saathi is overwhelmed! (Quota Exceeded). Try again in 60s.");
  }
  
  if (isLocalMode() && (errorMessage.includes("fetch") || errorMessage.includes("connection"))) {
    throw new Error("Saathi Local unreachable. Ensure Ollama (*) and bridge.py are running.");
  }

  throw new Error(rawMessage);
}
