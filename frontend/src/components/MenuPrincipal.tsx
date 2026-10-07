import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Pin, X } from 'lucide-react';
import type { Rota } from '../navegacao';
import { endereco, itemAtual, type GrupoMenu } from '../menu';

// Gaveta do menu principal, aberta pelo botão ☰ do cabeçalho. Os grupos e itens estão em menu.ts.
// Na gaveta ficam só os tópicos; as opções abrem embaixo do tópico. Com mouse, passar por cima abre
// e clicar deixa fixo (pode haver mais de um fixo). No celular (sem mouse), o toque abre e fecha.

const COM_MOUSE = '(hover: hover) and (pointer: fine) and (min-width: 768px)';

function useComMouse() {
  const [sim, setSim] = useState(() => { try { return window.matchMedia(COM_MOUSE).matches; } catch { return false; } });
  useEffect(() => {
    let mq: MediaQueryList;
    try { mq = window.matchMedia(COM_MOUSE); } catch { return; }
    const mudou = () => setSim(mq.matches);
    mq.addEventListener('change', mudou);
    return () => mq.removeEventListener('change', mudou);
  }, []);
  return sim;
}

function Contagem({ n, urgente }: { n?: number; urgente?: boolean }) {
  if (!n) return null;
  return (
    <span className={`ml-auto rounded-full px-2 text-[12px] font-bold leading-[20px] tabular ${urgente ? 'bg-urgente text-sobre-alerta' : 'bg-elevada text-texto-2'}`}>
      {n}
    </span>
  );
}

