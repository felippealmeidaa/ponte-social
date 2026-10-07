import { useEffect, useRef, useState } from 'react';
import { BellOff, BellRing, ShieldAlert } from 'lucide-react';
import type { Triagem } from '../tipos';

// Caso de violência sem ninguém atendendo há mais que o tempo do alerta (configurável pela coordenação, padrão 10 min):
// o painel inteiro avisa (princípio 1: urgência primeiro)
const REPETIR_SOM_MIN = 3;
const CHAVE_SOM = 'alerta_urgente_som';

function lerSom() {
  try { return localStorage.getItem(CHAVE_SOM) === '1'; } catch { return false; }
}

/** Dois toques curtos, sem arquivo de som (o navegador só deixa tocar depois de um clique na página). */
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
    /* sem áudio no navegador: fica só o aviso na tela */
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

  // Título da aba avisa mesmo com o painel em segundo plano
  useEffect(() => {
    const original = document.title.replace(/^\(\d+\) Urgente parado · /, '');
    document.title = n ? `(${n}) Urgente parado · ${original}` : original;
    return () => { document.title = original; };
  }, [n]);

  // Som: quando aparece um caso novo parado e, enquanto houver, de tempos em tempos
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
    try { localStorage.setItem(CHAVE_SOM, novo ? '1' : '0'); } catch { /* fica só nesta aba */ }
    if (novo) tocar(); // confirma que o som funciona (e libera o áudio no navegador)
  };

  if (!n) return null;
  const maisAntigo = parados[0].minutos;
  const espera = maisAntigo >= 60 ? `${Math.floor(maisAntigo / 60)} h ${maisAntigo % 60} min` : `${maisAntigo} min`;

  return (
    <div role="alert" className="nao-imprimir mb-7 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[4px] bg-alerta px-4 py-3 text-sobre-alerta md:px-5">
      <p className="flex min-w-0 grow basis-[26rem] items-center gap-3 text-[15px] leading-snug">
        <ShieldAlert className="size-5 shrink-0" aria-hidden />
        <span>
          <strong className="font-semibold">
            {n === 1 ? '1 caso de violência passou' : `${n} casos de violência passaram`} de {minutos} min sem ninguém atendendo
          </strong>
          {n === 1 ? ` há ${espera}.` : ` (o mais antigo há ${espera}).`} Abra a ficha e marque “Em atendimento” quando alguém assumir.
        </span>
      </p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={alternarSom} aria-pressed={som}
          className="inline-flex h-9 items-center gap-1.5 rounded-[3px] px-3 text-[13.5px] text-sobre-alerta/90 transition-colors duration-150 hover:bg-sobre-alerta/15 hover:text-sobre-alerta">
          {som ? <BellRing className="size-4" aria-hidden /> : <BellOff className="size-4" aria-hidden />}
          {som ? 'Som ligado' : 'Ligar som'}
        </button>
        <a href="#/fila" className="inline-flex h-9 items-center rounded-[3px] bg-superficie px-3.5 text-[14px] font-semibold text-urgente transition-colors duration-150 hover:bg-urgente-fundo">
          Ver na fila
        </a>
      </div>
    </div>
  );
}
