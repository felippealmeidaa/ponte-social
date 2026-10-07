import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { 
  AlertTriangle, 
  Archive, 
  CheckCircle2, 
  Circle, 
  CircleDot, 
  Clock, 
  Loader2, 
  ShieldAlert, 
  Sparkles, 
  X, 
  type LucideIcon 
} from 'lucide-react';
import type { Tom } from '../vocabulario';

type Variante = 'primario' | 'secundario' | 'fantasma' | 'perigo' | 'glow' | 'ai';

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-sky-600 hover:bg-sky-700 text-white font-medium shadow-sm hover:shadow active:scale-[0.98]',
  glow: 'bg-gradient-to-r from-sky-600 to-emerald-600 text-white font-medium shadow-sm hover:shadow-md hover:brightness-105 active:scale-[0.98]',
  ai: 'bg-gradient-to-r from-sky-600 to-indigo-600 text-white font-medium shadow-sm hover:shadow-md hover:brightness-105 active:scale-[0.98]',
  secundario: 'glass-card text-texto border border-linha hover:bg-elevada hover:border-linha-forte font-medium active:scale-[0.98]',
  fantasma: 'bg-transparent text-texto-2 hover:text-texto hover:bg-elevada active:scale-[0.98]',
  perigo: 'bg-rose-600 hover:bg-rose-700 text-white font-medium shadow-sm active:scale-[0.98]',
};

export function Botao({
  variante = 'secundario',
  icone: Icone,
  carregando,
  tamanho = 'md',
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { 
  variante?: Variante; 
  icone?: LucideIcon; 
  carregando?: boolean; 
  tamanho?: 'sm' | 'md' | 'lg';
}) {
  const medidas = {
    sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
    md: 'h-10 px-4 text-[14px] gap-2 rounded-xl',
    lg: 'h-12 px-6 text-[15.5px] gap-2.5 rounded-xl'
  }[tamanho];

  return (
    <button
      {...props}
      disabled={props.disabled || carregando}
      className={`relative inline-flex items-center justify-center whitespace-nowrap transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${medidas} ${VARIANTES[variante]} ${className}`}
    >
      {carregando ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        Icone && <Icone className="size-4 shrink-0 transition-transform duration-200 group-hover:scale-105" aria-hidden />
      )}
      {children}
    </button>
  );
}

const TONS: Record<Tom, { classe: string; icone: LucideIcon; pulso?: boolean }> = {
  urgente: { 
    classe: 'bg-rose-500/15 text-rose-900 dark:text-rose-200 border-rose-500/40 font-semibold', 
    icone: ShieldAlert,
    pulso: true 
  },
  alta: { 
    classe: 'bg-amber-500/15 text-amber-950 dark:text-amber-200 border-amber-500/40 font-semibold', 
    icone: AlertTriangle 
  },
  media: { 
    classe: 'bg-yellow-500/15 text-yellow-950 dark:text-yellow-200 border-yellow-500/40 font-semibold', 
    icone: CircleDot 
  },
  caneta: { 
    classe: 'bg-sky-500/15 text-sky-950 dark:text-sky-200 border-sky-500/40 font-semibold', 
    icone: Clock 
  },
  info: { 
    classe: 'bg-blue-500/15 text-blue-950 dark:text-blue-200 border-blue-500/40 font-semibold', 
    icone: Circle 
  },
  ok: { 
    classe: 'bg-emerald-500/15 text-emerald-950 dark:text-emerald-200 border-emerald-500/40 font-semibold', 
    icone: CheckCircle2 
  },
  neutro: { 
    classe: 'bg-slate-200/70 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700', 
    icone: Archive 
  },
};

export function Selo({ 
  tom, 
  children, 
  semIcone 
}: { 
  tom: Tom; 
  children: ReactNode; 
  semIcone?: boolean;
}) {
  const { classe, icone: Icone, pulso } = TONS[tom];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] tracking-wide whitespace-nowrap ${classe}`}>
      {pulso && (
        <span className="relative flex h-2 w-2 mr-0.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600"></span>
        </span>
      )}
      {!semIcone && !pulso && <Icone className="size-3.5" aria-hidden />}
      {children}
    </span>
  );
}

export function TituloFileira({ children, contagem, id }: { children: ReactNode; contagem?: number; id?: string }) {
  return (
    <h2 id={id} className="titulo flex items-center gap-3 text-[19px] text-texto">
      {children}
      {contagem !== undefined && (
        <span className="mono text-[12px] font-semibold bg-elevada border border-linha text-marca px-2.5 py-0.5 rounded-full tabular">
          {contagem}
        </span>
      )}
    </h2>
  );
}

export function TituloPagina({ 
  titulo, 
  descricao, 
  acoes 
}: { 
  titulo: string; 
  descricao?: string; 
  acoes?: ReactNode 
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-linha pb-6">
      <div>
        <h1 className="titulo text-[26px] md:text-[30px] tracking-tight text-texto">
          {titulo}
        </h1>
        {descricao && <p className="mt-2 max-w-[70ch] text-[14.5px] leading-relaxed text-texto-2">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-3">{acoes}</div>}
    </header>
  );
}

export function Aviso({ 
  tom = 'urgente', 
  children 
}: { 
  tom?: 'urgente' | 'info' | 'ok'; 
  children: ReactNode 
}) {
  const estilo = {
    urgente: 'border-rose-500/40 bg-rose-500/10 text-rose-950 dark:text-rose-100 ring-1 ring-rose-500/10',
    info: 'border-sky-500/40 bg-sky-500/10 text-sky-950 dark:text-sky-100 ring-1 ring-sky-500/10',
    ok: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100 ring-1 ring-emerald-500/10',
  }[tom];
  
  const Icone = { urgente: ShieldAlert, info: Sparkles, ok: CheckCircle2 }[tom];

  return (
    <div role={tom === 'urgente' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-xl border p-4 text-sm font-medium ${estilo}`}>
      <Icone className={`mt-0.5 size-5 shrink-0 ${tom === 'urgente' ? 'text-rose-600 dark:text-rose-400' : tom === 'info' ? 'text-sky-600 dark:text-sky-400' : 'text-emerald-600 dark:text-emerald-400'}`} aria-hidden />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

