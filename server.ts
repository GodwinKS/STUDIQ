import express from "express";
import path from "path";
import os from "os";
import { createServer as createViteServer } from "vite";
import { spawn } from "child_process";

import { createProxyMiddleware } from "http-proxy-middleware";

async function startServer() {
  // Start Python Bridge (Optional/Local Only)
  try {
    console.log("Starting Saathi Hardware Bridge (Python)...");
    // Detect system appropriate python command
    const pythonCmd = process.platform === "win32" ? "python" : "python3";
    const bridge = spawn(pythonCmd, ["bridge.py"]);
    
    bridge.on("error", (err) => {
      console.warn(`[Bridge] HW Bridge could not be started: ${err.message}`);
    });

    bridge.on("exit", (code) => {
      if (code !== 0) {
        console.error(`[Bridge] HW Bridge process exited with code ${code}`);
      }
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
    if (req.url.startsWith('/api')) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    }
    next();
  });

  // Mock database
  const sessions: any[] = [
    { id: 1, timestamp: new Date(Date.now() - 3600000).toISOString(), duration: 1800, score: 8.5 },
    { id: 2, timestamp: new Date(Date.now() - 7200000).toISOString(), duration: 4500, score: 7.2 }
  ];
  const logs: any[] = [
    { id: 1, timestamp: new Date().toISOString(), message: 'Saathi-OS Backend Initialized', type: 'system' }
  ];
  let isShieldActive = true;

  // Root Health
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Sessions Logic
  app.get("/api/sessions", (req, res) => {
    res.json(sessions);
  });

  app.post("/api/sessions", (req, res) => {
    const session = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      ...req.body
    };
    sessions.unshift(session);
    console.log(`[Session] Created: ${session.id}`);
    res.status(201).json(session);
  });

  // Logs Logic
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

  // System Status Monitor
  app.get("/api/monitor", async (req, res) => {
    const status: any = {
      server: "online",
      bridge: "offline",
      ollama: "offline",
      os: os.platform(),
      arch: os.arch(),
      uptime: process.uptime()
    };

    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 1000);
      const bridgeRes = await fetch("http://127.0.0.1:5000/health", { signal: controller.signal });
      clearTimeout(id);
      if (bridgeRes.ok) status.bridge = "online";
    } catch (e) {}

    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 1000);
      const ollamaRes = await fetch("http://127.0.0.1:11434/api/tags", { signal: controller.signal });
      clearTimeout(id);
      if (ollamaRes.ok) status.ollama = "online";
    } catch (e) {}

    res.json(status);
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

  // API 404 Handler - MUST be before Vite middleware
  app.all("/api/*", (req, res) => {
    res.status(404).json({ 
      error: "API Endpoint Not Found", 
      path: req.url,
      method: req.method 
    });
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
