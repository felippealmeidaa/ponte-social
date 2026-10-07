import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AlertTriangle, Archive, CheckCircle2, Circle, CircleDot, Clock, Info, Loader2, ShieldAlert, X, type LucideIcon } from 'lucide-react';
import type { Tom } from '../vocabulario';

type Variante = 'primario' | 'secundario' | 'fantasma' | 'perigo';

// Ação principal em tinta cheia; o resto não compete com ela
const VARIANTES: Record<Variante, string> = {
  primario: 'bg-acao text-sobre-acao hover:bg-acao-hover font-semibold shadow-[0_1px_0_rgb(27_39_51/0.25)]',
  secundario: 'bg-superficie text-texto border border-linha-forte hover:border-texto-3 hover:bg-elevada',
  fantasma: 'bg-transparent text-texto-2 hover:text-texto hover:bg-elevada',
  perigo: 'bg-superficie text-urgente border border-urgente/45 hover:bg-urgente-fundo',
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
  const medidas = tamanho === 'sm' ? 'h-8 px-3 text-[13px] gap-1.5' : 'h-10 px-4 text-[14.5px] gap-2';
  return (
    <button
      {...props}
      disabled={props.disabled || carregando}
      className={`inline-flex items-center justify-center rounded-[3px] whitespace-nowrap transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${medidas} ${VARIANTES[variante]} ${className}`}
    >
      {carregando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icone && <Icone className="size-4 shrink-0" aria-hidden />}
      {children}
    </button>
  );
}

const TONS: Record<Tom, { classe: string; icone: LucideIcon }> = {
  urgente: { classe: 'bg-urgente-fundo text-urgente border-urgente/35', icone: ShieldAlert },
  alta: { classe: 'bg-alta-fundo text-alta border-alta/30', icone: AlertTriangle },
  media: { classe: 'bg-transparent text-texto-2 border-transparent !px-0 font-medium', icone: CircleDot },
  caneta: { classe: 'bg-caneta-fundo text-caneta border-caneta/25', icone: Clock },
  info: { classe: 'bg-info-fundo text-info border-info/25', icone: Circle },
  ok: { classe: 'bg-ok-fundo text-ok border-ok/25', icone: CheckCircle2 },
  neutro: { classe: 'bg-elevada text-texto-2 border-linha', icone: Archive },
};

export function Selo({ tom, children, semIcone }: { tom: Tom; children: ReactNode; semIcone?: boolean }) {
  const { classe, icone: Icone } = TONS[tom];
  return (
    <span className={`inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[12.5px] font-semibold whitespace-nowrap ${classe}`}>
      {!semIcone && <Icone className="size-3.5" aria-hidden />}
      {children}
    </span>
  );
}

export function TituloFileira({ children, contagem, id }: { children: ReactNode; contagem?: number; id?: string }) {
  return (
    <h2 id={id} className="titulo flex items-baseline gap-3 text-[21px] text-texto">
      {children}
      {contagem !== undefined && <span className="font-sans text-[15px] font-semibold text-texto-3 tabular">{contagem}</span>}
    </h2>
  );
}

