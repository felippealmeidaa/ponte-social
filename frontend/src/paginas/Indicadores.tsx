import { lazy, Suspense, useCallback, useState } from 'react';
import { BarChart3, FileText, ShieldAlert, Table2 } from 'lucide-react';
import { api } from '../api';
import { Aviso, Esqueleto, Vazio } from '../components/ui';
import { useAtualizacao } from '../useAtualizacao';
import { Relatorio } from './Relatorio';
import { CANAIS, corCategoria, duracao, ESTADOS, nomeCategoria, ORDEM_ESTADOS } from '../vocabulario';

// Série única na cor da marca; a barra em foco ganha a cor do texto
const COR_SERIE = 'var(--color-acao)';
const COR_FOCO = 'var(--color-texto)';

// O mapa (Leaflet) só é baixado quando a página de Indicadores abre
const MapaDemanda = lazy(() => import('../components/MapaDemanda').then((m) => ({ default: m.MapaDemanda })));

interface Resumo {
  periodo_dias: number;
  total: number;
  abertas: number;
  urgentes: number;
  por_status: Record<string, number>;
  por_categoria: Record<string, number>;
  por_canal: Record<string, number>;
  por_bairro: Record<string, number>;
  por_dia: { dia: string; total: number }[];
  acerto_do_sistema: { confirmadas_pelo_cidadao: number; sugestao_aceita: number };
  horas_ate_primeiro_atendimento: number | null;
  tempo_resposta: TempoCras[];
  avaliacao: { respostas: number; media: number | null; por_nota: Record<string, number> };
}

interface GrupoTempo { casos: number; atendidos: number; mediana_min: number | null }
interface TempoCras { unidade_id: string | null; nome: string; urgentes: GrupoTempo; demais: GrupoTempo }

const PERIODOS = [7, 30, 90];
const diaCurto = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

export function Indicadores({ parametro }: { parametro?: string }) {
  if (parametro === 'relatorio') return <Relatorio />;
  return <Painel />;
}

