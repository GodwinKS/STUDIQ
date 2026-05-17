import sys

try:
    from flask import Flask, request, jsonify
    from flask_cors import CORS
except ImportError:
    print("\n" + "!"*60)
    print("ERROR: Missing Dependencies for Saathi Hardware Bridge")
    print("Please run the following command to fix this:")
    print("\npip install flask flask-cors screen-brightness-control plyer faster-whisper pygetwindow pillow sounddevice numpy scipy")
    print("!"*60 + "\n")
    sys.exit(1)

import os
import subprocess
import platform

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
@app.route('/brightness', methods=['GET', 'POST'])
def handle_brightness():
    """Feature 2: Agentic OS Control - Manages screen brightness."""
    try:
        import screen_brightness_control as sbc
        platform_name = platform.system()
        
        def get_current_brightness():
            try:
                # 1. Try screen_brightness_control (Good for Windows/Some Linux)
                current = sbc.get_brightness()
                if current and len(current) > 0:
                    return current[0]
            except:
                pass
            
            if platform_name == "Linux":
                try:
                    # 2. Try brightnessctl (Modern Linux)
                    out = subprocess.check_output(["brightnessctl", "g"]).decode().strip()
                    max_b = subprocess.check_output(["brightnessctl", "m"]).decode().strip()
                    return int(int(out) / int(max_b) * 100)
                except:
                    try:
                        # 3. Try xbacklight (Legacy Linux)
                        out = subprocess.check_output(["xbacklight", "-get"]).decode().strip()
                        return int(float(out))
                    except:
                        return 50
            elif platform_name == "Darwin": # Mac
                try:
                    # 4. Try brightness tool (Mac)
                    out = subprocess.check_output(["brightness", "-l"]).decode().strip()
                    for line in out.splitlines():
                        if "brightness" in line:
                            return int(float(line.split()[-1]) * 100)
                    return 50
                except:
                    return 50
            return 50

        if request.method == 'GET':
            return jsonify({"status": "success", "brightness": get_current_brightness()})
            
        data = request.json
        percent = data.get('percent')
        adjustment = data.get('adjustment', 0) 
        
        current_val = get_current_brightness()
        if percent is not None:
            target = max(0, min(100, percent))
        else:
            target = max(0, min(100, current_val + adjustment))
            
        if platform_name == "Linux":
            try:
                subprocess.run(["brightnessctl", "set", f"{target}%"], check=True)
            except:
                try:
                    subprocess.run(["xbacklight", "-set", str(target)], check=True)
                except:
                    try:
                        # 3rd Fallback: xrandr (Works for many desktop displays)
                        # Finds the primary output and sets its brightness (0.0 to 1.0)
                        output = subprocess.check_output("xrandr | grep ' connected primary' | cut -f1 -d' '", shell=True).decode().strip()
                        if not output:
                            output = subprocess.check_output("xrandr | grep ' connected' | head -n1 | cut -f1 -d' '", shell=True).decode().strip()
                        if output:
                            subprocess.run(["xrandr", "--output", output, "--brightness", str(target/100)], check=True)
                    except Exception as e:
                        print(f"All Linux brightness fallbacks failed: {e}")
                        return jsonify({"status": "error", "message": "No brightness control found. Install 'brightnessctl' or 'xbacklight'."}), 500
        elif platform_name == "Windows":
            sbc.set_brightness(target)
        elif platform_name == "Darwin": 
             try:
                subprocess.run(["brightness", str(target/100)], check=True)
             except:
                return jsonify({"status": "error", "message": "Mac 'brightness' tool not found. Install via: brew install brightness"}), 500
        
        return jsonify({"status": "success", "brightness": target})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/mute', methods=['POST'])
