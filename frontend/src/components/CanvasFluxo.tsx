import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Lock, ShieldAlert } from 'lucide-react';
import { COMANDOS, DESVIOS, ETAPAS, etapaDaExtra, LIGACOES, SEGURANCA, TRILHO, type Etapa, type MensagemExtra, type Ponto } from '../fluxoBot';
import { type EstadoTrilho } from './TrilhoFluxo';

export interface EstadoCanvas extends EstadoTrilho {
  posicoes: Record<string, Ponto>;
  extras: MensagemExtra[];
  ancoras: string[];
  podeEditar: boolean;
  onMover: (posicoes: Record<string, Ponto>) => void;
  onAdicionar: (antesDe: string) => void;
  onOrelha: (x: number | null) => void;
}

const POR_ID: Record<string, Etapa> = Object.fromEntries(ETAPAS.map((e) => [e.id, e]));
const ANTERIOR: Record<string, string> = { ...Object.fromEntries(TRILHO.slice(1).map((id, i) => [id, TRILHO[i]])), encerrado: 'caminho' };

type Porta = 'direita' | 'esquerda' | 'baixo' | 'cima';
interface Ligacao { de: string; para: string; rotulo?: string; urgente?: boolean; mais?: string }
interface Desenho { caminho: string; meio: Ponto; reta: boolean; lado: 'esquerda' | 'direita' }
interface Origem { left: number; top: number }

function rotuloDe(de: string, para: string) {
  return LIGACOES.find((l) => l.de === de && l.para === para)?.rotulo;
}

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

function desenhoPadrao(largura: number): Record<string, Ponto> {
  const coluna = largura / 6;
  const saida: Record<string, Ponto> = {};
  for (const [id, g] of Object.entries(GRADE)) {
    saida[id] = { x: Math.round(coluna * (g.coluna + 0.5)), y: g.linha === 1 ? 0 : 175 + (g.linha - 2) * 137 };
  }
  return saida;
}

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
  const t = 0.5, u = 1 - t;
  const meio = {
    x: u ** 3 * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * b.x,
    y: u ** 3 * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * b.y,
  };
  const lado = b.x - meio.x > 40 ? 'esquerda' : 'direita';
  return { caminho: `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`, meio, reta: true, lado };
}

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

