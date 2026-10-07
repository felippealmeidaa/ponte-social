import { useEffect, useRef } from 'react';
import { endereco, type GrupoMenu, type itemAtual } from '../menu';

// Cabeçalho das telas de um grupo do menu (Acompanhamento, Bot do WhatsApp, Gestão): o título é o do grupo e as
// abas são só os itens dele, as mesmas entradas do menu ☰. Assim Gestão não aparece misturada com o bot ou com a IA.
export function CabecalhoGrupo({ grupos, aqui }: { grupos: GrupoMenu[]; aqui: ReturnType<typeof itemAtual> }) {
  const barra = useRef<HTMLElement>(null);
  const grupo = grupos.find((g) => g.titulo === aqui?.grupo);

  // No celular a barra rola de lado: ao trocar de tela, mostra a aba atual rolando só a barra (nunca a página)
  useEffect(() => {
    const el = barra.current, ativa = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (el && ativa && (ativa.offsetLeft < el.scrollLeft || ativa.offsetLeft + ativa.offsetWidth > el.scrollLeft + el.clientWidth)) {
      el.scrollLeft = ativa.offsetLeft - 16;
    }
  }, [aqui?.item]);

  if (!grupo) return null;
  const Icone = grupo.icone;
  return (
    <header className="nao-imprimir mb-6">
      <h1 className="titulo flex items-center gap-2.5 text-[26px] leading-[1.05]">
        <Icone className="size-6 text-texto-2" aria-hidden />{grupo.titulo}
      </h1>
      <p className="mt-1 text-[14px] text-texto-2">{grupo.resumo}</p>
      <nav ref={barra} aria-label={grupo.titulo} className="relative mt-4 flex gap-1 overflow-x-auto border-b border-linha">
        {grupo.itens.map((i) => {
          const ativa = aqui?.item === i.rotulo;
          return (
            <a key={i.rotulo} href={endereco(i.rota, i.parametro)} aria-current={ativa ? 'page' : undefined}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ${ativa ? 'border-caneta font-semibold text-texto' : 'border-transparent text-texto-2 hover:text-texto'}`}>
              {i.rotulo}
            </a>
          );
        })}
      </nav>
    </header>
  );
}