def mute_notifications():
    """Attempts to toggle notification quiet mode / system volume mute."""
    data = request.json
    mute = data.get('mute', True)
    
    try:
        platform_name = platform.system()
        if platform_name == "Windows":
            # Direct system volume mute via NirCmd if available, or just use simple shortcut simulate
            # For hackathon, we simulate the "Mute" key if available
            import ctypes
            WM_APPCOMMAND = 0x319
            APPCOMMAND_VOLUME_MUTE = 0x80000
            # This mutes system sound which is a good proxy for "No noise" focus
            ctypes.windll.user32.SendMessageW(ctypes.windll.user32.GetForegroundWindow(), WM_APPCOMMAND, 0, APPCOMMAND_VOLUME_MUTE)
        elif platform_name == "Linux":
            # Try amixer first, then pactl (PulseAudio)
            try:
                state = "mute" if mute else "unmute"
                subprocess.run(["amixer", "set", "Master", state], check=True)
            except:
                state = "1" if mute else "0"
                subprocess.run(["pactl", "set-sink-mute", "@DEFAULT_SINK@", state], check=True)
        elif platform_name == "Darwin": # Mac
            state = "true" if mute else "false"
            subprocess.run(["osascript", "-e", f"set volume with output muted {state}"], check=True)
            
        return jsonify({"status": "success", "muted": mute})
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
        from faster_whisper import WhisperModel
        # 'tiny' is the fastest for CPU-only student laptops
        model = WhisperModel("tiny", device="cpu", compute_type="int8")
        segments, _ = model.transcribe(file_path)
        text = " ".join([seg.text for seg in segments])
        os.remove(file_path)
        return jsonify({"status": "success", "text": text})
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
                import pygetwindow as dw
                active = dw.getActiveWindow()
                title = active.title if active else "None"
                
                # Get ALL visible windows for split-screen detection
                all_windows = [w.title for w in dw.getAllWindows() if w.title and w.visible]
                
                return jsonify({
                    "status": "success", 
                    "active_window": title,
                    "active_app": title,
                    "all_visible_windows": all_windows
                })
            except:
                return jsonify({"active_app": "Unknown", "all_visible_windows": []}), 500
        return jsonify({"status": "error", "message": "OS not supported for tracking"}), 400
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

import threading
import wave

recording_thread = None
is_recording = False
RECORD_PATH = "temp_recording.wav"

@app.route('/record/start', methods=['POST'])
def start_record():
    """Starts hardware-level audio recording."""
    global is_recording, recording_thread
    if is_recording: return jsonify({"status": "already_recording"})
    
    try:
        import sounddevice as sd
        import numpy as np
        from scipy.io.wavfile import write

        is_recording = True
        def record():
            global is_recording
            try:
                fs = 44100  # Sample rate
                audio_data = []
                def callback(indata, frames, time, status):
                    if is_recording:
                        audio_data.append(indata.copy())
                
                with sd.InputStream(samplerate=fs, channels=1, callback=callback):
                    while is_recording:
                        sd.sleep(100)
                
                if audio_data:
                    full_audio = np.concatenate(audio_data, axis=0)
                    write(RECORD_PATH, fs, full_audio)
                    print(f"Recording saved to {RECORD_PATH}")
            except Exception as e:
                print(f"Background thread error: {e}")
                is_recording = False

        recording_thread = threading.Thread(target=record)
        recording_thread.start()
        return jsonify({"status": "success"})
    except ImportError:
        return jsonify({
            "status": "error", 
            "message": "Missing audio dependencies. Please run 'pip install sounddevice numpy scipy'"
        }), 500
    except Exception as e:
        return jsonify({"status": "error", "message": f"Hardware recording error: {str(e)}"}), 500

@app.route('/record/stop', methods=['POST'])
def stop_record():
    """Stops hardware-level audio recording and transcribes it immediately."""
    global is_recording, recording_thread
    is_recording = False
    if recording_thread:
        recording_thread.join()
    
    if not os.path.exists(RECORD_PATH):
        return jsonify({"status": "error", "message": "No recording found"}), 404
        
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel("tiny", device="cpu", compute_type="int8")
        segments, _ = model.transcribe(RECORD_PATH)
        text = " ".join([seg.text for seg in segments])
        os.remove(RECORD_PATH)
        return jsonify({"status": "success", "text": text})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/screenshot', methods=['GET'])
def take_screenshot():
    """Hardware Level Screenshot - Bypasses browser iframe restrictions."""
    try:
        from PIL import ImageGrab
        import io
        import base64
        
        # Capture full screen
        screenshot = ImageGrab.grab()
        
        # Optimize for AI (resize if too large)
        if screenshot.width > 1280:
            screenshot.thumbnail((1280, 1280))
            
        buffered = io.BytesIO()
        screenshot.save(buffered, format="JPEG", quality=85)
        img_str = base64.b64encode(buffered.getvalue()).decode()
        
        return jsonify({
            "status": "success", 
            "image": f"data:image/jpeg;base64,{img_str}"
        })
    except ImportError:
        return jsonify({
            "status": "error", 
            "message": "Missing dependencies for screenshots. Please run 'pip install pillow'"
        }), 500
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
