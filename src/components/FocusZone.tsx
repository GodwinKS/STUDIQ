import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, Shield, Brain, Coffee, AlertTriangle, Search, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeFocus, useSaathiSettings } from '../lib/gemini';
import { fetchWithRetry } from '../lib/api';
import { cn } from '../lib/utils';

export function FocusZone() {
  const { isLocal } = useSaathiSettings();
  const [isActive, setIsActive] = useState(false);
  const [isShieldActive, setIsShieldActive] = useState(false);
  const [time, setTime] = useState(0);
  const [sessionScore, setSessionScore] = useState(10);
  const [status, setStatus] = useState<'focused' | 'distracted' | 'idle'>('idle');
  const [lastAnalysis, setLastAnalysis] = useState<any>(null);
  const [lastScreenshot, setLastScreenshot] = useState<string | null>(null);

  const isHardwareMutedRef = useRef(false);
  const isHardwareBrightBoostedRef = useRef(false);
  const isHardwareDimmedRef = useRef(false);

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
      // 1. Check for AI refusals or "unable to access" hallucinations
      const lowerText = text.toLowerCase();
      if (lowerText.includes("unable to access") || 
          lowerText.includes("cannot see") || 
          lowerText.includes("i am an ai") ||
          lowerText.includes("sorry") ||
          lowerText.includes("as an ai model") ||
          !text.includes('{')) {
        console.warn("AI hallucinated limitation or refused analysis. Preserving current session score.");
        return null;
      }

      // 2. Clean the text of markdown noise if it exists
      let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      // 3. Find the first '{' and last '}'
      const start = cleanText.indexOf('{');
      const end = cleanText.lastIndexOf('}');
      
      if (start === -1 || end === -1) return null;
      
      const jsonStr = cleanText.substring(start, end + 1);
      return JSON.parse(jsonStr);
    } catch (e) {
      console.warn("JSON Parse Error (AI Hallucinated):", e, text);
      return null;
    }
  };

  useEffect(() => {
    if (!isActive || !isShieldActive) {
      if (isHardwareMutedRef.current) {
        fetch('/api/bridge/mute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mute: false }) }).catch(() => {});
        isHardwareMutedRef.current = false;
      }
      if (isHardwareDimmedRef.current || isHardwareBrightBoostedRef.current) {
        fetch('/api/bridge/dim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ percent: 90 }) }).catch(() => {});
        isHardwareDimmedRef.current = false;
        isHardwareBrightBoostedRef.current = false;
      }
      return;
    }

    if (sessionScore < 5) {
      // Distraction logic
      if (!isHardwareDimmedRef.current) {
        fetch('/api/bridge/dim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ percent: 20 })
        }).then(() => { isHardwareDimmedRef.current = true; isHardwareBrightBoostedRef.current = false; })
          .catch(() => {});
      }
    } else if (sessionScore > 9.5) {
      // Deep focus logic
      if (!isHardwareBrightBoostedRef.current) {
        fetch('/api/bridge/brightness', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adjustment: 10 })
        }).then(() => { 
          isHardwareBrightBoostedRef.current = true;
          isHardwareDimmedRef.current = false;
        }).catch(() => {});
      }
      if (!isHardwareMutedRef.current) {
        fetch('/api/bridge/mute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mute: true }) })
          .then(() => { isHardwareMutedRef.current = true; })
          .catch(() => {});
      }
    } else if (sessionScore > 7) {
      // Normal focus - Reset to standard high
      if (isHardwareDimmedRef.current || isHardwareBrightBoostedRef.current) {
        fetch('/api/bridge/dim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ percent: 90 }) 
        }).then(() => { 
          isHardwareDimmedRef.current = false;
          isHardwareBrightBoostedRef.current = false;
        }).catch(() => {});
      }
      if (isHardwareMutedRef.current) {
        fetch('/api/bridge/mute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mute: false }) })
          .then(() => { isHardwareMutedRef.current = false; })
          .catch(() => {});
      }
    }
  }, [sessionScore, isActive, isShieldActive]);

  useEffect(() => {
    let timerInterval: any;
    let analysisTimeout: any;

    const runAnalysisCycle = async () => {
      // Hardware/Local Mode path - Now default
      if (!isAnalyzing) {
        setIsAnalyzing(true);
        setAnalysisError(null);
        try {
          // 1. Get Screenshot
          const ssRes = await fetch('/api/bridge/screenshot');
          if (!ssRes.ok) {
            const errData = await ssRes.json().catch(() => ({}));
            throw new Error(errData.error || "Bridge Error. Ensure bridge.py is running.");
          }
          const ssData = await ssRes.json();
          
          // 2. Get Window Titles (for better context & split-screen detection)
          let windowContext = "Unknown Activity";
          let allVisibleWindows: string[] = [];
          try {
            const winRes = await fetch('/api/bridge/windows');
            if (winRes.ok) {
              const winData = await winRes.json();
              windowContext = winData.active_window || winData.active_app || "Unknown";
              allVisibleWindows = winData.all_visible_windows || [];
            }
          } catch (winErr) {
            console.warn("Window tracking failed", winErr);
          }

          if (ssData.status === 'success') {
            setLastScreenshot(ssData.image); 
            const base64Data = ssData.image.split(',')[1];
            // 3. Analyze with AI
            const resText = await analyzeFocus(base64Data, "image/jpeg", windowContext, allVisibleWindows);
            const data = extractJson(resText);
            
            if (data) {
              setLastAnalysis(data);
              setSessionScore(prev => {
                let newScore = Number(data.focusScore);
                if (isNaN(newScore)) return prev;

                // USER REQUEST: Fast reaction for clear distractions/study
                if (newScore <= 2) return newScore; // Instagram immediate drop
                if (newScore >= 9.5 && prev < 8) return (prev + newScore) / 2; // Faster boost for PDF

                // Heavy penalization for distraction, but slow decay for focus recovery
                if (newScore < 5) {
                  if (prev < 6) return Math.max(0, newScore); 
                  return Math.max(5.1, prev - 2); 
                }
                
                if (newScore < prev) return Math.max(0, (prev * 2 + newScore) / 3);
                return Math.min(10, (prev * 4 + newScore) / 5); 
              }); 
              
              if (data.distractionType !== 'none' && data.focusScore < 7 && isShieldActive) {
                  if (data.actionsRequired) {
                    data.actionsRequired.forEach(async (action: string) => {
                      try {
                        if (action === 'mute_notifications') {
                          await fetch('/api/bridge/notify', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                              title: "Saathi Focus Warning",
                              message: `Distraction detected: ${data.distractionType}. Focus back!`
                            })
                          });
                        }
                      } catch (e) {
                        console.warn(`Local action ${action} failed:`, e);
                      }
                    });
                  }
              }
            } else {
              console.log("Analysis cycle skipped (AI Hallucinated Limitations).");
            }
          }
        } catch (e: any) {
          console.error("Local Analysis failed", e);
          setAnalysisError(e.message || "Hardware Error");
        }
        setIsAnalyzing(false);
      }
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
      // Hardware mode: Use the python bridge to take screenshots
      setIsActive(true);
      setStatus('focused');
      toggleShield(true);
      fetchWithRetry('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hardware-Level Focus Session Started', type: 'session_start' })
      }).catch(e => console.warn('Start session log failed:', e));
    } catch (e: any) {
      console.error("Hardware bridge session failed", e);
      alert("Could not start session. Ensure Saathi Hardware Bridge (bridge.py) is running locally.");
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

      {/* Diagnostic View (Debug) */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 p-8 rounded-[44px] bg-white border-2 border-brand-primary shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] overflow-hidden"
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#5A5A40]/10 rounded-lg">
              <Search size={20} className="text-[#5A5A40]" />
            </div>
            <div>
              <h4 className="text-sm font-bold uppercase tracking-tight">Focus Diagnostic Engine</h4>
              <p className="text-[10px] opacity-50 font-mono">Real-time Activity & Heuristics Tracker</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono bg-black text-white px-2 py-0.5 rounded uppercase tracking-tighter">
              {isActive ? 'Live Monitoring' : 'Standby'}
            </span>
            <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-red-500 animate-pulse' : 'bg-gray-300'}`} />
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="aspect-video rounded-3xl bg-black/5 overflow-hidden border-2 border-black/5 relative group shadow-inner">
              {lastScreenshot ? (
                <img src={lastScreenshot} alt="Last Focus Frame" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-black/20 gap-2">
                  <Activity className={isActive ? "animate-spin" : ""} />
                  <span className="text-[10px] font-mono uppercase">
                    {isActive ? "Capturing Frame..." : "Start Session to see Screen Capture"}
                  </span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex flex-col gap-4 justify-center">
            <div className="p-6 rounded-3xl bg-[#5A5A40]/5 border border-[#5A5A40]/10 flex-1 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#5A5A40]/10 blur-3xl -mr-12 -mt-12" />
              <div className="text-[10px] font-mono uppercase opacity-40 mb-3 tracking-widest font-bold">Heuristic Reasoning</div>
              <div className="text-sm leading-relaxed text-[#5A5A40] italic font-serif">
                {lastAnalysis?.thought ? (
                  `"${lastAnalysis.thought}"`
                ) : (
                  "Waiting for next analysis cycle... Saathi analyzes split-screen context every 15s."
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-white border border-black/5 shadow-sm">
                <div className="text-[10px] font-mono uppercase opacity-40 mb-1">Detected Subject</div>
                <div className="text-sm font-bold truncate">{lastAnalysis?.subject || "Detecting..."}</div>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-black/5 shadow-sm">
                <div className="text-[10px] font-mono uppercase opacity-40 mb-1">Distraction Status</div>
                <div className={`text-sm font-bold uppercase ${lastAnalysis?.distractionType !== 'none' && lastAnalysis?.distractionType !== undefined ? 'text-red-500' : 'text-green-600'}`}>
                  {lastAnalysis?.distractionType && lastAnalysis.distractionType !== 'none' ? lastAnalysis.distractionType : "CLEAN"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

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
                      {sessionScore > 9.5 && (
                        <div className="bg-purple-50 p-2 rounded-lg border border-purple-200 mt-2 animate-pulse">
                          <p className="text-[10px] font-mono text-purple-800 uppercase font-bold tracking-tight mb-1">Deep Focus Bonus:</p>
                          <div className="flex flex-wrap gap-1">
                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-900 rounded text-[10px] font-mono leading-none border border-purple-300">
                              +10% Brightness Boost
                            </span>
                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-900 rounded text-[10px] font-mono leading-none border border-purple-300">
                              Mute Active
                            </span>
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

          <div className="bg-[#141414] text-white p-8 rounded-[40px] shadow-lg space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <Shield size={24} className="text-blue-400" />
              <h4 className="font-bold">Active Shield Policy</h4>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="opacity-60">Screen Dimmer</span>
                <span className={cn("px-2 py-0.5 rounded font-mono", isShieldActive ? "bg-green-500/20 text-green-400" : "bg-white/10 opacity-40")}>
                  {isShieldActive ? "READY" : "OFF"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="opacity-60">Notifications Mute</span>
                <span className={cn("px-2 py-0.5 rounded font-mono", isShieldActive ? "bg-green-500/20 text-green-400" : "bg-white/10 opacity-40")}>
                  {isShieldActive ? "HARDENED" : "OFF"}
                </span>
              </div>
              <p className="text-[10px] opacity-40 leading-relaxed font-serif italic border-t border-white/10 pt-3">
                If distraction &gt; 30s, brightness drops to 20% &amp; warning notifies system.
              </p>
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
