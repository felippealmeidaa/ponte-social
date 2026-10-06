import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Lock, Plus, ShieldAlert } from 'lucide-react';
import { COMANDOS, DESVIOS, ETAPAS, etapaDaExtra, LIGACOES, SEGURANCA, TRILHO, type Etapa, type MensagemExtra, type Ponto } from '../fluxoBot';
import { Situacao, type EstadoTrilho } from './TrilhoFluxo';

// Canvas do fluxo, no jeito do n8n: cada etapa é um quadradinho com ícone, ligado por curvas com seta.
// Quem coordena arrasta os quadradinhos (a posição fica salva) e usa o + de uma ligação para pôr uma
// mensagem extra antes da etapa. A ordem da conversa continua a do bot; violência e aceite são travados.


export interface EstadoCanvas extends EstadoTrilho {
  /** Posição salva de cada quadradinho (centro do ícone em x, topo em y). Sem posição: o desenho padrão. */
  posicoes: Record<string, Ponto>;
  extras: MensagemExtra[];
  /** Etapas que aceitam mensagem extra antes delas. */
  ancoras: string[];
  podeEditar: boolean;
  onMover: (posicoes: Record<string, Ponto>) => void;
  onAdicionar: (antesDe: string) => void;
  /** Centro do quadradinho escolhido, em px a partir da borda esquerda do canvas (para a orelha do editor). */
  onOrelha: (x: number | null) => void;
}

const POR_ID: Record<string, Etapa> = Object.fromEntries(ETAPAS.map((e) => [e.id, e]));
/** De onde a conversa chega em cada etapa que aceita extra. */
const ANTERIOR: Record<string, string> = { ...Object.fromEntries(TRILHO.slice(1).map((id, i) => [id, TRILHO[i]])), encerrado: 'caminho' };

type Porta = 'direita' | 'esquerda' | 'baixo' | 'cima';
interface Ligacao { de: string; para: string; rotulo?: string; urgente?: boolean; mais?: string }
interface Desenho { caminho: string; meio: Ponto; reta: boolean; lado: 'esquerda' | 'direita' }
interface Origem { left: number; top: number }

function rotuloDe(de: string, para: string) {
  return LIGACOES.find((l) => l.de === de && l.para === para)?.rotulo;
}

/** Linha (1 = caminho principal) e coluna de cada etapa no desenho padrão. */
const GRADE: Record<string, { coluna: number; linha: number }> = (() => {
  const lugar: Record<string, { coluna: number; linha: number }> = {};
  TRILHO.forEach((id, i) => { lugar[id] = { coluna: i, linha: 1 }; });
  for (const [origem, cadeias] of Object.entries(DESVIOS)) {
    for (const cadeia of cadeias) {
      cadeia.forEach((passo, p) => { lugar[passo.etapa] ??= { coluna: lugar[origem].coluna, linha: 2 + p }; });
    }
  }
  return lugar;
})();

const LARGURA_BLOCO = { grande: 132, medio: 128, pequeno: 104 } as const;

/** Desenho padrão das etapas, calculado para a largura do canvas: 6 colunas, desvios descendo. */
function desenhoPadrao(largura: number): Record<string, Ponto> {
  const coluna = largura / 6;
  const saida: Record<string, Ponto> = {};
  for (const [id, g] of Object.entries(GRADE)) {
    saida[id] = { x: Math.round(coluna * (g.coluna + 0.5)), y: g.linha === 1 ? 0 : 175 + (g.linha - 2) * 137 };
  }
  return saida;
}

/** Onde entra uma mensagem extra ainda não arrastada: acima da ligação em que foi posta (ou ao lado, no desvio). */
function lugarDaExtra(lugar: Record<string, Ponto>, extras: MensagemExtra[], e: MensagemExtra, coluna: number): Ponto | null {
  const a = lugar[ANTERIOR[e.antes_de]], b = lugar[e.antes_de];
  if (!a || !b) return null;
  const irmas = extras.filter((x) => x.antes_de === e.antes_de);
  const k = irmas.indexOf(e);
  if (e.antes_de === 'encerrado') return { x: Math.round(a.x + coluna * 0.62), y: Math.round((a.y + b.y) / 2) + k * 130 };
  return { x: Math.round(a.x + ((b.x - a.x) * (k + 1)) / (irmas.length + 1)), y: Math.min(a.y, b.y) - 150 };
}

