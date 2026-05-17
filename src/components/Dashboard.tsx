import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from 'recharts';
import { Flame, Target, TrendingUp, AlertCircle, Terminal, Activity, Cpu, Cloud } from 'lucide-react';
import { cn } from '../utils';
import { fetchWithRetry, safeJson } from '../lib/api';
import { useSaathiSettings } from '../lib/gemini';

export function Dashboard() {
  const { isLocal, model } = useSaathiSettings();
  const [sessions, setSessions] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    deepFocus: '0h',
    goal: '0%',
    score: '0.0',
    distractions: '0m',
    switches: 0
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sessionRes, logRes] = await Promise.all([
          fetchWithRetry('/api/sessions'),
          fetchWithRetry('/api/logs')
        ]);

        if (!sessionRes.ok || !logRes.ok) {
          console.warn(`Data partial fetch: Sessions=${sessionRes.status}, Logs=${logRes.status}`);
          return; // Don't throw, just wait for next poll if it's a transient 404/500
        }

        const [sessionData, logData] = await Promise.all([
          safeJson(sessionRes),
          safeJson(logRes)
        ]);
        
        setSessions(sessionData);
        setLogs(logData);
        setFetchError(null);

        // Calculate stats
        if (sessionData.length > 0) {
          const totalDuration = sessionData.reduce((acc: number, s: any) => acc + s.duration, 0);
          const avgScore = sessionData.reduce((acc: number, s: any) => acc + s.score, 0) / sessionData.length;
          
          // Count context switches from logs in the last hour
          const oneHourAgo = Date.now() - 3600000;
          const contextSwitches = logData.filter((l: any) => 
            l.type === 'warning' && 
            l.message.includes('Cognitive Load') &&
            new Date(l.timestamp).getTime() > oneHourAgo
          ).length;

          setStats({
            deepFocus: `${(totalDuration / 3600).toFixed(1)}h`,
            goal: `${Math.min(100, Math.round((totalDuration / 14400) * 100))}%`,
            score: avgScore.toFixed(1),
            distractions: `${Math.round(totalDuration * 0.05 / 60)}m`,
            switches: contextSwitches
          });
        }
      } catch (e: any) {
        console.error('Data fetch failed:', e);
        setFetchError(e.message || 'Connecting to Saathi backend...');
        // Only show actual error log if sustained
      }
    };

    let isMounted = true;
    let pollTimeout: any;

    const pollData = async () => {
      if (!isMounted) return;
      await fetchData();
      pollTimeout = setTimeout(pollData, 5000); // Poll every 5s
    };

    pollData();
    return () => {
      isMounted = false;
      clearTimeout(pollTimeout);
    };
  }, []);

  const chartData = sessions.slice(0, 7).reverse().map((s, i) => ({
    time: new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    score: s.score
  }));

  function calculateBreak(focusHoursStr: string, avgScoreStr: string, switches: number) {
    const hours = parseFloat(focusHoursStr);
    const score = parseFloat(avgScoreStr);
    if (hours === 0) return 0;
    
    // Base: 20% of work time
    let breakMins = (hours * 60) * 0.2;
    // Multiplier based on focus quality
    if (score > 8) breakMins *= 1.2;
    // Add penalty for context switching (fatigue)
    breakMins += (switches * 2);
    
    return Math.min(60, Math.round(breakMins));
  }

  const heatmapData = [
    { day: 'Mon', dist: 12, focus: 45 },
    { day: 'Tue', dist: 18, focus: 32 },
    { day: 'Wed', dist: 5, focus: 60 },
    { day: 'Thu', dist: 25, focus: 20 },
    { day: 'Fri', dist: 8, focus: 55 },
    { day: 'Sat', dist: 30, focus: 15 },
    { day: 'Sun', dist: 2, focus: 70 },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold font-serif italic text-[#141414]">Cognitive Dashboard.</h2>
          <p className="opacity-60 text-sm mt-1">Gemma 4 Intelligence Telemetry — Saathi-OS.</p>
        </div>
        {fetchError && (
          <div className="flex items-center gap-2 px-3 py-1 bg-red-50 text-red-600 rounded-full border border-red-100 animate-pulse">
            <AlertCircle size={14} />
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest">{fetchError}</span>
          </div>
        )}
        <div className="px-4 py-2 bg-white rounded-full border border-[#141414]/5 shadow-sm text-xs font-mono uppercase tracking-widest">
          {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Deep Focus', value: stats.deepFocus, icon: Flame, color: 'text-orange-500', bg: 'bg-orange-50' },
          { label: 'Switches', value: stats.switches, icon: Activity, color: 'text-red-500', bg: 'bg-red-50', sub: 'Last hr' },
          { label: 'Avg. Focus', value: stats.score, icon: TrendingUp, color: 'text-green-500', bg: 'bg-green-50' },
          { label: 'AI Break', value: `${calculateBreak(stats.deepFocus, stats.score, stats.switches)}m`, icon: Cpu, color: 'text-blue-500', bg: 'bg-blue-50' },
        ].map((stat, i) => (
          <div key={i} className="brutalist-card !p-5">
            <div className="flex justify-between items-start mb-4">
              <div className={cn("p-2 rounded-xl", stat.bg, stat.color)}>
                <stat.icon size={20} />
              </div>
            </div>
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] opacity-40 mb-1">{stat.label}</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold tracking-tighter tabular-nums">{stat.value}</p>
              {stat.sub && <span className="text-[9px] opacity-30 font-mono italic whitespace-nowrap">{stat.sub}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-8">
          <div className="bg-white p-8 rounded-[40px] border border-[#141414]/5 shadow-sm">
            <h3 className="font-bold mb-6 flex items-center gap-2">
              <Activity size={18} />
              Session Intensity <span className="text-[10px] uppercase font-mono opacity-40">(Last 7 Sessions)</span>
            </h3>
            <div className="h-[300px] w-full">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#141414" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#141414" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, opacity: 0.4 }} />
                    <YAxis hide domain={[0, 10]} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 20px 40px rgba(0,0,0,0.1)', padding: '16px' }}
                      itemStyle={{ color: '#141414', fontWeight: 'bold' }}
                    />
                    <Area type="monotone" dataKey="score" stroke="#141414" strokeWidth={4} fillOpacity={1} fill="url(#colorScore)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center opacity-20 italic space-y-2">
                  <TrendingUp size={48} strokeWidth={1} />
                  <p>Start a Focus Session to see data</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white p-8 rounded-[40px] border border-[#141414]/5 shadow-sm mt-8">
            <h3 className="font-bold mb-6 flex items-center gap-2">
              <AlertCircle size={18} />
              Weekly Distraction Heatmap <span className="text-[10px] uppercase font-mono opacity-40">(YouTube vs Study)</span>
            </h3>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={heatmapData} stackOffset="expand">
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, opacity: 0.4 }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 20px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="focus" stackId="a" fill="#141414" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="dist" stackId="a" fill="#ef4444" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 mt-4 text-[10px] font-mono uppercase tracking-widest opacity-40">
              <div className="flex items-center gap-1"><div className="w-2 h-2 bg-[#141414] rounded-full" /> Deep Study</div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 bg-[#ef4444] rounded-full" /> Distractions</div>
            </div>
          </div>
        </div>

        <div className="bg-[#141414] text-white p-6 rounded-[40px] shadow-2xl flex flex-col h-[280px] brutalist-card !bg-[#141414] !p-6">
          <h3 className="font-bold mb-4 flex items-center gap-2 text-white/90">
            <Terminal size={18} />
            System Telemetry
          </h3>
          
          <div className="flex-1 overflow-y-auto space-y-4 font-mono text-[11px] pr-2 scrollbar-hide">
            {logs.length > 0 ? logs.map((log) => (
              <div key={log.id} className="opacity-60 border-l border-white/10 pl-3 py-1 hover:opacity-100 transition-opacity">
                <span className="text-white/30 mr-2">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}]</span>
                <span className={cn(
                  log.type === 'heartbeat' ? 'text-green-400' : 
                  log.type === 'system' ? 'text-blue-400' : 'text-white'
                )}>
                  {log.message}
                </span>
              </div>
            )) : (
              <div className="opacity-20 italic">No logs available...</div>
            )}
          </div>

          <div className="pt-6 border-t border-white/5 mt-6">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em]">
              <div className="flex items-center gap-1.5 opacity-60">
                {isLocal ? <Cpu size={12} /> : <Cloud size={12} />}
                <span>{isLocal ? `Local-Core: ${model}` : 'Cloud: Gemini 2.0'}</span>
              </div>
              <span className="animate-pulse text-green-400 font-bold font-mono">Active</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
