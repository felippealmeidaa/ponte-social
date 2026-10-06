import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

// Modo escuro: segue o computador até a pessoa escolher; a escolha fica neste navegador.
// O index.html aplica o tema antes de a página aparecer (sem piscar branco ao abrir).
const CHAVE = 'ponte_tema';
type Tema = 'claro' | 'escuro';

function escolhido(): Tema | null {
  try {
    const v = localStorage.getItem(CHAVE);
    return v === 'claro' || v === 'escuro' ? v : null;
  } catch {
    return null;
  }
}

function doSistema(): Tema {
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro'; } catch { return 'claro'; }
}

function aplicar(tema: Tema) {
  document.documentElement.dataset.tema = tema;
}

function useTema() {
  const [tema, setTema] = useState<Tema>(() => (document.documentElement.dataset.tema as Tema) || escolhido() || doSistema());

  // Sem escolha feita, acompanha o computador se ele mudar (ex.: modo noturno automático)
  useEffect(() => {
    let mq: MediaQueryList;
    try { mq = window.matchMedia('(prefers-color-scheme: dark)'); } catch { return; }
    const mudou = () => {
      if (escolhido()) return;
      const novo = mq.matches ? 'escuro' : 'claro';
      aplicar(novo);
      setTema(novo);
    };
    mq.addEventListener('change', mudou);
    return () => mq.removeEventListener('change', mudou);
  }, []);

  const alternar = () => {
    const novo: Tema = tema === 'escuro' ? 'claro' : 'escuro';
    aplicar(novo);
    setTema(novo);
    try { localStorage.setItem(CHAVE, novo); } catch { /* vale só até recarregar */ }
  };
  return { tema, alternar };
}

export function BotaoTema({ className = '', compacto = false }: { className?: string; compacto?: boolean }) {
  const { tema, alternar } = useTema();
  const escuro = tema === 'escuro';
  return (
    <button type="button" onClick={alternar} aria-pressed={escuro}
      title={escuro ? 'Voltar para o modo claro' : 'Usar o modo escuro'}
      className={`inline-flex items-center gap-1.5 rounded-[5px] px-2 py-1.5 text-[13.5px] text-texto-2 transition-colors duration-150 hover:bg-superficie hover:text-texto ${className}`}>
      {escuro ? <Sun className={compacto ? 'size-5' : 'size-4'} aria-hidden /> : <Moon className={compacto ? 'size-5' : 'size-4'} aria-hidden />}
      <span className={compacto ? 'sr-only' : ''}>{escuro ? 'Modo claro' : 'Modo escuro'}</span>
    </button>
  );
}
