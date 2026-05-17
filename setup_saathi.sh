#!/bin/bash
echo "--- Saathi-OS Offline Environment Setup ---"
echo "1. Creating virtual environment..."
python3 -m venv saathi_env

echo "2. Activating virtual environment..."
source saathi_env/bin/activate

echo "3. Installing hardware dependencies..."
pip install flask flask-cors screen-brightness-control plyer faster-whisper pygetwindow pillow sounddevice numpy scipy

echo "--- DONE ---"
echo "To start Saathi next time, always run:"
echo "source saathi_env/bin/activate && python bridge.py"
