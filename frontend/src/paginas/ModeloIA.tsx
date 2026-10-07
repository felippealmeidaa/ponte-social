import { useCallback, useEffect, useState } from 'react';
import { 
  Activity, 
  Brain, 
  CheckCircle2, 
  CircleX, 
  GraduationCap, 
  Play, 
  Scale, 
  Zap 
} from 'lucide-react';
import { api, ErroApi } from '../api';
import { Aviso, Botao, Esqueleto } from '../components/ui';
import { contaAtual } from '../unidades';
import { useAtualizacao } from '../useAtualizacao';
import { dataHora } from '../vocabulario';

interface Metricas {
  f1_macro: number;
  f1_macro_ic95?: [number, number];
  acuracia: number;
  recall_violencia: number;
}
interface Relatorio {
  timestamp: string;
  dataset_size: number;
  test_size: number;
  exemplos_reais?: number;
  metodologia: { limitacao: string };
  baselines: Record<string, { teste_informal: Metricas }>;
  modelos_avaliados_cv5: Record<string, { teste_informal: Metricas }>;
  modelo_final: { nome: string; teste_sistema_completo: Metricas };
}
interface Abordagem extends Metricas {
  descricao: string; tempo_medio_ms?: number; tempo_p95_ms?: number; tokens_medios?: number; falhas?: number;
}
interface Comparacao {
  resultado: null | {
    timestamp: string; conjunto: string; modelo_llm: string;
    abordagens: { modelo_local: Abordagem; llm: Abordagem; hibrido: Abordagem };
    mcnemar_local_x_llm: { a_certo_b_errado: number; a_errado_b_certo: number; p_valor: number };
  };
  estado: { rodando: boolean; feitos: number; total: number; erro: string | null };
  llm_disponivel: boolean;
}
interface ResumoTreino { modelo: string; f1_macro: number; acuracia: number; recall_violencia: number; treino: number; exemplos_reais: number }
interface Treino { em: string; por: string; antes: ResumoTreino; depois: ResumoTreino; trocou: boolean; motivo: string; reais_por_fonte: { pessoa: number; equipe: number } }
interface Aprendizado { exemplos_reais: number; por_fonte: { pessoa: number; equipe: number }; historico: Treino[]; rodando: boolean }

