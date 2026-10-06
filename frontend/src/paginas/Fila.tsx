import { useCallback, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { CalendarClock, ClipboardPlus, Inbox, Languages, Paperclip, Search, UserRoundCheck, X } from 'lucide-react';
import { sessaoSalva } from '../api';
import { FichaCaso } from '../components/FichaCaso';
import { RegistrarAtendimento } from '../components/RegistrarAtendimento';
import { Aviso, Botao, Esqueleto, Selo, TituloFileira, Vazio } from '../components/ui';
import { irPara } from '../navegacao';
import type { Triagem } from '../tipos';
import type { useAtualizacao } from '../useAtualizacao';
import { CANAIS, corCategoria, ESTADOS, ICONE_CATEGORIA, nomeCategoria, PRIORIDADES, tempoDesde } from '../vocabulario';

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
  /** Grupos que ocupam menos atenção ficam recolhidos */
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
      { id: 'urgente', titulo: 'Atender primeiro', casos: abertas.filter((t) => t.prioridade === 'URGENTE_VIOLENCIA').sort(porEspera), vazio: 'Nenhum caso de violência aguardando.' },
      { id: 'alta', titulo: 'Prioridade alta', casos: abertas.filter((t) => t.prioridade === 'ALTA').sort(porEspera), vazio: 'Nada com prioridade alta aguardando.' },
      { id: 'media', titulo: 'Média e baixa', casos: abertas.filter((t) => t.prioridade === 'MEDIA' || t.prioridade === 'BAIXA').sort(porEspera), vazio: 'Nada aguardando nesta faixa.' },
      { id: 'curso', titulo: 'Em atendimento', casos: filtradas.filter((t) => EM_CURSO.has(t.status)), vazio: 'Ninguém em atendimento agora.' },
      { id: 'fechados', titulo: 'Concluídos e arquivados', casos: filtradas.filter((t) => t.status === 'CONCLUIDO' || t.status === 'ARQUIVADO'), vazio: 'Nada concluído ainda.', recolhido: !filtroEstado },
    ].filter((f) => !filtroEstado || f.casos.length > 0);
  }, [filtradas, filtroEstado]);

  const casoAberto = triagens.find((t) => t.id === abertoId) ?? null;
  const novo = (t: Triagem) => vistos !== null && !vistos.has(t.id);

  const aoAlterar = (t: Triagem) => fila.setDados((atual) => (atual ?? []).map((x) => (x.id === t.id ? t : x)));

  return (
    <>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="titulo text-[34px]">Fila de atendimento</h1>
          <p className="mt-2 max-w-[60ch] text-texto-2">Cada caso é uma guia: o que a pessoa contou, o caminho sugerido e há quanto tempo ela espera. Violência sempre no topo.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Buscar na fila</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-3" aria-hidden />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar relato, bairro, assunto"
              className="h-10 w-72 max-w-full rounded-[5px] border border-linha-forte bg-superficie pl-9 pr-3 text-[15px] hover:border-texto-3 focus:border-caneta focus:outline-none focus:ring-2 focus:ring-caneta/15"
            />
          </label>
          <button type="button" aria-pressed={meus} onClick={() => setMeus((m) => !m)}
            className={`inline-flex h-10 items-center gap-2 rounded-[5px] border px-3.5 text-[14.5px] transition-colors duration-150 ${meus
              ? 'border-caneta bg-caneta-fundo font-semibold text-caneta'
              : 'border-linha-forte bg-superficie text-texto hover:border-texto-3 hover:bg-elevada'}`}>
            <UserRoundCheck className="size-4" aria-hidden />
            Meus casos
            {quantosMeus > 0 && <span className="rounded-full bg-caneta px-1.5 text-[12px] font-bold leading-[18px] text-sobre tabular">{quantosMeus}</span>}
          </button>
          <Botao variante="primario" icone={ClipboardPlus} onClick={() => setRegistrando(true)}>Registrar atendimento</Botao>
        </div>
      </header>

      {meus && (
        <div className="mb-6 flex items-center gap-2 text-sm text-texto-2">
          Mostrando só os casos que você assumiu.
          <Botao tamanho="sm" variante="fantasma" icone={X} onClick={() => setMeus(false)}>Mostrar todos</Botao>
        </div>
      )}

      {filtroEstado && ESTADOS[filtroEstado] && (
        <div className="mb-6 flex items-center gap-2 text-sm text-texto-2">
          Mostrando só <Selo tom={ESTADOS[filtroEstado].tom}>{ESTADOS[filtroEstado].rotulo}</Selo>
          <Botao tamanho="sm" variante="fantasma" icone={X} onClick={() => irPara('fila')}>Mostrar tudo</Botao>
        </div>
      )}

      {fila.erro && <div className="mb-6"><Aviso>{fila.erro}</Aviso></div>}

      {!fila.dados && !fila.erro && (
        <div className="flex flex-col gap-10" aria-busy="true" aria-label="Carregando a fila">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-3">
              <Esqueleto className="h-7 w-56" />
              {[0, 1].map((j) => <Esqueleto key={j} className="h-[132px] w-full" />)}
            </div>
          ))}
        </div>
      )}

      {fila.dados && (
        <div className="flex flex-col gap-11">
          {fileiras.map((f) => (
            <GrupoGuias key={f.id} fileira={f} novo={novo} onAbrir={abrir} />
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

/** Número curto e estável da guia, a partir do id (só para a equipe se referir ao caso). */
function numeroGuia(id: string) {
  const hex = id.replace(/^trg-/, '').slice(0, 6);
  const n = parseInt(hex, 16);
  return Number.isNaN(n) ? id.slice(-4) : String(n % 10000).padStart(4, '0');
}

function GrupoGuias({ fileira, novo, onAbrir }: { fileira: Fileira; novo: (t: Triagem) => boolean; onAbrir: (id: string) => void }) {
  const lista = useRef<HTMLOListElement>(null);
  const tituloId = `grupo-${fileira.id}`;
  const urgente = fileira.id === 'urgente';

  // Setas para cima/baixo andam entre as guias do mesmo grupo
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
    <p className="text-[14.5px] text-texto-3">{fileira.vazio}</p>
  ) : (
    <ol ref={lista} onKeyDown={aoTeclar} className={`grid gap-4 ${urgente ? '' : 'xl:grid-cols-2'}`}>
      {fileira.casos.map((t, i) => (
        <li key={t.id}><Guia caso={t} novo={novo(t)} grande={urgente && i === 0} onAbrir={() => onAbrir(t.id)} /></li>
      ))}
    </ol>
  );

  if (fileira.recolhido) {
    return (
      <details className="group">
        <summary className="cursor-pointer list-none text-texto-2 hover:text-texto">
          <span className="titulo text-[19px]">{fileira.titulo}</span>
          <span className="ml-3 text-[14.5px] tabular">{fileira.casos.length}</span>
          <span className="ml-3 text-[13.5px] underline">mostrar</span>
        </summary>
        <div className="mt-4">{conteudo}</div>
      </details>
    );
  }

  return (
    <section aria-labelledby={tituloId}>
      <div className={`mb-4 flex items-baseline gap-3 border-b-2 pb-2 ${urgente && fileira.casos.length ? 'border-urgente' : 'border-texto'}`}>
        <TituloFileira id={tituloId} contagem={fileira.casos.length}>{fileira.titulo}</TituloFileira>
      </div>
      {conteudo}
    </section>
  );
}

function Guia({ caso, novo, grande, onAbrir }: { caso: Triagem; novo: boolean; grande: boolean; onAbrir: () => void }) {
  const estado = ESTADOS[caso.status] ?? ESTADOS.PENDENTE;
  const prioridade = PRIORIDADES[caso.prioridade] ?? PRIORIDADES.BAIXA;
  const urgente = caso.prioridade === 'URGENTE_VIOLENCIA';
  const espera = tempoDesde(caso.criado_em);
  const aberto = caso.status === 'PENDENTE' || caso.status === 'URGENTE_CREAS';
  const IconeCat = ICONE_CATEGORIA[caso.categoria] ?? ICONE_CATEGORIA.nao_identificado;
  return (
    <button
      data-caso
      onClick={onAbrir}
      aria-label={`Guia ${numeroGuia(caso.id)}: ${nomeCategoria(caso.categoria)}, ${estado.rotulo}, chegou ${espera}${urgente ? ', urgente' : ''}${novo ? ', caso novo' : ''}`}
      className={`folha guia w-full text-left transition-[border-color,box-shadow] duration-150 hover:border-texto-3 focus-visible:border-caneta ${urgente ? 'border-urgente/45' : ''} ${novo ? 'caso-novo' : ''}`}
    >
      <span className="guia-canhoto flex flex-row items-baseline justify-between gap-1 bg-elevada px-4 py-3 sm:flex-col sm:justify-start sm:py-4">
        <span className="text-[12px] text-texto-3">Guia</span>
        <span className="titulo text-[24px] tabular">{numeroGuia(caso.id)}</span>
        <span className={`text-[13.5px] font-semibold sm:mt-3 ${urgente && aberto ? 'text-urgente' : 'text-texto-2'}`}>
          {aberto ? (espera === 'agora' ? 'chegou agora' : `espera ${espera.replace('há ', '')}`) : espera}
        </span>
      </span>
      <span className={`relative flex min-w-0 flex-col gap-2.5 px-5 ${grande ? 'py-5' : 'py-4'}`}>
        <span className="flex items-start justify-between gap-4">
          <span className="flex min-w-0 items-center gap-2.5">
            <span style={{ '--cat': corCategoria(caso.categoria) } as CSSProperties}
              className={`chip-cat flex shrink-0 items-center justify-center rounded-[7px] ${grande ? 'size-9' : 'size-8'}`} aria-hidden>
              <IconeCat className={grande ? 'size-5' : 'size-[18px]'} strokeWidth={1.9} />
            </span>
            <span className={`titulo ${grande ? 'text-[24px]' : 'text-[19px]'}`}>{nomeCategoria(caso.categoria)}</span>
          </span>
          {urgente && aberto ? (
            <span className={`carimbo shrink-0 ${grande ? 'text-[22px]' : 'text-[15px]'}`} aria-hidden>Urgente</span>
          ) : novo ? (
            <span className="shrink-0 text-[13px] font-semibold text-caneta">Novo</span>
          ) : null}
          {(caso.documentos_enviados ?? 0) > 0 && !(urgente && aberto) && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-caneta/30 bg-caneta-fundo px-2 py-0.5 text-[12.5px] font-semibold text-caneta">
              <Paperclip className="size-3.5" aria-hidden />{caso.documentos_enviados} documento{caso.documentos_enviados === 1 ? '' : 's'}
            </span>
          )}
        </span>
        <span className={`${grande ? 'line-clamp-3 text-[16.5px]' : 'line-clamp-2 text-[15px]'} leading-snug text-texto`}>
          {caso.relato_traducao && (
            <span className="mr-1.5 inline-flex translate-y-[-1px] items-center gap-1 rounded-[4px] bg-info-fundo px-1.5 align-middle text-[11.5px] font-semibold text-info">
              <Languages className="size-3" aria-hidden />traduzido
            </span>
          )}
          “{caso.relato_traducao ?? caso.relato_original}”
        </span>
        <span className="grid grid-cols-2 gap-x-6 gap-y-1 border-t border-linha pt-2.5 text-[13px] sm:grid-cols-4">
          <span><span className="block text-[11.5px] text-texto-3">Bairro</span><span className="font-semibold">{caso.bairro !== 'Não informado' ? caso.bairro : 'não informado'}</span></span>
          <span><span className="block text-[11.5px] text-texto-3">Chegou por</span><span className="font-semibold">{CANAIS[caso.canal] ?? caso.canal}</span></span>
          <span><span className="block text-[11.5px] text-texto-3">Prioridade</span><span className={`font-semibold ${urgente ? 'text-urgente' : ''}`}>{prioridade.rotulo}</span></span>
          <span>
            <span className="block text-[11.5px] text-texto-3">Situação</span><Selo tom={estado.tom} semIcone>{estado.rotulo}</Selo>
            {caso.responsavel_nome && <span className="mt-0.5 block truncate text-[12px] text-texto-2">com {caso.responsavel_nome}</span>}
            {caso.agendado_para && (
              <span className="mt-0.5 flex items-center gap-1 text-[12px] font-semibold text-caneta">
                <CalendarClock className="size-3.5 shrink-0" aria-hidden />
                {new Date(caso.agendado_para).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </span>
        </span>
      </span>
    </button>
  );
}
