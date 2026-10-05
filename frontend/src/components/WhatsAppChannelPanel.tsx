import React, { useState, useEffect, useRef } from 'react';
import { 
  QrCode, 
  Smartphone, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  Send, 
  ShieldCheck,
  Zap
} from 'lucide-react';

export const WhatsAppChannelPanel: React.FC = () => {
  const [connectionStatus, setConnectionStatus] = useState<any>({
    connected: false,
    state: 'disconnected',
    instance_name: 'cras-anapolis'
  });
  const [qrCodeData, setQrCodeData] = useState<any>(null);
  const [isLoadingQr, setIsLoadingQr] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Test message simulator
  const [testPhone, setTestPhone] = useState('5562999998888');
  const [testMessage, setTestMessage] = useState('oi');
  const [conversa, setConversa] = useState<{ de: 'cidadao' | 'bot'; texto: string }[]>([]);
  const fimDaConversa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimDaConversa.current?.scrollIntoView({ block: 'nearest' });
  }, [conversa]);
  const [isSimulating, setIsSimulating] = useState(false);

  const fetchStatus = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('http://localhost:8000/api/v1/whatsapp/status?instance_name=cras-anapolis');
      if (res.ok) {
        const data = await res.json();
        setConnectionStatus(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleGenerateQr = async () => {
    setIsLoadingQr(true);
    try {
      const res = await fetch('http://localhost:8000/api/v1/whatsapp/qrcode?instance_name=cras-anapolis', {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        setQrCodeData(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingQr(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  // Conversa com o bot pelo mesmo fluxo e banco do WhatsApp, mas mostrando as respostas na tela
  const handleSimulateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    const texto = testMessage.trim();
    if (!texto) return;
    setIsSimulating(true);
    setConversa((c) => [...c, { de: 'cidadao', texto }]);
    setTestMessage('');
    try {
      const res = await fetch('http://localhost:8000/api/v1/webhooks/simular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefone: testPhone, texto })
      });
      if (!res.ok) throw new Error();
      const data: { respostas: string[] } = await res.json();
      setConversa((c) => [...c, ...data.respostas.map((r) => ({ de: 'bot' as const, texto: r }))]);
    } catch {
      setConversa((c) => [...c, { de: 'bot', texto: '[Erro: backend fora do ar na porta 8000]' }]);
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-xs font-mono text-emerald-400 font-medium uppercase tracking-wider">Evolution API v2 & Meta Cloud API</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Canais & Conexão WhatsApp</h1>
          <p className="text-sm text-slate-400">
            Gerenciamento de instâncias WhatsApp, pareamento com QR Code na tela e roteamento de mensagens para o fluxo de IA.
          </p>
        </div>

        <button
          onClick={fetchStatus}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3.5 py-2 rounded-xl transition-all self-start border border-white/10"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          Atualizar Conexão
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: QR Code & Status */}
        <div className="lg:col-span-6 space-y-4">
          <div className="glass-panel p-6 rounded-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Instância: cras-anapolis</h3>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span>Provedor: Evolution API v2</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-mono font-medium">Porta 8080</span>
                  </div>
                </div>
              </div>

              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border ${
                connectionStatus.connected
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              }`}>
                {connectionStatus.connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                {connectionStatus.connected ? 'Conectado' : 'Aguardando Pareamento'}
              </span>
            </div>

            {/* QR Code Container */}
            <div className="bg-slate-950 p-6 rounded-xl border border-white/5 flex flex-col items-center justify-center text-center space-y-4">
              {qrCodeData?.qrcode ? (
                <div className="bg-white p-4 rounded-xl shadow-xl">
                  <img src={qrCodeData.qrcode} alt="WhatsApp QR Code" className="w-48 h-48" />
                </div>
              ) : (
                <div className="w-48 h-48 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center text-slate-500 p-4">
                  <QrCode className="w-12 h-12 mb-2 text-slate-600" />
                  <span className="text-xs">Clique abaixo para gerar o QR Code de conexão</span>
                </div>
              )}

              {qrCodeData?.pairing_code && (
                <div className="text-xs bg-slate-900 border border-white/10 px-4 py-2 rounded-lg mono-font text-sky-400">
                  Código de Pareamento: <span className="font-bold text-white">{qrCodeData.pairing_code}</span>
                </div>
              )}

              <button
                onClick={handleGenerateQr}
                disabled={isLoadingQr}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/10 disabled:opacity-50"
              >
                {isLoadingQr ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Gerando QR Code...
                  </>
                ) : (
                  <>
                    <QrCode className="w-4 h-4" />
                    Gerar Novo QR Code na Tela
                  </>
                )}
              </button>
            </div>

            {/* Instructions */}
            <div className="space-y-2 text-xs text-slate-400 border-t border-white/5 pt-4">
              <span className="font-semibold text-slate-200 block">Como conectar seu WhatsApp:</span>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-400">
                <li>Abra o WhatsApp no seu smartphone</li>
                <li>Toque nos 3 pontinhos (ou Configurações) &gt; <strong className="text-slate-300">Aparelhos Conectados</strong></li>
                <li>Toque em <strong className="text-slate-300">Conectar um Aparelho</strong> e aponte a câmera para o QR Code</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Right Column: Webhook Simulator & Endpoint Specs */}
        <div className="lg:col-span-6 space-y-4">
          {/* Simulator Card */}
          <div className="glass-panel p-5 rounded-2xl space-y-4">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-sky-400" />
              Simulador de Mensagem WhatsApp (Webhook Live)
            </h3>
            <p className="text-xs text-slate-400">
              Converse com o bot sem celular: mesmo fluxo e mesmo banco do WhatsApp real. Triagens confirmadas aparecem na fila do CRAS.
            </p>

            <div className="bg-slate-950 border border-white/5 rounded-xl p-3 h-72 overflow-y-auto space-y-2" aria-live="polite">
              {conversa.length === 0 && <p className="text-[11px] text-slate-500">Mande "oi" para começar.</p>}
              {conversa.map((m, i) => (
                <div key={i} className={`flex ${m.de === 'cidadao' ? 'justify-end' : 'justify-start'}`}>
                  <p className={`max-w-[85%] whitespace-pre-wrap text-xs px-3 py-2 rounded-xl ${m.de === 'cidadao' ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-100'}`}>
                    {m.texto.replace(/\*/g, '')}
                  </p>
                </div>
              ))}
              <div ref={fimDaConversa} />
            </div>

            <form onSubmit={handleSimulateWebhook} className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  placeholder="Mensagem do cidadão"
                  aria-label="Mensagem do cidadão"
                  className="flex-1 bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                />
                <button
                  type="submit"
                  disabled={isSimulating}
                  className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs px-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {isSimulating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Enviar
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="sim-telefone" className="text-[11px] text-slate-400">Telefone fictício</label>
                <input
                  id="sim-telefone"
                  type="text"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="w-40 bg-slate-950 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white mono-font focus:outline-none focus:border-sky-500"
                />
                <button type="button" onClick={() => setConversa([])} className="text-[11px] text-slate-400 hover:text-slate-200 underline">
                  limpar tela
                </button>
              </div>
            </form>
          </div>

          {/* Webhook URLs Specification */}
          <div className="glass-panel p-5 rounded-2xl space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              URLs de Webhook do Backend
            </h3>
            <div className="space-y-2 text-xs">
              <div className="bg-slate-950 p-2.5 rounded-lg border border-white/5">
                <span className="text-[10px] text-slate-500 block">Webhook Evolution API v2</span>
                <code className="text-sky-300 mono-font text-[11px]">http://localhost:8000/api/v1/webhooks/evolution</code>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-white/5">
                <span className="text-[10px] text-slate-500 block">Webhook Meta Cloud API Oficial</span>
                <code className="text-sky-300 mono-font text-[11px]">http://localhost:8000/api/v1/webhooks/meta-cloud</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
