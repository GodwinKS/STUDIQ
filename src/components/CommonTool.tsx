import React, { useState, useRef } from 'react';
import { Camera, RefreshCw, X, Loader2, ChevronRight, HelpCircle, Mic } from 'lucide-react';
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { explainImage, Language, transcribeAudioToText } from '../lib/gemini';
import { VoiceRecorder } from './VoiceRecorder';

export function CommonTool() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>('hindi');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const title = 'AI Masterclass';
  const description = 'Upload any engineering diagram, book page, concept, or formula. I will explain it in detail step-by-step.';

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
        setResult(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleVoiceInput = async (base64OrText: string, mimeType: string) => {
    setIsTranscribing(true);
    try {
      if (mimeType === 'text/plain') {
        // Direct transcription from bridge
        setCustomPrompt(prev => prev ? `${prev} ${base64OrText}` : base64OrText);
      } else {
        const text = await transcribeAudioToText(base64OrText, mimeType, language);
        if (text) {
          setCustomPrompt(prev => prev ? `${prev} ${text}` : text);
        }
      }
    } catch (err) {
      console.error('Transcription failed:', err);
      setError('Voice transcription failed. Please try again.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const captureScreen = async () => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const res = await fetch('/api/bridge/screenshot');
      if (!res.ok) throw new Error("Bridge screenshot failed. Ensure bridge.py is running.");
      const data = await res.json();
      if (data.status === 'success') {
        setSelectedImage(data.image);
        setResult(null);
      }
    } catch (err: any) {
      setError(err.message || "Failed to capture screen.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const analyze = async () => {
    if (!selectedImage) return;
    setIsAnalyzing(true);
    setResult(null);
    setError(null);

    try {
      const mimeType = selectedImage.split(';')[0].split(':')[1];
      const base64Data = selectedImage.split(',')[1];

      const responseText = await explainImage(base64Data, mimeType, language, customPrompt);

      setResult(responseText || "No response received.");
    } catch (err: any) {
      setError(err.message || "Analysis failed. Please check your connection or image quality.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2">
        <h2 className="text-3xl font-bold font-serif italic">{title}</h2>
        <p className="opacity-60 text-sm max-w-xl">{description}</p>
      </div>

      <div className="space-y-6 bg-white p-8 rounded-[40px] border-2 border-brand-primary shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]">
        <div className="space-y-3">
          <label className="text-[11px] font-mono uppercase tracking-[0.2em] opacity-40 ml-1">Select Instruction Language</label>
          <div className="bg-gray-50 rounded-2xl p-1.5 flex flex-wrap gap-1 border border-[#141414]/5">
            {['english', 'hindi', 'malayalam', 'tamil', 'punjabi', 'kannada', 'telugu'].map((lang) => (
              <button
                key={lang}
                onClick={() => setLanguage(lang as any)}
                className={`py-2 px-3 rounded-xl transition-all font-serif italic text-sm flex-1 min-w-[80px] text-center ${
                  language === lang ? 'bg-[#5A5A40] text-white shadow-md' : 'hover:bg-black/5'
                }`}
              >
                {lang.charAt(0).toUpperCase() + lang.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-[11px] font-mono uppercase tracking-widest opacity-40 ml-1">Specific Prompt / Question (Optional)</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="e.g. Explain the second paragraph or solve this formula..."
                className="w-full bg-gray-50 rounded-2xl p-4 border border-[#141414]/5 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/20 transition-all font-serif italic"
              />
            </div>
            <VoiceRecorder onRecordingComplete={handleVoiceInput} isProcessing={isTranscribing} />
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {!selectedImage ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="group h-[320px] rounded-[40px] border-2 border-dashed border-[#141414]/10 hover:border-[#141414]/30 hover:bg-white transition-all cursor-pointer flex flex-col items-center justify-center p-8"
            >
              <div className="p-6 bg-white rounded-full shadow-lg group-hover:scale-110 transition-transform">
                <Camera size={32} />
              </div>
              <div className="mt-6 text-center">
                <p className="text-lg font-bold">Select File</p>
                <p className="text-xs opacity-40 mt-1 uppercase tracking-widest font-mono">Diagram, Notebook Photo, PDF Page</p>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
            </div>

            <div
              onClick={captureScreen}
              className="group h-[320px] rounded-[40px] border-2 border-[#141414] bg-[#F5F5F0] hover:bg-white transition-all cursor-pointer flex flex-col items-center justify-center p-8 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4">
                <div className="px-2 py-1 bg-[#5A5A40] text-white text-[9px] font-mono rounded font-bold uppercase tracking-widest">Hardware Port</div>
              </div>
              <div className="p-6 bg-white rounded-full shadow-lg group-hover:scale-110 transition-transform border border-black/5">
                <RefreshCw size={32} className="text-[#5A5A40]" />
              </div>
              <div className="mt-6 text-center">
                <p className="text-lg font-bold">Capture Desktop</p>
                <p className="text-xs opacity-40 mt-1 uppercase tracking-widest font-mono">Explain what's on my screen right now</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="relative aspect-video rounded-[40px] overflow-hidden border-4 border-white shadow-xl bg-gray-50 max-w-2xl mx-auto">
              <img src={selectedImage} alt="Analysis Target" className="w-full h-full object-contain" />
              <button onClick={clearImage} className="absolute top-4 right-4 p-2 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600">
                <X size={16} />
              </button>
            </div>
            <div className="flex justify-center">
              <button
                disabled={isAnalyzing}
                onClick={analyze}
                className={`px-12 py-4 rounded-full font-bold text-lg shadow-xl transition-all flex items-center gap-3 ${
                  isAnalyzing ? 'bg-black/10 text-black/40' : 'bg-[#141414] text-white hover:-translate-y-1'
                }`}
              >
                {isAnalyzing ? (
                  <><Loader2 className="animate-spin" /> Saathi is Thinking...</>
                ) : (
                  <>Analyze with Saathi <ChevronRight size={20} /></>
                )}
              </button>
            </div>
          </div>
        )}

        <AnimatePresence>
          {(result || error) && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#5A5A40] rounded-full flex items-center justify-center text-white text-xs font-bold shadow-inner">S</div>
                <h4 className="font-bold opacity-40 uppercase tracking-widest text-[10px] font-mono">The Explanation</h4>
              </div>
              {error ? (
                <div className="p-6 bg-red-50 rounded-3xl border border-red-100 flex gap-4 items-center text-red-600">
                  <HelpCircle />
                  <p className="font-medium text-sm">{error}</p>
                </div>
              ) : (
                <div className="prose prose-stone max-w-none bg-white p-8 md:p-12 rounded-[40px] border border-[#141414]/5 shadow-sm leading-relaxed">
                  <Markdown>{result || ''}</Markdown>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
