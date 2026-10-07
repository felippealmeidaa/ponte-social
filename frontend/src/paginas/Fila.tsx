import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { CalendarClock, ClipboardPlus, Inbox, Languages, Paperclip, Search, ShieldAlert, UserRoundCheck, X } from 'lucide-react';
import { sessaoSalva } from '../api';
import { FichaCaso } from '../components/FichaCaso';
import { RegistrarAtendimento } from '../components/RegistrarAtendimento';
import { Aviso, Botao, Esqueleto, FaixaLeitura, Leitura, Selo, Vazio } from '../components/ui';
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
  // Tela larga: a ficha fica encaixada ao lado da tabela e a lista continua usável
  const encaixar = useTelaLarga();

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

  const leitura = {
    urgentes: triagens.filter((t) => t.status === 'URGENTE_CREAS' || (t.prioridade === 'URGENTE_VIOLENCIA' && ABERTOS.has(t.status))).length,
    aguardando: triagens.filter((t) => t.status === 'PENDENTE').length,
    emCurso: triagens.filter((t) => EM_CURSO.has(t.status)).length,
    hoje: triagens.filter((t) => chegouHoje(t.criado_em)).length,
    maisAntigo: triagens.filter((t) => ABERTOS.has(t.status)).sort((a, b) => a.criado_em.localeCompare(b.criado_em))[0],
  };

  return (
    <>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="titulo text-[26px]">Fila de casos</h1>
          <p className="mt-0.5 text-[14px] text-texto-2">Violência sempre no topo; o resto por quem espera há mais tempo.</p>
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
              className="h-10 w-72 max-w-full rounded-[3px] border border-linha-forte bg-superficie pl-9 pr-3 text-[14.5px] hover:border-texto-3 focus:border-caneta focus:outline-none focus:ring-2 focus:ring-caneta/15"
            />
          </label>
          <button type="button" aria-pressed={meus} onClick={() => setMeus((m) => !m)}
            className={`inline-flex h-10 items-center gap-2 rounded-[3px] border px-3.5 text-[14.5px] transition-colors duration-150 ${meus
              ? 'border-caneta bg-caneta-fundo font-semibold text-caneta'
              : 'border-linha-forte bg-superficie text-texto hover:border-texto-3 hover:bg-elevada'}`}>
            <UserRoundCheck className="size-4" aria-hidden />
            Meus casos
            {quantosMeus > 0 && <span className="rounded-[3px] bg-caneta px-1.5 text-[12px] font-bold leading-[18px] text-sobre tabular">{quantosMeus}</span>}
          </button>
          <Botao variante="primario" icone={ClipboardPlus} onClick={() => setRegistrando(true)}>Registrar atendimento</Botao>
        </div>
      </header>

      {fila.dados && (
        <FaixaLeitura className="mb-4">
          <Leitura rotulo="Violência aguardando" valor={leitura.urgentes} href="#/fila/URGENTE_CREAS" urgente={leitura.urgentes > 0} />
          <Leitura rotulo="Aguardando" valor={leitura.aguardando} href="#/fila/PENDENTE" />
          <Leitura rotulo="Em atendimento" valor={leitura.emCurso} href="#/fila/EM_ATENDIMENTO" />
          <Leitura rotulo="Chegaram hoje" valor={leitura.hoje} />
          <Leitura rotulo="Espera mais longa" valor={leitura.maisAntigo ? esperaCurta(leitura.maisAntigo) : '–'}
            detalhe={leitura.maisAntigo ? `guia ${numeroGuia(leitura.maisAntigo.id)}` : 'ninguém aguardando'} />
        </FaixaLeitura>
      )}

      {(meus || (filtroEstado && ESTADOS[filtroEstado])) && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-texto-2">
          {meus && <>Só os casos que você assumiu. <Botao tamanho="sm" variante="fantasma" icone={X} onClick={() => setMeus(false)}>Mostrar todos</Botao></>}
          {filtroEstado && ESTADOS[filtroEstado] && (
            <>Mostrando só <Selo tom={ESTADOS[filtroEstado].tom}>{ESTADOS[filtroEstado].rotulo}</Selo>
              <Botao tamanho="sm" variante="fantasma" icone={X} onClick={() => irPara('fila')}>Mostrar tudo</Botao></>
          )}
        </div>
      )}

      {fila.erro && <div className="mb-6"><Aviso>{fila.erro}</Aviso></div>}

      {!fila.dados && !fila.erro && (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando a fila">
          <Esqueleto className="h-[74px] w-full" />
          <Esqueleto className="h-[420px] w-full" />
        </div>
      )}

      {fila.dados && fila.dados.length === 0 && (
        <Vazio icone={Inbox} titulo="A fila está vazia">
          Quando alguém pedir contato pelo WhatsApp, o caso aparece aqui. Para quem chegou ao balcão, use <strong>Registrar atendimento</strong>.
        </Vazio>
      )}

      {fila.dados && fila.dados.length > 0 && (
        <div className={encaixar && casoAberto ? 'grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(400px,34%)]' : ''}>
        <div className="flex min-w-0 flex-col gap-4">
          <TabelaFila fileiras={fileiras.filter((f) => !f.recolhido)} novo={novo} abertoId={abertoId} onAbrir={abrir} compacta={encaixar && Boolean(casoAberto)} />
          {fileiras.filter((f) => f.recolhido).map((f) => (
            <details key={f.id} className="painel group">
              <summary className="painel-cabeca cursor-pointer list-none text-texto-2 hover:text-texto [&::-webkit-details-marker]:hidden">
                <span className="titulo flex items-baseline gap-2.5 text-[16px] text-texto">{f.titulo}<span className="dado text-[13px] font-normal text-texto-3">{f.casos.length}</span></span>
                <span className="text-[13px]"><span className="group-open:hidden">Mostrar</span><span className="hidden group-open:inline">Esconder</span></span>
              </summary>
              <TabelaFila fileiras={[f]} novo={novo} abertoId={abertoId} onAbrir={abrir} semPainel compacta={encaixar && Boolean(casoAberto)} />
            </details>
          ))}
        </div>
        {encaixar && casoAberto && (
          <FichaCaso key={casoAberto.id} caso={casoAberto} onFechar={() => setAbertoId(null)} onAlterado={aoAlterar} encaixado />
        )}
        </div>
      )}

      {/* Tela estreita: a ficha entra por cima da lista */}
      {!encaixar && <FichaCaso key={casoAberto?.id ?? 'nenhum'} caso={casoAberto} onFechar={() => setAbertoId(null)} onAlterado={aoAlterar} />}
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

