import { useCallback, useEffect, useState } from 'react';
import { BarChart3, ListOrdered, LogOut, MessagesSquare, NotebookPen, Settings, type LucideIcon } from 'lucide-react';
import { api, encerrarSessao, sessaoSalva, type Usuario } from './api';
import { LoginPage } from './components/LoginPage';
import { Fila } from './paginas/Fila';
import { Conversas } from './paginas/Conversas';
import { Indicadores } from './paginas/Indicadores';
import { ServicosMensagens } from './paginas/ServicosMensagens';
import { Configuracoes } from './paginas/Configuracoes';
import type { ResumoConversa, Triagem } from './tipos';
import { AlertaUrgente } from './components/AlertaUrgente';
import { useAtualizacao } from './useAtualizacao';
import { nomeUnidade, useUnidades } from './unidades';
import type { Rota } from './navegacao';

export const NOME_PRODUTO = 'Ponte Social';

const NAVEGACAO: { id: Rota; rotulo: string; curto: string; icone: LucideIcon }[] = [
  { id: 'fila', rotulo: 'Fila', curto: 'Fila', icone: ListOrdered },
  { id: 'conversas', rotulo: 'Conversas', curto: 'Conversas', icone: MessagesSquare },
  { id: 'indicadores', rotulo: 'Indicadores', curto: 'Indicadores', icone: BarChart3 },
  { id: 'servicos', rotulo: 'Serviços e mensagens', curto: 'Serviços', icone: NotebookPen },
  { id: 'configuracoes', rotulo: 'Configurações', curto: 'Ajustes', icone: Settings },
];

function rotaAtual(): { rota: Rota; parametro?: string } {
  const [, rota, parametro] = window.location.hash.split('/');
  const valida = NAVEGACAO.some((n) => n.id === rota) ? (rota as Rota) : 'fila';
  return { rota: valida, parametro: parametro ? decodeURIComponent(parametro) : undefined };
}

export default function App() {
  const [usuario, setUsuario] = useState<Usuario | null>(sessaoSalva);

  useEffect(() => {
    const aoExpirar = () => setUsuario(null);
    window.addEventListener('sessao-expirada', aoExpirar);
    return () => window.removeEventListener('sessao-expirada', aoExpirar);
  }, []);

  if (!usuario) return <LoginPage onEntrar={setUsuario} />;
  return <Painel usuario={usuario} onSair={() => { encerrarSessao(); setUsuario(null); }} />;
}

/** Campo do cabeçalho, como num formulário: rótulo pequeno e o valor sobre a linha. */
function CampoCabecalho({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border-b border-linha-forte pb-1">
      <dt className="text-[12px] text-texto-3">{rotulo}</dt>
      <dd className="truncate text-[14.5px] font-semibold text-texto">{children}</dd>
    </div>
  );
}

