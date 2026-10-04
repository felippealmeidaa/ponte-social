import { useState } from 'react';
import { ShieldAlert, CheckCircle2, Clock, MapPin, FileText, Sparkles, Send } from 'lucide-react';

interface TriagemItem {
  id: string;
  nome_cidadao: string;
  telefone_mascarado: string;
  bairro: string;
  cidade: string;
  relato_original: string;
  categoria: string;
  titulo_encaminhamento: string;
  prioridade: string;
  confianca: number;
  metodo_decisao: string;
  status: string;
  criado_em: string;
  servicos_recomendados: string[];
  documentos_necessarios: string[];
}

export const TriagemPanel = () => {
  const [filterPrioridade, setFilterPrioridade] = useState<string>('TODAS');
  const [novoRelato, setNovoRelato] = useState('');
  const [isClassifying, setIsClassifying] = useState(false);
  const [resultadoSimulacao, setResultadoSimulacao] = useState<any>(null);

  const [triagens, setTriagens] = useState<TriagemItem[]>([
    {
      id: "trg-103",
      nome_cidadao: "Relato Anônimo (Vítima de Violência)",
      telefone_mascarado: "62 9****-4411",
      bairro: "Recanto do Sol",
      cidade: "Anápolis",
      relato_original: "Estou sendo ameaçada de morte pelo meu ex-marido armado, ele quebrou as coisas em casa e preciso de abrigo seguro urgente!",
      categoria: "violencia_protecao",
      titulo_encaminhamento: "PROTEÇÃO IMEDIATA E ATENDIMENTO ESPECIALIZADO",
      prioridade: "URGENTE_VIOLENCIA",
      confianca: 0.99,
      metodo_decisao: "Regra de Segurança Prioritária (Violência/Proteção)",
      status: "ENCAMINHADO_CREAS",
      criado_em: "Hoje às 16:05",
      servicos_recomendados: ["Atendimento emergencial CREAS", "Acolhimento em Casa Abrigo", "Encaminhamento DEAM / Medida Protetiva"],
      documentos_necessarios: ["Atendimento prioritário sem exigência prévia de documentos"]
    },
    {
      id: "trg-101",
      nome_cidadao: "Maria Silva",
      telefone_mascarado: "62 9****-3321",
      bairro: "Vila Jaiara",
      cidade: "Anápolis",
      relato_original: "Perdi meu emprego e estou sem conseguir colocar comida na mesa para meus 3 filhos. Preciso de ajuda com bolsa família e cesta básica.",
      categoria: "renda_beneficio",
      titulo_encaminhamento: "Programas de Transferência de Renda (Bolsa Família / BPC)",
      prioridade: "ALTA",
      confianca: 0.98,
      metodo_decisao: "Modelo de Machine Learning (Linear SVM / NLP)",
      status: "PENDENTE",
      criado_em: "Hoje às 14:22",
      servicos_recomendados: ["Inscrição no Cadastro Único", "Encaminhamento para Bolsa Família"],
      documentos_necessarios: ["RG ou CNH", "CPF de todos os membros", "Comprovante de residência", "Declaração escolar"]
    },
    {
      id: "trg-102",
      nome_cidadao: "João Pereira",
      telefone_mascarado: "62 9****-9988",
      bairro: "Jundiaí",
      cidade: "Anápolis",
      relato_original: "Preciso urgente atualizar os dados da minha família no Cadastro Único para não bloquear meu benefício.",
      categoria: "cadastro_atualizacao",
      titulo_encaminhamento: "Cadastro Único para Programas Sociais (CadÚnico)",
      prioridade: "MEDIA",
      confianca: 0.96,
      metodo_decisao: "Modelo de Machine Learning (Linear SVM / NLP)",
      status: "EM_ATENDIMENTO",
      criado_em: "Hoje às 15:10",
      servicos_recomendados: ["Atualização cadastral bienal", "Emissão de Folha Resumo"],
      documentos_necessarios: ["RG e CPF do Responsável", "Certidões de nascimento", "Conta de energia recente"]
    }
  ]);

  const handleSimularTriagem = async () => {
    if (!novoRelato.trim()) return;
    setIsClassifying(true);
    try {
      const response = await fetch('http://localhost:8000/api/v1/triagem/predizer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relato: novoRelato })
      });
      const data = await response.json();
      setResultadoSimulacao(data);

      const novoItem: TriagemItem = {
        id: `trg-${Math.floor(100 + Math.random() * 900)}`,
        nome_cidadao: "Cidadão Simulado (Web)",
        telefone_mascarado: "62 9****-0000",
        bairro: "Centro",
        cidade: "Anápolis",
        relato_original: novoRelato,
        categoria: data.categoria,
        titulo_encaminhamento: data.titulo_encaminhamento,
        prioridade: data.prioridade,
        confianca: data.confianca,
        metodo_decisao: data.metodo_decisao,
        status: data.is_urgente ? "ENCAMINHADO_CREAS" : "PENDENTE",
        criado_em: "Agora mesmo",
        servicos_recomendados: data.servicos_recomendados,
        documentos_necessarios: data.documentos_necessarios
      };
      setTriagens([novoItem, ...triagens]);
      setNovoRelato('');
    } catch {
      alert("Erro ao conectar à API FastAPI (Verifique se o backend está ativo na porta 8000).");
    } finally {
      setIsClassifying(false);
    }
  };

  const triagensFiltradas = filterPrioridade === 'TODAS'
    ? triagens
    : triagens.filter(t => t.prioridade === filterPrioridade);

  return (
    <div className="space-y-6">
      {/* Simulador Interativo de Triagem com IA */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 backdrop-blur-md shadow-xl">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Simulador de Triagem Social com IA (NLP + Regras de Violência)</h2>
            <p className="text-sm text-gray-400">Digite o relato que um cidadão enviaria pelo WhatsApp para testar a triagem e encaminhamento instantâneo.</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={novoRelato}
            onChange={(e) => setNovoRelato(e.target.value)}
            placeholder="Ex: Não temos nada para comer hoje e meus 3 filhos estão com fome..."
            className="flex-1 px-4 py-3 bg-gray-950 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
            onKeyDown={(e) => e.key === 'Enter' && handleSimularTriagem()}
          />
          <button
            onClick={handleSimularTriagem}
            disabled={isClassifying}
            className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/30"
          >
            {isClassifying ? "Analisando..." : (
              <>
                <Send className="w-4 h-4" />
                Classificar Relato
              </>
            )}
          </button>
        </div>

        {resultadoSimulacao && (
          <div className={`mt-4 p-4 rounded-xl border ${resultadoSimulacao.is_urgente ? 'bg-red-950/40 border-red-800 text-red-200' : 'bg-emerald-950/40 border-emerald-800 text-emerald-200'} transition-all`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm uppercase tracking-wider flex items-center gap-2">
                {resultadoSimulacao.is_urgente ? <ShieldAlert className="w-4 h-4 text-red-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                {resultadoSimulacao.titulo_encaminhamento}
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-gray-800/80 border border-gray-700 font-mono">
                Confiança: {(resultadoSimulacao.confianca * 100).toFixed(1)}% ({resultadoSimulacao.metodo_decisao})
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Header da Fila e Filtros */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Fila Operacional do CRAS / CREAS
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2.5 py-0.5 rounded-full font-mono">
              {triagensFiltradas.length} casos
            </span>
          </h2>
          <p className="text-sm text-gray-400">Demandas triadas automaticamente pelo WhatsApp e organizadas por prioridade.</p>
        </div>

        <div className="flex items-center gap-2">
          {['TODAS', 'URGENTE_VIOLENCIA', 'ALTA', 'MEDIA'].map((prio) => (
            <button
              key={prio}
              onClick={() => setFilterPrioridade(prio)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterPrioridade === prio
                  ? 'bg-gray-800 text-white border border-gray-600 shadow-sm'
                  : 'bg-gray-950/60 text-gray-400 hover:text-gray-200 border border-gray-800'
              }`}
            >
              {prio === 'URGENTE_VIOLENCIA' ? '🚨 Urgente Violência' : prio}
            </button>
          ))}
        </div>
      </div>

      {/* Cards de Triagens da Fila */}
      <div className="grid grid-cols-1 gap-4">
        {triagensFiltradas.map((item) => {
          const isUrgente = item.prioridade === 'URGENTE_VIOLENCIA';
          return (
            <div
              key={item.id}
              className={`p-5 rounded-2xl border transition-all ${
                isUrgente
                  ? 'bg-red-950/20 border-red-800/80 shadow-lg shadow-red-950/30'
                  : 'bg-gray-900/60 border-gray-800 hover:border-gray-700'
              }`}
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 mb-3 pb-3 border-b border-gray-800/60">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${isUrgente ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/10 text-blue-400'}`}>
                    {isUrgente ? <ShieldAlert className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-base flex items-center gap-2">
                      {item.nome_cidadao}
                      <span className="text-xs text-gray-400 font-normal">({item.telefone_mascarado})</span>
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                      <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-gray-500" /> {item.bairro} - {item.cidade}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-gray-500" /> {item.criado_em}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase ${
                    isUrgente
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse'
                      : item.prioridade === 'ALTA'
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                      : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                  }`}>
                    {item.prioridade}
                  </span>
                  <span className="px-3 py-1 rounded-full text-xs bg-gray-800 text-gray-300 font-medium">
                    {item.status}
                  </span>
                </div>
              </div>

              {/* Relato do Cidadão */}
              <div className="bg-gray-950/60 p-3.5 rounded-xl border border-gray-800/80 mb-3">
                <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Relato Original do Cidadão:</p>
                <p className="text-sm text-gray-200 italic">"{item.relato_original}"</p>
              </div>

              {/* Encaminhamento sugerido e documentos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-gray-900/40 rounded-xl border border-gray-800/60">
                  <p className="font-semibold text-emerald-400 mb-1">Encaminhamento Sugerido pela IA:</p>
                  <p className="text-gray-300 font-medium">{item.titulo_encaminhamento}</p>
                  <p className="text-gray-500 text-[11px] mt-1 font-mono">{item.metodo_decisao}</p>
                </div>
                <div className="p-3 bg-gray-900/40 rounded-xl border border-gray-800/60">
                  <p className="font-semibold text-blue-400 mb-1">Documentos Necessários:</p>
                  <p className="text-gray-300 truncate">{item.documentos_necessarios.join(", ")}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