const LARGA = '(min-width: 1280px)';
function useTelaLarga() {
  const [larga, setLarga] = useState(() => { try { return window.matchMedia(LARGA).matches; } catch { return false; } });
  useEffect(() => {
    let mq: MediaQueryList;
    try { mq = window.matchMedia(LARGA); } catch { return; }
    const mudou = () => setLarga(mq.matches);
    mq.addEventListener('change', mudou);
    return () => mq.removeEventListener('change', mudou);
  }, []);
  return larga;
}

const chegouHoje = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

function esperaCurta(t: Triagem) {
  const e = tempoDesde(t.criado_em);
  return e === 'agora' ? 'agora' : e.replace('há ', '');
}

/** Fila em linhas densas, agrupada por prioridade. Setas para cima/baixo andam entre as linhas; Enter abre a ficha. */
function TabelaFila({ fileiras, novo, abertoId, onAbrir, semPainel, compacta = false }: {
  fileiras: Fileira[]; novo: (t: Triagem) => boolean; abertoId: string | null; onAbrir: (id: string) => void; semPainel?: boolean;
  /** Com a ficha aberta ao lado: some a coluna Canal e a Necessidade estreita, para o relato continuar legível */
  compacta?: boolean;
}) {
  const colunas = compacta ? 6 : 7;
  const ref = useRef<HTMLDivElement>(null);
  const aoTeclar = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const botoes = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button[data-caso]') ?? []).filter((b) => b.offsetParent !== null);
    const i = botoes.indexOf(document.activeElement as HTMLButtonElement);
    const proximo = botoes[i + (e.key === 'ArrowDown' ? 1 : -1)];
    if (proximo) { e.preventDefault(); proximo.focus(); }
  };

  const total = fileiras.reduce((s, f) => s + f.casos.length, 0);
  const corpo = (
    <div ref={ref} onKeyDown={aoTeclar}>
      <table className="hidden w-full table-fixed border-collapse text-left text-[14px] md:table">
        <thead>
          <tr className="border-b border-linha text-[12.5px] text-texto-3">
            <th scope="col" className="w-[104px] px-4 py-2 font-medium">Guia</th>
            <th scope="col" className="w-[84px] px-3 py-2 font-medium">Espera</th>
            <th scope="col" className={`${compacta ? 'w-[170px]' : 'w-[220px]'} px-3 py-2 font-medium`}>Necessidade</th>
            <th scope="col" className="px-3 py-2 font-medium">Relato</th>
            <th scope="col" className={`${compacta ? 'w-[120px]' : 'w-[150px]'} px-3 py-2 font-medium`}>Bairro</th>
            {!compacta && <th scope="col" className="w-[96px] px-3 py-2 font-medium">Canal</th>}
            <th scope="col" className="w-[150px] px-4 py-2 font-medium">Situação</th>
          </tr>
        </thead>
        {fileiras.map((f) => (
          <tbody key={f.id}>
            {!semPainel && (
              <tr className="border-b border-linha bg-elevada">
                <th scope="colgroup" colSpan={colunas} className={`px-4 py-1.5 text-[12.5px] font-semibold ${f.id === 'urgente' && f.casos.length ? 'text-urgente' : 'text-texto-2'}`}>
                  {f.id === 'urgente' && f.casos.length > 0 && <ShieldAlert className="mr-1.5 inline size-3.5 align-[-2px]" aria-hidden />}
                  {f.titulo} <span className="dado ml-1 font-normal text-texto-3">{f.casos.length}</span>
                </th>
              </tr>
            )}
            {f.casos.length === 0 ? (
              <tr className="border-b border-linha"><td colSpan={colunas} className="px-4 py-2.5 text-[13.5px] text-texto-3">{f.vazio}</td></tr>
            ) : f.casos.map((t) => <LinhaCaso key={t.id} caso={t} novo={novo(t)} aberto={abertoId === t.id} onAbrir={() => onAbrir(t.id)} compacta={compacta} />)}
          </tbody>
        ))}
      </table>

      <div className="md:hidden">
        {fileiras.map((f) => (
          <section key={f.id} aria-label={f.titulo}>
            {!semPainel && (
              <p className={`border-b border-linha bg-elevada px-4 py-1.5 text-[12.5px] font-semibold ${f.id === 'urgente' && f.casos.length ? 'text-urgente' : 'text-texto-2'}`}>
                {f.titulo} <span className="dado font-normal text-texto-3">{f.casos.length}</span>
              </p>
            )}
            {f.casos.length === 0
              ? <p className="border-b border-linha px-4 py-2.5 text-[13.5px] text-texto-3">{f.vazio}</p>
              : f.casos.map((t) => <LinhaCasoCelular key={t.id} caso={t} novo={novo(t)} aberto={abertoId === t.id} onAbrir={() => onAbrir(t.id)} />)}
          </section>
        ))}
      </div>
    </div>
  );

  if (semPainel) return corpo;
  return (
    <section aria-labelledby="t-fila" className="painel">
      <div className="painel-cabeca">
        <h2 id="t-fila" className="titulo flex items-baseline gap-2.5 text-[16px]">Fila <span className="dado text-[13px] font-normal text-texto-3">{total} casos</span></h2>
        <span className="hidden text-[12.5px] text-texto-3 sm:inline">Setas para andar entre os casos, Enter para abrir</span>
      </div>
      {corpo}
    </section>
  );
}

