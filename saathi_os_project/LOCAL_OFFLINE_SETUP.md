# Saathi-OS: Complete Offline Setup Guide (Gemma 4)

This guide runs Saathi-OS **100% offline** using Gemma 4 on your CPU via Ollama.

---

## RAM requirements — pick your model

| RAM   | Model to pull        | Notes                        |
|-------|----------------------|------------------------------|
| 4 GB  | `gemma4:e2b`         | Lite — fast, less accurate   |
| 8 GB  | `gemma4:e4b`         | ✅ Recommended for most laptops |
| 16 GB | `gemma4:9b`          | Best quality, slower on CPU  |

---

## Step 1 — Install Ollama

Download from [ollama.com](https://ollama.com) and install it.

Then pull your Gemma 4 model (choose based on RAM above):
```bash
ollama pull gemma4:e4b
```
> First pull downloads ~3GB. Be patient — it only happens once.

---

## Step 2 — Start Ollama with CORS enabled

Browsers block direct `localhost` requests unless Ollama allows it.
**Every time you start Ollama, use this command instead of just `ollama serve`:**

**Mac / Linux:**
```bash
OLLAMA_ORIGINS="*" ollama serve
```

**Windows (PowerShell):**
```powershell
$env:OLLAMA_ORIGINS="*"; ollama serve
```

> If you see "address already in use": on Linux run `sudo systemctl stop ollama` first.

---

## Step 3 — Set up the Python Hardware Bridge

### 3a — Install FFmpeg (required for Whisper audio)
- **Linux:** `sudo apt install ffmpeg`
- **Mac:** `brew install ffmpeg`
- **Windows:** Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH

### 3b — Create a Python virtual environment
```bash
python3 -m venv saathi_env
source saathi_env/bin/activate      # Mac/Linux
# saathi_env\Scripts\activate       # Windows
```

### 3c — Install Python dependencies
```bash
pip install -r requirements.txt
```

### 3d — Start the bridge
```bash
python3 bridge.py
```
You should see:
```
--- Saathi-OS Hardware Bridge Active ---
Listening on http://0.0.0.0:5000
```

---

## Step 4 — Start the web app

In a **new terminal**:
```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Step 5 — Switch to Local / Offline mode

1. Go to the **Settings** tab in Saathi-OS
2. Click **"Switch to Local Core"**
3. Confirm the model shows `gemma4:e4b`
4. Health panel should show **Bridge: Online** and **Ollama: Connected**
5. Start a **Focus Session** — Gemma 4 now runs fully on your laptop!

---

## Quick health check
```bash
curl http://localhost:5000/health     # Bridge check
curl http://localhost:11434/api/tags  # Ollama model list
```

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Address already in use` (port 5000) | `lsof -i :5000` and kill the process |
| `Address already in use` (Ollama) | `sudo systemctl stop ollama` then restart with OLLAMA_ORIGINS |
| `Externally managed environment` | Activate `saathi_env` venv first |
| `command not found: python` | Use `python3` |
| Screenshot fails on Linux | `sudo apt install python3-tk scrot` |
| Whisper slow on first run | Downloads tiny model (~75MB) — normal |
