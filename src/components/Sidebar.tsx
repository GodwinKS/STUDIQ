import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Brain, BookOpen, MessageCircle, Settings as SettingsIcon, Shield, Clock, FileText, Headphones, Sparkles, Wifi, WifiOff } from 'lucide-react';
import { cn } from '../utils';
import { isLocalMode, setLocalMode } from '../lib/gemini';
import { safeJson } from '../lib/api';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'focus', label: 'Focus Zone', icon: Clock },
  { id: 'tutor', label: 'AI Masterclass', icon: Brain },
  { id: 'smart_notes', label: 'Smart Notes', icon: Sparkles },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const [localMode, setLocalModeState] = useState(isLocalMode());

  useEffect(() => {
    const handleSettingsChange = () => {
      setLocalModeState(isLocalMode());
    };
    window.addEventListener('saathi_settings_changed', handleSettingsChange);
    return () => window.removeEventListener('saathi_settings_changed', handleSettingsChange);
  }, []);

  const [status, setStatus] = useState<any>(null);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/monitor');
        if (res.ok) setStatus(await safeJson(res));
      } catch (e) {
        setStatus({ server: 'offline' });
      }
    };
    const interval = setInterval(checkStatus, 5000);
    checkStatus();
    return () => clearInterval(interval);
  }, []);

  const handleToggleLocal = () => {
    const newState = !localMode;
    setLocalMode(newState);
    setLocalModeState(newState);
  };

  return (
    <div className="w-64 border-r border-[#141414]/10 h-screen flex flex-col bg-white sticky top-0">
      <div className="p-6 flex items-center gap-2 mb-8">
        <div className="w-10 h-10 bg-[#141414] text-white flex items-center justify-center rounded-xl rotate-3 shadow-lg">
          <Shield size={24} />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-xl leading-none">Saathi-OS</span>
          <span className="text-[10px] font-mono tracking-tighter opacity-70 uppercase text-[#5A5A40]">Gemma 4 Intelligence</span>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group",
              activeTab === item.id 
                ? "bg-[#141414] text-white shadow-md" 
                : "text-[#141414]/60 hover:bg-[#141414]/5 hover:text-[#141414]"
            )}
          >
            <item.icon size={20} />
            <span className="font-medium text-sm">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-4 mt-auto space-y-2">
        <div className="w-full flex flex-col gap-1 px-4 py-3 rounded-2xl border bg-[#141414] border-[#141414] text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <WifiOff size={16} />
              <span className="text-sm font-bold tracking-tight">Offline Core</span>
            </div>
            <div className={cn(
              "w-2 h-2 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse",
              status?.bridge === 'online' ? 'bg-green-500' : 'bg-red-500 shadow-red-500/60'
            )} />
          </div>
          <p className="text-[9px] opacity-40 font-mono uppercase tracking-widest leading-none">
            {status?.bridge === 'online' ? 'Hardware Bridge Connected' : 'Bridge (bridge.py) Offline'}
          </p>
        </div>

        <div className="bg-[#5A5A40]/5 rounded-2xl p-4 border border-[#5A5A40]/10">
          <p className="text-[10px] font-mono uppercase tracking-wider opacity-40 mb-2">Saathi Intelligence</p>
          <div className="flex items-center gap-2">
            <Brain size={12} className="text-blue-500" />
            <span className="text-xs font-bold">Offline Active</span>
          </div>
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#5A5A40]/10">
            <div className="w-2 h-2 bg-brand-accent rounded-full" />
            <span className="text-xs font-bold opacity-70">Gemma-4 Vision</span>
          </div>
        </div>
      </div>
    </div>
  );
}