function rotuloCaso(caso: Triagem, novo: boolean) {
  const estado = ESTADOS[caso.status] ?? ESTADOS.PENDENTE;
  return `Guia ${numeroGuia(caso.id)}: ${nomeCategoria(caso.categoria)}, ${estado.rotulo}, chegou ${tempoDesde(caso.criado_em)}${caso.prioridade === 'URGENTE_VIOLENCIA' ? ', violência' : ''}${novo ? ', caso novo' : ''}`;
}

function Necessidade({ caso }: { caso: Triagem }) {
  const urgente = caso.prioridade === 'URGENTE_VIOLENCIA';
  const IconeCat = urgente ? ShieldAlert : (ICONE_CATEGORIA[caso.categoria] ?? ICONE_CATEGORIA.nao_identificado);
  return (
    <span className={`flex min-w-0 items-center gap-2 ${urgente ? 'font-semibold text-urgente' : 'text-texto'}`}>
      <span style={urgente ? ({ '--cat': corCategoria(caso.categoria) } as CSSProperties) : undefined} aria-hidden
        className={`flex size-6 shrink-0 items-center justify-center rounded-[3px] ${urgente ? 'chip-cat' : 'bg-elevada text-texto-2'}`}>
        <IconeCat className="size-3.5" strokeWidth={2} />
      </span>
      <span className="truncate">{nomeCategoria(caso.categoria)}</span>
    </span>
  );
}

