import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Circle, CircleDot, Clock, Info, Loader2, ShieldAlert, X, Archive, type LucideIcon } from 'lucide-react';
import type { Tom } from '../vocabulario';

type Variante = 'primario' | 'secundario' | 'fantasma' | 'perigo';

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-ambar text-[#1b1406] hover:bg-[#ffd47a] font-semibold',
  secundario: 'bg-transparent text-texto border border-linha-forte hover:border-texto-3 hover:bg-elevada',
  fantasma: 'bg-transparent text-texto-2 hover:text-texto hover:bg-elevada',
  perigo: 'bg-transparent text-urgente border border-urgente/50 hover:bg-urgente-fundo',
};

export function Botao({
  variante = 'secundario',
  icone: Icone,
  carregando,
  tamanho = 'md',
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; icone?: LucideIcon; carregando?: boolean; tamanho?: 'sm' | 'md' }) {
  const medidas = tamanho === 'sm' ? 'h-8 px-3 text-[13px] gap-1.5' : 'h-10 px-4 text-sm gap-2';
  return (
    <button
      {...props}
      disabled={props.disabled || carregando}
      className={`inline-flex items-center justify-center rounded-lg whitespace-nowrap transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${medidas} ${VARIANTES[variante]} ${className}`}
    >
      {carregando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icone && <Icone className="size-4 shrink-0" aria-hidden />}
      {children}
    </button>
  );
}

const TONS: Record<Tom, { classe: string; icone: LucideIcon }> = {
  urgente: { classe: 'bg-urgente-fundo text-urgente border-urgente/40', icone: ShieldAlert },
  alta: { classe: 'bg-[#2b1d10] text-alta border-alta/35', icone: AlertTriangle },
  media: { classe: 'bg-elevada text-texto border-linha-forte', icone: CircleDot },
  ambar: { classe: 'bg-ambar-escuro text-ambar border-ambar/30', icone: Clock },
  info: { classe: 'bg-info-fundo text-info border-info/30', icone: Circle },
  ok: { classe: 'bg-ok-fundo text-ok border-ok/30', icone: CheckCircle2 },
  neutro: { classe: 'bg-elevada text-texto-2 border-linha-forte', icone: Archive },
};

export function Selo({ tom, children, semIcone }: { tom: Tom; children: ReactNode; semIcone?: boolean }) {
  const { classe, icone: Icone } = TONS[tom];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${classe}`}>
      {!semIcone && <Icone className="size-3.5" aria-hidden />}
      {children}
    </span>
  );
}

export function TituloFileira({ children, contagem, id }: { children: ReactNode; contagem?: number; id?: string }) {
  return (
    <h2 id={id} className="font-display text-[28px] leading-none tracking-[0.08em] text-texto flex items-baseline gap-3">
      {children}
      {contagem !== undefined && <span className="font-sans text-sm tracking-normal text-texto-3 tabular">{contagem}</span>}
    </h2>
  );
}

export function TituloPagina({ titulo, descricao, acoes }: { titulo: string; descricao?: string; acoes?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="font-display text-[44px] leading-[0.95] tracking-[0.03em]">{titulo}</h1>
        {descricao && <p className="text-texto-2 mt-2 max-w-[70ch]">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </header>
  );
}

export function Aviso({ tom = 'urgente', children }: { tom?: 'urgente' | 'info' | 'ok'; children: ReactNode }) {
  const estilo = { urgente: 'border-urgente/40 bg-urgente-fundo text-[#ffb3ad]', info: 'border-info/30 bg-info-fundo text-[#c3d6ff]', ok: 'border-ok/30 bg-ok-fundo text-[#a8e8c8]' }[tom];
  const Icone = { urgente: AlertTriangle, info: Info, ok: CheckCircle2 }[tom];
  return (
    <div role={tom === 'urgente' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${estilo}`}>
      <Icone className="size-4 mt-0.5 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function Vazio({ icone: Icone, titulo, children }: { icone: LucideIcon; titulo: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-linha-forte px-6 py-8 text-texto-2">
      <Icone className="size-6 text-texto-3" aria-hidden />
      <p className="text-texto font-medium">{titulo}</p>
      {children && <div className="text-sm max-w-[60ch]">{children}</div>}
    </div>
  );
}

export function Esqueleto({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-elevada ${className}`} aria-hidden />;
}

export function Campo({ rotulo, dica, children, id }: { rotulo: string; dica?: string; children: ReactNode; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-texto-2">{rotulo}</label>
      {children}
      {dica && <p className="text-xs text-texto-3">{dica}</p>}
    </div>
  );
}

export const classeEntrada =
  'w-full rounded-lg border border-linha-forte bg-fundo px-3 py-2 text-sm text-texto transition-colors duration-150 hover:border-texto-3 focus:border-ambar focus:outline-none';

/** Painel lateral para trabalhar um item sem perder a lista de vista. Esc fecha. */
export function PainelLateral({ aberto, titulo, onFechar, children, largura = 'max-w-xl' }: {
  aberto: boolean; titulo: string; onFechar: () => void; children: ReactNode; largura?: string;
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
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/55" onClick={onFechar} aria-hidden />
      <aside
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`relative h-full w-full ${largura} overflow-y-auto border-l border-linha bg-superficie shadow-[-24px_0_48px_-24px_rgb(0_0_0/0.7)] focus:outline-none animate-[entrar_220ms_var(--ease-saida)]`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-linha bg-superficie/95 px-6 py-4 backdrop-blur">
          <h2 className="font-display text-[26px] leading-none tracking-[0.04em]">{titulo}</h2>
          <Botao variante="fantasma" tamanho="sm" icone={X} onClick={onFechar} aria-label="Fechar">Fechar</Botao>
        </div>
        <div className="px-6 py-5">{children}</div>
      </aside>
    </div>
  );
}