function Painel() {
  const [dias, setDias] = useState(30);
  const { dados, erro } = useAtualizacao(useCallback(() => api<Resumo>(`/triagem/indicadores/resumo?dias=${dias}`), [dias]), 30000);

  return (
    <>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="titulo text-[35px] leading-[1.05]">Indicadores</h1>
          <p className="mt-2 max-w-[75ch] text-texto-2">O que chegou à fila no período. Os exemplos de demonstração não entram na conta.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
        <a href="#/indicadores/relatorio" className="inline-flex h-10 items-center gap-2 rounded-[5px] border border-linha-forte bg-superficie px-4 text-[14.5px] hover:border-texto-3 hover:bg-elevada">
          <FileText className="size-4" aria-hidden />Relatório do mês
        </a>
        <div role="group" aria-label="Período" className="flex rounded-[5px] border border-linha-forte p-1">
          {PERIODOS.map((p) => (
            <button key={p} aria-pressed={dias === p} onClick={() => setDias(p)}
              className={`h-8 rounded-md px-3 text-[13px] ${dias === p ? 'bg-caneta-fundo text-caneta font-semibold' : 'text-texto-2 hover:text-texto'}`}>
              {p} dias
            </button>
          ))}
        </div>
        </div>
      </header>

      {erro && <Aviso>{erro}</Aviso>}
      {!dados && !erro && <div className="flex flex-col gap-6" aria-busy="true"><Esqueleto className="h-16" /><Esqueleto className="h-72" /></div>}

      {dados && dados.total === 0 && (
        <Vazio icone={BarChart3} titulo={`Nenhuma triagem nos últimos ${dados.periodo_dias} dias`}>
          Os números aparecem quando as primeiras triagens reais chegarem pelo WhatsApp ou pelo balcão.
        </Vazio>
      )}

      {dados && dados.total > 0 && (
        <div className="flex flex-col gap-10">
          <p className="max-w-[64ch] text-[19px] leading-relaxed text-texto-2">
            Em {dados.periodo_dias} dias chegaram <strong className="text-texto tabular">{dados.total}</strong> triagens.{' '}
            <strong className="text-texto tabular">{dados.abertas}</strong> ainda aguardam atendimento.{' '}
            <span className={dados.urgentes > 0 ? 'text-urgente' : ''}>
              {dados.urgentes > 0 && <ShieldAlert className="mr-1 inline size-[18px] align-[-3px]" aria-hidden />}
              <strong className="tabular">{dados.urgentes}</strong> tiveram sinal de violência.
            </span>
            {dados.horas_ate_primeiro_atendimento !== null && (
              <>
                {' '}O primeiro atendimento levou, em média,{' '}
                <strong className="text-texto">
                  {dados.horas_ate_primeiro_atendimento < 1 ? 'menos de 1 hora' : `${dados.horas_ate_primeiro_atendimento.toLocaleString('pt-BR')} h`}
                </strong>.
              </>
            )}
          </p>

          <PorDia pontos={dados.por_dia} />

          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
            <section aria-labelledby="t-categoria">
              <h2 id="t-categoria" className="titulo text-[22px] leading-[1.05] mb-4">Por necessidade</h2>
              <Barras itens={Object.entries(dados.por_categoria).map(([k, v]) => ({ chave: k, rotulo: nomeCategoria(k), valor: v }))} total={dados.total} porCategoria />
            </section>

            <div className="flex flex-col gap-8">
              <Lista titulo="Por situação" itens={ORDEM_ESTADOS.filter((s) => dados.por_status[s]).map((s) => [ESTADOS[s].rotulo, dados.por_status[s]])} />
              <Lista titulo="Por canal de entrada" itens={Object.entries(dados.por_canal).map(([k, v]) => [CANAIS[k] ?? k, v])} />
              {Object.keys(dados.por_bairro).length > 0 && <Lista titulo="Bairros com mais casos" itens={Object.entries(dados.por_bairro)} />}
            </div>
          </div>

          <Suspense fallback={<Esqueleto className="h-[420px]" />}><MapaDemanda dias={dias} /></Suspense>

          {dados.tempo_resposta.length > 0 && <TempoResposta linhas={dados.tempo_resposta} />}

          {dados.avaliacao.respostas > 0 && dados.avaliacao.media !== null && (
            <section aria-labelledby="t-nota" className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
              <div>
                <h2 id="t-nota" className="titulo mb-2 text-[22px] leading-[1.05]">Nota das pessoas atendidas</h2>
                <p className="max-w-[44ch] text-[15px] text-texto-2">
                  Média <strong className="titulo text-[28px] text-texto tabular">{dados.avaliacao.media.toLocaleString('pt-BR')}</strong> de 5,
                  em <strong className="text-texto tabular">{dados.avaliacao.respostas}</strong> resposta{dados.avaliacao.respostas > 1 ? 's' : ''}.
                  A pergunta vai pelo WhatsApp quando o caso é concluído.
                </p>
              </div>
              <Barras itens={['5', '4', '3', '2', '1'].map((n) => ({ chave: n, rotulo: `Nota ${n}${n === '5' ? ' (ajudou muito)' : n === '1' ? ' (não ajudou)' : ''}`, valor: dados.avaliacao.por_nota[n] ?? 0 }))}
                total={dados.avaliacao.respostas} />
            </section>
          )}

          <section aria-labelledby="t-acerto" className="rounded-[6px] border border-linha px-5 py-4">
            <h2 id="t-acerto" className="text-sm font-medium">Sugestão do sistema confirmada pelas pessoas</h2>
            {dados.acerto_do_sistema.confirmadas_pelo_cidadao === 0 ? (
              <p className="mt-1 text-sm text-texto-2">Ainda não há confirmações pelo WhatsApp no período.</p>
            ) : (
              <p className="mt-1 text-sm text-texto-2">
                Das <strong className="text-texto tabular">{dados.acerto_do_sistema.confirmadas_pelo_cidadao}</strong> pessoas que responderam “está certo?”,{' '}
                <strong className="text-texto tabular">{dados.acerto_do_sistema.sugestao_aceita}</strong> aceitaram a categoria sugerida
                ({Math.round((100 * dados.acerto_do_sistema.sugestao_aceita) / dados.acerto_do_sistema.confirmadas_pelo_cidadao)}%). As correções viram exemplos para treinar o modelo.
              </p>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function TempoResposta({ linhas }: { linhas: TempoCras[] }) {
  const celula = (g: GrupoTempo, urgente: boolean) => (
    <td className="px-3 py-2.5 align-top">
      {g.casos === 0 ? <span className="text-texto-3">sem casos</span> : g.mediana_min === null ? (
        <span className={urgente ? 'font-semibold text-urgente' : 'text-texto-2'}>{g.casos} sem resposta ainda</span>
      ) : (
        <>
          <span className={`font-semibold tabular ${urgente ? 'text-urgente' : 'text-texto'}`}>{duracao(g.mediana_min)}</span>
          <span className="block text-[12.5px] text-texto-3 tabular">{g.atendidos} de {g.casos} respondidos</span>
        </>
      )}
    </td>
  );
  return (
    <section aria-labelledby="t-tempo">
      <h2 id="t-tempo" className="titulo mb-1.5 text-[22px] leading-[1.05]">Tempo até a primeira resposta</h2>
      <p className="mb-4 max-w-[70ch] text-[14px] text-texto-2">
        Quanto tempo a equipe leva, desde a chegada do caso, para assumir ou marcar “Em atendimento”. Mediana: metade dos casos foi respondida mais rápido que isso.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-[14.5px]">
          <thead>
            <tr className="border-b-2 border-texto text-[13px] text-texto-2">
              <th scope="col" className="px-3 py-2 font-semibold">Unidade</th>
              <th scope="col" className="px-3 py-2 font-semibold"><ShieldAlert className="mr-1 inline size-3.5 align-[-2px] text-urgente" aria-hidden />Violência</th>
              <th scope="col" className="px-3 py-2 font-semibold">Demais casos</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.unidade_id ?? 'sem'} className="border-b border-linha">
                <th scope="row" className="px-3 py-2.5 align-top font-semibold">{l.nome}</th>
                {celula(l.urgentes, true)}
                {celula(l.demais, false)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Barras({ itens, total, porCategoria = false }: { itens: { chave: string; rotulo: string; valor: number }[]; total: number; porCategoria?: boolean }) {
  const maximo = Math.max(...itens.map((i) => i.valor), 1);
  return (
    <ul className="flex flex-col gap-3">
      {itens.map((i) => (
        <li key={i.chave} className="grid grid-cols-[minmax(8rem,13rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="flex items-center gap-1.5 truncate text-texto-2">
            {i.chave === 'violencia_protecao' && <ShieldAlert className="size-4 shrink-0 text-urgente" aria-hidden />}
            {i.rotulo}
          </span>
          <span className="h-3 rounded-r-[4px] bg-transparent" aria-hidden>
            <span className="block h-full rounded-r-[4px]" style={{ width: `${(100 * i.valor) / maximo}%`, background: porCategoria ? corCategoria(i.chave) : COR_SERIE, minWidth: 4 }} />
          </span>
          <span className="tabular text-texto w-16 text-right">
            {i.valor} <span className="text-texto-3 text-xs">{Math.round((100 * i.valor) / total)}%</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function PorDia({ pontos }: { pontos: { dia: string; total: number }[] }) {
  const [tabela, setTabela] = useState(false);
  const [foco, setFoco] = useState<number | null>(null);
  const maximo = Math.max(...pontos.map((p) => p.total), 1);
  const marcas = [0, Math.floor((pontos.length - 1) / 2), pontos.length - 1];

  return (
    <section aria-labelledby="t-dia">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 id="t-dia" className="titulo text-[22px] leading-[1.05] flex items-baseline gap-3">
          Triagens por dia
          {!tabela && <span className="font-sans text-xs tracking-normal text-texto-3 tabular">máximo {maximo} por dia</span>}
        </h2>
        <button onClick={() => setTabela((t) => !t)} className="inline-flex items-center gap-1.5 text-[13px] text-texto-2 hover:text-texto">
          {tabela ? <BarChart3 className="size-4" aria-hidden /> : <Table2 className="size-4" aria-hidden />}
          {tabela ? 'Ver gráfico' : 'Ver como tabela'}
        </button>
      </div>

      {tabela ? (
        <div className="max-h-72 overflow-y-auto rounded-[6px] border border-linha">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-superficie text-left text-texto-2"><tr><th className="px-4 py-2 font-medium">Dia</th><th className="px-4 py-2 font-medium text-right">Triagens</th></tr></thead>
            <tbody>
              {[...pontos].reverse().map((p) => (
                <tr key={p.dia} className="border-t border-linha"><td className="px-4 py-1.5 tabular">{diaCurto(p.dia)}</td><td className="px-4 py-1.5 text-right tabular">{p.total}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <div className="flex h-48 items-end gap-[2px] border-b border-linha-forte" role="img" aria-label={`Triagens por dia; máximo de ${maximo} em um dia. Use "Ver como tabela" para os valores.`}>
            {pontos.map((p, i) => (
              <button
                key={p.dia}
                onMouseEnter={() => setFoco(i)}
                onMouseLeave={() => setFoco(null)}
                onFocus={() => setFoco(i)}
                onBlur={() => setFoco(null)}
                aria-label={`${diaCurto(p.dia)}: ${p.total} triagens`}
                className="group relative flex h-full flex-1 items-end focus-visible:outline-offset-0"
              >
                <span
                  className="block w-full rounded-t-[4px] transition-colors duration-150"
                  style={{ height: p.total ? `${(100 * p.total) / maximo}%` : 2, background: !p.total ? 'var(--color-linha-forte)' : foco === i ? COR_FOCO : COR_SERIE }}
                />
              </button>
            ))}
          </div>
          {foco !== null && (
            <div
              role="tooltip"
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-[5px] border border-linha-forte bg-elevada px-3 py-1.5 text-xs shadow-[0_8px_20px_-12px_rgb(27_39_51/0.45)]"
              style={{ left: `${((foco + 0.5) / pontos.length) * 100}%` }}
            >
              <span className="text-texto-2">{diaCurto(pontos[foco].dia)}:</span> <strong className="tabular">{pontos[foco].total}</strong> triagens
            </div>
          )}
          <div className="mt-2 flex justify-between text-xs text-texto-3 tabular" aria-hidden>
            {marcas.map((i) => <span key={i}>{diaCurto(pontos[i].dia)}</span>)}
          </div>
        </div>
      )}
    </section>
  );
}

function Lista({ titulo, itens }: { titulo: string; itens: [string, number][] }) {
  return (
    <section>
      <h2 className="text-sm font-medium mb-2">{titulo}</h2>
      <ul className="divide-y divide-linha rounded-[6px] border border-linha">
        {itens.map(([rotulo, valor]) => (
          <li key={rotulo} className="flex items-center justify-between px-4 py-2 text-sm">
            <span className="text-texto-2">{rotulo}</span>
            <span className="tabular">{valor}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
