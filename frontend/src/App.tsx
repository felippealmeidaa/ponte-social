import { useState, useEffect } from 'react';
import { TriagemPanel } from './components/TriagemPanel';
import { FlowBuilder } from './components/FlowBuilder';
import { LiveChatInbox } from './components/LiveChatInbox';
import { MlStudioPanel } from './components/MlStudioPanel';
import { AiServerPanel } from './components/AiServerPanel';
import { KnowledgeBasePanel } from './components/KnowledgeBasePanel';
import { WhatsAppChannelPanel } from './components/WhatsAppChannelPanel';
import { LoginPage } from './components/LoginPage';
import { 
  Users, 
  GitBranch, 
  MessageSquare, 
  Brain, 
  Shield, 
  LogOut, 
  UserCheck,
  Cpu,
  BookOpen,
  QrCode
} from 'lucide-react';

export function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<
    'triagem' | 'flows' | 'chat' | 'aiserver' | 'knowledge' | 'ml' | 'channels'
  >('triagem');

  useEffect(() => {
    const savedUser = localStorage.getItem('social_crm_user');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('social_crm_user');
      }
    }
  }, []);

  const handleLoginSuccess = (user: any, token: string) => {
    setCurrentUser(user);
    localStorage.setItem('social_crm_user', JSON.stringify(user));
    localStorage.setItem('social_crm_token', token);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('social_crm_user');
    localStorage.removeItem('social_crm_token');
  };

  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const navItems = [
    { id: 'triagem', label: 'Triagem Social', icon: Users },
    { id: 'chat', label: 'Live Chat', icon: MessageSquare },
    { id: 'flows', label: 'Flow Studio', icon: GitBranch },
    { id: 'aiserver', label: 'AI Server & Gateway', icon: Cpu, badge: 'PRO' },
    { id: 'knowledge', label: 'Base RAG', icon: BookOpen },
    { id: 'ml', label: 'MLOps & Treino', icon: Brain },
    { id: 'channels', label: 'Canais WhatsApp', icon: QrCode }
  ];

  return (
    <div className="min-h-screen bg-[#07080b] text-slate-100 flex flex-col selection:bg-sky-500/30 selection:text-sky-300">
      {/* Top Navbar */}
      <header className="border-b border-white/5 bg-[#090b10]/90 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center text-sky-400 shadow-sm">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-white tracking-tight">SocialCRM & AI Gateway</h1>
                <span className="text-[10px] uppercase font-mono font-semibold bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
                  v2.0 Enterprise
                </span>
              </div>
              <p className="text-[11px] text-slate-400">UniEVANGÉLICA 2026/2 • ODS 16 & 10</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden lg:flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-white/5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all relative ${
                    isActive
                      ? 'bg-slate-800 text-white shadow-sm border border-white/10'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-sky-400' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="text-[9px] font-mono bg-sky-500/20 text-sky-400 px-1 py-0.2 rounded">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* User Info & Logout */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-950 border border-white/5 text-xs text-slate-300">
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-medium">{currentUser.name}</span>
            </div>

            <button
              onClick={handleLogout}
              title="Encerrar Sessão"
              className="p-2 rounded-xl bg-slate-950 hover:bg-rose-950/30 text-slate-400 hover:text-rose-400 border border-white/5 hover:border-rose-500/30 transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile Navigation Row */}
        <div className="lg:hidden flex items-center gap-1 overflow-x-auto p-2 bg-slate-950 border-t border-white/5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 flex items-center gap-1.5 transition-all ${
                  isActive
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'triagem' && <TriagemPanel />}
        {activeTab === 'chat' && <LiveChatInbox />}
        {activeTab === 'flows' && <FlowBuilder />}
        {activeTab === 'aiserver' && <AiServerPanel />}
        {activeTab === 'knowledge' && <KnowledgeBasePanel />}
        {activeTab === 'ml' && <MlStudioPanel />}
        {activeTab === 'channels' && <WhatsAppChannelPanel />}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-[#07080b] py-4">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center text-xs text-slate-500 gap-2">
          <span>Sistema Inteligente de Encaminhamento Social • ODS 16 (16.6) & ODS 10 (10.2)</span>
          <span className="mono-font text-[11px]">Linear SVM (TF-IDF) • Gemini 3.5 Flash Lite • Faster-Whisper • pgvector</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
