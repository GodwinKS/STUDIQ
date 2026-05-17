import { useState, useEffect } from "react";
import { safeJson } from './api';

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
  if (typeof window === 'undefined') return true;
  return localStorage.getItem('saathi_local_mode') !== 'false'; // Default to true but allow false
};

export const getLocalModel = () => {
  if (typeof window === 'undefined') return "moondream";
  return localStorage.getItem('saathi_local_model') || "moondream";
};

export const setLocalModel = (model: string) => {
  localStorage.setItem('saathi_local_model', model);
  window.dispatchEvent(new Event('saathi_settings_changed'));
};

export const setLocalMode = (enabled: boolean) => {
  localStorage.setItem('saathi_local_mode', enabled ? "true" : "false");
  window.dispatchEvent(new Event('saathi_settings_changed'));
};

const OLLAMA_URL = "/api/ollama/api/generate";

async function callOllama(prompt: string, images?: string[], isJson: boolean = false, modelOverride?: string) {
  const model = modelOverride || getLocalModel();
  const body: any = {
    model: model,
    prompt: prompt,
    images: images || [],
    stream: false,
    options: {
      num_ctx: 8192, // Increased from 2048 for longer notes and explanations
      temperature: 0.3,
      num_predict: 1024, // Allow for longer responses
    }
  };

  if (isJson) {
    body.format = 'json';
  }

  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const errData = await safeJson(response).catch(() => ({}));
    throw new Error(errData.error || "Local Ollama server unreachable. Run 'ollama serve'.");
  }
  const data = await safeJson(response);
  return { text: () => data.response };
}

async function callCloud(prompt: string, fileBase64?: string, mimeType?: string) {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      fileBase64,
      mimeType,
      model: "gemini-2.0-flash"
    })
  });

  if (!response.ok) {
    const data = await safeJson(response).catch(() => ({}));
    throw new Error(data.error || "Cloud AI Error");
  }
  const data = await safeJson(response);
  return { text: () => data.text };
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 10): Promise<T> {
  // Local mode doesn't benefit much from generic retries if the server is down
  return fn();
}

export type TaskType = 'explain' | 'focus';
export type Language = 'hindi' | 'malayalam' | 'english' | 'tamil' | 'punjabi' | 'kannada' | 'telugu';

export async function analyzeDiagram(imageBase64: string, mimeType: string) {
  try {
    const prompt = `Act as Saathi-OS Science Assistant. Analyze this diagram (circuit, biology, flowchart, etc.) and explain: 
    1. What is this? 
    2. Key components labeled. 
    3. How it works (step-by-step).
    Use simple, clear language for a first-year engineering student. Format with Markdown.`;

    const cleanBase64 = imageBase64.replace(/^data:.*?base64,/, "");
    
    if (isLocalMode()) {
      const response = await callOllama(prompt, [cleanBase64], false, "gemma4:e2b");
      return response.text();
    } else {
      const response = await callCloud(prompt, cleanBase64, mimeType);
      return response.text();
    }
  } catch (err: any) {
    return handleApiError(err);
  }
}

export async function solveFormula(imageBase64: string, mimeType: string) {
  try {
    const prompt = `Act as Saathi-OS Math & Physics Tutor. Look at this formula or equation and:
    1. Identify the formula name/context.
    2. Define every variable shown.
    3. Solve it step-by-step if it's a problem, OR explain how to use it if it's a general formula.
    4. Provide one real-world application.
    Use Markdown and LaTeX-style formatting for math where appropriate.`;

    const cleanBase64 = imageBase64.replace(/^data:.*?base64,/, "");
    
    if (isLocalMode()) {
      const response = await callOllama(prompt, [cleanBase64], false, "gemma4:e2b");
      return response.text();
    } else {
      const response = await callCloud(prompt, cleanBase64, mimeType);
      return response.text();
    }
  } catch (err: any) {
    return handleApiError(err);
  }
}

export async function generateSmartNotes(fileBase64: string, mimeType: string, isHandwritten: boolean = false) {
  try {
    const isAudioVideo = mimeType.startsWith('audio/') || mimeType.startsWith('video/');
    let prompt = `Act as Saathi-OS Study Assistant.
    Goal: Transform this media into structured study notes.
    Format: Use Markdown. Include summary, key points, and review questions.
    If handwriting, preserve the hierarchy of notes.`;

    const cleanBase64 = fileBase64.replace(/^data:.*?base64,/, "");
    
    if (isLocalMode()) {
      const response = await callOllama(prompt, [cleanBase64], false, "gemma4:e2b");
      return response.text();
    } else {
      const response = await callCloud(prompt, cleanBase64, mimeType);
      return response.text();
    }
  } catch (err: any) {
    return handleApiError(err);
  }
}

