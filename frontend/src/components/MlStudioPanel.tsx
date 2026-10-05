import React, { useCallback, useEffect, useState } from 'react';
import { Brain, BarChart3, RefreshCw, CheckCircle, ShieldCheck, Target, Layers, AlertTriangle } from 'lucide-react';

const API = 'http://localhost:8000/api/v1/ml';

interface Metricas {
  f1_macro: number;
  acuracia: number;
  recall_violencia: number;
  f1_macro_ic95?: [number, number];
  taxa_nao_identificado?: number;
}

interface Relatorio {
  timestamp: string;
  dataset_size: number;
  test_size: number;
  metodologia: Record<string, string>;
  baselines: Record<string, { descricao: string; validacao_cruzada: Metricas; teste_informal: Metricas }>;
  modelos_avaliados_cv5: Record<string, {
    f1_macro_mean: number;
    f1_macro_std: number;
    recall_violencia_cv: number;
    melhores_hiperparametros: Record<string, unknown>;
    teste_informal: Metricas;
  }>;
  comparacao_mcnemar: { modelo_a: string; modelo_b: string; p_valor: number };
  modelo_final: {
    nome: string;
    limiar_confianca: number;
    limiar_violencia: number;
    teste_sistema_completo: Metricas;
    confusion_matrix_labels: string[];
    confusion_matrix: number[][];
    erros_no_teste: { texto: string; esperado: string; previsto: string }[];
  };
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const num = (v: number) => v.toFixed(3);
const ic = (m: Metricas) => (m.f1_macro_ic95 ? `${num(m.f1_macro_ic95[0])}–${num(m.f1_macro_ic95[1])}` : '—');

const NOMES_BASELINE: Record<string, string> = {
  classe_majoritaria: 'Classe majoritária',
  regras_palavras_chave: 'Regras por palavra-chave',
};

const ABREVIACAO: Record<string, string> = {
  renda_beneficio: 'renda',
  cadastro_atualizacao: 'cadastro',
  moradia: 'moradia',
  documentacao: 'docs',
  alimentacao: 'alim.',
  pessoa_idosa_pcd: 'idoso/pcd',
  trabalho_renda: 'trabalho',
  violencia_protecao: 'violência',
  nao_identificado: 'não ident.',
};

export const MlStudioPanel: React.FC = () => {
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [isRetraining, setIsRetraining] = useState(false);

  const carregar = useCallback(async (): Promise<Relatorio | null> => {
    try {
      const res = await fetch(`${API}/metrics`);
      if (!res.ok) throw new Error();
      const dados: Relatorio = await res.json();
      setRelatorio(dados);
      setErro(null);
      return dados;
    } catch {
      setErro('Não foi possível carregar o relatório. Verifique se o backend está rodando na porta 8000.');
      return null;
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const handleRetrain = async () => {
    setIsRetraining(true);
    const anterior = relatorio?.timestamp;
    try {
      await fetch(`${API}/retrain`, { method: 'POST' });
      // O treino roda em background; espera o relatório mudar (até ~3 minutos)
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const novo = await carregar();
        if (novo && novo.timestamp !== anterior) break;
      }
    } finally {
      setIsRetraining(false);
    }
  };

  if (!relatorio) {
    return (
      <div className="p-6 rounded-2xl bg-gray-900/80 border border-gray-800 text-sm text-gray-300">
        {erro ?? 'Carregando relatório do modelo...'}
      </div>
    );
  }

  const final = relatorio.modelo_final;
  const sistema = final.teste_sistema_completo;
  const melhorBaseline = Math.max(...Object.values(relatorio.baselines).map((b) => b.teste_informal.f1_macro));

  return (
    <div className="space-y-6">
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 backdrop-blur-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400">
            <Brain className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Avaliação do Modelo de Triagem</h2>
            <p className="text-xs text-gray-400">
              Gerado em {new Date(relatorio.timestamp).toLocaleString('pt-BR')} · modelo em uso: {final.nome}
            </p>
          </div>
        </div>
        <button
          onClick={handleRetrain}
          disabled={isRetraining}
          className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-60 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-blue-900/30"
        >
          <RefreshCw className={`w-4 h-4 ${isRetraining ? 'animate-spin' : ''}`} />
          {isRetraining ? 'Retreinando (leva ~1 min)...' : 'Retreinar e Reavaliar'}
        </button>
      </div>

      <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/70 text-amber-200 text-xs flex gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span><strong>Limitação:</strong> {relatorio.metodologia.limitacao}.</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Cartao rotulo="F1 MACRO (TESTE)" icone={<Target className="w-4 h-4 text-emerald-400" />}
          valor={num(sistema.f1_macro)} legenda={`IC 95%: ${ic(sistema)} · melhor linha de base ${num(melhorBaseline)}`} cor="text-emerald-400" />
        <Cartao rotulo="REVOCAÇÃO VIOLÊNCIA" icone={<ShieldCheck className="w-4 h-4 text-red-400" />}
          valor={pct(sistema.recall_violencia)} legenda="Sistema completo (regra + modelo), no teste" cor="text-red-400" />
        <Cartao rotulo="DADOS" icone={<Layers className="w-4 h-4 text-blue-400" />}
          valor={`${relatorio.dataset_size} / ${relatorio.test_size}`} legenda="Relatos únicos de treino / de teste" cor="text-blue-400" />
        <Cartao rotulo="NÃO IDENTIFICADO" icone={<BarChart3 className="w-4 h-4 text-purple-400" />}
          valor={pct(sistema.taxa_nao_identificado ?? 0)} legenda="Casos enviados ao Disque Social 121" cor="text-purple-400" />
      </div>

      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 backdrop-blur-md">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-1">Modelos vs. linhas de base</h3>
        <p className="text-xs text-gray-400 mb-4">
          Validação cruzada agrupada (k=5) no treino; teste em relatos informais nunca vistos. O modelo é escolhido pela validação cruzada, nunca pelo teste.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-gray-950/80 text-gray-400 uppercase text-[10px] tracking-wider border-b border-gray-800">
              <tr>
                <th className="p-3">Abordagem</th>
                <th className="p-3">F1 macro (CV)</th>
                <th className="p-3">F1 macro (teste)</th>
                <th className="p-3">IC 95% (teste)</th>
                <th className="p-3">Recall violência (teste)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60 font-mono">
              {Object.entries(relatorio.baselines).map(([chave, b]) => (
                <tr key={chave}>
                  <td className="p-3 font-sans text-gray-400">{NOMES_BASELINE[chave] ?? chave} <span className="text-gray-600">(linha de base)</span></td>
                  <td className="p-3">{num(b.validacao_cruzada.f1_macro)}</td>
                  <td className="p-3">{num(b.teste_informal.f1_macro)}</td>
                  <td className="p-3 text-gray-500">—</td>
                  <td className="p-3">{pct(b.teste_informal.recall_violencia)}</td>
                </tr>
              ))}
              {Object.entries(relatorio.modelos_avaliados_cv5).map(([nome, m]) => (
                <tr key={nome} className={nome === final.nome ? 'bg-emerald-950/20' : ''}>
                  <td className="p-3 font-sans text-gray-200 flex items-center gap-1.5">
                    {nome === final.nome && <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
                    {nome} <span className="text-gray-500">(modelo sozinho)</span>
                  </td>
                  <td className="p-3">{num(m.f1_macro_mean)} ± {num(m.f1_macro_std)}</td>
                  <td className="p-3">{num(m.teste_informal.f1_macro)}</td>
                  <td className="p-3">{ic(m.teste_informal)}</td>
                  <td className="p-3">{pct(m.teste_informal.recall_violencia)}</td>
                </tr>
              ))}
              <tr className="bg-emerald-950/30">
                <td className="p-3 font-sans text-emerald-300 font-bold">Sistema completo em produção</td>
                <td className="p-3 text-gray-500">—</td>
                <td className="p-3 text-emerald-300 font-bold">{num(sistema.f1_macro)}</td>
                <td className="p-3 text-emerald-300">{ic(sistema)}</td>
                <td className="p-3 text-emerald-300 font-bold">{pct(sistema.recall_violencia)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-500 mt-3">
          McNemar {relatorio.comparacao_mcnemar.modelo_a} vs {relatorio.comparacao_mcnemar.modelo_b}: p = {relatorio.comparacao_mcnemar.p_valor.toFixed(3)}
          {relatorio.comparacao_mcnemar.p_valor >= 0.05 ? ' (diferença não significativa)' : ' (diferença significativa)'}
          {' · '}Decisão: {relatorio.metodologia.decisao} · limiares: confiança {final.limiar_confianca}, violência {final.limiar_violencia}
        </p>
      </div>

      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 backdrop-blur-md">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Matriz de confusão do sistema (teste)</h3>
        <div className="overflow-x-auto">
          <table className="text-[11px] font-mono text-gray-300">
            <thead>
              <tr>
                <th className="p-1.5 text-left text-gray-500 font-sans">real ↓ / previsto →</th>
                {final.confusion_matrix_labels.map((l) => <th key={l} className="p-1.5 text-gray-400 font-sans font-medium">{ABREVIACAO[l] ?? l}</th>)}
              </tr>
            </thead>
            <tbody>
              {final.confusion_matrix.map((linha, i) => (
                <tr key={i}>
                  <th className="p-1.5 text-left text-gray-400 font-sans font-medium">{ABREVIACAO[final.confusion_matrix_labels[i]]}</th>
                  {linha.map((v, j) => (
                    <td key={j} className={`p-1.5 text-center rounded ${v === 0 ? 'text-gray-700' : i === j ? 'bg-emerald-900/50 text-emerald-200' : 'bg-red-900/40 text-red-200'}`}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 backdrop-blur-md">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Análise de erros ({final.erros_no_teste.length} no teste)</h3>
        <ul className="space-y-2 text-xs max-h-80 overflow-y-auto pr-2">
          {final.erros_no_teste.map((e, i) => (
            <li key={i} className={`p-2.5 rounded-lg border ${e.esperado === 'violencia_protecao' ? 'border-red-800 bg-red-950/30' : 'border-gray-800 bg-gray-950/50'}`}>
              <span className="text-gray-200">"{e.texto}"</span>
              <span className="block text-gray-500 mt-1 font-mono">esperado {e.esperado} → previsto {e.previsto}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const Cartao: React.FC<{ rotulo: string; icone: React.ReactNode; valor: string; legenda: string; cor: string }> = ({ rotulo, icone, valor, legenda, cor }) => (
  <div className="bg-gray-900/60 border border-gray-800 p-5 rounded-2xl">
    <div className="flex justify-between items-start text-xs text-gray-400 mb-2">
      <span>{rotulo}</span>
      {icone}
    </div>
    <p className="text-2xl font-black text-white font-mono">{valor}</p>
    <p className={`text-[11px] ${cor} mt-1 font-medium`}>{legenda}</p>
  </div>
);
