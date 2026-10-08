import { useEffect, useRef, useState } from 'react';
import { BellOff, BellRing, Clock, ShieldAlert } from 'lucide-react';
import type { Triagem } from '../tipos';

// Caso de violência sem ninguém atendendo há mais que o tempo do alerta (configurável pela coordenação, padrão 10 min):
// uma etiqueta discreta na barra do topo, o título da aba e, se a pessoa ligar, um som curto. Sem faixa e sem popups.
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
    /* sem áudio no navegador: fica só a etiqueta */
  }
}

/** Etiqueta na barra do topo: quantos casos de violência passaram do tempo sem ninguém atendendo. */
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
  const descricao = `${n === 1 ? '1 caso de violência passou' : `${n} casos de violência passaram`} de ${minutos} min sem ninguém atendendo; o mais antigo espera há ${espera}`;

  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <a href="#/fila/URGENTE_CREAS" title={descricao} aria-label={`${descricao}. Ver na fila`}
        className="inline-flex h-7 items-center gap-1.5 rounded-[3px] border border-urgente/50 bg-urgente-fundo px-2 text-[12.5px] font-semibold text-urgente hover:border-urgente">
        <ShieldAlert className="size-3.5 shrink-0" aria-hidden />
        <span className="dado">{n}</span>
        <span className="hidden sm:inline">parado{n > 1 ? 's' : ''} +{minutos} min</span>
      </a>
      <button type="button" onClick={alternarSom} aria-pressed={som} title={som ? 'Som do alerta ligado' : 'Ligar som do alerta'}
        aria-label={som ? 'Desligar som do alerta' : 'Ligar som do alerta'}
        className={`rounded-[3px] p-1.5 hover:bg-sobre-topo/10 ${som ? 'text-urgente' : 'text-sobre-topo-2 hover:text-sobre-topo'}`}>
        {som ? <BellRing className="size-4" aria-hidden /> : <BellOff className="size-4" aria-hidden />}
      </button>
    </span>
  );
}

/** Casos comuns aguardando há mais que "alerta_fila_horas" (Gestão › Alertas; 0 desliga): etiqueta âmbar, sem som.
 *  Violência fica de fora: já tem o alerta próprio, em minutos. */
export function AlertaFila({ triagens, horas }: { triagens: Triagem[]; horas: number }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  if (!horas) return null;
  const esperas = triagens
    .filter((t) => t.status === 'PENDENTE' && t.prioridade !== 'URGENTE_VIOLENCIA')
    .map((t) => (agora - new Date(t.criado_em).getTime()) / 3_600_000)
    .filter((h) => h >= horas);
  const n = esperas.length;
  if (!n) return null;
  const maior = Math.floor(Math.max(...esperas));
  const espera = maior >= 48 ? `${Math.floor(maior / 24)} dias` : `${maior} h`;
  const descricao = `${n === 1 ? '1 caso aguarda' : `${n} casos aguardam`} há mais de ${horas} h sem ninguém atender; o mais antigo espera há ${espera}`;
  return (
    <a href="#/fila/PENDENTE" title={descricao} aria-label={`${descricao}. Ver na fila`}
      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[3px] border border-alta/40 bg-alta-fundo px-2 text-[12.5px] font-semibold text-alta hover:border-alta">
      <Clock className="size-3.5 shrink-0" aria-hidden />
      <span className="dado">{n}</span>
      <span className="hidden sm:inline">aguardando +{horas} h</span>
    </a>
  );
}