export function Vazio({ 
  icone: Icone, 
  titulo, 
  children 
}: { 
  icone: LucideIcon; 
  titulo: string; 
  children?: ReactNode 
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 rounded-2xl border border-dashed border-linha bg-superficie p-12 text-texto-2">
      <div className="p-3.5 rounded-2xl bg-marca-fundo border border-marca/20 text-marca">
        <Icone className="size-7" aria-hidden />
      </div>
      <p className="titulo text-[17px] text-texto">{titulo}</p>
      {children && <div className="max-w-[50ch] text-sm text-texto-2 leading-relaxed">{children}</div>}
    </div>
  );
}

export function Esqueleto({ className = '' }: { className?: string }) {
  return <div className={`shimmer rounded-xl border border-linha/50 bg-elevada ${className}`} aria-hidden />;
}

export function Campo({ 
  rotulo, 
  dica, 
  children, 
  id 
}: { 
  rotulo: string; 
  dica?: string; 
  children: ReactNode; 
  id: string; 
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13.5px] font-medium text-texto tracking-wide">{rotulo}</label>
      {children}
      {dica && <p className="text-[12px] text-texto-3">{dica}</p>}
    </div>
  );
}

export function Chave({ 
  id, 
  ligada, 
  onMudar, 
  disabled, 
  rotuloId 
}: { 
  id: string; 
  ligada: boolean; 
  onMudar: (v: boolean) => void; 
  disabled?: boolean; 
  rotuloId: string; 
}) {
  return (
    <button 
      id={id} 
      type="button" 
      role="switch" 
      aria-checked={ligada} 
      aria-labelledby={rotuloId} 
      disabled={disabled}
      onClick={() => onMudar(!ligada)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-all duration-300 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
        ligada ? 'border-sky-500 bg-sky-600 shadow-sm' : 'border-linha-forte bg-slate-300 dark:bg-slate-700'
      }`}
    >
      <span 
        aria-hidden 
        className={`absolute left-0.5 size-5 rounded-full bg-white shadow-md transition-transform duration-300 ease-[var(--ease-saida)] ${
          ligada ? 'translate-x-5' : ''
        }`} 
      />
    </button>
  );
}

export function Segmentado<T extends string>({ 
  valor, 
  opcoes, 
  onMudar, 
  disabled, 
  rotuloId 
}: { 
  valor: T; 
  opcoes: { valor: T; rotulo: string }[]; 
  onMudar: (v: T) => void; 
  disabled?: boolean; 
  rotuloId: string; 
}) {
  return (
    <div role="radiogroup" aria-labelledby={rotuloId} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl border border-linha bg-elevada p-1">
      {opcoes.map((o) => (
        <button 
          key={o.valor} 
          type="button" 
          role="radio" 
          aria-checked={valor === o.valor} 
          disabled={disabled}
          onClick={() => onMudar(o.valor)}
          className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
            valor === o.valor 
              ? 'bg-superficie border border-linha-forte font-semibold text-texto shadow-sm' 
              : 'text-texto-2 hover:text-texto hover:bg-superficie/50'
          }`}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

export const classeEntrada =
  'w-full rounded-xl border border-linha bg-superficie px-4 py-2.5 text-[14px] text-texto placeholder:text-texto-3 transition-all duration-200 hover:border-linha-forte focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/20';

export function PainelLateral({ 
  aberto, 
  titulo, 
  onFechar, 
  children, 
  largura = 'max-w-xl' 
}: { 
  aberto: boolean; 
  titulo: string; 
  onFechar: () => void; 
  children: ReactNode; 
  largura?: string; 
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', aoTeclar);
    return () => {
      window.removeEventListener('keydown', aoTeclar);
      anterior?.focus();
    };
  }, [aberto, onFechar]);

  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300" onClick={onFechar} aria-hidden />
      <aside
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`relative h-full w-full ${largura} overflow-y-auto border-l border-linha glass-panel shadow-2xl focus:outline-none`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-linha bg-superficie px-6 py-4">
          <h2 className="titulo text-[19px] text-texto">{titulo}</h2>
          <Botao variante="fantasma" tamanho="sm" icone={X} onClick={onFechar} aria-label="Fechar">Fechar</Botao>
        </div>
        <div className="px-6 py-6 text-texto">{children}</div>
      </aside>
    </div>
  );
}
