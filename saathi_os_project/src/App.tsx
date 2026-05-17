import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { FocusZone } from './components/FocusZone';
import { CommonTool } from './components/CommonTool';
import { SmartNotes } from './components/SmartNotes';
import { CognitiveMonitor } from './components/CognitiveMonitor';
import { Settings } from './components/Settings';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'focus': return <FocusZone />;
      case 'tutor': return <CommonTool />;
      case 'smart_notes': return <SmartNotes />;
      case 'settings': return <Settings />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex bg-[#F5F5F0] min-h-screen font-sans selection:bg-[#5A5A40] selection:text-white">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="flex-1 p-8 md:p-12 max-w-7xl mx-auto overflow-y-auto h-screen scroll-smooth">
        <div className="max-w-5xl mx-auto">
          {renderContent()}
        </div>
      </main>

      <CognitiveMonitor />

      {/* Global Background Effects */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[50%] aspect-square bg-[#5A5A40]/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] aspect-square bg-[#141414]/5 blur-[100px] rounded-full" />
      </div>
    </div>
  );
}

