@echo off
echo --- Saathi-OS Offline Environment Setup (Windows) ---
echo 1. Creating virtual environment...
python -m venv saathi_env

echo 2. Activating virtual environment...
call saathi_env\Scripts\activate

echo 3. Installing hardware dependencies...
pip install flask flask-cors screen-brightness-control plyer faster-whisper pygetwindow pillow sounddevice numpy scipy

echo --- DONE ---
echo To start Saathi next time, always run:
echo saathi_env\Scripts\activate && python bridge.py
pause
