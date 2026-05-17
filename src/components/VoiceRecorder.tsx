import React, { useState, useRef } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface VoiceRecorderProps {
  onRecordingComplete: (base64: string, mimeType: string) => void;
  isProcessing?: boolean;
}

export function VoiceRecorder({ onRecordingComplete, isProcessing }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startRecording = async () => {
    try {
      setError(null);
      // Hard Bypass: Always use hardware recording in Saathi-OS for reliability
      const res = await fetch('/api/bridge/record/start', { method: 'POST' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Hardware bridge unreachable. Run bridge.py locally.");
      }
      setIsRecording(true);
    } catch (err: any) {
      console.error('Hardware recording error:', err);
      setError(err.message);
      alert(err.message);
    }
  };

  const stopRecording = async () => {
    try {
      setIsRecording(false);
      // Processing starts immediately on stop
      const res = await fetch('/api/bridge/record/stop', { method: 'POST' });
      if (!res.ok) throw new Error("Hardware recording failed to save or transcribe.");
      
      const data = await res.json();
      if (data.status === 'success') {
        const text = data.text;
        // The parent expects a base64 for legacyReasons but we can just pass the text now
        // or actually, let's keep the interface but modify implementation in parent if needed
        // For now, onRecordingComplete is designed to send to AI, but the bridge already did transcribe.
        // I will pass the transcribed text as a special 'text' mimeType or similar
        onRecordingComplete(text, 'text/plain');
      }
    } catch (err: any) {
      console.error('Stop recording failed:', err);
      alert(err.message);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={isRecording ? stopRecording : startRecording}
        disabled={isProcessing}
        className={`p-3 rounded-full transition-all relative ${
          isRecording 
            ? 'bg-red-500 text-white animate-pulse' 
            : 'bg-[#5A5A40]/10 text-[#5A5A40] hover:bg-[#5A5A40]/20'
        } disabled:opacity-50`}
      >
        {isProcessing ? (
          <Loader2 className="animate-spin" size={20} />
        ) : isRecording ? (
          <Square size={20} />
        ) : (
          <Mic size={20} />
        )}
        
        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1.2, opacity: 0.3 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="absolute inset-0 bg-red-500 rounded-full"
            />
          )}
        </AnimatePresence>
      </button>
    </div>
  );
}