export async function generateSmartNotesFromUrl(url: string) {
  try {
    const promptPrefix = `Act as Saathi-OS Research Engine. Convert the following text into study notes. CONTENT: `;
    let scrapedContent = "";
    
    // Offline mode ONLY: Attempt to scrape using the backend
    try {
      const scrapeRes = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      if (scrapeRes.ok) {
        const scrapeData = await safeJson(scrapeRes);
        scrapedContent = scrapeData.text;
      }
    } catch (scrapeErr) {
      console.warn("Backend scraper failed.", scrapeErr);
    }

    if (!scrapedContent) {
      throw new Error("Local Bridge Scraper failed. Is bridge.py running?");
    }

    if (isLocalMode()) {
      const response = await callOllama(`${promptPrefix}\n\n${scrapedContent}`, [], false, "gemma4:e2b");
      return response.text();
    } else {
      const response = await callCloud(promptPrefix + scrapedContent);
      return response.text();
    }
  } catch (err: any) {
    return handleApiError(err);
  }
}

export async function transcribeAudioToText(audioBase64: string, mimeType: string, language: Language) {
  try {
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
    const data = await safeJson(response);
    return data.text;
  } catch (err: any) {
    return handleApiError(err);
  }
}

export async function generateSmartNotesFromText(text: string) {
  try {
    const prompt = `Act as Saathi-OS. Transform this lecture transcript into structured study notes with summary, key terms, and review questions. Use Markdown.\n\nTRANSCRIPT:\n${text}`;
    
    if (isLocalMode()) {
      const response = await callOllama(prompt, [], false, "gemma4:e2b");
      return response.text();
    } else {
      const response = await callCloud(prompt);
      return response.text();
    }
  } catch (err: any) {
    return handleApiError(err);
  }
}

