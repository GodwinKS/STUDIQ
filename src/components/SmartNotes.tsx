import React, { useState, useRef } from 'react';
import { FileText, Upload, X, Loader2, ChevronRight, Music, Film, Headphones, Image as ImageIcon, Link as LinkIcon, Sparkles, Mic } from 'lucide-react';
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../utils';
import { generateSmartNotes, generateSmartNotesFromUrl, generateSmartNotesFromText, analyzeDiagram, solveFormula } from '../lib/gemini';
import { VoiceRecorder } from './VoiceRecorder';

export function SmartNotes() {
  const [selectedFile, setSelectedFile] = useState<{ name: string, type: string, base64: string } | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [isHandwritten, setIsHandwritten] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<'notes' | 'diagram' | 'formula'>('notes');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      setError("File is too large. Please upload a file smaller than 20MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setSelectedFile({
        name: file.name,
        type: file.type,
        base64
      });
      setLinkUrl(''); // Clear link if file is uploaded
      setError(null);
      setResult(null);
    };
    reader.readAsDataURL(file);
  };

  const removeFile = () => {
    setSelectedFile(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleVoiceRecording = (content: string, mimeType: string) => {
    setSelectedFile({
      name: `voice-recording-${new Date().getTime()}`,
      type: mimeType,
      base64: content // This might be text or base64
    });
    setLinkUrl('');
    setError(null);
    setResult(null);
  };

  const processSmartNotes = async () => {
    if (!selectedFile && !linkUrl) return;
    
    setIsAnalyzing(true);
    setError(null);
    
    try {
      if (selectedFile) {
        let responseText;

        if (selectedFile.type === 'text/plain') {
          responseText = await generateSmartNotesFromText(selectedFile.base64);
        } else if (analysisMode === 'diagram') {
          responseText = await analyzeDiagram(selectedFile.base64, selectedFile.type);
        } else if (analysisMode === 'formula') {
          responseText = await solveFormula(selectedFile.base64, selectedFile.type);
        } else {
          responseText = await generateSmartNotes(selectedFile.base64, selectedFile.type, isHandwritten);
        }
        setResult(responseText || "No response received.");
      } else if (linkUrl) {
        const responseText = await generateSmartNotesFromUrl(linkUrl);
        setResult(responseText || "No response received.");
      }
    } catch (err: any) {
      console.error(err);
      setError("Analysis failed: " + (err.message || "Unknown error"));
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-12 pb-20 scroll-smooth">
      <div className="space-y-4">
        <div className="flex items-center gap-4 text-[#5A5A40]">
          <div className="p-4 bg-[#5A5A40]/10 rounded-2xl brutalist-card !p-3">
            <Sparkles size={32} />
          </div>
          <div>
            <h1 className="text-4xl font-serif italic font-medium leading-tight">Smart Notes</h1>
            <p className="text-[#141414]/60 font-serif">Unified AI engine for Audio, Video, Links, and Handwritten Digits.</p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-12 items-start">
        <div className="space-y-8">
          <div className="bg-white rounded-[40px] p-10 border-2 border-brand-primary shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] space-y-8">
            {/* File Upload Area */}
            <div 
              className={`border-2 border-dashed rounded-[32px] p-10 transition-all cursor-pointer ${
                selectedFile ? 'border-[#5A5A40] bg-[#5A5A40]/5' : 'border-[#141414]/10 hover:border-[#5A5A40]/30'
              }`}
              onClick={() => !selectedFile && fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="audio/*,video/*,image/*"
                className="hidden"
              />
              
              <AnimatePresence mode="wait">
                {!selectedFile ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center gap-4 text-center"
                  >
                    <div className="flex gap-3 text-[#141414]/20">
                      <ImageIcon size={24} />
                      <Music size={24} />
                      <Film size={24} />
                    </div>
                    <div>
                      <p className="font-medium text-[#141414]">Upload lecture media</p>
                      <p className="text-xs text-[#141414]/40 font-serif italic">Image, Audio, or Video (Max 20MB)</p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-4 text-left">
                      <div className="p-3 bg-white rounded-2xl shadow-sm">
                        {selectedFile.type.startsWith('image') ? <ImageIcon className="text-[#5A5A40]" /> : 
                         selectedFile.type.startsWith('video') ? <Film className="text-[#5A5A40]" /> : 
                         <Headphones className="text-[#5A5A40]" />}
                      </div>
                      <div className="max-w-[150px]">
                        <p className="font-medium truncate text-sm">{selectedFile.name}</p>
                        <p className="text-[10px] uppercase tracking-widest text-[#141414]/40">{selectedFile.type}</p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFile(); }}
                      className="p-2 hover:bg-white rounded-full transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Voice Recording Option */}
            <div className="flex items-center justify-between p-4 bg-[#5A5A40]/5 rounded-2xl border border-[#5A5A40]/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white rounded-lg">
                  <Mic size={18} className="text-[#5A5A40]" />
                </div>
                <div>
                  <p className="text-sm font-medium">Live Lecture Record</p>
                  <p className="text-[10px] text-[#141414]/40 uppercase tracking-widest">Listen & Transcribe in real-time</p>
                </div>
              </div>
              <VoiceRecorder onRecordingComplete={handleVoiceRecording} isProcessing={isAnalyzing} />
            </div>

            {/* Link Input */}
            <div className="space-y-3">
              <label className="text-[11px] font-mono uppercase tracking-[0.2em] opacity-40 ml-1">Or Paste Lecture Link</label>
              <div className="relative">
                <input
                  type="text"
                  value={linkUrl}
                  onChange={(e) => { 
                    setLinkUrl(e.target.value);
                    if (e.target.value) setSelectedFile(null);
                  }}
                  placeholder="YouTube, Web Article, Drive Link..."
                  className="w-full bg-gray-50 rounded-2xl p-4 pl-12 border border-[#141414]/5 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/20 transition-all font-serif italic"
                />
                <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-[#141414]/20" size={18} />
              </div>
            </div>

            {/* Options */}
            {selectedFile?.type.startsWith('image') && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'notes', label: 'General Notes', icon: <FileText size={14} /> },
                    { id: 'diagram', label: 'Circuit/Diagram', icon: <Sparkles size={14} /> },
                    { id: 'formula', label: 'Formula Solver', icon: <Sparkles size={14} /> }
                  ].map(mode => (
                    <button
                      key={mode.id}
                      onClick={() => setAnalysisMode(mode.id as any)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border",
                        analysisMode === mode.id 
                          ? "bg-[#5A5A40] text-white border-[#5A5A40]" 
                          : "bg-white text-[#141414]/60 border-[#141414]/10 hover:border-[#5A5A40]/30"
                      )}
                    >
                      {mode.icon}
                      {mode.label}
                    </button>
                  ))}
                </div>

                {analysisMode === 'notes' && (
                  <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-2xl border border-[#141414]/5 cursor-pointer hover:bg-gray-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={isHandwritten}
                      onChange={(e) => setIsHandwritten(e.target.checked)}
                      className="w-5 h-5 rounded-lg border-[#141414]/10 text-[#5A5A40] focus:ring-[#5A5A40]"
                    />
                    <div>
                      <p className="text-sm font-medium">Handwritten Mode</p>
                      <p className="text-[10px] text-[#141414]/40 uppercase tracking-widest leading-none mt-1">Optimize OCR for handwriting</p>
                    </div>
                  </label>
                )}
              </div>
            )}

            <button
              onClick={processSmartNotes}
              disabled={isAnalyzing || (!selectedFile && !linkUrl)}
              className="w-full bg-[#5A5A40] text-white p-5 rounded-3xl font-medium flex items-center justify-center gap-3 shadow-xl hover:translate-y-[-2px] active:translate-y-[0px] transition-all disabled:opacity-50"
            >
              {isAnalyzing ? (
                <Loader2 className="animate-spin" />
              ) : (
                <>
                  <Sparkles size={20} />
                  Generate AI Smart Notes
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="p-6 bg-red-50 text-red-600 rounded-[32px] border border-red-100 flex items-start gap-4">
              <div className="p-2 bg-white rounded-xl shadow-sm">
                <X size={16} />
              </div>
              <p className="text-sm font-medium leading-relaxed">{error}</p>
            </div>
          )}
        </div>

        <div className="h-full">
          {!result && !isAnalyzing ? (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-12 border border-[#141414]/5 rounded-[40px] bg-white/50 opacity-40">
              <FileText size={48} className="mb-4" />
              <p className="font-serif italic">Your detailed structured notes will appear here...</p>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between px-4">
                <span className="text-[11px] font-mono uppercase tracking-[0.2em] opacity-40">Knowledge Synthesis</span>
                <span className="flex items-center gap-2 text-[10px] font-mono text-[#5A5A40]">
                  {isAnalyzing ? <Loader2 size={12} className="animate-spin" /> : 'Ready to Copy'}
                </span>
              </div>
              
              {isAnalyzing ? (
                <div className="bg-white p-12 rounded-[40px] space-y-8 animate-pulse border border-[#141414]/5">
                  <div className="space-y-3">
                    <div className="h-6 bg-gray-100 rounded w-1/3"></div>
                    <div className="h-4 bg-gray-100 rounded w-1/2"></div>
                  </div>
                  <div className="space-y-4">
                    <div className="h-32 bg-gray-100 rounded w-full"></div>
                    <div className="h-24 bg-gray-100 rounded w-full"></div>
                  </div>
                </div>
              ) : (
                <div className="prose prose-stone max-w-none bg-white p-8 md:p-12 rounded-[40px] border border-[#141414]/5 shadow-sm leading-relaxed overflow-hidden">
                  <Markdown>{result || ''}</Markdown>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