function ponto(r: DOMRect, base: Origem, porta: Porta, fundo: number): Ponto {
  const x = r.left - base.left, y = r.top - base.top;
  if (porta === 'direita') return { x: x + r.width + 2, y: y + r.height / 2 };
  if (porta === 'esquerda') return { x: x - 2, y: y + r.height / 2 };
  if (porta === 'baixo') return { x: x + r.width / 2, y: fundo - base.top + 4 };
  return { x: x + r.width / 2, y: y - 2 };
}

/** Escolhe por onde a curva sai e entra, pela posição de um quadradinho em relação ao outro. */
function portas(de: DOMRect, para: DOMRect, fundoDe: number, fundoPara: number): [Porta, Porta] {
  const dx = (para.left + para.width / 2) - (de.left + de.width / 2);
  if (para.top - fundoDe > 24) {
    if (Math.abs(dx) < 70) return ['baixo', 'cima'];
    return ['baixo', dx > 0 ? 'esquerda' : 'direita'];
  }
  if (de.top - fundoPara > 24) {
    if (Math.abs(dx) < 70) return ['cima', 'baixo'];
    return ['cima', dx > 0 ? 'esquerda' : 'direita'];
  }
  return dx >= 0 ? ['direita', 'esquerda'] : ['esquerda', 'direita'];
}

/** Curva de Bézier como a do n8n: sai e chega na direção da porta. */
function desenhar(de: HTMLElement, para: HTMLElement, base: Origem): Desenho {
  const fundo = (el: HTMLElement) => (el.closest('button') ?? el).getBoundingClientRect().bottom;
  const rd = de.getBoundingClientRect(), rp = para.getBoundingClientRect();
  const [saida, entrada] = portas(rd, rp, fundo(de), fundo(para));
  const a = ponto(rd, base, saida, fundo(de));
  const b = ponto(rp, base, entrada, fundo(para));
  const forca = Math.max(36, Math.min(110, Math.hypot(b.x - a.x, b.y - a.y) / 2));
  const empurra = (p: Porta, q: Ponto, s: number) => (
    p === 'direita' ? { x: q.x + s, y: q.y } : p === 'esquerda' ? { x: q.x - s, y: q.y } : p === 'baixo' ? { x: q.x, y: q.y + s } : { x: q.x, y: q.y - s }
  );
  const c1 = empurra(saida, a, forca), c2 = empurra(entrada, b, forca);
  const reta = saida === 'direita' || saida === 'esquerda';
  const cruza = (saida === 'baixo' && entrada !== 'cima') || (saida === 'cima' && entrada !== 'baixo');
  // Rótulo no meio; na curva que atravessa colunas, mais perto da saída, longe dos outros rótulos
  const t = cruza ? 0.28 : 0.5, u = 1 - t;
  const meio = {
    x: u ** 3 * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * b.x,
    y: u ** 3 * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * b.y,
  };
  // Rótulo de linha que sobe ou desce fica do lado oposto ao destino, longe do nome do quadradinho
  const lado = b.x - meio.x > 40 ? 'esquerda' : 'direita';
  return { caminho: `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`, meio, reta, lado };
}

/** Ligações do desenho: caminho principal e desvios, com as extras encaixadas antes da etapa em que entram. */
function montarLigacoes(extras: MensagemExtra[], ancoras: string[]): Ligacao[] {
  const saida: Ligacao[] = [];
  const corrente = (de: string, para: string, rotulo?: string) => {
    const nos = [de, ...extras.filter((e) => e.antes_de === para).map((e) => e.id), para];
    nos.slice(1).forEach((no, i) => saida.push({
      de: nos[i], para: no, rotulo: i === 0 ? rotulo : undefined,
      mais: no === para && ancoras.includes(para) ? para : undefined,
    }));
  };
  TRILHO.slice(1).forEach((id, i) => corrente(TRILHO[i], id, rotuloDe(TRILHO[i], id)));
  for (const [origem, cadeias] of Object.entries(DESVIOS)) {
    for (const cadeia of cadeias) {
      let anterior = origem;
      for (const passo of cadeia) {
        if (passo.etapa === 'encerrado') corrente(anterior, passo.etapa, passo.rotulo);
        else saida.push({ de: anterior, para: passo.etapa, rotulo: passo.rotulo });
        anterior = passo.etapa;
      }
    }
  }
  SEGURANCA.slice(1).forEach((id, i) => saida.push({ de: SEGURANCA[i], para: id, rotulo: rotuloDe(SEGURANCA[i], id), urgente: true }));
  return saida;
}

