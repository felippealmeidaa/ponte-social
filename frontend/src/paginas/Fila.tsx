import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { 
  CalendarClock,
  ChevronRight, 
  ClipboardPlus, 
  Clock, 
  Inbox, 
  Languages, 
  MapPin, 
  Paperclip, 
  Radio, 
  Search, 
  ShieldAlert, 
  UserRoundCheck, 
  X 
} from 'lucide-react';
import { sessaoSalva } from '../api';
import { FichaCaso } from '../components/FichaCaso';
import { RegistrarAtendimento } from '../components/RegistrarAtendimento';
import { Aviso, Botao, Esqueleto, Selo, TituloFileira, Vazio } from '../components/ui';
import { irPara } from '../navegacao';
import type { Triagem } from '../tipos';
import type { useAtualizacao } from '../useAtualizacao';
import { CANAIS, corCategoria, ESTADOS, ICONE_CATEGORIA, nomeCategoria, tempoDesde } from '../vocabulario';

const ABERTOS = new Set(['PENDENTE', 'URGENTE_CREAS']);
const EM_CURSO = new Set(['EM_ATENDIMENTO', 'ENCAMINHADO_CREAS']);
const CHAVE_VISTOS = 'cras_casos_vistos';

function lerVistos(): Set<string> | null {
  try {
    const bruto = localStorage.getItem(CHAVE_VISTOS);
    return bruto ? new Set(JSON.parse(bruto) as string[]) : null;
  } catch {
    return null;
  }
}

function gravarVistos(vistos: Set<string>) {
  try {
    localStorage.setItem(CHAVE_VISTOS, JSON.stringify([...vistos].slice(-500)));
  } catch {
    /* sem armazenamento */
  }
}

interface Fileira {
  id: string;
  titulo: string;
  casos: Triagem[];
  vazio: string;
  recolhido?: boolean;
}