function SituacaoCaso({ caso }: { caso: Triagem }) {
  const estado = ESTADOS[caso.status] ?? ESTADOS.PENDENTE;
  return (
    <span className="flex min-w-0 items-center gap-2" title={caso.responsavel_nome ? `com ${caso.responsavel_nome}` : undefined}>
      <Selo tom={estado.tom} semIcone={caso.prioridade !== 'URGENTE_VIOLENCIA'}>{estado.rotulo}</Selo>
      {caso.agendado_para && (() => {
        const quando = new Date(caso.agendado_para).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        return (
          <span className="inline-flex shrink-0 text-texto-2" title={`Atendimento marcado: ${quando}`}>
            <CalendarClock className="size-3.5" aria-hidden /><span className="sr-only">Atendimento marcado: {quando}</span>
          </span>
        );
      })()}
    </span>
  );
}

function LinhaCaso({ caso, novo, aberto, onAbrir, compacta }: { caso: Triagem; novo: boolean; aberto: boolean; onAbrir: () => void; compacta: boolean }) {
  const urgente = caso.prioridade === 'URGENTE_VIOLENCIA';
  const esperando = ABERTOS.has(caso.status);
  return (
    <tr onClick={onAbrir}
      className={`h-10 cursor-pointer border-b border-linha transition-colors duration-150 ${aberto ? 'bg-caneta-fundo' : urgente && esperando ? 'bg-urgente-fundo/50 hover:bg-urgente-fundo' : 'hover:bg-elevada'}`}>
      <td className={`whitespace-nowrap px-4 py-1.5 ${aberto ? 'shadow-[inset_3px_0_0_var(--color-acao)]' : ''}`}>
        <button data-caso type="button" onClick={(e) => { e.stopPropagation(); onAbrir(); }} aria-label={rotuloCaso(caso, novo)} aria-current={aberto || undefined}
          className={`dado text-[14px] font-medium ${aberto ? 'text-caneta' : 'text-texto'} hover:underline`}>
          {numeroGuia(caso.id)}
        </button>
        {novo && <span className="ml-1.5 align-middle text-[11px] font-semibold text-texto-2" title="Caso ainda não aberto">novo</span>}
      </td>
      <td className={`dado px-3 py-1.5 text-[13.5px] ${urgente && esperando ? 'font-semibold text-urgente' : 'text-texto-2'}`}>{esperaCurta(caso)}</td>
      <td className="px-3 py-1.5"><Necessidade caso={caso} /></td>
      <td className="px-3 py-1.5 text-texto-2">
        <span className="block truncate">
          {caso.relato_traducao && (
            <span className="mr-1.5 inline-flex items-center gap-1 rounded-[3px] bg-info-fundo px-1 align-middle text-[11px] font-semibold text-info">
              <Languages className="size-3" aria-hidden />traduzido
            </span>
          )}
          {(caso.documentos_enviados ?? 0) > 0 && <Paperclip className="mr-1 inline size-3.5 align-[-2px] text-texto-2" aria-label={`${caso.documentos_enviados} documentos enviados`} />}
          {caso.relato_traducao ?? caso.relato_original}
        </span>
      </td>
      <td className="truncate px-3 py-1.5 text-[13.5px]">{caso.bairro !== 'Não informado' ? caso.bairro : <span className="text-texto-3">não informado</span>}</td>
      {!compacta && <td className="px-3 py-1.5 text-[13px] text-texto-2">{CANAIS[caso.canal] ?? caso.canal}</td>}
      <td className="px-4 py-1.5"><SituacaoCaso caso={caso} /></td>
    </tr>
  );
}

function LinhaCasoCelular({ caso, novo, aberto, onAbrir }: { caso: Triagem; novo: boolean; aberto: boolean; onAbrir: () => void }) {
  const urgente = caso.prioridade === 'URGENTE_VIOLENCIA';
  const esperando = ABERTOS.has(caso.status);
  const estado = ESTADOS[caso.status] ?? ESTADOS.PENDENTE;
  return (
    <button data-caso type="button" onClick={onAbrir} aria-label={rotuloCaso(caso, novo)}
      className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-b border-linha px-4 py-3 text-left ${aberto ? 'bg-caneta-fundo' : urgente && esperando ? 'bg-urgente-fundo/50' : ''}`}>
      <Necessidade caso={caso} />
      <span className={`dado text-[13px] ${urgente && esperando ? 'font-semibold text-urgente' : 'text-texto-2'}`}>{esperaCurta(caso)}</span>
      <span className="col-span-2 line-clamp-2 text-[14px] text-texto-2">{caso.relato_traducao ?? caso.relato_original}</span>
      <span className="dado truncate text-[12.5px] text-texto-3">
        {numeroGuia(caso.id)} · {caso.bairro !== 'Não informado' ? caso.bairro : 'sem bairro'}{novo ? ' · novo' : ''}
      </span>
      <span className="justify-self-end"><Selo tom={estado.tom} semIcone>{estado.rotulo}</Selo></span>
    </button>
  );
}
