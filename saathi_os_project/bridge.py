from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import subprocess
import platform
import io
import base64

app = Flask(__name__)
# Allow your React app to talk to this bridge
CORS(app) 

@app.route('/health', methods=['GET'])
@app.route('/status', methods=['GET'])
def status():
    """Identifies if the bridge is active and what mode it is in."""
    return jsonify({
        "status": "offline_mode_active", 
        "engine": "Gemma 2B",
        "system": platform.system(),
        "message": "Saathi Bridge is Online"
    })

@app.route('/dim', methods=['POST'])
def dim_screen():
    """Feature 2: Agentic OS Control - Dims screen when distraction is detected."""
    data = request.json
    percent = data.get('percent', 30)
    
    try:
        if platform.system() == "Linux":
            # For KDE Plasma/Gnome, brightnessctl is the most reliable tool
            subprocess.run(["brightnessctl", "set", f"{percent}%"], check=True)
        elif platform.system() == "Windows":
            import screen_brightness_control as sbc
            sbc.set_brightness(percent)
        elif platform.system() == "Darwin": # Mac
             subprocess.run(["brightness", str(percent/100)], check=True)
        
        return jsonify({"status": "success", "percent": percent, "success": True})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/notify', methods=['POST'])
def notify():
    """Feature 10: Sends adaptive break notifications."""
    data = request.json
    title = data.get('title', 'Saathi-OS')
    message = data.get('message', 'Time for a break!')
    
    try:
        from plyer import notification
        notification.notify(
            title=title,
            message=message,
            app_name='Saathi-OS'
        )
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/transcribe', methods=['POST'])
def transcribe():
    """Feature 5: Offline transcription using Whisper on CPU."""
    if 'file' not in request.files:
        return jsonify({"status": "error", "message": "No audio file found"}), 400
    
    file = request.files['file']
    file_path = "temp_lecture.wav"
    file.save(file_path)
    
    try:
        import whisper
        # 'tiny' is the fastest for CPU-only student laptops
        model = whisper.load_model("tiny")
        result = model.transcribe(file_path)
        os.remove(file_path)
        return jsonify({"status": "success", "text": result["text"]})
    except Exception as e:
        if os.path.exists(file_path): os.remove(file_path)
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/windows', methods=['GET'])
@app.route('/track', methods=['GET'])
def track_focus():
    """Feature 8: Cognitive Load Detection - Tracks window switches."""
    try:
        if platform.system() == "Linux":
            try:
                # Gets the title of the currently open window
                out = subprocess.check_output(["xprop", "-root", "_NET_ACTIVE_WINDOW"]).decode()
                window_id = out.split()[-1]
                title = subprocess.check_output(["xprop", "-id", window_id, "WM_NAME"]).decode()
                title = title.split(" = ")[-1].strip().strip('"')
                return jsonify({
                    "status": "success", 
                    "active_window": title, 
                    "active_app": title
                })
            except Exception as inner_e:
                return jsonify({
                    "status": "error", 
                    "active_app": "Unknown", 
                    "message": str(inner_e)
                }), 500
        elif platform.system() == "Windows":
            try:
                import pygetwindow as gw
                active = gw.getActiveWindow()
                title = active.title if active else "None"
                return jsonify({
                    "status": "success", 
                    "active_window": title,
                    "active_app": title
                })
            except:
                return jsonify({"active_app": "Unknown"}), 500
        return jsonify({"status": "error", "message": "OS not supported for tracking"}), 400
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/screenshot', methods=['GET'])
def take_screenshot():
    """Hardware Level Screenshot - Works on Linux (X11 + Wayland), Windows, macOS."""
    try:
        img_str = None

        # Primary: mss — fastest, works everywhere including Linux Wayland
        try:
            import mss
            import mss.tools
            with mss.mss() as sct:
                monitor = sct.monitors[1]  # Primary monitor
                sct_img = sct.grab(monitor)
                # Convert to PIL Image for resizing
                from PIL import Image
                img = Image.frombytes("RGB", sct_img.size, sct_img.bgra, "raw", "BGRX")
                if img.width > 1280:
                    img.thumbnail((1280, 1280))
                buffered = io.BytesIO()
                img.save(buffered, format="JPEG", quality=85)
                img_str = base64.b64encode(buffered.getvalue()).decode()
        except ImportError:
            pass  # mss not installed, try PIL fallback

        # Fallback: PIL ImageGrab — works on X11 Linux, Windows, macOS
        if not img_str:
            from PIL import ImageGrab
            screenshot = ImageGrab.grab()
            if screenshot.width > 1280:
                screenshot.thumbnail((1280, 1280))
            buffered = io.BytesIO()
            screenshot.save(buffered, format="JPEG", quality=85)
            img_str = base64.b64encode(buffered.getvalue()).decode()

        return jsonify({
            "status": "success",
            "image": f"data:image/jpeg;base64,{img_str}"
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/scrape', methods=['POST'])
def scrape():
    """Offline Scraper - Fetches text from URL for study notes."""
    data = request.json
    url = data.get('url')
    if not url: return jsonify({"error": "No URL"}), 400
    
    try:
        import requests
        from bs4 import BeautifulSoup
        resp = requests.get(url, timeout=10, headers={'User-Agent': 'Saathi-OS Browser'})
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        # Remove scripts and styles
        for s in soup(['script', 'style']): s.decompose()
        
        text = soup.get_text(separator='\n')
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        clean_text = '\n'.join(lines[:100]) # Limit to first 100 lines for local AI
        
        return jsonify({"status": "success", "text": clean_text})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/models', methods=['GET'])
def list_models():
    """Proxies to Ollama to list available tags."""
    try:
        import requests
        resp = requests.get("http://localhost:11434/api/tags", timeout=5)
        return jsonify(resp.json())
    except:
        return jsonify({"models": []})

@app.route('/', methods=['GET'])
def index():
    return jsonify({
        "message": "Saathi-OS Hardware Bridge is ACTIVE",
        "endpoints": ["/health", "/status", "/dim", "/notify", "/transcribe", "/windows", "/track"],
        "status": "Ready to support focus"
    })

if __name__ == '__main__':
    print("--- Saathi-OS Hardware Bridge Active ---")
    print("Listening on http://0.0.0.0:5000")
    app.run(port=5000, host='0.0.0.0')