export function Fila({ fila, filtroEstado }: { fila: ReturnType<typeof useAtualizacao<Triagem[]>>; filtroEstado?: string }) {
  const [busca, setBusca] = useState('');
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [registrando, setRegistrando] = useState(false);
  const [vistos, setVistos] = useState<Set<string> | null>(lerVistos);
  const [meus, setMeus] = useState(false);
  const eu = sessaoSalva()?.id ?? null;

  const triagens = useMemo(() => fila.dados ?? [], [fila.dados]);

  if (vistos === null && fila.dados) {
    const iniciais = new Set(fila.dados.map((t) => t.id));
    gravarVistos(iniciais);
    setVistos(iniciais);
  }

  const marcarVisto = useCallback((id: string) => {
    setVistos((atual) => {
      const novo = new Set(atual ?? []);
      novo.add(id);
      gravarVistos(novo);
      return novo;
    });
  }, []);

  const abrir = (id: string) => {
    marcarVisto(id);
    setAbertoId(id);
  };

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return triagens.filter((t) =>
      (!filtroEstado || t.status === filtroEstado) &&
      (!meus || (eu !== null && t.responsavel === eu)) &&
      (!termo || [t.relato_original, t.relato_traducao ?? '', t.bairro, nomeCategoria(t.categoria), t.telefone_mascarado]
        .some((c) => c.toLowerCase().includes(termo))),
    );
  }, [triagens, busca, filtroEstado, meus, eu]);
  
  const quantosMeus = eu ? triagens.filter((t) => t.responsavel === eu && t.status !== 'CONCLUIDO' && t.status !== 'ARQUIVADO').length : 0;

  const fileiras: Fileira[] = useMemo(() => {
    const porEspera = (a: Triagem, b: Triagem) => a.criado_em.localeCompare(b.criado_em);
    const abertas = filtradas.filter((t) => ABERTOS.has(t.status));
    return [
      { id: 'urgente', titulo: 'Protocolo de Emergência (CREAS / Violência)', casos: abertas.filter((t) => t.prioridade === 'URGENTE_VIOLENCIA').sort(porEspera), vazio: 'Nenhum caso de violência aguardando.' },
      { id: 'alta', titulo: 'Prioridade Alta (Vulnerabilidade Severa)', casos: abertas.filter((t) => t.prioridade === 'ALTA').sort(porEspera), vazio: 'Nenhum caso de prioridade alta aguardando.' },
      { id: 'media', titulo: 'Demanda Padrão (Média e Baixa)', casos: abertas.filter((t) => t.prioridade === 'MEDIA' || t.prioridade === 'BAIXA').sort(porEspera), vazio: 'Nenhuma triagem nesta faixa.' },
      { id: 'curso', titulo: 'Em Atendimento Humano', casos: filtradas.filter((t) => EM_CURSO.has(t.status)), vazio: 'Ninguém em atendimento ativo no momento.' },
      { id: 'fechados', titulo: 'Concluídos e Arquivados', casos: filtradas.filter((t) => t.status === 'CONCLUIDO' || t.status === 'ARQUIVADO'), vazio: 'Nenhum caso finalizado ainda.', recolhido: !filtroEstado },
    ].filter((f) => !filtroEstado || f.casos.length > 0);
  }, [filtradas, filtroEstado]);

  const casoAberto = triagens.find((t) => t.id === abertoId) ?? null;
  const novo = (t: Triagem) => vistos !== null && !vistos.has(t.id);
  const aoAlterar = (t: Triagem) => fila.setDados((atual) => (atual ?? []).map((x) => (x.id === t.id ? t : x)));

  return (
    <>
      {/* Header da Página com Ações e Busca */}
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-linha pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="titulo text-[26px] md:text-[30px] text-texto">
              Fila de Triagem Social
            </h1>
            <span className="mono text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-marca-fundo border border-marca/20 text-marca">
              {filtradas.length} total
            </span>
          </div>
          <p className="mt-2 max-w-[65ch] text-[14.5px] text-texto-2 leading-relaxed">
            Painel de acolhimento e inteligência social. Triagens classificadas por modelos supervisionados de IA e regras de proteção integral.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-texto-3" aria-hidden />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar relato, bairro, nome..."
              className="h-10 w-72 max-w-full rounded-xl border border-linha bg-superficie pl-10 pr-4 text-[14px] text-texto placeholder:text-texto-3 transition-all hover:border-linha-forte focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/20"
            />
          </div>

          <button
            type="button"
            aria-pressed={meus}
            onClick={() => setMeus((m) => !m)}
            className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-[13.5px] font-medium transition-all duration-150 cursor-pointer ${
              meus
                ? 'border-marca bg-marca-fundo text-marca font-semibold'
                : 'border-linha bg-superficie text-texto-2 hover:text-texto hover:bg-elevada'
            }`}
          >
            <UserRoundCheck className="size-4" aria-hidden />
            Meus Casos
            {quantosMeus > 0 && (
              <span className="mono rounded-full bg-sky-600 px-2 py-0.2 text-[11px] font-bold text-white tabular">
                {quantosMeus}
              </span>
            )}
          </button>

          <Botao variante="primario" icone={ClipboardPlus} onClick={() => setRegistrando(true)}>
            Novo Atendimento
          </Botao>
        </div>
      </header>

      {meus && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-sky-500/30 bg-superficie px-4 py-2.5 text-sm text-texto shadow-xs">
          <span>Filtrando apenas os casos atribuídos à sua conta.</span>
          <Botao tamanho="sm" variante="fantasma" icone={X} onClick={() => setMeus(false)}>Limpar filtro</Botao>
        </div>
      )}

      {filtroEstado && ESTADOS[filtroEstado] && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-linha bg-elevada px-4 py-2.5 text-sm text-texto">
          <span className="flex items-center gap-2">
            Status filtrado: <Selo tom={ESTADOS[filtroEstado].tom}>{ESTADOS[filtroEstado].rotulo}</Selo>
          </span>
          <Botao tamanho="sm" variante="fantasma" icone={X} onClick={() => irPara('fila')}>Mostrar todos</Botao>
        </div>
      )}

      {fila.erro && <div className="mb-6"><Aviso>{fila.erro}</Aviso></div>}

      {!fila.dados && !fila.erro && (
        <div className="flex flex-col gap-8" aria-busy="true" aria-label="Carregando fila">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-4">
              <Esqueleto className="h-8 w-64" />
              <div className="grid gap-4 md:grid-cols-2">
                {[0, 1].map((j) => <Esqueleto key={j} className="h-44 w-full" />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {fila.dados && (
        <div className="flex flex-col gap-10">
          {fileiras.map((f) => (
            <GrupoGuias key={f.id} fileira={f} novo={novo} onAbrir={abrir} />
          ))}
          {fila.dados.length === 0 && (
            <Vazio icone={Inbox} titulo="A fila está vazia">
              Quando alguém relatar uma necessidade pelo WhatsApp ou canal oficial, a triagem será classificada e exibida aqui.
            </Vazio>
          )}
        </div>
      )}

      <FichaCaso key={casoAberto?.id ?? 'nenhum'} caso={casoAberto} onFechar={() => setAbertoId(null)} onAlterado={aoAlterar} />
      <RegistrarAtendimento
        aberto={registrando}
        onFechar={() => setRegistrando(false)}
        onRegistrado={(id) => { marcarVisto(id); fila.recarregar(); }}
      />
    </>
  );
}

function numeroGuia(id: string) {
  const hex = id.replace(/^trg-/, '').slice(0, 6);
  const n = parseInt(hex, 16);
  return Number.isNaN(n) ? id.slice(-4) : String(n % 10000).padStart(4, '0');
}

function GrupoGuias({ fileira, novo, onAbrir }: { fileira: Fileira; novo: (t: Triagem) => boolean; onAbrir: (id: string) => void }) {
  const lista = useRef<HTMLOListElement>(null);
  const tituloId = `grupo-${fileira.id}`;
  const urgente = fileira.id === 'urgente';

  const aoTeclar = (e: KeyboardEvent<HTMLOListElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const botoes = Array.from(lista.current?.querySelectorAll<HTMLButtonElement>('button[data-caso]') ?? []);
    const i = botoes.indexOf(document.activeElement as HTMLButtonElement);
    const proximo = botoes[i + (e.key === 'ArrowDown' ? 1 : -1)];
    if (proximo) {
      e.preventDefault();
      proximo.focus();
    }
  };

  const conteudo = fileira.casos.length === 0 ? (
    <p className="text-[14px] text-texto-3 italic py-2">{fileira.vazio}</p>
  ) : (
    <ol ref={lista} onKeyDown={aoTeclar} className={`grid gap-4 ${urgente ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
      {fileira.casos.map((t, i) => (
        <li key={t.id}><Guia caso={t} novo={novo(t)} grande={urgente && i === 0} onAbrir={() => onAbrir(t.id)} /></li>
      ))}
    </ol>
  );

  if (fileira.recolhido) {
    return (
      <details className="group rounded-2xl border border-linha bg-superficie p-4">
        <summary className="cursor-pointer list-none flex items-center justify-between text-texto-2 hover:text-texto">
          <div className="flex items-center gap-3">
            <span className="titulo text-[16.5px] text-texto">{fileira.titulo}</span>
            <span className="mono text-[11px] font-semibold bg-elevada px-2 py-0.5 rounded-full">{fileira.casos.length}</span>
          </div>
          <span className="text-[13px] text-marca underline font-medium">Expandir</span>
        </summary>
        <div className="mt-4 pt-4 border-t border-linha">{conteudo}</div>
      </details>
    );
  }

  return (
    <section aria-labelledby={tituloId} className="flex flex-col gap-4">
      <div className={`flex items-center justify-between border-b pb-3 ${urgente && fileira.casos.length ? 'border-rose-500/40' : 'border-linha'}`}>
        <div className="flex items-center gap-3">
          {urgente && fileira.casos.length > 0 && (
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
            </span>
          )}
          <TituloFileira id={tituloId} contagem={fileira.casos.length}>{fileira.titulo}</TituloFileira>
        </div>
      </div>
      {conteudo}
    </section>
  );
}

