# Saathi-OS: Local Offline Setup Guide

This guide explains how to take Saathi-OS offline using **Gemma 4** on your local CPU.

## Prerequisites
1. **Ollama**: Download from [ollama.com](https://ollama.com).
2. **RAM**: 
   - 4GB: Use `gemma:2b`
   - 8GB+: Use `gemma4:e4b`
   - 16GB+: Use `gemma4:9b`

## Setup Steps

### Step 2: Initialize local models
Saathi-OS uses vision-capable models for focus analysis. Pull the following:
```bash
ollama pull moondream
```

### Step 3: Run the Hardware Bridge (Linux/Mac/PC)
Saathi-OS needs a Python bridge to control your hardware (screen brightness, audio) safely.

1. **Create and Activate a Virtual Environment** (Required for modern Linux):
   ```bash
   python3 -m venv saathi_env
   source saathi_env/bin/activate  # On Windows: saathi_env\Scripts\activate
   ```

2. **Install Dependencies**:
   ```bash
   pip install flask flask-cors screen-brightness-control plyer faster-whisper pygetwindow pillow sounddevice numpy scipy
   ```

3. **Run Bridge**:
   ```bash
   python bridge.py
   ```

### Step 4: Configure Ollama for Browser Access
Browsers prevent web apps from talking to Ollama unless permitted:
- **Mac/Linux**: `OLLAMA_ORIGINS="*" ollama serve`
- **Windows**: `$env:OLLAMA_ORIGINS="*"; ollama serve`
(Run this in a separate terminal)

### Troubleshooting common errors:
- **"Address already in use" (Ollama)**: Ollama is already running. On Linux, run `sudo systemctl stop ollama` first, then restart it with `OLLAMA_ORIGINS="*" ollama serve`.
- **"Externally managed environment"**: This means you skipped the `venv` step above. Always activate `saathi_env` before installing.
- **"Command python not found"**: Use `python3` instead of `python`.

### Step 4: Switch Saathi-OS to "Local Mode"
In the Saathi-OS UI, go to the **Settings** tab:
1. Click **Switch to Local**.
2. Start a **Focus Session**.
Now, when Gemma 4 detects you are distracted, it will actually dim your screen!

## Why this works Offline
Gemma 4 E2B is optimized for CPU inference. By using the Ollama REST API and the Python Bridge, Saathi-OS communicates directly with your laptop's hardware instead of sending data to the cloud.