export async function analyzeFocus(
  imageBase64: string, 
  mimeType: string, 
  windowContext: string = "Unknown",
  allWindows: string[] = []
) {
  try {
    // 1. DETERMINISTIC CHECK (HEURISTICS)
    const lowerAll = allWindows.map(w => w.toLowerCase());
    const lowerContext = windowContext.toLowerCase();
    
    const distractors = ["instagram", "facebook", "whatsapp", "discord", "youtube", "reddit", "netflix", "prime video", "steam", "game", "twitter", "x.com", "reels", "shorts", "twitch", "tiktok", "snapchat", "pinterest"];
    const studyKeywords = [".pdf", "notion", "obsidian", "vs code", "terminal", "blackboard", "canvas", "lecture", "book", "adobe acrobat", "foxit", "preview", "reader", "coursera", "edx", "khan academy", "stack overflow", "github", "documentation", "mdn", "overleaf", "latex", "jupyter", "colab"];

    const isDirectPdf = lowerContext.includes(".pdf") || lowerContext.includes("pdf") || lowerContext.includes("acrobat") || lowerContext.includes("document") || lowerContext.includes("reader") || lowerContext.includes("viewer") || lowerContext.includes("evince") || lowerContext.includes("okular");
    const foundDistraction = distractors.find(d => lowerAll.some(w => w.includes(d)));
    
    // USER REQUEST: Instagram detected = Score 2
    if (lowerAll.some(w => w.includes("instagram")) || lowerContext.includes("instagram")) {
      return JSON.stringify({
        thought: "Instagram detected on screen. Focused score heavily penalized to 2.",
        focusScore: 2,
        subject: "INSTAGRAM",
        distractionType: "social",
        advice: "Instagram detected. Saathi suggests closing it immediately for productivity.",
        actionsRequired: ["dim_screen", "mute_notifications"]
      });
    }

    const isStudying = studyKeywords.some(s => lowerAll.some(w => w.includes(s))) || isDirectPdf;

    // 1. HARD HEURISTICS (Overrides AI to be consistent)
    // PROACTIVE HEURISTIC: Pure Study (PDF detected, no distractions)
    if (isStudying && !foundDistraction) {
      return JSON.stringify({
        thought: "Heuristic: Pure study environment (PDF/Study Tool) detected. No visible distractions.",
        focusScore: 10,
        subject: "PDF Study",
        distractionType: "none",
        advice: "Excellent focus. Stay in the zone!",
        actionsRequired: []
      });
    }

    if (foundDistraction && !isStudying) {
      return JSON.stringify({
        thought: `Heuristic: Found "${foundDistraction}" visible. User is not clearly in a study tool. High distraction penalization.`,
        focusScore: 2,
        subject: foundDistraction.toUpperCase(),
        distractionType: foundDistraction === "reels" || foundDistraction === "shorts" ? "entertainment" : "social",
        advice: "Saathi detected distractors. Close them to reach Deep Focus!",
        actionsRequired: ["dim_screen", "mute_notifications"]
      });
    }

    if (isStudying && foundDistraction) {
      return JSON.stringify({
        thought: `Heuristic: Split-screen detected between study tools and "${foundDistraction}". Focus is compromised.`,
        focusScore: 4,
        subject: "Mixed Activity",
        distractionType: "social",
        advice: "You're trying to study, but distractions are visible. Close common distractions to reach Deep Focus.",
        actionsRequired: ["mute_notifications"]
      });
    }

    // 2. FALLBACK TO LOCAL AI FOR AMBIGUOUS CASES
    const prompt = `Act as the Saathi-OS Focus Engine. You are a local observer with access to the student's screen and window titles.
    
    IMPORTANT: 
    - DO NOT claim you cannot see external sources. The provided screenshot AND window titles ARE your sources.
    - If you see Instagram, Shorts, Reels, or clear entertainment, the focusScore MUST be between 0 and 4.
    - If you see a PDF, Code, or notes, the focusScore MUST be between 8 and 10.
    - If no clear distraction or study tool is identified, assume a neutral focusScore of 7.
    
    ANALYSIS DATA:
    - Active Title: "${windowContext}"
    - Visible Windows: ${allWindows.join(", ")}
    
    JSON SCHEMA:
    {
      "thought": "Briefly describe the visual proof you see (what apps/content are open)",
      "focusScore": number (0-10),
      "subject": "Main subject seen (e.g. Physics, Coding, Scrolling)",
      "distractionType": "none" | "social" | "entertainment",
      "advice": "Saathi tip",
      "actionsRequired": []
    }`;

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    let resText = "";

    if (isLocalMode()) {
      const response = await callOllama(prompt, [cleanBase64], true, "moondream");
      resText = response.text();
    } else {
      // In cloud mode, we still need JSON
      const response = await callCloud(prompt + "\n\nONLY RETURN RAW JSON.", cleanBase64, mimeType);
      resText = response.text();
    }

    try {
      let data = JSON.parse(resText);
      
      // If AI gave 0 for something not clearly a distraction, boost it to 7 as per user request
      if (data.focusScore === 0 && data.distractionType === "none" && data.thought) {
        data.focusScore = 7;
        data.thought = (data.thought || "") + " (Sanity check: Boosted neutral description to 7)";
      }

      // USER REQUEST: If "pdf" is in the thinking result, score = 9+
      const lowerAnalysis = resText.toLowerCase();
      if (lowerAnalysis.includes("pdf")) {
        console.log("Saathi Rule: 'pdf' detected in AI response. Boosting score to 9.5.");
        data.focusScore = Math.max(9.5, data.focusScore);
      }

      const lowerThought = data.thought?.toLowerCase() || "";
      const lowerSubject = data.subject?.toLowerCase() || "";
      const distractionKeywords = ["instagram", "reels", "shorts", "youtube", "tiktok", "scrolling", "distracted", "facebook", "twitter", "whatsapp"];
      
      const mentionsDistraction = distractionKeywords.some(k => lowerThought.includes(k) || lowerSubject.includes(k));
      
      // SANITY CHECK: If AI sees distraction, score MUST be low (<5)
      if (mentionsDistraction || data.distractionType !== 'none') {
        if (data.focusScore > 5) {
          console.warn("Saathi Sanity Check: AI mentioned distraction but gave high score. Forcing penalization.");
          data.focusScore = 3.5; // Cap it
          data.distractionType = data.distractionType === 'none' ? 'social' : data.distractionType;
        }
      }
      return JSON.stringify(data);
    } catch (e) {
      console.warn("Post-AI Sanity check failed to parse JSON, returning raw text.");
    }

    const lowerRes = resText.toLowerCase();
    const isRefusal = lowerRes.includes("unable to access") || 
                      lowerRes.includes("cannot see") || 
                      lowerRes.includes("external sources") ||
                      lowerRes.includes("as an ai model") ||
                      lowerRes.includes("cannot determine");

    if (isRefusal && isStudying) {
      return JSON.stringify({
        thought: "AI engine self-corrected refusal. Heuristics maintained focus context.",
        focusScore: 9.5,
        subject: isDirectPdf ? "PDF Study" : "Deep Learning",
        distractionType: "none",
        advice: "Continue your deep focus session.",
        actionsRequired: []
      });
    }

    return resText;
  } catch (err: any) {
    console.error("Focus Vision AI Error (Offline Failure):", err);
    // Fallback: Assume the best of the student if AI fails
    return JSON.stringify({
      thought: "Hardware engine busy. Assuming focus.",
      focusScore: 10,
      subject: "Study Session",
      distractionType: "none",
      advice: "Stay focused!",
      actionsRequired: []
    });
  }
}

export async function explainImage(imageBase64: string, mimeType: string, language: Language, customPrompt?: string) {
  try {
    const langName = language === 'hindi' ? 'Hindi' : language === 'malayalam' ? 'Malayalam' : 'English';
    let prompt = `Act as Saathi-OS Tutor—the friendly AI built by students, for students. 
    Explain this visual in ${langName}. 
    - Use simple, conversational language.
    - If explaining in Hindi/Malayalam, use standard pedagogical terms but explain them simply.
    - Use relatable analogies (like comparing a capacitor to a water tank).
    - If there is complex English text, translate the core meaning accurately into ${langName}.
    - Break down concepts step-by-step.
    - Be supportive and student-centric.`;
    if (customPrompt) prompt += `\n\nStudent specifically asked: "${customPrompt}"`;

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    
    if (isLocalMode()) {
      const response = await callOllama(prompt, [cleanBase64], false, "gemma4:e2b");
      return response.text();
    } else {
      const response = await callCloud(prompt, cleanBase64, mimeType);
      return response.text();
    }
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