function Painel({ usuario, onSair }: { usuario: Usuario; onSair: () => void }) {
  const [{ rota, parametro }, setLocal] = useState(rotaAtual);
  useEffect(() => {
    const aoMudar = () => setLocal(rotaAtual());
    window.addEventListener('hashchange', aoMudar);
    return () => window.removeEventListener('hashchange', aoMudar);
  }, []);

  const fila = useAtualizacao(useCallback(() => api<Triagem[]>('/triagem/fila'), []), 5000);
  const unidades = useUnidades();
  const conversas = useAtualizacao(useCallback(() => api<ResumoConversa[]>('/atendimento/conversas'), []), 4000);

  const triagens = fila.dados ?? [];
  const urgentes = triagens.filter((t) => t.status === 'URGENTE_CREAS').length;
  const aguardando = triagens.filter((t) => t.status === 'PENDENTE').length;
  const naoLidas = (conversas.dados ?? []).filter((c) => c.atendimento_humano && c.nao_lidas > 0).length;
  const papel = usuario.role === 'ADMIN' ? 'Coordenação' : 'Atendimento';

  return (
    <div className="min-h-dvh pb-20 md:pb-10">
      <header className="mx-auto max-w-[1440px] px-4 pt-4 md:px-8 md:pt-6">
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
          <div>
            <p className="titulo text-[26px] md:text-[30px]">{NOME_PRODUTO}</p>
            <p className="text-[13.5px] text-texto-2">Encaminhamento da assistência social</p>
          </div>

          <dl className="hidden flex-1 grid-cols-[repeat(3,minmax(0,auto))_auto] items-end justify-end gap-x-8 md:grid">
            <CampoCabecalho rotulo="Unidade">{usuario.unidade_id ? nomeUnidade(unidades.dados, usuario.unidade_id) : 'Todas as unidades'}</CampoCabecalho>
            <CampoCabecalho rotulo={papel}>{usuario.name}</CampoCabecalho>
            <CampoCabecalho rotulo="Na fila agora">
              {fila.dados ? (
                <a href="#/fila" className="hover:underline">
                  {urgentes > 0 && <span className="text-urgente">{urgentes} urgente{urgentes > 1 ? 's' : ''}, </span>}
                  <span className="tabular">{aguardando}</span> aguardando
                </a>
              ) : '–'}
            </CampoCabecalho>
            <button onClick={onSair} className="mb-1 inline-flex items-center gap-1.5 rounded-[5px] px-2 py-1.5 text-[13.5px] text-texto-2 hover:bg-superficie hover:text-texto">
              <LogOut className="size-4" aria-hidden />Sair
            </button>
          </dl>

          <button onClick={onSair} className="rounded-[5px] p-2 text-texto-2 hover:bg-superficie md:hidden" aria-label="Sair do sistema">
            <LogOut className="size-5" aria-hidden />
          </button>
        </div>

        <nav aria-label="Principal" className="mt-5 hidden gap-0.5 md:flex">
          {NAVEGACAO.map(({ id, rotulo, icone: Icone }) => (
            <a key={id} href={`#/${id}`} aria-current={rota === id ? 'page' : undefined}
              className={`aba-pasta relative flex items-center gap-2 px-4 py-2.5 text-[14.5px] ${rota === id ? 'z-10 font-semibold text-texto' : 'text-texto-2 hover:text-texto'}`}>
              <Icone className="size-[17px] shrink-0" aria-hidden />
              {rotulo}
              {id === 'conversas' && naoLidas > 0 && (
                <span className="rounded-full bg-caneta px-1.5 text-[12px] font-bold leading-[18px] text-white tabular" aria-label={`${naoLidas} conversas com mensagens novas`}>{naoLidas}</span>
              )}
            </a>
          ))}
        </nav>
      </header>

      <div className="mx-auto max-w-[1440px] md:px-8">
        <AlertaUrgente triagens={triagens} />
      </div>

      <main className="mx-auto max-w-[1440px] md:px-8">
        <div className="folha -mt-px min-h-[70vh] rounded-none px-4 py-6 md:rounded-[6px] md:rounded-tl-none md:px-9 md:py-8">
          {rota === 'fila' && <Fila fila={fila} filtroEstado={parametro} />}
          {rota === 'conversas' && <Conversas conversas={conversas} selecionada={parametro} />}
          {rota === 'indicadores' && <Indicadores />}
          {rota === 'servicos' && <ServicosMensagens />}
          {rota === 'configuracoes' && <Configuracoes aba={parametro} />}
        </div>
      </main>

      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-linha bg-superficie md:hidden">
        {NAVEGACAO.map(({ id, rotulo, curto, icone: Icone }) => (
          <a key={id} href={`#/${id}`} aria-label={rotulo} aria-current={rota === id ? 'page' : undefined}
            className={`relative flex flex-col items-center gap-1 py-2.5 text-[11px] ${rota === id ? 'font-semibold text-texto' : 'text-texto-3'}`}>
            {rota === id && <span className="absolute inset-x-4 top-0 h-[3px] rounded-b bg-texto" aria-hidden />}
            <Icone className="size-5" aria-hidden />
            <span className="max-w-full px-0.5 text-center leading-tight">{curto}</span>
            {id === 'conversas' && naoLidas > 0 && <span className="absolute right-[22%] top-1.5 size-2 rounded-full bg-caneta" aria-hidden />}
          </a>
        ))}
      </nav>
    </div>
  );
}
