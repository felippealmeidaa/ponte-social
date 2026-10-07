import { useCallback, useState } from 'react';
import { 
  Activity, 
  BarChart3, 
  Clock, 
  ShieldAlert, 
  Users 
} from 'lucide-react';
import { api } from '../api';
import { Aviso, Esqueleto, Vazio } from '../components/ui';
import { useAtualizacao } from '../useAtualizacao';
import { CANAIS, corCategoria, ESTADOS, nomeCategoria, ORDEM_ESTADOS } from '../vocabulario';

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

function duracao(min: number) {
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)}h ${min % 60 ? `${min % 60}m` : ''}`;
  const d = Math.round(min / 1440);
  return `${d} dia${d > 1 ? 's' : ''}`;
}

const PERIODOS = [7, 30, 90];
const diaCurto = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

export function Indicadores() {
  const [dias, setDias] = useState(30);
  const { dados, erro } = useAtualizacao(useCallback(() => api<Resumo>(`/triagem/indicadores/resumo?dias=${dias}`), [dias]), 30000);

  return (
    <>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-linha pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="titulo text-[26px] md:text-[30px] text-texto">
              Métricas & Indicadores de Atendimento
            </h1>
            <span className="mono text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-marca-fundo border border-marca/20 text-marca">
              {dias} dias
            </span>
          </div>
          <p className="mt-2 max-w-[75ch] text-[14.5px] text-texto-2 leading-relaxed">
            Painel consolidado da rede socioassistencial de Anápolis-GO. Análise de volume de triagens, tempo de resposta e resolutividade.
          </p>
        </div>

        <div role="group" aria-label="Período" className="flex rounded-xl border border-linha bg-elevada p-1">
          {PERIODOS.map((p) => (
            <button 
              key={p} 
              aria-pressed={dias === p} 
              onClick={() => setDias(p)}
              className={`h-8 rounded-lg px-3.5 text-[13px] font-medium transition-all duration-150 cursor-pointer ${
                dias === p 
                  ? 'bg-superficie border border-linha-forte text-texto font-bold shadow-xs' 
                  : 'text-texto-2 hover:text-texto'
              }`}
            >
              {p} dias
            </button>
          ))}
        </div>
      </header>

      {erro && <Aviso>{erro}</Aviso>}
      {!dados && !erro && (
        <div className="flex flex-col gap-6" aria-busy="true">
          <div className="grid gap-4 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Esqueleto key={i} className="h-28" />)}
          </div>
          <Esqueleto className="h-72" />
        </div>
      )}

      {dados && dados.total === 0 && (
        <Vazio icone={BarChart3} titulo={`Nenhuma triagem nos últimos ${dados.periodo_dias} dias`}>
          Os gráficos e KPIs serão exibidos automaticamente conforme os atendimentos reais ocorrerem na rede.
        </Vazio>
      )}

      {dados && dados.total > 0 && (
        <div className="flex flex-col gap-8">
          
          {/* Bento Grid de KPIs Principais */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-linha glass-card p-5">
              <div className="flex items-center justify-between text-texto-2 mb-2">
                <span className="text-[12px] font-semibold uppercase tracking-wider">Total de Triagens</span>
                <Users className="size-4 text-marca" />
              </div>
              <p className="mono titulo text-[30px] text-texto">{dados.total}</p>
              <p className="text-[12px] text-texto-3 mt-1">Registradas em {dados.periodo_dias} dias</p>
            </div>

            <div className="rounded-2xl border border-linha glass-card p-5">
              <div className="flex items-center justify-between text-texto-2 mb-2">
                <span className="text-[12px] font-semibold uppercase tracking-wider">Aguardando Ação</span>
                <Clock className="size-4 text-amber-600 dark:text-amber-400" />
              </div>
              <p className="mono titulo text-[30px] text-amber-600 dark:text-amber-400">{dados.abertas}</p>
              <p className="text-[12px] text-texto-3 mt-1">Triagens pendentes na fila</p>
            </div>

            <div className="rounded-2xl border border-rose-500/25 bg-superficie p-5 shadow-xs">
              <div className="flex items-center justify-between text-texto-2 mb-2">
                <span className="text-[12px] font-semibold uppercase tracking-wider">Casos de Violência</span>
                <ShieldAlert className="size-4 text-rose-600 dark:text-rose-400" />
              </div>
              <p className="mono titulo text-[30px] text-rose-600 dark:text-rose-400">{dados.urgentes}</p>
              <p className="text-[12px] text-texto-3 mt-1">Encaminhados com urgência (CREAS)</p>
            </div>

            <div className="rounded-2xl border border-linha glass-card p-5">
              <div className="flex items-center justify-between text-texto-2 mb-2">
                <span className="text-[12px] font-semibold uppercase tracking-wider">Primeiro Contato</span>
                <Activity className="size-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="mono titulo text-[30px] text-emerald-700 dark:text-emerald-300">
                {dados.horas_ate_primeiro_atendimento !== null 
                  ? `${dados.horas_ate_primeiro_atendimento.toLocaleString('pt-BR')}h` 
                  : '–'}
              </p>
              <p className="text-[12px] text-texto-3 mt-1">Tempo médio de resposta</p>
            </div>
          </div>

          {/* Gráfico Temporal de Triagens por Dia */}
          <PorDia pontos={dados.por_dia} />

          {/* Categorias e Situações */}
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <section aria-labelledby="t-categoria" className="rounded-2xl border border-linha glass-card p-6">
              <h2 id="t-categoria" className="titulo text-[19px] text-texto mb-5 flex items-center gap-2">
                <BarChart3 className="size-5 text-marca" /> Demanda por Categoria de Necessidade
              </h2>
              <Barras 
                itens={Object.entries(dados.por_categoria).map(([k, v]) => ({ chave: k, rotulo: nomeCategoria(k), valor: v }))} 
                total={dados.total} 
                porCategoria 
              />
            </section>

            <div className="flex flex-col gap-6">
              <div className="rounded-2xl border border-linha glass-card p-6">
                <Lista 
                  titulo="Situação Atual dos Casos" 
                  itens={ORDEM_ESTADOS.filter((s) => dados.por_status[s]).map((s) => [ESTADOS[s].rotulo, dados.por_status[s]])} 
                />
              </div>

              <div className="rounded-2xl border border-linha glass-card p-6">
                <Lista 
                  titulo="Canais de Entrada" 
                  itens={Object.entries(dados.por_canal).map(([k, v]) => [CANAIS[k] ?? k, v])} 
                />
              </div>
            </div>
          </div>

          {/* Avaliações e Tempo por Unidade */}
          {dados.tempo_resposta.length > 0 && (
            <section className="rounded-2xl border border-linha glass-card p-6">
              <h2 className="titulo text-[19px] text-texto mb-4 flex items-center gap-2">
                <Clock className="size-5 text-marca" /> Tempo de Resposta por Unidade do CRAS
              </h2>
              <div className="overflow-x-auto rounded-xl border border-linha bg-superficie">
                <table className="w-full min-w-[600px] text-sm">
                  <thead className="bg-elevada text-left text-texto-2 border-b border-linha">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Unidade</th>
                      <th className="px-4 py-3 text-right font-semibold text-rose-600 dark:text-rose-400">Urgentes (Mediana)</th>
                      <th className="px-4 py-3 text-right font-semibold">Demais Casos (Mediana)</th>
                      <th className="px-4 py-3 text-right font-semibold">Atendidos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-linha">
                    {dados.tempo_resposta.map((u) => (
                      <tr key={u.nome} className="hover:bg-elevada/50">
                        <td className="px-4 py-3 font-medium text-texto">{u.nome}</td>
                        <td className="mono px-4 py-3 text-right font-bold text-rose-600 dark:text-rose-300">
                          {u.urgentes.mediana_min !== null ? duracao(u.urgentes.mediana_min) : '–'}
                        </td>
                        <td className="mono px-4 py-3 text-right text-texto">
                          {u.demais.mediana_min !== null ? duracao(u.demais.mediana_min) : '–'}
                        </td>
                        <td className="mono px-4 py-3 text-right text-texto-2">{u.urgentes.atendidos + u.demais.atendidos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

        </div>
      )}
    </>
  );
}

function PorDia({ pontos }: { pontos: { dia: string; total: number }[] }) {
  if (pontos.length === 0) return null;
  const max = Math.max(1, ...pontos.map((p) => p.total));
  return (
    <section className="rounded-2xl border border-linha glass-card p-6">
      <h2 className="titulo text-[18px] text-texto mb-4">Fluxo Diário de Atendimentos</h2>
      <div className="flex h-36 items-end gap-2 pt-6">
        {pontos.map((p) => {
          const h = (p.total / max) * 100;
          return (
            <div key={p.dia} className="group relative flex flex-1 flex-col items-center h-full justify-end">
              <div 
                style={{ height: `${Math.max(6, h)}%` }} 
                className="w-full rounded-t-lg bg-sky-600 dark:bg-sky-500 transition-all duration-200 group-hover:brightness-110"
              />
              <span className="mono text-[10px] text-texto-3 mt-2 truncate max-w-full">{diaCurto(p.dia)}</span>
              
              <div className="absolute -top-7 hidden group-hover:flex items-center rounded-md bg-superficie border border-linha px-2 py-0.5 text-[11px] font-bold text-texto shadow-lg z-10">
                {p.total} casos
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Barras({ itens, total, porCategoria }: { itens: { chave: string; rotulo: string; valor: number }[]; total: number; porCategoria?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {itens.map((i) => {
        const pct = (i.valor / total) * 100;
        const cor = porCategoria ? corCategoria(i.chave) : '#0284c7';
        return (
          <div key={i.rotulo} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-medium text-texto">{i.rotulo}</span>
              <span className="mono text-texto-2 font-semibold">{i.valor} ({pct.toFixed(0)}%)</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-elevada overflow-hidden border border-linha/40">
              <div 
                style={{ width: `${pct}%`, backgroundColor: cor }} 
                className="h-full rounded-full transition-all duration-300"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Lista({ titulo, itens }: { titulo: string; itens: [string, number][] }) {
  return (
    <div>
      <h3 className="titulo text-[16px] text-texto mb-3">{titulo}</h3>
      <ul className="flex flex-col gap-2">
        {itens.map(([rotulo, valor]) => (
          <li key={rotulo} className="flex items-center justify-between text-[13.5px] border-b border-linha pb-1.5">
            <span className="text-texto-2">{rotulo}</span>
            <span className="mono font-bold text-texto">{valor}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