const pct = (v: number) => `${Math.round(v * 100)}%`;
const n2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ms = (v?: number) => (v === undefined ? '–' : v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`);

export function ModeloIA() {
  const relatorio = useAtualizacao(useCallback(() => api<Relatorio>('/ml/metrics'), []), 0);
  return (
    <div className="flex flex-col gap-10">
      <ComparacaoLLM />
      
      <section aria-labelledby="t-local" className="flex flex-col gap-4 rounded-2xl border border-linha glass-card p-6">
        <Titulo id="t-local" icone={Brain}>Benchmark Supervisionado do Modelo Local (MLOps)</Titulo>
        {relatorio.erro && <Aviso>{relatorio.erro}</Aviso>}
        {!relatorio.dados && !relatorio.erro && <Esqueleto className="h-60" />}
        {relatorio.dados && <TabelaLocal dados={relatorio.dados} />}
      </section>

      <AprenderComCasos onTreinou={relatorio.recarregar} />
    </div>
  );
}

function Titulo({ id, icone: Icone, children }: { id: string; icone: typeof Brain; children: string }) {
  return (
    <h2 id={id} className="flex items-center gap-3 titulo text-[19px] md:text-[21px] text-texto">
      <span className="flex size-8.5 items-center justify-center rounded-xl bg-marca-fundo border border-marca/20 text-marca">
        <Icone className="size-4.5" aria-hidden />
      </span>
      {children}
    </h2>
  );
}

function ComparacaoLLM() {
  const { dados, erro, recarregar } = useAtualizacao(useCallback(() => api<Comparacao>('/ml/comparacao'), []), 0);
  const [disparando, setDisparando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const rodando = Boolean(dados?.estado.rodando);

  useEffect(() => {
    if (!rodando) return;
    const id = setInterval(recarregar, 4000);
    return () => clearInterval(id);
  }, [rodando, recarregar]);

  const rodar = async () => {
    setDisparando(true);
    setFalha(null);
    try {
      await api('/ml/comparacao', { method: 'POST' });
      recarregar();
    } catch (e) {
      setFalha(e instanceof ErroApi ? e.message : 'Falha ao iniciar benchmark.');
    } finally {
      setDisparando(false);
    }
  };

  const r = dados?.resultado;
  const linhas = r ? ([
    ['Modelo Local Clássico (scikit-learn / SVM)', r.abordagens.modelo_local, false],
    [`LLM Generativo (${r.modelo_llm})`, r.abordagens.llm, false],
    ['Motor Híbrido Oficial (Produção WhatsApp)', r.abordagens.hibrido, true],
  ] as [string, Abordagem, boolean][]) : [];
  const m = r?.mcnemar_local_x_llm;

  return (
    <section aria-labelledby="t-comp" className="flex flex-col gap-4 rounded-2xl border border-linha glass-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Titulo id="t-comp" icone={Scale}>Comparativo Científico: LLM Generativo x Modelo Local</Titulo>
          <p className="mt-1.5 max-w-[75ch] text-[14px] text-texto-2 leading-relaxed">
            Avaliação comparativa no conjunto de teste independente (80 relatos). O motor híbrido de produção orquestra a interpretação semântica com os guardrails determinísticos de proteção integral.
          </p>
        </div>

        {contaAtual().coordenacao && dados?.llm_disponivel && (
          <Botao 
            variante="primario" 
            icone={Play} 
            carregando={disparando || rodando} 
            onClick={rodar} 
            disabled={rodando}
          >
            {rodando ? `Executando: ${dados?.estado.feitos ?? 0}/${dados?.estado.total ?? 0}` : r ? 'Reexecutar Benchmark' : 'Executar Comparação'}
          </Botao>
        )}
      </div>

      {erro && <Aviso>{erro}</Aviso>}
      {!dados && !erro && <Esqueleto className="h-48" />}
      {dados && !r && !rodando && <p className="text-[14px] text-texto-3 italic">O teste comparativo ainda não foi executado nesta instância.</p>}

      {r && (
        <div className="overflow-x-auto rounded-xl border border-linha bg-superficie">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-elevada text-left text-texto-2 border-b border-linha">
              <tr>
                <th className="px-4 py-3 font-semibold">Abordagem / Arquitetura</th>
                <th className="px-4 py-3 text-right font-semibold">F1-Macro (IC 95%)</th>
                <th className="px-4 py-3 text-right font-semibold">Acurácia</th>
                <th className="px-4 py-3 text-right font-semibold text-rose-600 dark:text-rose-400">Recall Violência</th>
                <th className="px-4 py-3 text-right font-semibold">Latência Média</th>
                <th className="px-4 py-3 text-right font-semibold">Custo / Tokens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {linhas.map(([nome, a, destaque]) => (
                <tr key={nome} className={`transition-colors ${destaque ? 'bg-sky-500/10 font-medium' : 'hover:bg-elevada/50'}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {destaque && <Zap className="size-4 text-marca" />}
                      <span className={`font-semibold ${destaque ? 'text-marca' : 'text-texto'}`}>{nome}</span>
                    </div>
                    <span className="block text-[12px] text-texto-3 mt-0.5">{a.descricao}</span>
                  </td>
                  <td className="mono px-4 py-3 text-right font-bold text-texto">
                    {n2(a.f1_macro)}
                    {a.f1_macro_ic95 && <span className="block text-[11px] text-texto-3 font-normal">({n2(a.f1_macro_ic95[0])}–{n2(a.f1_macro_ic95[1])})</span>}
                  </td>
                  <td className="mono px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">{pct(a.acuracia)}</td>
                  <td className="mono px-4 py-3 text-right font-bold">
                    <span className={`px-2 py-0.5 rounded-full ${a.recall_violencia >= 0.95 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30'}`}>
                      {pct(a.recall_violencia)}
                    </span>
                  </td>
                  <td className="mono px-4 py-3 text-right text-texto-2">{a.tempo_medio_ms !== undefined ? ms(a.tempo_medio_ms) : 'Local + API'}</td>
                  <td className="mono px-4 py-3 text-right text-texto-3">{a.tokens_medios ? `~${Math.round(a.tokens_medios)} tokens` : nome.startsWith('Modelo') ? '0 tokens (offline)' : 'API tokens'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {r && m && (
        <div className="rounded-xl border border-linha bg-elevada p-4 text-[13.5px] text-texto flex items-start gap-3">
          <Activity className="size-4 text-marca shrink-0 mt-0.5" />
          <div>
            <strong>Significância Estatística (Teste de McNemar):</strong> Em {m.a_certo_b_errado} relatos apenas o modelo local acertou; em {m.a_errado_b_certo}, apenas a LLM. p-valor = <span className="mono font-bold text-marca">{m.p_valor < 0.001 ? '< 0.001' : n2(m.p_valor)}</span> ({m.p_valor < 0.05 ? 'Diferença estatisticamente significante' : 'Diferença sem significância estatística'}).
          </div>
        </div>
      )}

      {(falha || dados?.estado.erro) && <Aviso>{falha ?? dados?.estado.erro}</Aviso>}
    </section>
  );
}

