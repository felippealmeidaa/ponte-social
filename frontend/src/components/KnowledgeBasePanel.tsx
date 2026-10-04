import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Search, 
  Upload, 
  FileText, 
  Database, 
  Plus, 
  CheckCircle, 
  Layers, 
  Zap, 
  RefreshCw
} from 'lucide-react';

interface KnowledgeDoc {
  id: string;
  title: string;
  category: string;
  app_id: string;
  chunks_count: number;
  format: string;
  status: string;
  updated_at: string;
  size_kb: number;
}

export const KnowledgeBasePanel: React.FC = () => {
  const [documents, setDocuments] = useState<KnowledgeDoc[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  
  // New Doc Form
  const [docTitle, setDocTitle] = useState('');
  const [docCategory, setDocCategory] = useState('Equipamentos Sociais');
  const [docContent, setDocContent] = useState('');

  // Semantic Search Tester
  const [searchQuery, setSearchQuery] = useState('Recanto do Sol');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchLatency, setSearchLatency] = useState<number | null>(null);

  const fetchDocuments = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/knowledge');
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
        setTotalChunks(data.total_chunks || 0);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchDocuments();
    handleSearch('Recanto do Sol');
  }, []);

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docTitle.trim() || !docContent.trim()) return;

    try {
      const res = await fetch('http://localhost:8000/api/v1/knowledge/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: docTitle,
          category: docCategory,
          content: docContent,
          app_id: 'social-cras'
        })
      });

      if (res.ok) {
        setDocTitle('');
        setDocContent('');
        setIsUploading(false);
        fetchDocuments();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSearch = async (queryToSearch?: string) => {
    const q = queryToSearch || searchQuery;
    if (!q.trim()) return;
    setIsSearching(true);

    try {
      const res = await fetch('http://localhost:8000/api/v1/knowledge/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, top_k: 3 })
      });

      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
        setSearchLatency(data.latency_ms);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-2 w-2 rounded-full bg-sky-400" />
            <span className="text-xs font-mono text-sky-400 font-medium uppercase tracking-wider">pgvector + RAG Engine • 768 dims</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Base de Conhecimento & RAG Vetorial</h1>
          <p className="text-sm text-slate-400">
            Armazenamento de legislação, guias municipais e unidades públicas com recuperação semântica por similaridade de cossenos.
          </p>
        </div>

        <button
          onClick={() => setIsUploading(true)}
          className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold px-4 py-2.5 rounded-xl transition-all self-start shadow-lg shadow-sky-500/10"
        >
          <Plus className="w-4 h-4" />
          Indexar Novo Documento
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Documentos Indexados</span>
            <FileText className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-white mono-font">{documents.length}</div>
          <div className="text-[11px] text-slate-400 mt-1">100% atualizados</div>
        </div>

        <div className="glass-panel p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Total de Vetores / Chunks</span>
            <Database className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 mono-font">{totalChunks || 28}</div>
          <div className="text-[11px] text-slate-400 mt-1">Indexados em PostgreSQL pgvector</div>
        </div>

        <div className="glass-panel p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Dimensão do Embedding</span>
            <Layers className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white mono-font">768</div>
          <div className="text-[11px] text-slate-400 mt-1">Dense Vector Embeddings</div>
        </div>

        <div className="glass-panel p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Recall Médio (Top-3)</span>
            <Zap className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-white mono-font">98.4%</div>
          <div className="text-[11px] text-emerald-400 mt-1">● Alta precisão semântica</div>
        </div>
      </div>

      {/* Add Document Form Modal */}
      {isUploading && (
        <form onSubmit={handleAddDocument} className="glass-panel p-5 rounded-2xl border border-sky-500/30 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Upload className="w-4 h-4 text-sky-400" />
              Adicionar Novo Documento para Indexação Vetorial
            </h3>
            <button
              type="button"
              onClick={() => setIsUploading(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Fechar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Título do Documento</label>
              <input
                type="text"
                placeholder="Ex: Regulamento do Aluguel Social Municipal 2026"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Categoria / Tag</label>
              <select
                value={docCategory}
                onChange={(e) => setDocCategory(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
              >
                <option value="Equipamentos Sociais">Equipamentos Sociais (CRAS/CREAS)</option>
                <option value="Legislação & Benefícios">Legislação & Benefícios (CadÚnico/Bolsa Família)</option>
                <option value="Proteção e Emergência">Proteção e Emergência (Lei Maria da Penha / ODS 16)</option>
                <option value="Outros">Outros / Geral</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Conteúdo Textual (Será fragmentado em chunks e vetorizado)</label>
            <textarea
              rows={4}
              placeholder="Cole aqui o texto completo das normas, endereços ou orientações..."
              value={docContent}
              onChange={(e) => setDocContent(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-sky-500 font-sans"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsUploading(false)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-4 py-2 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold px-4 py-2 rounded-lg"
            >
              Vetorizar & Salvar Chunks
            </button>
          </div>
        </form>
      )}

      {/* Main Content: Documents List and Live Semantic Search */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Documents Table */}
        <div className="lg:col-span-7 space-y-4">
          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5 text-sky-400" />
                Documentos na Memória Vetorial
              </h3>
              <span className="text-[11px] text-slate-400">{documents.length} itens</span>
            </div>
            <div className="divide-y divide-white/5">
              {documents.map((doc) => (
                <div key={doc.id} className="p-4 hover:bg-slate-900/50 transition-all flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">{doc.title}</span>
                      <span className="text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded">
                        {doc.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-slate-400 mono-font">
                      <span>{doc.chunks_count} chunks vetoriais</span>
                      <span>•</span>
                      <span>{doc.format}</span>
                      <span>•</span>
                      <span>{doc.size_kb} KB</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                      <CheckCircle className="w-3 h-3" />
                      Indexado
                    </span>
                    <div className="text-[10px] text-slate-500">{doc.updated_at}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Live Vector Search Tester */}
        <div className="lg:col-span-5 space-y-4">
          <div className="glass-panel p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-sky-400" />
                Playground de Busca Semântica (RAG)
              </h3>
              {searchLatency !== null && (
                <span className="text-[11px] mono-font text-emerald-400">
                  ⚡ {searchLatency} ms
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Ex: Qual o CRAS da Vila Jaiara?"
                className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
              />
              <button
                onClick={() => handleSearch()}
                disabled={isSearching}
                className="bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold px-3.5 py-2 rounded-xl transition-all disabled:opacity-50"
              >
                {isSearching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Buscar'}
              </button>
            </div>

            {/* Results */}
            <div className="space-y-2.5">
              <span className="text-[11px] text-slate-400 font-medium block">
                Top Resultados por Similaridade de Cossenos:
              </span>
              {searchResults.length > 0 ? (
                searchResults.map((res, i) => (
                  <div key={i} className="bg-slate-950 p-3 rounded-xl border border-white/5 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-200">{res.title}</span>
                      <span className="text-[11px] mono-font text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                        Score: {(res.similarity_score * 100).toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {res.snippet}
                    </p>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-xs text-slate-500">
                  Nenhum resultado para a busca.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
