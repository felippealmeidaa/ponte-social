import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

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

  useEffect(() => {
    aplicar(tema);
  }, [tema]);

  const alternar = () => {
    const novo: Tema = tema === 'escuro' ? 'claro' : 'escuro';
    aplicar(novo);
    setTema(novo);
    try { localStorage.setItem(CHAVE, novo); } catch { /* silêncio */ }
  };
  return { tema, alternar };
}

export function BotaoTema({ className = '', compacto = false }: { className?: string; compacto?: boolean; naFaixa?: boolean }) {
  const { tema, alternar } = useTema();
  const escuro = tema === 'escuro';

  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={escuro}
      title={escuro ? 'Mudar para o Modo Claro' : 'Mudar para o Modo Escuro'}
      className={`flex h-9 items-center justify-center rounded-xl border border-linha bg-elevada/60 text-texto-2 hover:border-marca/40 hover:bg-marca-bg hover:text-texto transition-all duration-200 cursor-pointer shadow-sm ${
        compacto ? 'w-9' : 'px-3 gap-1.5 text-[13px] font-medium'
      } ${className}`}
    >
      {escuro ? <Sun className="size-4 text-amber-400" aria-hidden /> : <Moon className="size-4 text-marca" aria-hidden />}
      {!compacto && <span>{escuro ? 'Claro' : 'Escuro'}</span>}
    </button>
  );
}
