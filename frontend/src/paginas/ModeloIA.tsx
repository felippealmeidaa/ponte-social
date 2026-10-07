import { useCallback, useEffect, useState } from 'react';
import { Brain, CheckCircle2, CircleX, GraduationCap, Play, Scale } from 'lucide-react';
import { api, ErroApi } from '../api';
import { Aviso, Botao, Esqueleto } from '../components/ui';
import { contaAtual } from '../unidades';
import { useAtualizacao } from '../useAtualizacao';
import { dataHora } from '../vocabulario';

// Aba "Modelo de IA": o que a banca e a coordenação precisam ver da IA, com números honestos.
// 1) LLM x modelo local no mesmo teste; 2) o modelo local em detalhe; 3) aprender com os casos reais.

interface Metricas {
  f1_macro: number; acuracia: number; recall_violencia: number; f1_macro_ic95?: [number, number]; taxa_nao_identificado?: number;
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
    <div className="flex flex-col gap-12">
      <ComparacaoLLM />
      <section aria-labelledby="t-local" className="flex flex-col gap-4">
        <Titulo id="t-local" icone={Brain}>Modelo local em detalhe</Titulo>
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
    <h2 id={id} className="flex items-center gap-2.5 titulo text-[22px] leading-[1.1]">
      <span className="flex size-8 items-center justify-center rounded-[4px] bg-caneta-fundo text-caneta"><Icone className="size-[18px]" aria-hidden /></span>
      {children}
    </h2>
  );
}