function Guia({ caso, novo, onAbrir }: { caso: Triagem; novo: boolean; grande?: boolean; onAbrir: () => void }) {
  const estado = ESTADOS[caso.status] ?? ESTADOS.PENDENTE;
  const urgente = caso.prioridade === 'URGENTE_VIOLENCIA';
  const espera = tempoDesde(caso.criado_em);
  const aberto = caso.status === 'PENDENTE' || caso.status === 'URGENTE_CREAS';
  const IconeCat = ICONE_CATEGORIA[caso.categoria] ?? ICONE_CATEGORIA.nao_identificado;

  return (
    <button
      data-caso
      onClick={onAbrir}
      aria-label={`Guia ${numeroGuia(caso.id)}: ${nomeCategoria(caso.categoria)}`}
      className={`group relative flex w-full text-left rounded-2xl border transition-all duration-150 cursor-pointer overflow-hidden ${
        urgente && aberto
          ? 'border-rose-500/40 bg-superficie shadow-xs hover:border-rose-500 hover:shadow-md ring-1 ring-rose-500/20'
          : 'border-linha bg-superficie hover:border-linha-forte hover:bg-elevada shadow-xs'
      }`}
    >
      {/* Barra de destaque lateral */}
      <div 
        className="w-1.5 shrink-0"
        style={{ backgroundColor: urgente ? '#e11d48' : corCategoria(caso.categoria) }}
      />

      <div className="flex flex-1 flex-col justify-between p-4.5 gap-3.5">
        {/* Cabeçalho do Card */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div 
              style={{ backgroundColor: `${corCategoria(caso.categoria)}18`, borderColor: `${corCategoria(caso.categoria)}40` }}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border"
            >
              <IconeCat className="size-4.5" style={{ color: corCategoria(caso.categoria) }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="mono text-[11px] font-bold text-texto-3">
                  #{numeroGuia(caso.id)}
                </span>
                <span className="titulo text-[16px] text-texto group-hover:text-marca transition-colors">
                  {nomeCategoria(caso.categoria)}
                </span>
              </div>
              <p className="flex items-center gap-1.5 text-[12px] text-texto-2 mt-0.5">
                <Clock className="size-3 text-texto-3" />
                {aberto ? `Espera há ${espera.replace('há ', '')}` : `Atendido ${espera}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {urgente && aberto ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 dark:text-rose-300">
                <ShieldAlert className="size-3 text-rose-600 dark:text-rose-400" />
                URGENTE
              </span>
            ) : novo ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/15 px-2.5 py-0.5 text-[11px] font-bold text-sky-700 dark:text-sky-300">
                NOVO
              </span>
            ) : null}

            {(caso.documentos_enviados ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-linha bg-elevada px-2 py-0.5 text-[11px] font-medium text-texto-2">
                <Paperclip className="size-3 text-marca" />
                {caso.documentos_enviados}
              </span>
            )}
          </div>
        </div>

        {/* Relato do Cidadão */}
        <p className="text-[13.5px] leading-relaxed text-texto-2 line-clamp-2 italic bg-elevada p-3 rounded-xl border border-linha/60">
          {caso.relato_traducao && (
            <span className="mr-1.5 not-italic inline-flex items-center gap-1 rounded-md bg-blue-500/15 border border-blue-500/20 px-1.5 py-0.2 text-[10.5px] font-semibold text-blue-700 dark:text-blue-300">
              <Languages className="size-3" /> Traduzido
            </span>
          )}
          “{caso.relato_traducao ?? caso.relato_original}”
        </p>

        {/* Rodapé do Card com Metadados */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-linha pt-3 text-[12.5px] text-texto-2">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1 font-medium text-texto">
              <MapPin className="size-3.5 text-marca" />
              {caso.bairro !== 'Não informado' ? caso.bairro : 'Bairro não inf.'}
            </span>
            <span className="flex items-center gap-1 text-texto-3">
              <Radio className="size-3" />
              {CANAIS[caso.canal] ?? caso.canal}
            </span>
            {caso.agendado_para && (
              <span className="flex items-center gap-1 font-semibold text-marca">
                <CalendarClock className="size-3.5 shrink-0" aria-hidden />
                {new Date(caso.agendado_para).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Selo tom={estado.tom}>{estado.rotulo}</Selo>
            <ChevronRight className="size-4 text-texto-3 group-hover:text-marca group-hover:translate-x-0.5 transition-all" />
          </div>
        </div>
      </div>
    </button>
  );
}
