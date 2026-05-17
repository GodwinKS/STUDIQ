import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Shield, Cpu, Cloud, Globe, AlertCircle, Save, CheckCircle2, XCircle } from 'lucide-react';
import { isLocalMode, setLocalMode, getLocalModel, setLocalModel } from '../lib/gemini';

export function Settings() {
  const [isLocal, setIsLocal] = useState(isLocalMode());
  const [localModelName, setLocalModelName] = useState(getLocalModel());
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [success, setSuccess] = useState(false);
  const [healthStatus, setHealthStatus] = useState<Record<string, 'checking' | 'ok' | 'fail'>>({});

  const handleToggle = (val: boolean) => {
    setIsLocal(val);
    setLocalMode(val);
    showSuccess();
  };

  const showSuccess = () => {
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2000);
  };

  const updateModel = (model: string) => {
    setLocalModelName(model);
    setLocalModel(model);
    showSuccess();
  };

  const checkHealth = async () => {
    setHealthStatus({ bridge: 'checking', ollama: 'checking' });
    
    // Check Bridge
    try {
      const res = await fetch('/api/bridge/health');
      if (res.ok) setHealthStatus(prev => ({ ...prev, bridge: 'ok' }));
      else throw new Error();
    } catch (e) {
      setHealthStatus(prev => ({ ...prev, bridge: 'fail' }));
    }

    // Check Ollama
    try {
      const res = await fetch('/api/ollama/api/tags');
      if (res.ok) setHealthStatus(prev => ({ ...prev, ollama: 'ok' }));
      else throw new Error();
    } catch (e) {
      setHealthStatus(prev => ({ ...prev, ollama: 'fail' }));
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-serif italic mb-1 text-[#141414] flex items-center gap-3">
            <SettingsIcon className="text-[#5A5A40]" size={28} />
            Control Center
          </h2>
          <p className="text-[#5A5A40]/60 text-sm">Configure Saathi-OS for absolute privacy or maximum power.</p>
        </div>
        <button 
          onClick={checkHealth}
          className="px-5 py-2.5 bg-[#F5F5F0] text-[#141414] rounded-2xl text-xs font-bold hover:bg-[#EBEBE5] transition-all flex items-center gap-2 border border-[#141414]/5"
        >
          {healthStatus.bridge === 'checking' ? 'Checking Pulse...' : 'Refresh Health'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={`p-5 rounded-[32px] border-2 flex items-center gap-4 transition-all ${healthStatus.bridge === 'ok' ? 'bg-green-50/50 border-green-200' : 'bg-red-50/50 border-red-100'}`}>
          <div className={`p-3 rounded-2xl ${healthStatus.bridge === 'ok' ? 'bg-green-100/50 text-green-600' : 'bg-red-100/50 text-red-600'}`}>
            {healthStatus.bridge === 'ok' ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold tracking-[0.2em] opacity-40">Hardware Bridge</div>
            <div className="text-sm font-bold">{healthStatus.bridge === 'ok' ? 'Online' : 'Disconnected'}</div>
          </div>
        </div>
        <div className={`p-5 rounded-[32px] border-2 flex items-center gap-4 transition-all ${healthStatus.ollama === 'ok' ? 'bg-green-50/50 border-green-200' : 'bg-red-50/50 border-red-100'}`}>
          <div className={`p-3 rounded-2xl ${healthStatus.ollama === 'ok' ? 'bg-green-100/50 text-green-600' : 'bg-red-100/50 text-red-600'}`}>
            {healthStatus.ollama === 'ok' ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold tracking-[0.2em] opacity-40">Ollama AI Engine</div>
            <div className="text-sm font-bold">{healthStatus.ollama === 'ok' ? 'Connected' : 'Offline'}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Hardware Mode Card - Re-Enforced for Offline Only */}
        <div className="p-8 rounded-[40px] border-2 transition-all relative overflow-hidden bg-[#141414] text-white border-[#141414]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 blur-[60px] -mr-16 -mt-16" />
          
          <div className="flex justify-between items-start mb-6">
            <div className={`p-4 rounded-2xl bg-white/10`}>
              <Cpu className="text-white" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-widest opacity-60">Privacy: Maximum (Offline)</span>
              <div className="w-2.5 h-2.5 rounded-full bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.5)]" />
            </div>
          </div>
          
          <h3 className="text-2xl font-bold mb-3">Saathi Offline Engine</h3>
          <p className="text-sm mb-8 leading-relaxed text-white/60">
            Saathi-OS is locked in high-privacy offline mode. All vision analysis and transcription happens 100% on your device using local hardware.
          </p>

          <div className="w-full py-4 rounded-2xl font-bold text-sm bg-white/5 text-white/40 text-center border border-white/10 uppercase tracking-widest">
            Hardware Mode Enforced
          </div>
        </div>
      </div>

      <div className="bg-white p-10 rounded-[44px] border-2 border-brand-primary shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] space-y-8">
        <h3 className="text-xl font-bold flex items-center gap-3">
          <Shield size={24} className="text-[#5A5A40]" />
          Advanced Engine Config
        </h3>
        
        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-[0.2em] opacity-40 mb-3">Active Offline Model</label>
              <div className="flex flex-col gap-2">
                <input 
                  type="text" 
                  placeholder="e.g. gemma:2b"
                  value={localModelName}
                  onChange={(e) => updateModel(e.target.value)}
                  className="w-full bg-[#F5F5F0] border-2 border-transparent focus:border-brand-primary rounded-2xl px-5 py-4 text-sm transition-all outline-none"
                />
                <div className="flex flex-wrap gap-2 py-2">
                  {[
                    { id: 'moondream', label: 'moondream (Vision - 0.8GB)', color: 'bg-green-100 text-green-700' },
                    { id: 'llava', label: 'llava (Vision - 4.5GB)', color: 'bg-blue-100 text-blue-700' },
                    { id: 'gemma:2b', label: 'gemma:2b (Text - 1.6GB)', color: 'bg-purple-100 text-purple-700' }
                  ].map(m => (
                    <button 
                      key={m.id}
                      onClick={() => updateModel(m.id)}
                      className={`text-[10px] font-bold px-3 py-1.5 rounded-full border transition-all flex items-center gap-1.5 ${localModelName === m.id ? 'bg-brand-primary text-white border-brand-primary' : `${m.color} border-transparent hover:opacity-80`}`}
                    >
                      {localModelName === m.id && <CheckCircle2 size={10} />}
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-[0.2em] opacity-40 mb-3">Ollama Endpoint</label>
              <input 
                type="text" 
                value={ollamaUrl}
                readOnly
                className="w-full bg-[#F5F5F0]/50 border-2 border-transparent rounded-2xl px-5 py-4 text-sm text-gray-400 cursor-not-allowed"
              />
              <div className="mt-4 p-4 bg-orange-50 rounded-2xl border border-orange-100">
                <p className="text-[10px] text-orange-700 leading-relaxed font-medium">
                  <AlertCircle size={10} className="inline mr-1 -mt-0.5" />
                  PRO TIP: To fix CORS errors, run: <br/>
                  <code className="bg-orange-100 px-1.5 py-0.5 rounded mt-1 inline-block text-[9px] uppercase font-bold text-orange-800">
                    OLLAMA_ORIGINS="*" ollama serve
                  </code>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {success && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-[#141414] text-white px-8 py-4 rounded-full font-bold shadow-2xl flex items-center gap-3 animate-in fade-in zoom-in slide-in-from-bottom-6 border-2 border-white/20">
          <div className="p-1 bg-green-500 rounded-full">
            <Save size={16} />
          </div>
          Preferences Synced
        </div>
      )}
    </div>
  );
}