export function CanvasFluxo(estado: EstadoCanvas) {
  const { selecionada, posicoes, extras, ancoras, onMover, onOrelha } = estado;
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
    extras.forEach((e) => {
      saida[e.id] = posicoes[e.id] ?? lugarDaExtra(saida, extras, e, largo / 6) ?? { x: 200, y: 100 };
    });
    return saida;
  }, [posicoes, largura, extras]);

  const posicaoDe = (id: string) => arrastando[id] ?? lugar[id] ?? { x: 0, y: 0 };

  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const medir = () => setLargura(el.clientWidth);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const base = el.getBoundingClientRect();
    const d: Record<string, Desenho> = {};
    for (const l of ligacoes) {
      const a = blocos.current.get(l.de), b = blocos.current.get(l.para);
      if (a && b) d[`${l.de}->${l.para}`] = desenhar(a, b, base);
    }
    setDesenhos(d);
  }, [ligacoes, arrastando, lugar, largura]);

  useLayoutEffect(() => {
    if (!selecionada) { onOrelha(null); return; }
    const no = blocos.current.get(selecionada);
    const base = canvas.current?.getBoundingClientRect();
    if (!no || !base) { onOrelha(null); return; }
    const r = no.getBoundingClientRect();
    onOrelha(Math.round(r.left + r.width / 2 - base.left));
  }, [selecionada, arrastando, lugar, largura, onOrelha]);

  const registrar = (id: string) => (no: HTMLElement | null) => {
    if (no) blocos.current.set(id, no);
    else blocos.current.delete(id);
  };

  const mover = (id: string, p: Ponto) => {
    const novas = { ...posicoes, [id]: { x: Math.max(70, Math.round(p.x)), y: Math.max(0, Math.round(p.y)) } };
    onMover(novas);
  };

  const etapasExtras = extras.map((e) => ({ ...etapaDaExtra(e), extra: true }));
  const todas = [...ETAPAS, ...etapasExtras];

  return (
    <div ref={canvas} className="flex flex-col gap-6">
      <div className="relative min-h-[360px] w-full overflow-hidden">
        <div ref={area} className="relative min-h-[340px] w-full">
          <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
            <defs>
              <marker id="seta-neon" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--color-marca)" />
              </marker>
              <marker id="seta-urgente" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--color-urgente)" />
              </marker>
            </defs>
            {ligacoes.map((l) => {
              const chave = `${l.de}->${l.para}`;
              const d = desenhos[chave];
              if (!d) return null;
              return (
                <g key={chave}>
                  <path
                    d={d.caminho}
                    fill="none"
                    stroke={l.urgente ? 'var(--color-urgente)' : 'var(--color-marca)'}
                    strokeWidth={l.urgente ? 2.5 : 2}
                    strokeDasharray={l.urgente ? '4 4' : 'none'}
                    markerEnd={`url(#${l.urgente ? 'seta-urgente' : 'seta-neon'})`}
                    className="opacity-75 transition-all duration-200"
                  />
                  {l.rotulo && (
                    <text
                      x={d.meio.x}
                      y={d.meio.y - 6}
                      textAnchor="middle"
                      fill="var(--color-texto-2)"
                      className="text-[12px] font-semibold select-none"
                    >
                      {l.rotulo}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {todas.filter((e) => !SEGURANCA.includes(e.id) && !COMANDOS.includes(e.id)).map((e) => {
            const p = posicaoDe(e.id);
            return (
              <div
                key={e.id}
                style={{ position: 'absolute', left: `${p.x}px`, top: `${p.y}px`, transform: 'translate(-50%, 0)' }}
              >
                <Bloco
                  {...estado}
                  id={e.id}
                  etapa={e}
                  tamanho={TRILHO.includes(e.id) ? 'grande' : 'medio'}
                  ref={registrar(e.id)}
                  extra={e.id.startsWith('extra_')}
                  lugar={lugar}
                  setArrastando={setArrastando}
                  mover={mover}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Faixas de Segurança & Comandos */}
      <div className="grid gap-4 sm:grid-cols-2 border-t border-linha pt-4">
        <div className="rounded-xl border border-urgente/30 bg-urgente-fundo p-4">
          <div className="flex items-center gap-2 text-urgente-forte mb-3">
            <ShieldAlert className="size-4" />
            <span className="text-[13px] font-bold uppercase">Trilho de Proteção e Violência</span>
          </div>
          <div className="flex gap-4">
            {SEGURANCA.map((id) => {
              const e = POR_ID[id];
              return (
                <Bloco
                  key={id}
                  {...estado}
                  id={id}
                  etapa={e}
                  tamanho="pequeno"
                  fixo
                  lugar={{}}
                  setArrastando={() => {}}
                  mover={() => {}}
                />
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-linha bg-elevada/50 p-4">
          <span className="text-[13px] font-semibold text-texto-2 uppercase block mb-3">Comandos Especiais do Cidadão</span>
          <div className="flex gap-4">
            {COMANDOS.map((id) => {
              const e = POR_ID[id];
              return (
                <Bloco
                  key={id}
                  {...estado}
                  id={id}
                  etapa={e}
                  tamanho="pequeno"
                  fixo
                  lugar={{}}
                  setArrastando={() => {}}
                  mover={() => {}}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const TAMANHO = {
  grande: { bloco: 'size-16', icone: 'size-7', largura: 'w-[136px]' },
  medio: { bloco: 'size-14', icone: 'size-6', largura: 'w-[128px]' },
  pequeno: { bloco: 'size-11', icone: 'size-5', largura: 'w-[104px]' },
};

interface PropsBloco extends EstadoCanvas {
  id: string;
  etapa: Etapa;
  tamanho: keyof typeof TAMANHO;
  ref?: (no: HTMLElement | null) => void;
  extra?: boolean;
  fixo?: boolean;
  lugar: Record<string, Ponto>;
  setArrastando: (p: Record<string, Ponto>) => void;
  mover: (id: string, p: Ponto) => void;
}

function Bloco({ id, etapa, tamanho, ref, extra, fixo, selecionada, contagem, puladas, onAbrir, podeEditar,
  lugar, setArrastando, mover }: PropsBloco) {
  const ativa = selecionada === id;
  const pulada = puladas[id];
  const n = contagem[id] ?? 0;
  const urgente = etapa.tipo === 'urgente' || id === 'fila_urgente';
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
    soltouAgora.current = true;
    setEmArraste(false);
    mover(id, { x: t0.origem.x + e.clientX - t0.x, y: t0.origem.y + e.clientY - t0.y });
    setArrastando({});
  };
  const cancelar = () => {
    toque.current = null;
    setEmArraste(false);
    setArrastando({});
  };

  const moldura = ativa
    ? 'border-marca bg-marca text-white shadow-md ring-2 ring-marca/40 scale-105'
    : pulada
      ? 'border-dashed border-linha-forte bg-elevada text-texto-3'
      : urgente
        ? 'border-urgente/50 bg-urgente-fundo text-urgente-forte shadow-sm hover:border-urgente'
        : extra
          ? 'border-marca/40 bg-marca-bg text-marca hover:border-marca'
          : 'border-linha bg-superficie text-texto hover:border-marca/40 hover:bg-elevada shadow-sm';

  return (
    <button
      type="button"
      aria-pressed={ativa}
      onClick={() => {
        if (soltouAgora.current) { soltouAgora.current = false; return; }
        onAbrir(id);
      }}
      onPointerDown={descer}
      onPointerMove={andar}
      onPointerUp={subir}
      onPointerCancel={cancelar}
      className={`group flex select-none flex-col items-center gap-2 text-center transition-all cursor-pointer ${t.largura} ${
        arrastavel ? `touch-none ${emArraste ? 'cursor-grabbing' : 'cursor-grab'}` : ''
      }`}
    >
      <span
        ref={ref}
        className={`relative flex items-center justify-center rounded-2xl border transition-all duration-200 ${t.bloco} ${moldura}`}
      >
        <Icone className={t.icone} aria-hidden />
        {n > 0 && (
          <span className="absolute -right-2 -top-2 min-w-5 rounded-full bg-marca px-1 text-[11px] font-bold leading-4 tabular text-white shadow-md">
            {n}
          </span>
        )}
        {etapa.travada && !ativa && (
          <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border border-linha bg-superficie text-texto-3">
            <Lock className="size-2.5" />
          </span>
        )}
      </span>

      <span className={`line-clamp-2 text-[12.5px] font-semibold leading-tight ${
        ativa ? 'text-marca' : pulada ? 'text-texto-3' : urgente ? 'text-urgente-forte' : 'text-texto-2 group-hover:text-texto'
      }`}>
        {etapa.titulo}
      </span>
    </button>
  );
}
