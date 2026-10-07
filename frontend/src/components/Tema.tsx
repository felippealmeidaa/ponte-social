import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';

// Tema: o painel abre no escuro até a pessoa escolher; a escolha fica neste navegador.
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

function aplicar(tema: Tema) {
  document.documentElement.dataset.tema = tema;
}

function useTema() {
  const [tema, setTema] = useState<Tema>(() => (document.documentElement.dataset.tema as Tema) || escolhido() || 'escuro');

  const alternar = () => {
    const novo: Tema = tema === 'escuro' ? 'claro' : 'escuro';
    aplicar(novo);
    setTema(novo);
    try { localStorage.setItem(CHAVE, novo); } catch { /* vale só até recarregar */ }
  };
  return { tema, alternar };
}

export function BotaoTema({ className = '', compacto = false, naFaixa = false }: { className?: string; compacto?: boolean; naFaixa?: boolean }) {
  const { tema, alternar } = useTema();
  const escuro = tema === 'escuro';
  return (
    <button type="button" onClick={alternar} aria-pressed={escuro}
      title={escuro ? 'Voltar para o modo claro' : 'Usar o modo escuro'}
      className={`inline-flex items-center gap-1.5 rounded-[3px] px-2 py-1.5 text-[13.5px] transition-colors duration-150 ${naFaixa
        ? 'text-sobre-topo-2 hover:bg-sobre-topo/10 hover:text-sobre-topo'
        : 'text-texto-2 hover:bg-superficie hover:text-texto'} ${className}`}>
      {escuro ? <Sun className={compacto ? 'size-5' : 'size-4'} aria-hidden /> : <Moon className={compacto ? 'size-5' : 'size-4'} aria-hidden />}
      <span className={compacto ? 'sr-only' : ''}>{escuro ? 'Modo claro' : 'Modo escuro'}</span>
    </button>
  );
}
