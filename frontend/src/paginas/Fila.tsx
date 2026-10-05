import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, ClipboardPlus, Inbox, Search, ShieldAlert, X } from 'lucide-react';
import { FichaCaso } from '../components/FichaCaso';
import { RegistrarAtendimento } from '../components/RegistrarAtendimento';
import { Aviso, Botao, Esqueleto, Selo, TituloFileira, Vazio } from '../components/ui';
import { irPara } from '../navegacao';
import type { Triagem } from '../tipos';
import type { useAtualizacao } from '../useAtualizacao';
import { CANAIS, ESTADOS, nomeCategoria, PRIORIDADES, tempoDesde } from '../vocabulario';

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
    /* sem armazenamento: o destaque de caso novo vale só nesta sessão */
  }
}

interface Fileira {
  id: string;
  titulo: string;
  casos: Triagem[];
  vazio: string;
}

export function Fila({ fila, filtroEstado }: { fila: ReturnType<typeof useAtualizacao<Triagem[]>>; filtroEstado?: string }) {
  const [busca, setBusca] = useState('');
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [registrando, setRegistrando] = useState(false);
  const [vistos, setVistos] = useState<Set<string> | null>(lerVistos);

  const triagens = useMemo(() => fila.dados ?? [], [fila.dados]);

  // Primeiro uso neste computador: o que já está na fila não conta como novo
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
      (!termo || [t.relato_original, t.bairro, nomeCategoria(t.categoria), t.telefone_mascarado].some((c) => c.toLowerCase().includes(termo))),
    );
  }, [triagens, busca, filtroEstado]);

  const fileiras: Fileira[] = useMemo(() => {
    const porEspera = (a: Triagem, b: Triagem) => a.criado_em.localeCompare(b.criado_em);
    const abertas = filtradas.filter((t) => ABERTOS.has(t.status));
    return [
      { id: 'urgente', titulo: 'Urgente — violência', casos: abertas.filter((t) => t.prioridade === 'URGENTE_VIOLENCIA').sort(porEspera), vazio: 'Nenhum caso urgente aguardando.' },
      { id: 'alta', titulo: 'Prioridade alta', casos: abertas.filter((t) => t.prioridade === 'ALTA').sort(porEspera), vazio: 'Nada com prioridade alta aguardando.' },
      { id: 'media', titulo: 'Média e baixa', casos: abertas.filter((t) => t.prioridade === 'MEDIA' || t.prioridade === 'BAIXA').sort(porEspera), vazio: 'Nada aguardando nesta faixa.' },
      { id: 'curso', titulo: 'Em atendimento', casos: filtradas.filter((t) => EM_CURSO.has(t.status)), vazio: 'Ninguém em atendimento agora.' },
      { id: 'fechados', titulo: 'Concluídos e arquivados', casos: filtradas.filter((t) => t.status === 'CONCLUIDO' || t.status === 'ARQUIVADO'), vazio: 'Nada concluído ainda.' },
    ].filter((f) => !filtroEstado || f.casos.length > 0);
  }, [filtradas, filtroEstado]);

  // Só o caso mais urgente da tela ganha o destaque invertido
  const destaque = fileiras[0]?.id === 'urgente' ? fileiras[0].casos[0] : undefined;
  const casoAberto = triagens.find((t) => t.id === abertoId) ?? null;
  const novo = (t: Triagem) => vistos !== null && !vistos.has(t.id);

  const aoAlterar = (t: Triagem) => fila.setDados((atual) => (atual ?? []).map((x) => (x.id === t.id ? t : x)));

  return (
    <>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[44px] leading-[0.95] tracking-[0.03em]">Fila de atendimento</h1>
          <p className="mt-2 text-texto-2">Casos do WhatsApp e do balcão, o mais urgente primeiro. Atualiza sozinha.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Buscar na fila</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-3" aria-hidden />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar relato, bairro, categoria"
              className="h-10 w-72 max-w-full rounded-lg border border-linha-forte bg-fundo pl-9 pr-3 text-sm hover:border-texto-3 focus:border-ambar focus:outline-none"
            />
          </label>
          <Botao variante="primario" icone={ClipboardPlus} onClick={() => setRegistrando(true)}>Registrar atendimento</Botao>
        </div>
      </header>

      {filtroEstado && ESTADOS[filtroEstado] && (
        <div className="mb-6 flex items-center gap-2 text-sm text-texto-2">
          Mostrando só <Selo tom={ESTADOS[filtroEstado].tom}>{ESTADOS[filtroEstado].rotulo}</Selo>
          <Botao tamanho="sm" variante="fantasma" icone={X} onClick={() => irPara('fila')}>Mostrar tudo</Botao>
        </div>
      )}

      {fila.erro && <div className="mb-6"><Aviso>{fila.erro}</Aviso></div>}

      {!fila.dados && !fila.erro && (
        <div className="flex flex-col gap-10" aria-busy="true" aria-label="Carregando a fila">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-4">
              <Esqueleto className="h-7 w-56" />
              <div className="flex gap-3">{[0, 1, 2, 3].map((j) => <Esqueleto key={j} className="h-[176px] w-[248px] shrink-0" />)}</div>
            </div>
          ))}
        </div>
      )}

      {destaque && <Destaque caso={destaque} novo={novo(destaque)} onAbrir={() => abrir(destaque.id)} />}

      {fila.dados && (
        <div className="parede flex flex-col gap-10">
          {fileiras.map((f) => (
            <FileiraCasos key={f.id} fileira={f} pularPrimeiro={f.id === 'urgente' && !!destaque} novo={novo} onAbrir={abrir} />
          ))}
          {fila.dados.length === 0 && (
            <Vazio icone={Inbox} titulo="A fila está vazia">
              Quando alguém pedir contato pelo WhatsApp, o caso aparece aqui. Para quem chegou ao balcão, use <strong>Registrar atendimento</strong>.
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

function Destaque({ caso, novo, onAbrir }: { caso: Triagem; novo: boolean; onAbrir: () => void }) {
  return (
    <section aria-label="Caso mais urgente" className={`mb-10 grid gap-5 rounded-2xl bg-urgente px-6 py-5 text-[#1a0807] md:grid-cols-[1fr_auto] md:items-center ${novo ? 'caso-novo' : ''}`}>
      <div className="min-w-0">
        <h2 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-display text-[30px] leading-none tracking-[0.06em]">
          <ShieldAlert className="size-6 self-center" aria-hidden />
          Atender primeiro
          {novo && <span className="rounded bg-[#1a0807] px-1.5 py-0.5 font-sans text-[11px] font-bold uppercase tracking-wider text-urgente">Novo</span>}
        </h2>
        <p className="mt-2 line-clamp-2 max-w-[80ch] text-[17px] font-medium leading-snug">“{caso.relato_original}”</p>
        <p className="mt-2 text-[13px] font-medium opacity-80">
          {tempoDesde(caso.criado_em) === 'agora' ? 'Acabou de chegar' : `Esperando ${tempoDesde(caso.criado_em).replace('há ', '')}`}
          {' · '}{CANAIS[caso.canal] ?? caso.canal}{caso.bairro !== 'Não informado' && ` · ${caso.bairro}`}{caso.tem_contato && ` · ${caso.telefone_mascarado}`}
        </p>
      </div>
      <button onClick={onAbrir} className="h-11 rounded-lg bg-[#1a0807] px-5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-black focus-visible:outline-[#1a0807]">
        Abrir ficha
      </button>
    </section>
  );
}

function FileiraCasos({ fileira, pularPrimeiro, novo, onAbrir }: {
  fileira: Fileira; pularPrimeiro: boolean; novo: (t: Triagem) => boolean; onAbrir: (id: string) => void;
}) {
  const trilho = useRef<HTMLDivElement>(null);
  const casos = pularPrimeiro ? fileira.casos.slice(1) : fileira.casos;
  const [transborda, setTransborda] = useState(false);

  // Setas só quando os cartões realmente não cabem na largura
  useEffect(() => {
    const el = trilho.current;
    if (!el) return;
    const medir = () => setTransborda(el.scrollWidth > el.clientWidth + 4);
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    medir();
    return () => observador.disconnect();
  }, [casos.length]);
  const rolar = (sentido: 1 | -1) => trilho.current?.scrollBy({ left: sentido * trilho.current.clientWidth * 0.8, behavior: 'smooth' });

  // Setas do teclado andam entre os cartões da mesma fileira
  const aoTeclar = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const botoes = Array.from(trilho.current?.querySelectorAll<HTMLButtonElement>('button[data-caso]') ?? []);
    const i = botoes.indexOf(document.activeElement as HTMLButtonElement);
    const proximo = botoes[i + (e.key === 'ArrowRight' ? 1 : -1)];
    if (proximo) {
      e.preventDefault();
      proximo.focus();
      proximo.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  };

  const tituloId = `fileira-${fileira.id}`;
  return (
    <section aria-labelledby={tituloId} className="fileira transition-opacity duration-200">
      <div className="mb-4 flex items-center justify-between gap-4">
        <TituloFileira id={tituloId} contagem={casos.length}>{fileira.titulo}</TituloFileira>
        {transborda && (
          <div className="flex gap-2">
            <button onClick={() => rolar(-1)} aria-label={`Rolar ${fileira.titulo} para a esquerda`} className="grid size-9 place-items-center rounded-full border border-linha-forte text-texto-2 hover:text-texto hover:border-texto-3">
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <button onClick={() => rolar(1)} aria-label={`Rolar ${fileira.titulo} para a direita`} className="grid size-9 place-items-center rounded-full border border-linha-forte text-texto-2 hover:text-texto hover:border-texto-3">
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
      {casos.length === 0 ? (
        <p className="text-sm text-texto-3">{pularPrimeiro ? 'O único caso urgente está no destaque acima.' : fileira.vazio}</p>
      ) : (
        <div ref={trilho} onKeyDown={aoTeclar} className="trilho -mx-1 flex gap-3 overflow-x-auto px-1 py-2">
          {casos.map((t) => <CartaoCaso key={t.id} caso={t} novo={novo(t)} onAbrir={() => onAbrir(t.id)} />)}
        </div>
      )}
    </section>
  );
}

function CartaoCaso({ caso, novo, onAbrir }: { caso: Triagem; novo: boolean; onAbrir: () => void }) {
  const prioridade = PRIORIDADES[caso.prioridade] ?? PRIORIDADES.BAIXA;
  const estado = ESTADOS[caso.status] ?? ESTADOS.PENDENTE;
  const urgente = caso.prioridade === 'URGENTE_VIOLENCIA';
  return (
    <button
      data-caso
      onClick={onAbrir}
      aria-label={`${nomeCategoria(caso.categoria)}, ${estado.rotulo}, chegou ${tempoDesde(caso.criado_em)}${novo ? ', caso novo' : ''}`}
      className={`cartao group relative flex h-[176px] w-[248px] shrink-0 flex-col overflow-hidden rounded-xl border bg-superficie p-4 text-left transition-[width,border-color,background-color] duration-250 ease-(--ease-saida)
        hover:w-[380px] hover:border-ambar hover:bg-elevada focus-visible:w-[380px] focus-visible:border-ambar focus-visible:bg-elevada focus-visible:outline-none
        ${urgente ? 'border-urgente/60' : 'border-linha'} ${novo ? 'caso-novo' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-display text-[24px] leading-[0.95] tracking-[0.03em] text-texto">{nomeCategoria(caso.categoria)}</p>
        {novo && <span className="rounded bg-ambar px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#1b1406]">Novo</span>}
      </div>
      <p className="mt-2 line-clamp-3 text-[13px] leading-snug text-texto-2 group-hover:line-clamp-2 group-focus-visible:line-clamp-2">
        {caso.relato_original}
      </p>
      <div className="mt-auto flex flex-col gap-2">
        <div className="hidden flex-wrap gap-1.5 group-hover:flex group-focus-visible:flex">
          <Selo tom={prioridade.tom}>{prioridade.rotulo}</Selo>
          <Selo tom={estado.tom}>{estado.rotulo}</Selo>
          {caso.documentos_necessarios.length > 0 && <span className="text-xs text-texto-3 self-center">{caso.documentos_necessarios.length} documentos</span>}
        </div>
        <p className="flex items-center gap-2 text-xs text-texto-3">
          <span className={urgente ? 'text-urgente font-medium' : 'text-texto-2'}>{tempoDesde(caso.criado_em)}</span>
          <span aria-hidden>·</span>
          <span>{CANAIS[caso.canal] ?? caso.canal}</span>
          {caso.bairro !== 'Não informado' && <><span aria-hidden>·</span><span className="truncate">{caso.bairro}</span></>}
        </p>
      </div>
    </button>
  );
}
