import { useEffect, useRef, useState } from 'react';
import { BellOff, BellRing, ChevronRight, ShieldAlert } from 'lucide-react';
import type { Triagem } from '../tipos';

export const ALERTA_URGENTE_MIN = 10;
const REPETIR_SOM_MIN = 3;
const CHAVE_SOM = 'alerta_urgente_som';

function lerSom() {
  try { return localStorage.getItem(CHAVE_SOM) === '1'; } catch { return false; }
}

function tocar() {
  try {
    const ctx = new AudioContext();
    [0, 0.28].forEach((atraso, i) => {
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.frequency.value = i === 0 ? 880 : 660;
      vol.gain.setValueAtTime(0.0001, ctx.currentTime + atraso);
      vol.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + atraso + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + atraso + 0.22);
      osc.connect(vol).connect(ctx.destination);
      osc.start(ctx.currentTime + atraso);
      osc.stop(ctx.currentTime + atraso + 0.25);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch {
    /* sem áudio no navegador */
  }
}

/** Faixa no topo de todas as telas quando um caso de violência espera demais, com som opcional. */
export function AlertaUrgente({ triagens, minutos = 10 }: { triagens: Triagem[]; minutos?: number }) {
  const [agora, setAgora] = useState(() => Date.now());
  const [som, setSom] = useState(lerSom);
  const ultimoSom = useRef(0);
  const quantosAntes = useRef(0);

  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 20_000);
    return () => clearInterval(id);
  }, []);

  const parados = triagens
    .filter((t) => t.status === 'URGENTE_CREAS')
    .map((t) => ({ t, minutos: Math.floor((agora - new Date(t.criado_em).getTime()) / 60_000) }))
    .filter((p) => p.minutos >= minutos)
    .sort((a, b) => b.minutos - a.minutos);
  const n = parados.length;

  useEffect(() => {
    const original = document.title.replace(/^\(\d+\) Urgente parado · /, '');
    document.title = n ? `(${n}) Urgente parado · ${original}` : original;
    return () => { document.title = original; };
  }, [n]);

  useEffect(() => {
    if (!som || !n) { quantosAntes.current = n; return; }
    const novo = n > quantosAntes.current;
    const tempo = Date.now() - ultimoSom.current > REPETIR_SOM_MIN * 60_000;
    if (novo || tempo) {
      tocar();
      ultimoSom.current = Date.now();
    }
    quantosAntes.current = n;
  }, [n, som, agora]);

  const alternarSom = () => {
    const novo = !som;
    setSom(novo);
    try { localStorage.setItem(CHAVE_SOM, novo ? '1' : '0'); } catch { /* silêncio */ }
    if (novo) tocar();
  };

  if (!n) return null;
  const maisAntigo = parados[0].minutos;
  const espera = maisAntigo >= 60 ? `${Math.floor(maisAntigo / 60)}h ${maisAntigo % 60}m` : `${maisAntigo} min`;

  return (
    <div 
      role="alert" 
      className="mb-8 relative overflow-hidden rounded-2xl border border-rose-500/30 bg-superficie p-4 md:px-6 md:py-4 shadow-sm transition-all duration-300 ring-1 ring-rose-500/10"
    >
      <div className="absolute top-0 left-0 h-full w-1.5 bg-rose-600" />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400">
            <ShieldAlert className="size-5 shrink-0" aria-hidden />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-texto tracking-tight">
                {n === 1 ? '1 Caso Crítico de Violência' : `${n} Casos Críticos de Violência`} Aguardando Atendimento
              </span>
              <span className="mono text-[11px] font-semibold bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 px-2.5 py-0.5 rounded-full">
                Espera: {espera}
              </span>
            </div>
            <p className="text-[13px] text-texto-2 mt-0.5">
              Protocolo de segurança: assuma o atendimento para iniciar acolhimento imediato e silenciar a IA.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            type="button" 
            onClick={alternarSom} 
            aria-pressed={som}
            className="inline-flex h-9 items-center gap-2 rounded-xl px-3.5 text-[13px] font-medium border border-linha bg-superficie text-texto-2 hover:bg-elevada hover:text-texto transition-all duration-150 cursor-pointer shadow-xs"
          >
            {som ? <BellRing className="size-3.5 text-rose-600 dark:text-rose-400" aria-hidden /> : <BellOff className="size-3.5 text-texto-3" aria-hidden />}
            {som ? 'Som ativo' : 'Ativar som'}
          </button>
          <a 
            href="#/fila" 
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 px-4 text-[13.5px] font-semibold text-white shadow-sm active:scale-95 transition-all duration-150"
          >
            Atender Agora
            <ChevronRight className="size-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
