import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { spawn } from "child_process";

import { createProxyMiddleware } from "http-proxy-middleware";

async function startServer() {
  // Start Python Bridge (Optional/Local Only)
  try {
    console.log("Starting Saathi Hardware Bridge (Python)...");
    const bridge = spawn("python3", ["bridge.py"]);
    
    bridge.on("error", (err) => {
      console.warn(`[Bridge] HW Bridge could not be started: ${err.message}`);
      console.warn("Saathi will transition to Cloud Hybrid mode.");
    });

    bridge.stdout.on("data", (data) => {
      console.log(`[Bridge]: ${data}`);
    });

    bridge.stderr.on("data", (data) => {
      console.error(`[Bridge Error]: ${data}`);
    });
  } catch (e) {
    console.error("[Bridge] Critical error during bridge initialization:", e);
  }

  const app = express();
  const PORT = 3000;

  // IMPORTANT: Proxy middleware must come BEFORE body parsers to handle streams correctly
  const proxyOptions = {
    changeOrigin: true,
    proxyTimeout: 30000, // 30s timeout for hardware
    timeout: 30000,
    onError: (err: any, req: any, res: any) => {
      console.error(`[Proxy Error] ${req.url}:`, err.message);
      res.status(502).json({ 
        error: "Hardware Bridge Unreachable", 
        details: err.message,
        suggestion: "Ensure bridge.py is running locally (Port 5000) or check network." 
      });
    }
  };

  app.use("/api/bridge", createProxyMiddleware({
    ...proxyOptions,
    target: "http://127.0.0.1:5000",
    pathRewrite: { "^/api/bridge": "" },
  }));

  app.use("/api/ollama", createProxyMiddleware({
    ...proxyOptions,
    target: "http://127.0.0.1:11434",
    pathRewrite: { "^/api/ollama": "" },
  }));

  app.use(express.json());

  // Logging middleware
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // Mock database
  const sessions: any[] = [];
  const logs: any[] = [];
  let isShieldActive = false;

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Shield Control
  app.get("/api/shield/status", (req, res) => {
    res.json({ active: isShieldActive });
  });

  app.post("/api/shield/toggle", (req, res) => {
    isShieldActive = req.body.active;
    const log = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      message: `Shield ${isShieldActive ? 'Enabled' : 'Disabled'} via UI`,
      type: 'system'
    };
    logs.unshift(log);
    res.json({ active: isShieldActive, log });
  });

  // Sessions
  app.post("/api/sessions", (req, res) => {
    const session = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      ...req.body
    };
    sessions.unshift(session);
    res.status(201).json(session);
  });

  app.get("/api/sessions", (req, res) => {
    res.json(sessions);
  });

  // System Logs
  app.get("/api/logs", (req, res) => {
    res.json(logs.slice(0, 50));
  });

  app.post("/api/logs", (req, res) => {
    const log = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      ...req.body
    };
    logs.unshift(log);
    if (logs.length > 100) logs.pop();
    res.status(201).json(log);
  });

  // Gemini Proxy (Secure)
  app.post("/api/gemini", async (req, res) => {
    try {
      const { prompt, fileBase64, mimeType, config } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(401).json({ error: "GEMINI_API_KEY is not set on the server." });
      }

      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: req.body.model || "gemini-2.0-flash" });

      let result;
      if (fileBase64 && mimeType) {
        result = await model.generateContent([
          { inlineData: { data: fileBase64, mimeType } },
          { text: prompt }
        ]);
      } else {
        result = await model.generateContent(prompt);
      }

      res.json({ text: result.response.text() });
    } catch (error: any) {
      console.error("[Gemini Proxy Error]:", error);
      res.status(500).json({ error: error.message || "Internal AI Error" });
    }
  });

  // Server-side Web Scraper for Cloud Mode
  app.post("/api/scrape", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "No URL provided" });

    try {
      const axios = (await import("axios")).default;
      const cheerio = await import("cheerio");
      
      const response = await axios.get(url, {
        timeout: 10000,
        headers: { 'User-Agent': 'Saathi-OS Research Bot' }
      });

      const $ = cheerio.load(response.data);
      
      // Remove noise
      $('script, style, nav, footer, header, ads').remove();
      
      const text = $('body').text()
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 8000); // Limit to keep within context window

      res.json({ text, title: $('title').text() });
    } catch (error: any) {
      console.error("[Scraper Error]:", error.message);
      res.status(500).json({ error: "Failed to fetch URL content", details: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static files
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Startup] Saathi-OS Backend successfully initialized.`);
    console.log(`[Startup] Listening on http://0.0.0.0:${PORT}`);
    console.log(`[Startup] Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer();