export function TituloPagina({ titulo, descricao, acoes }: { titulo: string; descricao?: string; acoes?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="titulo text-[28px]">{titulo}</h1>
        {descricao && <p className="mt-2 max-w-[68ch] text-texto-2">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </header>
  );
}

export function Aviso({ tom = 'urgente', children }: { tom?: 'urgente' | 'info' | 'ok'; children: ReactNode }) {
  const estilo = {
    urgente: 'border-urgente/35 bg-urgente-fundo text-urgente-forte',
    info: 'border-info/25 bg-info-fundo text-info-forte',
    ok: 'border-ok/25 bg-ok-fundo text-ok-forte',
  }[tom];
  const Icone = { urgente: AlertTriangle, info: Info, ok: CheckCircle2 }[tom];
  return (
    <div role={tom === 'urgente' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-[3px] border px-3 py-2.5 text-sm ${estilo}`}>
      <Icone className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function Vazio({ icone: Icone, titulo, children }: { icone: LucideIcon; titulo: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-[4px] border-2 border-dashed border-linha-forte bg-superficie/60 px-6 py-8 text-texto-2">
      <Icone className="size-6 text-texto-3" aria-hidden />
      <p className="font-semibold text-texto">{titulo}</p>
      {children && <div className="max-w-[60ch] text-sm">{children}</div>}
    </div>
  );
}

export function Esqueleto({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-[3px] bg-realce ${className}`} aria-hidden />;
}

/** Campo de formulário: rótulo curto em cima, a linha de preenchimento embaixo. */
export function Campo({ rotulo, dica, children, id }: { rotulo: string; dica?: string; children: ReactNode; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13.5px] font-semibold text-texto-2">{rotulo}</label>
      {children}
      {dica && <p className="text-[12.5px] text-texto-3">{dica}</p>}
    </div>
  );
}

/** Chave liga/desliga. O rótulo fica fora (aria-labelledby), para a frase da opção poder ser longa. */
export function Chave({ id, ligada, onMudar, disabled, rotuloId }: {
  id: string; ligada: boolean; onMudar: (v: boolean) => void; disabled?: boolean; rotuloId: string;
}) {
  return (
    <button id={id} type="button" role="switch" aria-checked={ligada} aria-labelledby={rotuloId} disabled={disabled}
      onClick={() => onMudar(!ligada)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${ligada ? 'border-acao bg-acao' : 'border-linha-forte bg-realce hover:border-texto-3'}`}>
      <span aria-hidden className={`absolute left-0.5 size-[18px] rounded-full bg-white shadow-[0_1px_2px_rgb(27_39_51/0.35)] transition-transform duration-200 ease-[var(--ease-saida)] ${ligada ? 'translate-x-5' : ''}`} />
    </button>
  );
}

/** Escolha entre poucas opções lado a lado (no lugar de um select quando todas cabem à vista). */
export function Segmentado<T extends string>({ valor, opcoes, onMudar, disabled, rotuloId }: {
  valor: T; opcoes: { valor: T; rotulo: string }[]; onMudar: (v: T) => void; disabled?: boolean; rotuloId: string;
}) {
  return (
    <div role="radiogroup" aria-labelledby={rotuloId} className="grid auto-cols-fr grid-flow-col gap-1 rounded-[4px] border border-linha-forte bg-elevada p-1">
      {opcoes.map((o) => (
        <button key={o.valor} type="button" role="radio" aria-checked={valor === o.valor} disabled={disabled}
          onClick={() => onMudar(o.valor)}
          className={`rounded-[4px] px-2 py-1.5 text-[13.5px] leading-tight transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${valor === o.valor ? 'bg-superficie font-semibold text-texto shadow-[0_1px_2px_rgb(27_39_51/0.18)]' : 'text-texto-2 hover:text-texto'}`}>
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

export const classeEntrada =
  'w-full rounded-[3px] border border-linha-forte bg-superficie px-3 py-2 text-[15px] text-texto transition-colors duration-150 hover:border-texto-3 focus:border-caneta focus:outline-none focus:ring-2 focus:ring-caneta/15';

/** Painel lateral: uma folha que entra sobre a mesa para trabalhar um item sem perder a lista. Esc fecha.
 *  Encaixado: fica ao lado do conteúdo (sem véu), e a lista continua usável. */
export function PainelLateral({ aberto, titulo, onFechar, children, largura = 'max-w-xl', encaixado = false }: {
  aberto: boolean; titulo: string; onFechar: () => void; children: ReactNode; largura?: string; encaixado?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    if (!encaixado) ref.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', aoTeclar);
    return () => {
      window.removeEventListener('keydown', aoTeclar);
      if (!encaixado) anterior?.focus();
    };
  }, [aberto, onFechar, encaixado]);

  if (!aberto) return null;
  const cabeca = (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-linha bg-superficie px-5 py-3">
      <h2 className="titulo text-[18px]">{titulo}</h2>
      <Botao variante="fantasma" tamanho="sm" icone={X} onClick={onFechar} aria-label="Fechar">Fechar</Botao>
    </div>
  );
  if (encaixado) {
    return (
      <aside ref={ref} tabIndex={-1} aria-label={titulo}
        className="painel sticky top-4 max-h-[calc(100dvh-2rem)] min-w-0 overflow-y-auto focus:outline-none">
        {cabeca}
        <div className="px-5 py-4">{children}</div>
      </aside>
    );
  }
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-veu/45" onClick={onFechar} aria-hidden />
      <aside
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`relative h-full w-full ${largura} overflow-y-auto border-l border-linha bg-superficie focus:outline-none animate-[entrar_220ms_var(--ease-saida)]`}
      >
        {cabeca}
        <div className="px-6 py-5">{children}</div>
      </aside>
    </div>
  );
}

/** Painel do terminal: bloco com traço fino, barra de título (com uma ação opcional à direita) e corpo. */
export function Painel({ id, titulo, detalhe, acao, children, className = '', semCorpo }: {
  id: string; titulo: ReactNode; detalhe?: ReactNode; acao?: ReactNode; children: ReactNode; className?: string; semCorpo?: boolean;
}) {
  return (
    <section aria-labelledby={id} className={`painel min-w-0 ${className}`}>
      <div className="painel-cabeca">
        <h2 id={id} className="titulo flex min-w-0 items-baseline gap-2.5 text-[16px] text-texto">
          {titulo}
          {detalhe && <span className="font-sans text-[12.5px] font-normal tracking-normal text-texto-3">{detalhe}</span>}
        </h2>
        {acao}
      </div>
      {semCorpo ? children : <div className="painel-corpo">{children}</div>}
    </section>
  );
}

/** Faixa de leitura no topo de uma tela: células lado a lado, como os mostradores de um painel. */
export function FaixaLeitura({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <dl className={`grid grid-cols-2 overflow-hidden rounded-[4px] border border-linha bg-superficie sm:grid-cols-3 lg:grid-cols-5 ${className}`}>
      {children}
    </dl>
  );
}

/** Célula da faixa de leitura: rótulo pequeno, valor em mono; com endereço, leva ao filtro. */
export function Leitura({ rotulo, valor, detalhe, href, urgente }: { rotulo: string; valor: number | string; detalhe?: string; href?: string; urgente?: boolean }) {
  const corpo = (
    <>
      <dt className="flex items-center gap-1.5 text-[12.5px] text-texto-2">
        {urgente && <ShieldAlert className="size-3.5 text-urgente" aria-hidden />}{rotulo}
      </dt>
      <dd className={`dado text-[21px] font-medium leading-tight ${urgente ? 'text-urgente' : 'text-texto'}`}>{valor}</dd>
      {detalhe && <dd className="dado text-[12px] text-texto-3">{detalhe}</dd>}
    </>
  );
  const classe = '-mb-px -mr-px block min-w-0 border-b border-r border-linha px-4 py-2';
  return href
    ? <a href={href} className={`${classe} hover:bg-elevada`}>{corpo}</a>
    : <div className={classe}>{corpo}</div>;
}