function TabelaLocal({ dados }: { dados: Relatorio }) {
  const s = dados.modelo_final.teste_sistema_completo;
  const linhas: [string, Metricas, boolean][] = [
    ['Baseline: Classe Majoritária', dados.baselines.classe_majoritaria.teste_informal, false],
    ['Baseline Heurístico: Regras e Palavras-Chave', dados.baselines.regras_palavras_chave.teste_informal, false],
    ...Object.entries(dados.modelos_avaliados_cv5).map(([nome, m]) => [`Modelo Supervisionado: ${nome}`, m.teste_informal, false] as [string, Metricas, boolean]),
    ['Sistema Local Completo em Produção (Guardrails + SVM)', s, true],
  ];

  return (
    <>
      <div className="rounded-xl border border-sky-500/20 bg-sky-50 dark:bg-sky-950/20 p-3.5 text-[13px] text-sky-900 dark:text-sky-200">
        ℹ️ {dados.metodologia.limitacao} Validação Cruzada Estratificada (k=5) com dataset de {dados.dataset_size} exemplos.
      </div>

      <div className="overflow-x-auto rounded-xl border border-linha bg-superficie">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-elevada text-left text-texto-2 border-b border-linha">
            <tr>
              <th className="px-4 py-3 font-semibold">Modelo / Abordagem</th>
              <th className="px-4 py-3 text-right font-semibold">F1-Macro</th>
              <th className="px-4 py-3 text-right font-semibold">Acurácia</th>
              <th className="px-4 py-3 text-right font-semibold text-rose-600 dark:text-rose-400">Recall Violência</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-linha">
            {linhas.map(([nome, m, destaque]) => (
              <tr key={nome} className={`transition-colors ${destaque ? 'bg-sky-500/10 font-semibold text-marca' : 'hover:bg-elevada/50'}`}>
                <td className="px-4 py-3 font-medium text-texto">{nome}</td>
                <td className="mono px-4 py-3 text-right font-bold text-texto">{n2(m.f1_macro)}</td>
                <td className="mono px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">{pct(m.acuracia)}</td>
                <td className="mono px-4 py-3 text-right font-bold text-rose-600 dark:text-rose-300">{pct(m.recall_violencia)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AprenderComCasos({ onTreinou }: { onTreinou: () => void }) {
  const { dados, erro, recarregar } = useAtualizacao(useCallback(() => api<Aprendizado>('/ml/aprendizado'), []), 0);
  const [treinando, setTreinando] = useState(false);
  const [resultado, setResultado] = useState<Treino | null>(null);
  const [falha, setFalha] = useState<string | null>(null);

  const treinar = async () => {
    setTreinando(true);
    setFalha(null);
    try {
      setResultado(await api<Treino>('/ml/retrain', { method: 'POST' }));
      recarregar();
      onTreinou();
    } catch (e) {
      setFalha(e instanceof ErroApi ? e.message : 'Falha durante o retreino.');
    } finally {
      setTreinando(false);
    }
  };

  return (
    <section aria-labelledby="t-aprender" className="flex flex-col gap-4 rounded-2xl border border-linha glass-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Titulo id="t-aprender" icone={GraduationCap}>Aprendizado Contínuo & Feedback Humano (Active Learning)</Titulo>
          <p className="mt-1.5 max-w-[75ch] text-[14px] text-texto-2 leading-relaxed">
            Casos confirmados no WhatsApp ou corrigidos pela equipe social retroalimentam o pipeline de treino sob consentimento LGPD.
          </p>
        </div>

        {contaAtual().coordenacao && (
          <Botao variante="primario" icone={GraduationCap} carregando={treinando} onClick={treinar}>
            {treinando ? 'Processando Retreino...' : 'Executar Retreino com Casos Reais'}
          </Botao>
        )}
      </div>

      {erro && <Aviso>{erro}</Aviso>}
      {falha && <Aviso tom="urgente">{falha}</Aviso>}
      
      {dados && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-linha bg-elevada p-4">
            <span className="text-[12px] font-semibold text-texto-3 uppercase">Casos Reais Disponíveis</span>
            <p className="mono titulo text-[26px] text-marca mt-1">{dados.exemplos_reais}</p>
          </div>
          <div className="rounded-xl border border-linha bg-elevada p-4">
            <span className="text-[12px] font-semibold text-texto-3 uppercase">Confirmados pelo Cidadão</span>
            <p className="mono titulo text-[26px] text-emerald-600 dark:text-emerald-400 mt-1">{dados.por_fonte.pessoa}</p>
          </div>
          <div className="rounded-xl border border-linha bg-elevada p-4">
            <span className="text-[12px] font-semibold text-texto-3 uppercase">Corrigidos pelos Técnicos</span>
            <p className="mono titulo text-[26px] text-sky-600 dark:text-sky-400 mt-1">{dados.por_fonte.equipe}</p>
          </div>
        </div>
      )}

      {resultado && <ResultadoTreino t={resultado} />}

      {dados && dados.historico.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-linha bg-superficie">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-elevada text-left text-texto-2 border-b border-linha">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Data / Autor</th>
                <th className="px-4 py-2.5 text-right font-semibold">Exemplos Reais</th>
                <th className="px-4 py-2.5 text-right font-semibold">F1 Macro</th>
                <th className="px-4 py-2.5 text-right font-semibold text-rose-600 dark:text-rose-400">Recall Violência</th>
                <th className="px-4 py-2.5 font-semibold">Status de Troca</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {dados.historico.map((h) => (
                <tr key={h.em} className="hover:bg-elevada/50">
                  <td className="px-4 py-2.5 font-medium text-texto">
                    {dataHora(h.em)}
                    <span className="block text-[11.5px] text-texto-3">{h.por}</span>
                  </td>
                  <td className="mono px-4 py-2.5 text-right text-texto">{h.depois.exemplos_reais}</td>
                  <td className="mono px-4 py-2.5 text-right font-bold text-texto">{n2(h.antes.f1_macro)} → {n2(h.depois.f1_macro)}</td>
                  <td className="mono px-4 py-2.5 text-right font-bold text-rose-600 dark:text-rose-300">{pct(h.antes.recall_violencia)} → {pct(h.depois.recall_violencia)}</td>
                  <td className="px-4 py-2.5 font-semibold">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${h.trocou ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30' : 'bg-elevada text-texto-3'}`}>
                      {h.trocou ? 'Novo Modelo Adotado' : 'Mantido Anterior'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ResultadoTreino({ t }: { t: Treino }) {
  const Icone = t.trocou ? CheckCircle2 : CircleX;
  return (
    <div role="status" className={`flex items-start gap-3 rounded-xl border p-4 ${t.trocou ? 'border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200' : 'border-linha bg-elevada text-texto'}`}>
      <Icone className={`mt-0.5 size-5 shrink-0 ${t.trocou ? 'text-emerald-600 dark:text-emerald-400' : 'text-texto-3'}`} aria-hidden />
      <div>
        <p className="font-bold text-texto text-[15px]">{t.trocou ? 'Novo Modelo Supervisionado Validado e em Produção!' : 'Modelo Anterior Mantido (Critério de Segurança).'}</p>
        <p className="text-[13.5px] text-texto-2 mt-0.5">
          Com {t.depois.exemplos_reais} casos reais: F1 {n2(t.antes.f1_macro)} → {n2(t.depois.f1_macro)}, Recall de Violência {pct(t.antes.recall_violencia)} → {pct(t.depois.recall_violencia)}. {t.trocou ? '' : `Motivo: ${t.motivo}.`}
        </p>
      </div>
    </div>
  );
}
