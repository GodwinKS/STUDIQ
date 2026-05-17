import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Brain, BookOpen, MessageCircle, Settings as SettingsIcon, Shield, Clock, FileText, Headphones, Sparkles, Wifi, WifiOff } from 'lucide-react';
import { cn } from '../lib/utils';
import { isLocalMode, setLocalMode } from '../lib/gemini';

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
        <button
          onClick={handleToggleLocal}
          className={cn(
            "w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-all text-sm font-bold",
            localMode 
              ? "bg-blue-50 border-blue-200 text-blue-700" 
              : "bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
          )}
        >
          <div className="flex items-center gap-2">
            {localMode ? <WifiOff size={16} /> : <Wifi size={16} />}
            <span>{localMode ? 'Offline Mode' : 'Cloud Hybrid'}</span>
          </div>
          <div className={cn("w-2 h-2 rounded-full", localMode ? "bg-blue-500 animate-pulse" : "bg-green-500")} />
        </button>

        <div className="bg-[#5A5A40]/5 rounded-2xl p-4 border border-[#5A5A40]/10">
          <p className="text-[10px] font-mono uppercase tracking-wider opacity-40 mb-2">OS Telemetry</p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs font-bold">Saathi Active</span>
          </div>
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#5A5A40]/10">
            <div className="w-2 h-2 bg-brand-accent rounded-full" />
            <span className="text-xs font-bold opacity-70">Model: Gemma 4</span>
          </div>
        </div>
      </div>
    </div>
  );
}
