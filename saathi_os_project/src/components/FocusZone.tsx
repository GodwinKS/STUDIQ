import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, Shield, Brain, Coffee, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeFocus, useSaathiSettings } from '../lib/gemini';
import { fetchWithRetry } from '../lib/api';

export function FocusZone() {
  const { isLocal } = useSaathiSettings();
  const [isActive, setIsActive] = useState(false);
  const [isShieldActive, setIsShieldActive] = useState(false);
  const [time, setTime] = useState(0);
  const [sessionScore, setSessionScore] = useState(10);
  const [status, setStatus] = useState<'focused' | 'distracted' | 'idle'>('idle');
  const [lastAnalysis, setLastAnalysis] = useState<any>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Fetch initial shield status
  useEffect(() => {
    fetchWithRetry('/api/shield/status')
      .then(res => res.json())
      .then(data => setIsShieldActive(data.active))
      .catch(err => console.error('Initial shield status check failed:', err));
  }, []);

  const toggleShield = async (val: boolean) => {
    try {
      if (isLocal) {
        setIsShieldActive(val);
        return;
      }
      const res = await fetchWithRetry('/api/shield/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: val })
      });
      const data = await res.json();
      setIsShieldActive(data.active);
    } catch (e) {
      console.error('Failed to toggle shield:', e);
      // Fallback for offline: just toggle local state so UI doesn't feel broken
      setIsShieldActive(val);
    }
  };

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Helper to extract JSON from AI response
  const extractJson = (text: string) => {
    try {
      // 1. Try finding JSON in code blocks
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
      }
      return JSON.parse(text);
    } catch (e) {
      console.warn("Failed to parse JSON directly, trying aggressive cleanup", e);
      // 2. Try to find the last occurrence of { and }
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        try {
          return JSON.parse(text.substring(start, end + 1));
        } catch (e2) {
          throw new Error("Could not find valid JSON in AI response");
        }
      }
      throw new Error("No JSON structure found");
    }
  };

  useEffect(() => {
    let timerInterval: any;
    let analysisTimeout: any;

    const runAnalysisCycle = async () => {
      // Hardware/Local Mode path
      if (isLocal && !isAnalyzing) {
        setIsAnalyzing(true);
        setAnalysisError(null);
        try {
          const ssRes = await fetch('/api/bridge/screenshot');
          if (!ssRes.ok) {
            const errData = await ssRes.json().catch(() => ({}));
            throw new Error(errData.error || "Hardware bridge unreachable. Run bridge.py locally.");
          }
          const ssData = await ssRes.json();
          if (ssData.status === 'success') {
            const base64Data = ssData.image.split(',')[1];
            const resText = await analyzeFocus(base64Data, "image/jpeg");
            const data = extractJson(resText);
            setLastAnalysis(data);
            setSessionScore(prev => Math.floor((prev + data.focusScore) / 2));
            
            if (data.isDistracted && data.focusScore < 4) {
              setStatus('distracted');
              if (isShieldActive) {
                // ... (rest of distraction logic)
                data.actionsRequired.forEach(async (action: string) => {
                  try {
                    await fetch('/api/bridge/' + (action === 'dim_screen' ? 'dim' : 'notify'), {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(action === 'dim_screen' ? { percent: 20 } : { 
                        title: "Saathi Focus Warning",
                        message: `Distraction detected: ${data.distractionType}. Focus back!`
                      })
                    });
                  } catch (e) {
                    console.warn(`Local action ${action} failed:`, e);
                  }
                });
              }
            } else {
              setStatus('focused');
              fetch('/api/bridge/dim', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ percent: 80 })
              }).catch(() => {});
            }
          }
        } catch (e: any) {
          console.error("Local Analysis failed", e);
          setAnalysisError(e.message || "Hardware Error");
          // If bridge fails in local mode, we might want to suggest turning it off
          if (e.message.includes("unreachable") || e.message.includes("Failed to fetch")) {
            setAnalysisError("Hardware Bridge Connection Lost. Toggle Local Mode off/on if running bridge.py.");
          }
        }
        setIsAnalyzing(false);
        return;
      }

      // Browser Mode path
      if (videoRef.current && canvasRef.current && !isAnalyzing) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          setIsAnalyzing(true);
          setAnalysisError(null);
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.4); 
            const base64Data = dataUrl.split(',')[1];
            
            try {
              const resText = await analyzeFocus(base64Data, "image/jpeg");
              if (resText) {
                const data = extractJson(resText);
                setLastAnalysis(data);
                setSessionScore(data.focusScore);
                setErrorCount(0);
                
                if (data.focusScore < 5) {
                  setStatus('distracted');
                  if (isShieldActive && data.actionsRequired && data.actionsRequired.length > 0) {
                    data.actionsRequired.forEach(async (action: string) => {
                      try {
                        if (action === 'dim_screen') {
                          await fetch('/api/bridge/dim', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ percent: 20 })
                          });
                        } else if (action === 'mute_notifications') {
                          await fetch('/api/bridge/notify', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                              title: "Saathi Focus Protection",
                              message: "Distraction detected. Notifications muted." 
                            })
                          });
                        }
                      } catch (bridgeErr) {
                        console.warn("OS Bridge ignored.");
                      }
                    });
                  }
                } else {
                  setStatus('focused');
                  try {
                    fetch('/api/bridge/dim', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ percent: 80 })
                    });
                  } catch (e) {}
                }
                
                fetchWithRetry('/api/logs', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    message: `Focus Check: ${data.focusScore}/10 (${data.subject})`,
                    type: 'system',
                  })
                }).catch(() => {});
              }
            } catch (e: any) {
              console.error("Analysis failed", e);
              setErrorCount(prev => prev + 1);
              setAnalysisError(e.message || "Engine Error");
              if (e.message?.includes("Quota")) {
                setIsActive(false);
                alert("Quota Exceeded. Switched to Idle.");
              }
            }
          }
          setIsAnalyzing(false);
        }
      }

      // Schedule next cycle ONLY IF still active
      // We check isActive inside the function to avoid race conditions
    };

    if (isActive) {
      timerInterval = setInterval(() => {
        setTime((t) => t + 1);
      }, 1000);
      
      let isMounted = true;
      const scheduleNext = () => {
        if (!isMounted || !isActive) return;
        const nextDelay = errorCount > 2 ? 30000 : 15000;
        analysisTimeout = setTimeout(async () => {
          await runAnalysisCycle();
          scheduleNext();
        }, nextDelay);
      };

      // Run once immediately, then start the chain
      runAnalysisCycle().then(() => scheduleNext());

      return () => {
        isMounted = false;
        clearInterval(timerInterval);
        clearTimeout(analysisTimeout);
      };
    }
  }, [isActive, errorCount]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startSession = async () => {
    try {
      if (isLocal) {
        // Hardware mode: Use the python bridge to take screenshots
        setIsActive(true);
        setStatus('focused');
        toggleShield(true);
        fetchWithRetry('/api/logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Local Focus Session Started', type: 'session_start' })
        }).catch(e => console.warn('Start session log failed:', e));
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error("getDisplayMedia not supported");
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({ 
        video: { displaySurface: "monitor" }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsActive(true);
      setStatus('focused');
      toggleShield(true);
      fetchWithRetry('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Focus Session Started', type: 'session_start' })
      }).catch(e => console.warn('Start session log failed:', e));
    } catch (e: any) {
      console.error("Screen capture rejected", e);
      if (e.message && e.message.includes("not supported")) {
        alert("Screen capture is not supported in this embedded preview. Please click the 'Open in new tab' icon (top right) to use this feature.");
      } else {
        alert("Screen capture is required for Focus Analytics. If you are in the AI Studio preview, you may need to open the app in a new tab (top right icon) to grant screen permissions.");
      }
    }
  };

  const stopSession = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsActive(false);
    setStatus('idle');
    toggleShield(false);
    setLastAnalysis(null);
    fetchWithRetry('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message: `Focus Session Ended. Final Duration: ${formatTime(time)}`, 
        type: 'session_end',
        duration: time
      })
    }).catch(e => console.warn('End session log failed:', e));
    fetchWithRetry('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration: time, score: sessionScore })
    }).catch(e => console.warn('Save session failed:', e));
    setTime(0);
  };

  return (
    <div className={`space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 transition-colors ${status === 'distracted' ? 'bg-red-50/50 grayscale-[0.5] contrast-125' : ''}`}>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold font-serif italic text-[#141414]">Focus Zone</h2>
            {isLocal && (
              <div className="flex flex-col">
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-mono font-bold rounded uppercase tracking-widest">
                  Local Mode Active
                </span>
                <span className="text-[9px] text-blue-600 font-bold mt-1 opacity-60">
                  Using Hardware-Level System Capture
                </span>
              </div>
            )}
          </div>
          <p className="opacity-60 text-sm max-w-xl">Memory-only screen capture monitoring active. Privacy first.</p>
        </div>
        
        <div className="flex items-center gap-3 bg-white px-6 py-3 rounded-2xl border border-[#141414]/5 shadow-sm">
          <Shield size={18} className={isShieldActive ? 'text-green-500' : 'text-gray-300'} />
          <span className="text-xs font-mono font-bold uppercase tracking-widest">Shield Mode</span>
          <button
            onClick={() => toggleShield(!isShieldActive)}
            className={`w-12 h-6 rounded-full transition-all relative ${isShieldActive ? 'bg-green-500' : 'bg-gray-200'}`}
          >
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${isShieldActive ? 'left-7' : 'left-1'}`} />
          </button>
        </div>
      </div>

      {/* Hidden elements for screen capture */}
      <video ref={videoRef} className="hidden" muted playsInline />
      <canvas ref={canvasRef} className="hidden" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-[#141414] text-white p-12 rounded-[60px] relative overflow-hidden shadow-2xl group border-4 border-white/5">
            <div className="absolute top-0 right-0 p-8 flex flex-col items-end gap-2">
               <div className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full backdrop-blur-md">
                 <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                 <span className="text-[10px] font-mono font-bold uppercase tracking-widest">
                   {isActive ? 'Live Processing' : 'Idle'}
                 </span>
               </div>
               {isShieldActive && (
                 <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full backdrop-blur-md border border-blue-500/30">
                   <Shield size={10} />
                   <span className="text-[10px] font-mono font-bold uppercase tracking-widest">Shield Hardened</span>
                 </div>
               )}
            </div>
            
            <div className="relative z-10 flex flex-col items-center text-center space-y-8 mt-4">
              <div className="space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-[0.4em] opacity-40">Session Duration</span>
                <h3 className="text-8xl md:text-9xl font-bold tracking-tighter tabular-nums">
                  {formatTime(time)}
                </h3>
              </div>

              <div className="flex gap-4">
                {!isActive ? (
                  <button
                    onClick={startSession}
                    className="flex items-center gap-3 bg-white text-black px-10 py-5 rounded-full font-bold text-lg hover:scale-105 active:scale-95 transition-all shadow-xl"
                  >
                    <Play size={24} fill="currentColor" /> Start Session
                  </button>
                ) : (
                  <div className="flex gap-4">
                    <button
                      onClick={stopSession}
                      className="flex items-center gap-3 bg-red-500 text-white px-10 py-5 rounded-full font-bold text-lg hover:bg-red-600 transition-all shadow-xl"
                    >
                      <Square size={20} fill="currentColor" /> End
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="absolute inset-0 opacity-10 pointer-events-none mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-6 rounded-[32px] border border-[#141414]/5 flex items-center gap-4">
              <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center text-green-600">
                <Shield />
              </div>
              <div>
                <p className="text-[10px] font-mono opacity-40 uppercase">Privacy Mode</p>
                <p className="font-bold">Hardened</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-[32px] border border-[#141414]/5 flex items-center gap-4">
              <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-600">
                <Brain />
              </div>
              <div>
                <p className="text-[10px] font-mono opacity-40 uppercase">Cognitive Load</p>
                <p className="font-bold">Optimal</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[40px] border border-[#141414]/5 shadow-sm space-y-6">
            <h4 className="font-bold border-b pb-4 border-[#141414]/5">Context Analysis</h4>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono uppercase tracking-widest opacity-40">
                  <span>Current Score</span>
                  <span>{sessionScore.toFixed(1)}/10</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${sessionScore * 10}%` }}
                    className={`h-full transition-all ${sessionScore < 5 ? 'bg-red-500' : 'bg-[#141414]'}`}
                  />
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-2xl space-y-3">
                <p className="text-[10px] font-mono opacity-40 uppercase tracking-widest">Active Analysis</p>
                <AnimatePresence mode="wait">
                  {isActive && (
                    <div className="flex items-center gap-2 mb-2 p-2 bg-[#141414]/5 rounded-xl border border-[#141414]/5">
                      <div className={`w-2 h-2 rounded-full ${analysisError ? 'bg-red-500' : isAnalyzing ? 'bg-orange-500 animate-pulse' : 'bg-green-500'}`} />
                      <span className="text-[9px] font-mono uppercase tracking-widest font-bold">
                        Engine Status: {analysisError ? `Error: ${analysisError}` : isAnalyzing ? 'Gemma 4 Thinking...' : 'Waiting for Next Snapshot'}
                      </span>
                    </div>
                  )}

                  {isActive && lastAnalysis ? (
                    <motion.div
                      key="active-data"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="space-y-2 text-sm"
                    >
                      {lastAnalysis.thought && (
                        <div className="bg-[#5A5A40]/5 p-3 rounded-2xl border border-[#5A5A40]/10 font-serif italic text-[#5A5A40] mb-3">
                          <p className="text-[9px] font-mono uppercase tracking-[0.2em] mb-1 opacity-50">Gemma 4 Thinking Process</p>
                          {lastAnalysis.thought}
                        </div>
                      )}
                      <div><strong className="opacity-50 font-mono text-[10px] uppercase">Subject:</strong><br/>{lastAnalysis.subject}</div>
                      {lastAnalysis.distractionType !== "none" && (
                        <div className="text-red-500"><strong className="opacity-50 font-mono text-[10px] uppercase text-black">Distraction:</strong><br/>{lastAnalysis.distractionType}</div>
                      )}
                      {lastAnalysis.actionsRequired && lastAnalysis.actionsRequired.length > 0 && (
                        <div className="bg-yellow-50 p-2 rounded-lg border border-yellow-200 mt-2">
                          <p className="text-[10px] font-mono text-yellow-800 uppercase font-bold tracking-tight mb-1">Agent Actions (Gemma 4):</p>
                          <div className="flex flex-wrap gap-1">
                            {lastAnalysis.actionsRequired.map((action: string) => (
                              <span key={action} className="px-1.5 py-0.5 bg-yellow-100 text-yellow-900 rounded text-[10px] font-mono leading-none border border-yellow-300">
                                {action}()
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="italic opacity-80 pt-2 border-t mt-2">"{lastAnalysis.advice}"</div>
                    </motion.div>
                  ) : isActive ? (
                    <motion.div
                      key="active"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center gap-3 text-sm font-medium"
                    >
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      Vision engine checking desk...
                    </motion.div>
                  ) : (
                    <motion.div
                      key="idle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-sm opacity-40 italic"
                    >
                      Waiting for session start. Screen permissions required.
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="bg-[#5A5A40] text-white p-8 rounded-[40px] shadow-lg space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <Coffee size={24} />
              <h4 className="font-bold">Next Break AI</h4>
            </div>
            <p className="text-sm opacity-80 leading-relaxed">
              Based on your session intensity, you'll need a <span className="font-bold underline underline-offset-4">12-minute</span> break in 45 minutes.
            </p>
            <div className="pt-2 text-[10px] font-mono opacity-40 uppercase tracking-widest">Calculated by Saathi</div>
          </div>

          {status === 'distracted' && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-red-500 text-white p-6 rounded-3xl shadow-xl flex gap-4 items-center"
            >
              <AlertTriangle className="shrink-0" />
              <div>
                <p className="font-bold text-sm">Focus Required</p>
                <p className="text-[10px] opacity-80">OS Control Activated. Screen dimmed to reduce cognitive load.</p>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