const ARRASTE_MINIMO = 4;
const PASSO_TECLADO = 20;

export function CanvasFluxo(estado: EstadoCanvas) {
  const { selecionada, puladas, contagem, personalizadas, posicoes, extras, ancoras, podeEditar, onMover, onAdicionar, onOrelha } = estado;
  const canvas = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const blocos = useRef(new Map<string, HTMLElement>());
  const [largura, setLargura] = useState(0);
  const [arrastando, setArrastando] = useState<Record<string, Ponto>>({});
  const [desenhos, setDesenhos] = useState<Record<string, Desenho>>({});

  const ligacoes = useMemo(() => montarLigacoes(extras, ancoras), [extras, ancoras]);
  const lugar = useMemo(() => {
    const largo = largura || 1100;
    const padrao = desenhoPadrao(largo);
    const saida: Record<string, Ponto> = {};
    for (const id of Object.keys(padrao)) saida[id] = posicoes[id] ?? padrao[id];
    for (const e of extras) {
      const p = posicoes[e.id] ?? lugarDaExtra(saida, extras, e, largo / 6);
      if (p) saida[e.id] = p;
    }
    // Extra nova acima do caminho: desce tudo para abrir espaço em cima
    const desce = Math.max(0, -Math.min(...Object.values(saida).map((p) => p.y)));
    if (desce) for (const id of Object.keys(saida)) saida[id] = { x: saida[id].x, y: saida[id].y + desce };
    return { ...saida, ...arrastando };
  }, [largura, posicoes, extras, arrastando]);
  const altura = Math.max(...Object.values(lugar).map((p) => p.y)) + 150;
  const larguraArea = Math.max(largura, Math.max(...Object.values(lugar).map((p) => p.x)) + 80);

  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el) return;
    // Largura útil do canvas (sem o recuo de 20 px de cada lado)
    const ro = new ResizeObserver(() => setLargura(el.clientWidth - 40));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const base = el.getBoundingClientRect();
    // Linhas medidas a partir do início do conteúdo, para acompanhar o canvas rolado de lado
    const origem = { left: base.left - el.scrollLeft, top: base.top - el.scrollTop };
    const saida: Record<string, Desenho> = {};
    for (const l of ligacoes) {
      const de = blocos.current.get(l.de), para = blocos.current.get(l.para);
      if (de && para) saida[`${l.de}>${l.para}`] = desenhar(de, para, origem);
    }
    setDesenhos(saida);
    const escolhido = selecionada ? blocos.current.get(selecionada) : null;
    if (escolhido) {
      const r = escolhido.getBoundingClientRect();
      onOrelha(r.left + r.width / 2 - base.left);
    } else onOrelha(null);
  }, [ligacoes, lugar, largura, selecionada, puladas, contagem, personalizadas, onOrelha]);

  const registrar = (id: string) => (no: HTMLElement | null) => {
    if (no) blocos.current.set(id, no);
    else blocos.current.delete(id);
  };

  /** Ao soltar, o desenho inteiro fica salvo como está na tela (assim não muda se a janela mudar de largura). */
  const mover = (id: string, p: Ponto) => {
    onMover({ ...lugar, [id]: { x: Math.max(70, Math.round(p.x)), y: Math.max(0, Math.round(p.y)) } });
  };

  const comuns = { ...estado, arrastando, setArrastando, mover, lugar };

  return (
    <div ref={canvas} className="canvas-fluxo relative isolate overflow-x-auto overflow-y-hidden rounded-[6px] border border-linha p-5">
      <svg aria-hidden className="pointer-events-none absolute left-0 top-0 z-0 overflow-visible" style={{ width: larguraArea + 40, height: '100%' }}>
        <defs>
          {(['normal', 'ativa', 'urgente'] as const).map((tom) => (
            <marker key={tom} id={`seta-${tom}`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" className={tom === 'ativa' ? 'fill-caneta' : tom === 'urgente' ? 'fill-urgente' : 'fill-linha-forte'} />
            </marker>
          ))}
        </defs>
        {ligacoes.map((l) => {
          const d = desenhos[`${l.de}>${l.para}`];
          if (!d) return null;
          const ativa = selecionada === l.de || selecionada === l.para;
          const apagada = Boolean(puladas[l.de] || puladas[l.para]);
          const tom = ativa ? 'ativa' : l.urgente ? 'urgente' : 'normal';
          return (
            <path key={`${l.de}>${l.para}`} d={d.caminho} fill="none" markerEnd={`url(#seta-${tom})`}
              strokeDasharray={apagada ? '5 5' : undefined}
              className={`transition-[stroke] duration-150 ${ativa ? 'stroke-caneta' : l.urgente ? 'stroke-urgente' : 'stroke-linha-forte'}`}
              strokeWidth={ativa ? 2.25 : 1.75} />
          );
        })}
      </svg>
      <div className="pointer-events-none absolute left-0 top-0 z-[2] h-full" style={{ width: larguraArea + 40 }}>
        {ligacoes.map((l) => {
          const d = desenhos[`${l.de}>${l.para}`];
          if (!d) return null;
          const ativa = selecionada === l.de || selecionada === l.para;
          const destino = POR_ID[l.para]?.titulo;
          return (
            <span key={`${l.de}>${l.para}`}>
              {l.rotulo && (
                <span aria-hidden style={d.reta
                  ? { left: d.meio.x, top: d.meio.y - 15, transform: 'translate(-50%, -100%)' }
                  : d.lado === 'direita'
                    ? { left: d.meio.x + 18, top: d.meio.y, transform: 'translateY(-50%)' }
                    : { left: d.meio.x - 18, top: d.meio.y, transform: 'translate(-100%, -50%)' }}
                  className={`absolute whitespace-nowrap rounded-[4px] px-1.5 py-px text-[12px] leading-tight ${d.reta ? '' : 'bg-elevada'} ${ativa ? 'font-semibold text-caneta' : l.urgente ? 'text-[#8f211b]' : 'text-texto-3'}`}>
                  {l.rotulo}
                </span>
              )}
              {l.mais && podeEditar && (
                <button type="button" onClick={() => onAdicionar(l.mais!)} title={`Pôr uma mensagem antes de “${destino}”`}
                  aria-label={`Adicionar mensagem extra antes de ${destino}`}
                  style={{ left: d.meio.x, top: d.meio.y }}
                  className="pointer-events-auto absolute z-10 flex size-[22px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-linha-forte bg-superficie text-texto-2 shadow-[0_2px_6px_-2px_rgb(23_40_74/0.35)] transition-[color,border-color,scale] duration-150 hover:scale-110 hover:border-caneta hover:text-caneta">
                  <Plus className="size-3.5" strokeWidth={2.25} aria-hidden />
                </button>
              )}
            </span>
          );
        })}
      </div>

      <section aria-labelledby="c-seguranca" className="sticky left-0 mb-8 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-[6px] border border-urgente/30 bg-urgente-fundo/80 px-4 py-3.5" style={{ maxWidth: largura || undefined }}>
        <h3 id="c-seguranca" className="flex max-w-[15rem] items-start gap-2 text-[14px] font-semibold leading-snug text-[#8f211b]">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          Violência, em qualquer etapa e em todos os CRAS
        </h3>
        <ol className="flex flex-wrap items-start gap-x-[4.5rem] gap-y-3">
          {SEGURANCA.map((id) => (
            <li key={id}><Bloco id={id} etapa={POR_ID[id]} tamanho="medio" ref={registrar(id)} {...comuns} fixo /></li>
          ))}
        </ol>
      </section>

      <div ref={area} role="list" aria-label="Caminho da conversa: da esquerda para a direita; os desvios descem da etapa de onde saem"
        className="relative" style={{ height: altura, width: larguraArea }}>
        {Object.keys(lugar).map((id) => {
          const extra = extras.find((e) => e.id === id);
          const etapa = extra ? etapaDaExtra(extra) : POR_ID[id];
          const tamanho = extra ? 'medio' : GRADE[id]?.linha === 1 ? 'grande' : 'medio';
          const p = lugar[id];
          return (
            <div key={id} role="listitem" className="absolute" style={{ left: p.x - LARGURA_BLOCO[tamanho] / 2, top: p.y }}>
              <Bloco id={id} etapa={etapa} tamanho={tamanho} ref={registrar(id)} extra={Boolean(extra)} {...comuns} />
            </div>
          );
        })}
      </div>

      <section aria-labelledby="c-comandos" className="sticky left-0 mt-4 flex flex-wrap items-start gap-x-6 gap-y-3 border-t border-dashed border-linha-forte pt-4" style={{ maxWidth: largura || undefined }}>
        <h3 id="c-comandos" className="w-full text-[13.5px] font-semibold text-texto-2">Comandos e situações que valem em qualquer etapa</h3>
        <ul className="flex flex-wrap items-start gap-x-5 gap-y-4">
          {COMANDOS.map((id) => <li key={id}><Bloco id={id} etapa={POR_ID[id]} tamanho="pequeno" {...comuns} fixo /></li>)}
        </ul>
      </section>
    </div>
  );
}

