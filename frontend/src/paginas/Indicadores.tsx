import { useCallback, useState } from 'react';
import { BarChart3, ShieldAlert, Table2 } from 'lucide-react';
import { api } from '../api';
import { Aviso, Esqueleto, Vazio } from '../components/ui';
import { useAtualizacao } from '../useAtualizacao';
import { CANAIS, ESTADOS, nomeCategoria, ORDEM_ESTADOS } from '../vocabulario';

// Série única: uma cor só, validada contra a superfície escura (faixa de luminosidade e contraste ≥ 3:1)
const COR_SERIE = '#5f8ff0';

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
}

const PERIODOS = [7, 30, 90];
const diaCurto = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

export function Indicadores() {
  const [dias, setDias] = useState(30);
  const { dados, erro } = useAtualizacao(useCallback(() => api<Resumo>(`/triagem/indicadores/resumo?dias=${dias}`), [dias]), 30000);

  return (
    <>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[44px] leading-[0.95] tracking-[0.03em]">Indicadores</h1>
          <p className="mt-2 max-w-[75ch] text-texto-2">O que chegou à fila no período. Os exemplos de demonstração não entram na conta.</p>
        </div>
        <div role="group" aria-label="Período" className="flex rounded-lg border border-linha-forte p-1">
          {PERIODOS.map((p) => (
            <button key={p} aria-pressed={dias === p} onClick={() => setDias(p)}
              className={`h-8 rounded-md px-3 text-[13px] ${dias === p ? 'bg-ambar-escuro text-ambar font-semibold' : 'text-texto-2 hover:text-texto'}`}>
              {p} dias
            </button>
          ))}
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
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-linha bg-linha sm:grid-cols-4">
            <Numero rotulo="Triagens no período" valor={dados.total} />
            <Numero rotulo="Aguardando atendimento" valor={dados.abertas} />
            <Numero rotulo="Com sinal de violência" valor={dados.urgentes} urgente={dados.urgentes > 0} />
            <Numero rotulo="Até o primeiro atendimento" valor={dados.horas_ate_primeiro_atendimento === null ? '—' : dados.horas_ate_primeiro_atendimento < 1 ? 'menos de 1 h' : `${dados.horas_ate_primeiro_atendimento.toLocaleString('pt-BR')} h`} />
          </dl>

          <PorDia pontos={dados.por_dia} />

          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
            <section aria-labelledby="t-categoria">
              <h2 id="t-categoria" className="font-display text-[28px] leading-none tracking-[0.04em] mb-4">Por necessidade</h2>
              <Barras itens={Object.entries(dados.por_categoria).map(([k, v]) => ({ chave: k, rotulo: nomeCategoria(k), valor: v }))} total={dados.total} />
            </section>

            <div className="flex flex-col gap-8">
              <Lista titulo="Por situação" itens={ORDEM_ESTADOS.filter((s) => dados.por_status[s]).map((s) => [ESTADOS[s].rotulo, dados.por_status[s]])} />
              <Lista titulo="Por canal de entrada" itens={Object.entries(dados.por_canal).map(([k, v]) => [CANAIS[k] ?? k, v])} />
              {Object.keys(dados.por_bairro).length > 0 && <Lista titulo="Bairros com mais casos" itens={Object.entries(dados.por_bairro)} />}
            </div>
          </div>

          <section aria-labelledby="t-acerto" className="rounded-xl border border-linha px-5 py-4">
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

function Numero({ rotulo, valor, urgente }: { rotulo: string; valor: number | string; urgente?: boolean }) {
  return (
    <div className="bg-superficie px-5 py-4">
      <dt className="flex items-center gap-1.5 text-[13px] text-texto-2">
        {urgente && <ShieldAlert className="size-4 text-urgente" aria-hidden />}
        {rotulo}
      </dt>
      <dd className={`mt-1 text-[28px] font-semibold tabular leading-none ${urgente ? 'text-urgente' : 'text-texto'}`}>{valor}</dd>
    </div>
  );
}

function Barras({ itens, total }: { itens: { chave: string; rotulo: string; valor: number }[]; total: number }) {
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
            <span className="block h-full rounded-r-[4px]" style={{ width: `${(100 * i.valor) / maximo}%`, background: COR_SERIE, minWidth: 4 }} />
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
        <h2 id="t-dia" className="font-display text-[28px] leading-none tracking-[0.04em] flex items-baseline gap-3">
          Triagens por dia
          {!tabela && <span className="font-sans text-xs tracking-normal text-texto-3 tabular">máximo {maximo} por dia</span>}
        </h2>
        <button onClick={() => setTabela((t) => !t)} className="inline-flex items-center gap-1.5 text-[13px] text-texto-2 hover:text-texto">
          {tabela ? <BarChart3 className="size-4" aria-hidden /> : <Table2 className="size-4" aria-hidden />}
          {tabela ? 'Ver gráfico' : 'Ver como tabela'}
        </button>
      </div>

      {tabela ? (
        <div className="max-h-72 overflow-y-auto rounded-xl border border-linha">
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
                  className={`block w-full rounded-t-[4px] transition-opacity duration-150 ${foco !== null && foco !== i ? 'opacity-50' : ''}`}
                  style={{ height: p.total ? `${(100 * p.total) / maximo}%` : 2, background: p.total ? COR_SERIE : 'var(--color-linha-forte)' }}
                />
              </button>
            ))}
          </div>
          {foco !== null && (
            <div
              role="tooltip"
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-linha-forte bg-elevada px-3 py-1.5 text-xs shadow-[0_8px_24px_-12px_rgb(0_0_0/0.8)]"
              style={{ left: `${((foco + 0.5) / pontos.length) * 100}%` }}
            >
              <span className="text-texto-2">{diaCurto(pontos[foco].dia)}</span> · <strong className="tabular">{pontos[foco].total}</strong> triagens
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
      <ul className="divide-y divide-linha rounded-xl border border-linha">
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
