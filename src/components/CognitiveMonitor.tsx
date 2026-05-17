import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, Coffee, Brain, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchWithRetry, safeJson } from '../lib/api';

export function CognitiveMonitor() {
  const [switches, setSwitches] = useState<number[]>([]);
  const [showWarning, setShowWarning] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const lastSwitchRef = useRef<number>(0);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        // Debounce multiple events that might fire together
        if (now - lastSwitchRef.current > 500) {
          setSwitches(prev => {
            const updated = [...prev, now].filter(t => now - t < 60000); // Only keep last 60s
            
            if (updated.length >= 10 && !isMuted) {
              setShowWarning(true);
              logOverload(updated.length);
            }
            return updated;
          });
          lastSwitchRef.current = now;
        }
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    const lastBridgeWindowRef = { current: '' };

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/bridge/windows');
        if (res.ok) {
          const data = await safeJson(res);
          const winName = data.active_window;
          if (winName && winName !== lastBridgeWindowRef.current) {
             // Window changed at OS level
             const now = Date.now();
             setSwitches(prev => {
                const updated = [...prev, now].filter(t => now - t < 60000);
                if (updated.length >= 10 && !isMuted) {
                  setShowWarning(true);
                  logOverload(updated.length);
                }
                return updated;
             });
             lastBridgeWindowRef.current = winName;
          }
        }
      } catch (e) {}

      const now = Date.now();
      setSwitches(prev => prev.filter(t => now - t < 60000));
    }, 5000);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      clearInterval(pollInterval);
    };
  }, [isMuted]);

  const logOverload = (count: number) => {
    fetchWithRetry('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `High Cognitive Load Detected: ${count} switches/min`,
        type: 'warning',
        metadata: { switchesPerMinute: count }
      })
    }).catch(console.error);
  };

  const getBreakSuggestion = () => {
    // Feature 10: Adaptive Break AI Calculation
    // Multiplier based on switches (Intensity)
    const intensityFactor = Math.max(1, switches.length / 5);
    
    // We'll estimate session time based on when the first switch happened if not passed
    // But for a more robust demo, we'll use a simulated session duration or 
    // simply follow a logic where intensity * base_time = break
    
    // Logic: Every 5 switches adds ~2 mins to a base 5 min break
    // For 45 mins session with high switches (e.g. 15 switches), break = 5 + (15/5)*2 = 11-12 mins
    let breakMinutes = Math.floor(5 + (intensityFactor * 2.5));
    
    // Cap at 30 mins
    breakMinutes = Math.min(30, breakMinutes);

    let label = `${breakMinutes}-minute Neural Cool-down`;
    let reason = "Context switching is creating mental fatigue.";

    if (breakMinutes > 15) {
      label = `${breakMinutes}-minute Deep Reset`;
      reason = "High cognitive load detected. Sustained focus is at risk.";
    } else if (breakMinutes < 7) {
      label = `${breakMinutes}-minute Micro-break`;
      reason = "Minor fragmentation noted. Quick refresh recommended.";
    }
    
    return { label, reason };
  };

  const suggestion = getBreakSuggestion();

  return (
    <>
      <AnimatePresence>
        {showWarning && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed bottom-6 right-6 z-50 w-80 bg-white border-2 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] p-5 rounded-none"
          >
            <div className="flex items-start gap-4">
              <div className="bg-red-100 p-2 rounded-full">
                <AlertCircle className="text-red-600" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-[#141414] text-lg leading-tight">Saathi Alert</h3>
                <p className="text-xs text-[#141414]/70 mt-1 uppercase font-mono tracking-tighter">Adaptive Break AI</p>
                <p className="text-sm text-[#141414]/70 mt-2">
                  You've switched focus <span className="font-bold text-red-600">{switches.length} times</span> recently. {suggestion.reason}
                </p>
                
                <div className="mt-4 bg-blue-50 p-3 flex items-center gap-3 border border-blue-100">
                  <Coffee size={20} className="text-blue-600 shrink-0" />
                  <div>
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-blue-800 opacity-60">AI Calculation</p>
                    <p className="text-sm font-bold text-blue-900">{suggestion.label}</p>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => setShowWarning(false)}
                    className="flex-1 bg-[#141414] text-white py-2 text-sm font-bold hover:bg-[#2a2a2a] transition-colors"
                  >
                    Take a Break
                  </button>
                  <button
                    onClick={() => {
                      setShowWarning(false);
                      setIsMuted(true);
                      setTimeout(() => setIsMuted(false), 300000); // Mute for 5 mins
                    }}
                    className="p-2 border border-[#141414]/20 hover:bg-gray-50 rounded"
                    title="Mute warnings for 5m"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background UI status in Sidebar or Dashboard could use this switches.length */}
    </>
  );
}