function ComparacaoLLM() {
  const { dados, erro, recarregar } = useAtualizacao(useCallback(() => api<Comparacao>('/ml/comparacao'), []), 0);
  const [disparando, setDisparando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const rodando = Boolean(dados?.estado.rodando);

  // Enquanto roda, acompanha o andamento
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
      setFalha(e instanceof ErroApi ? e.message : 'Não foi possível iniciar.');
    } finally {
      setDisparando(false);
    }
  };

  const r = dados?.resultado;
  const linhas = r ? ([
    ['Modelo local (scikit-learn)', r.abordagens.modelo_local, false],
    [`LLM sozinho (${r.modelo_llm})`, r.abordagens.llm, false],
    ['Híbrido: o que roda no WhatsApp', r.abordagens.hibrido, true],
  ] as [string, Abordagem, boolean][]) : [];
  const m = r?.mcnemar_local_x_llm;

  return (
    <section aria-labelledby="t-comp" className="flex flex-col gap-4">
      <Titulo id="t-comp" icone={Scale}>LLM x modelo local, no mesmo teste</Titulo>
      <p className="max-w-[75ch] text-[15px] text-texto-2">
        Os mesmos {r ? r.conjunto.split(' ')[0] : '80'} relatos de teste (nunca usados no treino) passam pelo modelo local e pela IA generativa.
        O sistema do WhatsApp usa os dois: a IA lê o relato pelo sentido, e se a regra ou o modelo local virem violência, vale violência.
      </p>
      {erro && <Aviso>{erro}</Aviso>}
      {!dados && !erro && <Esqueleto className="h-48" />}
      {dados && !r && !rodando && <p className="text-[14px] text-texto-3">A comparação ainda não foi rodada.</p>}
      {r && (
        <div className="overflow-x-auto rounded-[4px] border border-linha">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-elevada text-left text-texto-2">
              <tr>
                <th className="px-4 py-2.5 font-medium">Abordagem</th>
                <th className="px-4 py-2.5 text-right font-medium">F1 macro (IC 95%)</th>
                <th className="px-4 py-2.5 text-right font-medium">Acerto</th>
                <th className="px-4 py-2.5 text-right font-medium">Violência reconhecida</th>
                <th className="px-4 py-2.5 text-right font-medium">Tempo por relato</th>
                <th className="px-4 py-2.5 text-right font-medium">Custo</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(([nome, a, destaque]) => (
                <tr key={nome} className={`border-t border-linha ${destaque ? 'bg-caneta-fundo/50 font-medium' : ''}`}>
                  <td className="px-4 py-2.5">{nome}<span className="block text-[12px] font-normal text-texto-3">{a.descricao}</span></td>
                  <td className="px-4 py-2.5 text-right tabular">{n2(a.f1_macro)}{a.f1_macro_ic95 && <span className="ml-1 text-xs text-texto-3">({n2(a.f1_macro_ic95[0])}–{n2(a.f1_macro_ic95[1])})</span>}</td>
                  <td className="px-4 py-2.5 text-right tabular">{pct(a.acuracia)}</td>
                  <td className={`px-4 py-2.5 text-right tabular ${a.recall_violencia < 0.9 ? 'text-urgente' : ''}`}>{pct(a.recall_violencia)}</td>
                  <td className="px-4 py-2.5 text-right tabular">{a.tempo_medio_ms !== undefined ? ms(a.tempo_medio_ms) : 'IA + local'}</td>
                  <td className="px-4 py-2.5 text-right tabular text-texto-2">{a.tokens_medios ? `~${Math.round(a.tokens_medios)} tokens` : nome.startsWith('Modelo') ? 'grátis, sem internet' : 'tokens da IA'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {r && m && (
        <p className="max-w-[80ch] text-[14px] text-texto-2">
          Em {m.a_certo_b_errado} relatos só o modelo local acertou; em {m.a_errado_b_certo}, só a IA.{' '}
          {m.p_valor < 0.05 ? `A diferença é estatisticamente significativa (teste de McNemar, p = ${m.p_valor < 0.001 ? '< 0,001' : n2(m.p_valor)}).`
            : `A diferença não é estatisticamente significativa (teste de McNemar, p = ${n2(m.p_valor)}).`}
          {(r.abordagens.llm.falhas ?? 0) > 0 && ` Atenção: ${r.abordagens.llm.falhas} chamadas à IA falharam e contaram como erro.`}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {contaAtual().coordenacao && dados?.llm_disponivel && (
          <Botao icone={Play} carregando={disparando || rodando} onClick={rodar} disabled={rodando}>
            {rodando ? `Rodando: ${dados?.estado.feitos ?? 0} de ${dados?.estado.total ?? 0} relatos` : r ? 'Rodar a comparação de novo' : 'Rodar a comparação'}
          </Botao>
        )}
        {r && <span className="text-[13px] text-texto-3">Rodada em {dataHora(r.timestamp)}. Leva uns 6 minutos: o plano gratuito do Gemini aceita 15 pedidos por minuto.</span>}
      </div>
      {(falha || dados?.estado.erro) && <Aviso>{falha ?? dados?.estado.erro}</Aviso>}
    </section>
  );
}

function TabelaLocal({ dados }: { dados: Relatorio }) {
  const s = dados.modelo_final.teste_sistema_completo;
  const linhas: [string, Metricas, boolean][] = [
    ['Sempre a categoria mais comum', dados.baselines.classe_majoritaria.teste_informal, false],
    ['Só palavras-chave', dados.baselines.regras_palavras_chave.teste_informal, false],
    ...Object.entries(dados.modelos_avaliados_cv5).map(([nome, m]) => [`${nome} (sozinho)`, m.teste_informal, false] as [string, Metricas, boolean]),
    ['Sistema local em uso (regra de violência + modelo + palavras-chave)', s, true],
  ];
  return (
    <>
      <Aviso tom="info">{dados.metodologia.limitacao}. Os números abaixo são de relatos simulados.</Aviso>
      <p className="max-w-[75ch] text-texto-2">
        No teste com {dados.test_size} relatos escritos como no WhatsApp, o sistema local acertou a necessidade em{' '}
        <strong className="text-texto">{pct(s.acuracia)}</strong> dos casos e reconheceu{' '}
        <strong className={s.recall_violencia < 0.9 ? 'text-urgente' : 'text-texto'}>{pct(s.recall_violencia)}</strong> das situações de violência.
        Em {pct(s.taxa_nao_identificado ?? 0)} ele preferiu não arriscar e indicou o Disque Social 121.
      </p>
      <div className="overflow-x-auto rounded-[4px] border border-linha">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-elevada text-left text-texto-2">
            <tr>
              <th className="px-4 py-2.5 font-medium">Abordagem</th>
              <th className="px-4 py-2.5 text-right font-medium">F1 macro</th>
              <th className="px-4 py-2.5 text-right font-medium">Acerto</th>
              <th className="px-4 py-2.5 text-right font-medium">Violência reconhecida</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(([nome, m, destaque]) => (
              <tr key={nome} className={`border-t border-linha ${destaque ? 'bg-caneta-fundo/50 font-medium' : ''}`}>
                <td className="px-4 py-2.5">{nome}</td>
                <td className="px-4 py-2.5 text-right tabular">{n2(m.f1_macro)}{m.f1_macro_ic95 && <span className="ml-1 text-xs text-texto-3">({n2(m.f1_macro_ic95[0])}–{n2(m.f1_macro_ic95[1])})</span>}</td>
                <td className="px-4 py-2.5 text-right tabular">{pct(m.acuracia)}</td>
                <td className="px-4 py-2.5 text-right tabular">{pct(m.recall_violencia)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[13px] text-texto-3">
        Relatório de {dataHora(dados.timestamp)}, modelo {dados.modelo_final.nome}, {dados.dataset_size} relatos de treino
        {dados.exemplos_reais ? `, dos quais ${dados.exemplos_reais} reais` : ''}.
      </p>
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
      setFalha(e instanceof ErroApi ? e.message : 'Não foi possível treinar.');
    } finally {
      setTreinando(false);
    }
  };

  return (
    <section aria-labelledby="t-aprender" className="flex flex-col gap-4">
      <Titulo id="t-aprender" icone={GraduationCap}>Aprender com os casos reais</Titulo>
      <p className="max-w-[75ch] text-[15px] text-texto-2">
        Cada caso em que a pessoa confirmou a necessidade no WhatsApp, ou em que a equipe corrigiu a necessidade na ficha, vira um exemplo
        para treinar o modelo local (só com o consentimento dado no aceite). O modelo novo é medido no mesmo teste e só substitui o atual
        se não piorar: o reconhecimento de violência não pode cair.
      </p>
      {erro && <Aviso>{erro}</Aviso>}
      {dados && (
        <p className="text-[15px]">
          <strong className="titulo text-[26px] tabular">{dados.exemplos_reais}</strong>{' '}
          <span className="text-texto-2">casos reais prontos para ensinar ({dados.por_fonte.pessoa} confirmados pela pessoa, {dados.por_fonte.equipe} corrigidos pela equipe)</span>
        </p>
      )}
      {contaAtual().coordenacao && (
        <div className="flex flex-wrap items-center gap-3">
          <Botao variante="primario" icone={GraduationCap} carregando={treinando} onClick={treinar}>
            {treinando ? 'Treinando e avaliando (cerca de 30 s)' : 'Treinar com os casos reais'}
          </Botao>
        </div>
      )}
      {falha && <Aviso>{falha}</Aviso>}
      {resultado && <ResultadoTreino t={resultado} />}
      {dados && dados.historico.length > 0 && (
        <div className="overflow-x-auto rounded-[4px] border border-linha">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="px-4 pt-3 text-left text-[13.5px] font-semibold text-texto-2">Treinos anteriores</caption>
            <thead className="text-left text-texto-2">
              <tr>
                <th className="px-4 py-2 font-medium">Quando</th>
                <th className="px-4 py-2 text-right font-medium">Casos reais</th>
                <th className="px-4 py-2 text-right font-medium">F1 antes → depois</th>
                <th className="px-4 py-2 text-right font-medium">Violência antes → depois</th>
                <th className="px-4 py-2 font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {dados.historico.map((h) => (
                <tr key={h.em} className="border-t border-linha">
                  <td className="px-4 py-2">{dataHora(h.em)}<span className="block text-[12px] text-texto-3">{h.por}</span></td>
                  <td className="px-4 py-2 text-right tabular">{h.depois.exemplos_reais}</td>
                  <td className="px-4 py-2 text-right tabular">{n2(h.antes.f1_macro)} → {n2(h.depois.f1_macro)}</td>
                  <td className="px-4 py-2 text-right tabular">{pct(h.antes.recall_violencia)} → {pct(h.depois.recall_violencia)}</td>
                  <td className={`px-4 py-2 ${h.trocou ? 'text-ok' : 'text-texto-2'}`}>{h.trocou ? 'Modelo novo em uso' : 'Mantido o anterior'}</td>
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
    <div role="status" className={`flex items-start gap-3 rounded-[4px] border px-4 py-3 ${t.trocou ? 'border-ok/30 bg-ok-fundo' : 'border-linha bg-elevada'}`}>
      <Icone className={`mt-0.5 size-5 shrink-0 ${t.trocou ? 'text-ok' : 'text-texto-2'}`} aria-hidden />
      <div className="text-[14.5px]">
        <p className="font-semibold">{t.trocou ? 'O modelo novo está em uso.' : 'O modelo anterior foi mantido.'}</p>
        <p className="text-texto-2">
          Com {t.depois.exemplos_reais} casos reais: F1 {n2(t.antes.f1_macro)} → {n2(t.depois.f1_macro)}, violência reconhecida{' '}
          {pct(t.antes.recall_violencia)} → {pct(t.depois.recall_violencia)}. {t.trocou ? '' : `Motivo: ${t.motivo}.`}
        </p>
      </div>
    </div>
  );
}
