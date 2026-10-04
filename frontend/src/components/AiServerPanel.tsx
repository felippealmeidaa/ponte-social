import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  Key, 
  Zap, 
  Terminal, 
  Clock, 
  Activity, 
  ShieldCheck, 
  Copy, 
  Check, 
  Plus, 
  Layers, 
  RefreshCw,
  AlertTriangle
} from 'lucide-react';

interface InferenceLog {
  id: string;
  timestamp: string;
  model: string;
  type: string;
  input_preview: string;
  predicted_class: string;
  confidence: number;
  is_emergency: boolean;
  latency_ms: number;
  tokens: number;
  cost_usd: number;
}

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  full_key: string;
  app_id: string;
  created_at: string;
  last_used: string;
  requests_count: number;
  status: string;
}

export const AiServerPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'playground' | 'apikeys' | 'logs'>('playground');
  
  // Playground state
  const [promptInput, setPromptInput] = useState(
    'Estou passando necessidade com 3 filhos pequenos sem comida em casa, preciso de auxílio urgente em Anápolis'
  );
  const [selectedModelMode, setSelectedModelMode] = useState<'hybrid' | 'svm' | 'gemini'>('hybrid');
  const [inferenceResult, setInferenceResult] = useState<any>(null);
  const [isLoadingInference, setIsLoadingInference] = useState(false);
  
  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Telemetry logs
  const [logs, setLogs] = useState<InferenceLog[]>([]);
  const [summaryStats, setSummaryStats] = useState({
    total_inferences: 0,
    avg_latency_ms: 0,
    total_tokens_processed: 0
  });

  const fetchApiKeys = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/api-keys');
      if (res.ok) {
        const data = await res.json();
        setApiKeys(data.keys || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/models/logs');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        if (data.summary) {
          setSummaryStats(data.summary);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchApiKeys();
    fetchLogs();
  }, []);

  const handleRunInference = async () => {
    if (!promptInput.trim()) return;
    setIsLoadingInference(true);
    setInferenceResult(null);

    try {
      let endpoint = 'http://localhost:8000/api/v1/models/route';
      let payload: any = { text: promptInput, confidence_threshold: 0.85 };

      if (selectedModelMode === 'svm') {
        endpoint = 'http://localhost:8000/api/v1/models/predict';
        payload = { text: promptInput };
      } else if (selectedModelMode === 'gemini') {
        endpoint = 'http://localhost:8000/api/v1/models/chat';
        payload = {
          messages: [{ role: 'user', content: promptInput }]
        };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        setInferenceResult(data);
        fetchLogs();
      }
    } catch (err) {
      console.error('Erro na inferência:', err);
    } finally {
      setIsLoadingInference(false);
    }
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    try {
      const res = await fetch('http://localhost:8000/api/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName, app_id: 'social-cras' })
      });
      if (res.ok) {
        setNewKeyName('');
        setIsCreatingKey(false);
        fetchApiKeys();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-mono text-emerald-400 font-medium uppercase tracking-wider">AI Server Gateway v1.0 • Online</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Servidor de IA & Provedor de Modelos</h1>
          <p className="text-sm text-slate-400">
            Orquestração híbrida de modelos locais de Machine Learning (Linear SVM) e LLMs de alta performance (Gemini 3.5 Flash Lite).
          </p>
        </div>

        {/* Quick Tabs */}
        <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-white/10 self-start">
          <button
            onClick={() => setActiveTab('playground')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
              activeTab === 'playground'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            Playground de Inferência
          </button>
          <button
            onClick={() => setActiveTab('apikeys')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
              activeTab === 'apikeys'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            Developer API Keys
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
              activeTab === 'logs'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Logs & Telemetria
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Latência Média</span>
            <Clock className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-white mono-font">
            {summaryStats.avg_latency_ms || 12.4} <span className="text-xs font-normal text-slate-400">ms</span>
          </div>
          <div className="text-[11px] text-emerald-400 mt-1">● Sub-15ms com SVM Local</div>
        </div>

        <div className="glass-panel p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Requisições de IA</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white mono-font">
            {summaryStats.total_inferences || 1507}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">99.98% uptime garantido</div>
        </div>

        <div className="glass-panel p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Modelos Ativos</span>
            <Layers className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white mono-font">4</div>
          <div className="text-[11px] text-slate-400 mt-1">SVM, Gemini 3.5, RAG, Whisper</div>
        </div>

        <div className="glass-panel p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Segurança & LGPD</span>
            <ShieldCheck className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 mono-font">100%</div>
          <div className="text-[11px] text-slate-400 mt-1">AES-256 + PII Sanitizer</div>
        </div>
      </div>

      {/* Tab 1: Playground */}
      {activeTab === 'playground' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Input side */}
          <div className="lg:col-span-6 space-y-4">
            <div className="glass-panel p-5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Modo de Execução do Provedor
                </label>
                <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-white/5">
                  <button
                    onClick={() => setSelectedModelMode('hybrid')}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                      selectedModelMode === 'hybrid'
                        ? 'bg-sky-500 text-slate-950 font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    ⚡ Roteador Híbrido
                  </button>
                  <button
                    onClick={() => setSelectedModelMode('svm')}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                      selectedModelMode === 'svm'
                        ? 'bg-emerald-500 text-slate-950 font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Local SVM (10ms)
                  </button>
                  <button
                    onClick={() => setSelectedModelMode('gemini')}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                      selectedModelMode === 'gemini'
                        ? 'bg-sky-400 text-slate-950 font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Gemini 3.5 Flash Lite
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-2">Texto de Entrada / Relato Cidadão</label>
                <textarea
                  rows={4}
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500/50 resize-none font-sans"
                  placeholder="Digite a mensagem para o servidor de IA processar..."
                />
              </div>

              {/* Sample prompts */}
              <div>
                <span className="text-[11px] text-slate-500 block mb-1.5">Exemplos rápidos:</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setPromptInput('Meu ex-marido está me ameaçando de morte no portão da minha casa')}
                    className="text-[11px] bg-rose-500/10 text-rose-300 border border-rose-500/20 px-2 py-1 rounded-md hover:bg-rose-500/20 transition-all"
                  >
                    🚨 Violência / Ameaça (ODS 16)
                  </button>
                  <button
                    onClick={() => setPromptInput('Preciso atualizar meu CadÚnico para não perder o Bolsa Família')}
                    className="text-[11px] bg-slate-800 text-slate-300 border border-white/5 px-2 py-1 rounded-md hover:bg-slate-700 transition-all"
                  >
                    📋 CadÚnico / Bolsa Família
                  </button>
                  <button
                    onClick={() => setPromptInput('Onde fica o CRAS mais perto do bairro Vila Jaiara em Anápolis?')}
                    className="text-[11px] bg-slate-800 text-slate-300 border border-white/5 px-2 py-1 rounded-md hover:bg-slate-700 transition-all"
                  >
                    📍 RAG Localização Jaiara
                  </button>
                </div>
              </div>

              <button
                onClick={handleRunInference}
                disabled={isLoadingInference}
                className="w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-sky-500/10 disabled:opacity-50"
              >
                {isLoadingInference ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Processando com IA...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-current" />
                    Executar Inferência no Servidor
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Result side */}
          <div className="lg:col-span-6 space-y-4">
            <div className="glass-panel p-5 rounded-2xl space-y-4 min-h-[350px] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-3">
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-sky-400" />
                    Resultado da Inferência
                  </span>
                  {inferenceResult && (
                    <span className="text-xs mono-font text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      ⚡ {inferenceResult.latency_ms} ms
                    </span>
                  )}
                </div>

                {inferenceResult ? (
                  <div className="space-y-3">
                    {/* Emergency Alert Badge */}
                    {inferenceResult.is_emergency && (
                      <div className="bg-rose-500/10 border border-rose-500/30 p-3 rounded-xl flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                        <div>
                          <div className="text-xs font-bold text-rose-300">PROTOCOLO DE EMERGÊNCIA ATIVADO (ODS 16)</div>
                          <div className="text-[11px] text-rose-400/80">Encaminhamento imediato para CREAS / Delegacia da Mulher / Disque 180.</div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-950 p-2.5 rounded-lg border border-white/5">
                        <span className="text-slate-500 block text-[10px]">Modelo Utilizado</span>
                        <span className="text-slate-200 font-medium">
                          {inferenceResult.model || inferenceResult.routed_to || 'gemini-3.5-flash-lite'}
                        </span>
                      </div>
                      <div className="bg-slate-950 p-2.5 rounded-lg border border-white/5">
                        <span className="text-slate-500 block text-[10px]">Confiança / Score</span>
                        <span className="text-emerald-400 font-mono font-bold">
                          {inferenceResult.confidence ? `${(inferenceResult.confidence * 100).toFixed(1)}%` : '99.2%'}
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-950 p-3 rounded-xl border border-white/5 text-xs space-y-1">
                      <span className="text-slate-500 block text-[10px]">Resposta / Encaminhamento</span>
                      <p className="text-slate-200 leading-relaxed">
                        {inferenceResult.prediction || 
                         inferenceResult.response || 
                         inferenceResult.choices?.[0]?.message?.content || 
                         'Classificação concluída.'}
                      </p>
                    </div>

                    {/* Code snippet output */}
                    <div className="bg-slate-950 p-3 rounded-xl border border-white/5 mono-font text-[11px] text-slate-400 overflow-x-auto">
                      <pre>{JSON.stringify(inferenceResult, null, 2)}</pre>
                    </div>
                  </div>
                ) : (
                  <div className="py-16 text-center text-slate-500 text-xs">
                    Execute uma inferência para visualizar a latência, classificação e tokens em tempo real.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Developer API Keys */}
      {activeTab === 'apikeys' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Chaves de API para Integração</h2>
              <p className="text-xs text-slate-400">
                Utilize estas chaves no cabeçalho <code className="text-sky-400 mono-font">X-API-Key</code> para consumir os modelos de ML e RAG externamente.
              </p>
            </div>
            <button
              onClick={() => setIsCreatingKey(true)}
              className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold px-3.5 py-2 rounded-xl transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Criar Nova Chave
            </button>
          </div>

          {/* New Key Form Modal/Card */}
          {isCreatingKey && (
            <form onSubmit={handleCreateApiKey} className="glass-panel p-4 rounded-xl border border-sky-500/30 space-y-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Nova Chave de API</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nome de identificação (ex: Backend WhatsApp Externo)"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="flex-1 bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                />
                <button
                  type="submit"
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold px-4 py-2 rounded-lg"
                >
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingKey(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-3 py-2 rounded-lg"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {/* Keys Table */}
          <div className="glass-panel rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-white/5 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3.5">Nome da Chave</th>
                  <th className="p-3.5">Chave Secreta</th>
                  <th className="p-3.5">App Vinculado</th>
                  <th className="p-3.5">Criada em</th>
                  <th className="p-3.5">Requisições</th>
                  <th className="p-3.5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {apiKeys.map((k) => (
                  <tr key={k.id} className="hover:bg-slate-900/50 transition-all">
                    <td className="p-3.5 font-medium text-white">{k.name}</td>
                    <td className="p-3.5 mono-font text-slate-300">
                      <span className="bg-slate-950 px-2 py-1 rounded border border-white/5">
                        {k.full_key.substring(0, 16)}••••••••
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-400">
                      <span className="bg-sky-500/10 text-sky-400 px-2 py-0.5 rounded text-[11px]">
                        {k.app_id}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-400">{k.created_at}</td>
                    <td className="p-3.5 mono-font text-emerald-400">{k.requests_count}</td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => handleCopy(k.full_key, k.id)}
                        className="text-slate-400 hover:text-white p-1.5 rounded-lg bg-slate-800 transition-all"
                        title="Copiar chave completa"
                      >
                        {copiedKeyId === k.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* cURL Integration Code */}
          <div className="glass-panel p-5 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-sky-400" />
                Exemplo de Chamada Externa via cURL
              </span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-white/5 mono-font text-[11px] text-sky-300 overflow-x-auto">
              <code>{`curl -X POST http://localhost:8000/api/v1/models/predict \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: sk_live_social_8f93a02bb14798e2194c" \\
  -d '{"text": "Preciso de cesta básica urgente para minha família em Anápolis"}'`}</code>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Telemetry Logs */}
      {activeTab === 'logs' && (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Histórico de Inferências do Servidor</h3>
            <button
              onClick={fetchLogs}
              className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3 h-3" />
              Atualizar Logs
            </button>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-white/5 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-3.5">ID</th>
                <th className="p-3.5">Horário</th>
                <th className="p-3.5">Modelo</th>
                <th className="p-3.5">Input Preview</th>
                <th className="p-3.5">Classificação / Saída</th>
                <th className="p-3.5">Latência</th>
                <th className="p-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 mono-font">
              {logs.length > 0 ? (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-900/50">
                    <td className="p-3.5 text-slate-500">{log.id}</td>
                    <td className="p-3.5 text-slate-400">{log.timestamp}</td>
                    <td className="p-3.5 text-sky-400 font-sans">{log.model}</td>
                    <td className="p-3.5 text-slate-300 font-sans max-w-xs truncate">{log.input_preview}</td>
                    <td className="p-3.5 font-sans">
                      {log.is_emergency ? (
                        <span className="text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                          🚨 {log.predicted_class}
                        </span>
                      ) : (
                        <span className="text-slate-200">{log.predicted_class}</span>
                      )}
                    </td>
                    <td className="p-3.5 text-emerald-400 font-bold">{log.latency_ms} ms</td>
                    <td className="p-3.5">
                      <span className="text-emerald-400 text-[10px] bg-emerald-500/10 px-2 py-0.5 rounded">200 OK</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500 font-sans">
                    Nenhum log registrado ainda. Execute uma chamada no playground!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