const TAMANHO = {
  grande: { bloco: 'size-[68px]', icone: 'size-7', largura: 'w-[132px]' },
  medio: { bloco: 'size-14', icone: 'size-6', largura: 'w-[128px]' },
  pequeno: { bloco: 'size-11', icone: 'size-5', largura: 'w-[104px]' },
};

interface PropsBloco extends EstadoCanvas {
  id: string;
  etapa: Etapa;
  tamanho: keyof typeof TAMANHO;
  ref?: (no: HTMLElement | null) => void;
  extra?: boolean;
  /** Fora do canvas arrastável (faixa de violência e comandos). */
  fixo?: boolean;
  lugar: Record<string, Ponto>;
  setArrastando: (p: Record<string, Ponto>) => void;
  mover: (id: string, p: Ponto) => void;
}

function Bloco({ id, etapa, tamanho, ref, extra, fixo, selecionada, contagem, puladas, personalizadas, onAbrir, podeEditar,
  lugar, setArrastando, mover }: PropsBloco) {
  const ativa = selecionada === id;
  const pulada = puladas[id];
  const n = contagem[id] ?? 0;
  const urgente = etapa.tipo === 'urgente' || id === 'fila_urgente';
  const fim = etapa.tipo === 'fim';
  const Icone = etapa.icone;
  const t = TAMANHO[tamanho];
  const arrastavel = podeEditar && !fixo;
  const toque = useRef<{ x: number; y: number; origem: Ponto; moveu: boolean } | null>(null);
  const soltouAgora = useRef(false);
  const [emArraste, setEmArraste] = useState(false);

  const descer = (e: PointerEvent<HTMLButtonElement>) => {
    if (!arrastavel || e.button !== 0) return;
    toque.current = { x: e.clientX, y: e.clientY, origem: lugar[id], moveu: false };
  };
  const andar = (e: PointerEvent<HTMLButtonElement>) => {
    const t0 = toque.current;
    if (!t0) return;
    const dx = e.clientX - t0.x, dy = e.clientY - t0.y;
    if (!t0.moveu && Math.hypot(dx, dy) < ARRASTE_MINIMO) return;
    if (!t0.moveu) {
      t0.moveu = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setEmArraste(true);
    }
    setArrastando({ [id]: { x: Math.max(70, t0.origem.x + dx), y: Math.max(0, t0.origem.y + dy) } });
  };
  const subir = (e: PointerEvent<HTMLButtonElement>) => {
    const t0 = toque.current;
    toque.current = null;
    if (!t0?.moveu) return;
    soltouAgora.current = true; // o clique que vem depois do arraste não abre a etapa
    setEmArraste(false);
    mover(id, { x: t0.origem.x + e.clientX - t0.x, y: t0.origem.y + e.clientY - t0.y });
    setArrastando({});
  };
  const cancelar = () => {
    toque.current = null;
    setEmArraste(false);
    setArrastando({});
  };
  const teclado = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!arrastavel || !e.altKey) return;
    const passo = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[e.key];
    if (!passo) return;
    e.preventDefault();
    mover(id, { x: lugar[id].x + passo[0] * PASSO_TECLADO, y: lugar[id].y + passo[1] * PASSO_TECLADO });
  };

  const moldura = ativa
    ? 'border-caneta border-2 bg-caneta-fundo text-caneta shadow-[0_0_0_4px_rgb(36_87_197/0.14),0_8px_18px_-10px_rgb(23_40_74/0.5)]'
    : pulada
      ? 'border-dashed border-linha-forte bg-elevada text-texto-3'
      : urgente
        ? 'border-urgente/50 bg-superficie text-urgente shadow-[0_6px_14px_-10px_rgb(192_50_43/0.55)] group-hover:border-urgente'
        : extra
          ? 'border-caneta/45 bg-superficie text-caneta shadow-[0_6px_14px_-10px_rgb(23_40_74/0.55)] group-hover:border-caneta'
          : 'border-linha-forte bg-superficie text-texto shadow-[0_6px_14px_-10px_rgb(23_40_74/0.55)] group-hover:border-texto-3';

  return (
    <button type="button" aria-pressed={ativa} title={pulada?.motivo}
      onClick={() => {
        if (soltouAgora.current) { soltouAgora.current = false; return; }
        onAbrir(id);
      }}
      onPointerDown={descer} onPointerMove={andar} onPointerUp={subir} onPointerCancel={cancelar}
      onKeyDown={teclado}
      aria-label={`${etapa.titulo}${extra ? ', mensagem extra' : ''}${pulada ? `, ${pulada.curto}` : ''}${n ? `, ${n} conversa(s) aqui agora` : ''}. Ver e editar.${arrastavel ? ' Alt e setas movem.' : ''}`}
      className={`group flex select-none flex-col items-center gap-2 rounded-[8px] text-center focus-visible:outline-none ${t.largura} ${arrastavel ? `touch-none ${emArraste ? 'cursor-grabbing' : 'cursor-grab'}` : ''}`}>
      <span ref={ref}
        className={`relative flex items-center justify-center border transition-[border-color,background-color,box-shadow,scale] duration-150 group-focus-visible:outline-2 group-focus-visible:outline-offset-4 group-focus-visible:outline-caneta ${t.bloco} ${fim ? 'rounded-l-[10px] rounded-r-full' : 'rounded-[10px]'} ${moldura} ${emArraste ? 'scale-[1.06] shadow-[0_16px_28px_-12px_rgb(23_40_74/0.55)]' : ''}`}>
        <Icone className={t.icone} strokeWidth={1.75} aria-hidden />
        {n > 0 && (
          <span className="absolute -right-2 -top-2 min-w-5 rounded-full border-2 border-superficie bg-info px-1 text-[11.5px] font-semibold leading-4 tabular text-white">{n}</span>
        )}
        {etapa.travada && !ativa && (
          <span className="absolute -bottom-1.5 -right-1.5 flex size-[18px] items-center justify-center rounded-full border border-linha-forte bg-superficie text-texto-3">
            <Lock className="size-2.5" aria-hidden />
          </span>
        )}
        {tamanho === 'pequeno' && personalizadas.has(id) && <span className="absolute -left-1 -top-1 size-2.5 rounded-full border-2 border-superficie bg-caneta" />}
      </span>
      <span className={`line-clamp-2 leading-tight ${tamanho === 'pequeno' ? 'text-[13px] font-medium' : 'text-[13.5px] font-semibold'} ${ativa || extra ? 'text-caneta' : pulada ? 'text-texto-2' : urgente ? 'text-[#8f211b]' : 'text-texto'} ${ativa ? '' : 'group-hover:underline group-hover:decoration-linha-forte group-hover:underline-offset-4'}`}>
        {etapa.titulo}
      </span>
      {tamanho !== 'pequeno' && !extra && <Situacao etapa={etapa} selecionada={selecionada} contagem={{}} puladas={puladas} personalizadas={personalizadas} onAbrir={onAbrir} />}
      {extra && <span className="text-[12.5px] text-texto-3">mensagem extra</span>}
    </button>
  );
}
