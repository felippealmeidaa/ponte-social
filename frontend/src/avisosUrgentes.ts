import { useEffect, useRef, useState } from 'react';
import type { Triagem } from './tipos';

// Lógica dos avisos no computador (notificações do sistema) para casos de violência. Ver components/AvisosNavegador.tsx.

export const CHAVE_AVISOS = 'avisos_navegador';

/** Liga/desliga os avisos, lembrando a escolha neste navegador. */
export function useAvisosLigados(): [boolean, (v: boolean) => void] {
  return useState(ligadoSalvo);
}

function ligadoSalvo() {
  try { return localStorage.getItem(CHAVE_AVISOS) === '1' && typeof Notification !== 'undefined' && Notification.permission === 'granted'; } catch { return false; }
}

export function notificar(titulo: string, corpo: string, tag: string) {
  try {
    const n = new Notification(titulo, { body: corpo, tag, requireInteraction: true });
    n.onclick = () => { window.focus(); window.location.hash = '#/fila'; n.close(); };
  } catch {
    /* navegador sem notificação: fica a faixa e o som */
  }
}

/** Observa a fila e avisa o computador. Fica montado o tempo todo (no cabeçalho). */
export function useAvisosUrgentes(triagens: Triagem[], minutosAlerta: number, ligado: boolean) {
  const conhecidos = useRef<Set<string> | null>(null);
  const avisadosParados = useRef(new Set<string>());
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const urgentes = triagens.filter((t) => t.status === 'URGENTE_CREAS');
    if (conhecidos.current === null) {
      conhecidos.current = new Set(urgentes.map((t) => t.id)); // o que já estava na fila ao abrir não é "novo"
      return;
    }
    for (const t of urgentes) {
      if (!conhecidos.current.has(t.id)) {
        conhecidos.current.add(t.id);
        if (ligado) notificar('Novo caso de violência', 'Chegou agora um caso urgente na Fila. Clique para abrir.', `novo-${t.id}`);
      }
      const minutos = Math.floor((agora - new Date(t.criado_em).getTime()) / 60_000);
      if (minutos >= minutosAlerta && !avisadosParados.current.has(t.id)) {
        avisadosParados.current.add(t.id);
        if (ligado) notificar('Caso de violência sem atendimento', `Esperando há ${minutos} min. Abra a ficha e marque “Em atendimento”.`, `parado-${t.id}`);
      }
    }
  }, [triagens, agora, minutosAlerta, ligado]);
}