/** As telas de um tópico (com os subitens da fila), igual no painel ao lado e na lista do celular. */
function Opcoes({ grupo, atual }: { grupo: GrupoMenu; atual: ReturnType<typeof itemAtual> }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {grupo.itens.map((i) => {
        const ativo = atual?.grupo === grupo.titulo && atual.item === i.rotulo && !atual.sub;
        const Icone = i.icone;
        return (
          <li key={i.rotulo}>
            <a href={endereco(i.rota, i.parametro)} aria-current={ativo ? 'page' : undefined}
              className={`relative flex items-center gap-3 rounded-[3px] px-3 py-2.5 text-[15px] ${ativo ? 'bg-caneta-fundo font-semibold text-texto' : 'text-texto-2 hover:bg-elevada hover:text-texto'}`}>
              {ativo && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-acao" aria-hidden />}
              <Icone className="size-[18px] shrink-0" aria-hidden />
              {i.rotulo}
              <Contagem n={i.contagem} urgente={i.urgente} />
            </a>
            {i.subitens && (
              <ul className="mb-1 ml-[1.35rem] mt-0.5 flex flex-col gap-0.5 border-l border-linha pl-3">
                {i.subitens.map((s) => {
                  const subAtivo = atual?.item === i.rotulo && atual.sub === s.rotulo;
                  return (
                    <li key={s.rotulo}>
                      <a href={endereco(s.rota, s.parametro)} aria-current={subAtivo ? 'page' : undefined}
                        className={`flex items-center gap-2 rounded-[3px] px-3 py-1.5 text-[14px] ${subAtivo ? 'bg-caneta-fundo font-semibold text-texto' : 'text-texto-2 hover:bg-elevada hover:text-texto'}`}>
                        {s.rotulo}
                        <Contagem n={s.contagem} urgente={s.urgente} />
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// Soma do que pede atenção no tópico (urgentes, mensagens novas), para aparecer mesmo com o tópico fechado
function alerta(g: GrupoMenu) {
  let n = 0, urgente = false;
  for (const i of g.itens) {
    for (const x of [i, ...(i.subitens ?? [])]) {
      if (x.urgente) { n += x.contagem ?? 0; urgente = true; }
    }
    if (i.rota === 'conversas') n += i.contagem ?? 0;
  }
  return { n, urgente };
}

export function GavetaMenu({ aberto, onFechar, grupos, rota, parametro, rodape }: {
  aberto: boolean; onFechar: () => void; grupos: GrupoMenu[]; rota: Rota; parametro?: string; rodape?: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const atual = itemAtual(grupos, rota, parametro);
  const comMouse = useComMouse();
  // Tópicos fixados por clique e o tópico sob o mouse (só abre se o mouse parar um instante nele)
  const [fixados, setFixados] = useState<Set<string>>(() => new Set());
  const [sobMouse, setSobMouse] = useState<string | null>(null);
  const espera = useRef<number | undefined>(undefined);
  const exibido = (titulo: string) => fixados.has(titulo) || (comMouse && sobMouse === titulo);

  const passar = (titulo: string | null) => {
    window.clearTimeout(espera.current);
    espera.current = window.setTimeout(() => setSobMouse(titulo), titulo ? 140 : 260);
  };
  const alternar = (titulo: string) => {
    setFixados((atual) => {
      const novo = new Set(atual);
      if (novo.has(titulo)) novo.delete(titulo); else novo.add(titulo);
      return novo;
    });
    setSobMouse(null);
  };

  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('[data-topico-atual]')?.focus();
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', aoTeclar);
    // Ao escolher uma tela o endereço muda: fecha a gaveta
    window.addEventListener('hashchange', onFechar);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', aoTeclar);
      window.removeEventListener('hashchange', onFechar);
      document.body.style.overflow = '';
      window.clearTimeout(espera.current);
      anterior?.focus();
    };
  }, [aberto, onFechar]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-veu/45" onClick={onFechar} aria-hidden />
      <div className="relative flex h-full">
        <nav
          ref={ref}
          id="menu-principal"
          tabIndex={-1}
          aria-label="Menu principal"
          className="relative z-10 flex h-full w-[min(20rem,86vw)] flex-col overflow-y-auto border-r border-linha bg-superficie shadow-[20px_0_40px_-20px_rgb(27_39_51/0.45)] focus:outline-none animate-[entrar-esquerda_200ms_var(--ease-saida)]"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-linha bg-superficie px-5 py-4">
            <p className="titulo text-[20px]">Menu</p>
            <button type="button" onClick={onFechar} aria-label="Fechar menu"
              className="rounded-[3px] p-1.5 text-texto-2 hover:bg-elevada hover:text-texto">
              <X className="size-5" aria-hidden />
            </button>
          </div>

          <ul className="flex flex-1 flex-col gap-1 px-3 py-4">
            {grupos.map((g) => {
              const Icone = g.icone;
              const aqui = atual?.grupo === g.titulo;
              const aberto = exibido(g.titulo);
              const fixo = fixados.has(g.titulo);
              const { n, urgente } = alerta(g);
              return (
                <li key={g.titulo} onMouseEnter={() => comMouse && passar(g.titulo)} onMouseLeave={() => comMouse && passar(null)}>
                  <button type="button" aria-expanded={aberto} aria-controls={`opcoes-${g.titulo}`}
                    data-topico-atual={aqui || undefined}
                    onClick={() => alternar(g.titulo)}
                    className={`relative flex w-full items-center gap-3 rounded-[3px] px-3 py-3 text-left ${aberto ? 'bg-elevada' : 'hover:bg-elevada'}`}>
                    {aqui && !aberto && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-acao" aria-hidden />}
                    <Icone className={`size-5 shrink-0 ${aqui ? 'text-acao' : 'text-texto-2'}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[15.5px] ${aqui ? 'font-semibold text-texto' : 'font-medium text-texto'}`}>{g.titulo}</span>
                      <span className="block text-[12.5px] leading-snug text-texto-3">{aqui && atual ? `Você está em: ${atual.sub ?? atual.item}` : g.resumo}</span>
                    </span>
                    {n > 0 && <Contagem n={n} urgente={urgente} />}
                    {fixo && comMouse && <Pin className="size-3.5 shrink-0 text-caneta" aria-label="fixado aberto" />}
                    <ChevronDown className={`size-4 shrink-0 text-texto-3 transition-transform duration-150 ${aberto ? 'rotate-180 text-texto' : ''}`} aria-hidden />
                  </button>
                  {aberto && (
                    <div id={`opcoes-${g.titulo}`} className="assentar mb-2 ml-[1.3rem] mt-1 border-l border-linha pl-2">
                      <Opcoes grupo={g} atual={atual} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {rodape && <div className="border-t border-linha px-5 py-4">{rodape}</div>}
        </nav>

      </div>
    </div>
  );
}
