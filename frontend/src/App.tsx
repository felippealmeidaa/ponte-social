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
import { useAtualizacao } from './useAtualizacao';
import { nomeUnidade, useUnidades } from './unidades';
import { ESTADOS, ORDEM_ESTADOS } from './vocabulario';
import type { Rota } from './navegacao';


const NAVEGACAO: { id: Rota; rotulo: string; curto: string; icone: LucideIcon }[] = [
  { id: 'fila', rotulo: 'Fila', curto: 'Fila', icone: ListOrdered },
  { id: 'conversas', rotulo: 'Conversas', curto: 'Conversas', icone: MessagesSquare },
  { id: 'indicadores', rotulo: 'Indicadores', curto: 'Indicadores', icone: BarChart3 },
  { id: 'servicos', rotulo: 'Serviços e mensagens', curto: 'Serviços', icone: NotebookPen },
  { id: 'configuracoes', rotulo: 'Configurações', curto: 'Configurações', icone: Settings },
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
  const porEstado = Object.fromEntries(ORDEM_ESTADOS.map((s) => [s, triagens.filter((t) => t.status === s).length]));
  const naoLidas = (conversas.dados ?? []).filter((c) => c.atendimento_humano && c.nao_lidas > 0).length;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[256px_1fr]">
      <aside className="hidden md:flex sticky top-0 h-dvh flex-col border-r border-linha bg-[#0d1016] px-4 py-6">
        <div className="px-2 mb-8">
          <p className="font-display text-[30px] leading-[0.9] tracking-[0.06em]">CRAS Anápolis</p>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.22em] text-ambar">Encaminhamento social</p>
        </div>

        <nav aria-label="Principal" className="flex flex-col gap-1">
          {NAVEGACAO.map(({ id, rotulo, icone: Icone }) => {
            const ativo = rota === id;
            return (
              <a
                key={id}
                href={`#/${id}`}
                aria-current={ativo ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors duration-150 ${
                  ativo ? 'border-ambar/70 bg-ambar-escuro text-ambar font-semibold' : 'border-transparent text-texto-2 hover:text-texto hover:bg-elevada'
                }`}
              >
                <Icone className="size-[18px] shrink-0" aria-hidden />
                <span className="flex-1">{rotulo}</span>
                {id === 'conversas' && naoLidas > 0 && (
                  <span className="rounded-full bg-ambar px-1.5 text-[11px] font-bold text-[#1b1406] tabular" aria-label={`${naoLidas} conversas com mensagens novas`}>{naoLidas}</span>
                )}
              </a>
            );
          })}
        </nav>

        <div className="mt-8 border-t border-linha pt-6 px-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-texto-3 mb-3">Situação da fila</p>
          <ul className="flex flex-col gap-2 text-[13px]">
            {ORDEM_ESTADOS.slice(0, 5).map((s) => (
              <li key={s}>
                <a href={`#/fila/${s}`} className="flex items-center justify-between text-texto-2 hover:text-texto">
                  <span>{ESTADOS[s].rotulo}</span>
                  <span className={`tabular ${s === 'URGENTE_CREAS' && porEstado[s] > 0 ? 'text-urgente font-semibold' : 'text-texto'}`}>
                    {fila.dados ? porEstado[s] : '–'}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 rounded-lg border border-linha px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{usuario.name}</p>
            <p className="truncate text-xs text-texto-3">
              {usuario.role === 'ADMIN' ? 'Coordenação' : 'Atendimento'}
              {usuario.unidade_id ? ` · ${nomeUnidade(unidades.dados, usuario.unidade_id)}` : usuario.role === 'ADMIN' ? ' geral' : ''}
            </p>
          </div>
          <button onClick={onSair} className="rounded-md p-1.5 text-texto-3 hover:bg-elevada hover:text-texto" aria-label="Sair do sistema" title="Sair">
            <LogOut className="size-4" aria-hidden />
          </button>
        </div>
      </aside>

      <main className="min-w-0 px-4 pb-24 pt-6 md:px-8 md:pb-10 lg:px-10">
        {rota === 'fila' && <Fila fila={fila} filtroEstado={parametro} />}
        {rota === 'conversas' && <Conversas conversas={conversas} selecionada={parametro} />}
        {rota === 'indicadores' && <Indicadores />}
        {rota === 'servicos' && <ServicosMensagens />}
        {rota === 'configuracoes' && <Configuracoes aba={parametro} />}
      </main>

      <nav aria-label="Principal" className="md:hidden fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-linha bg-[#0d1016]">
        {NAVEGACAO.map(({ id, rotulo, curto, icone: Icone }) => (
          <a key={id} href={`#/${id}`} aria-label={rotulo} aria-current={rota === id ? 'page' : undefined}
            className={`flex flex-col items-center gap-1 py-2.5 text-[10px] tracking-tight ${rota === id ? 'text-ambar' : 'text-texto-3'}`}>
            <Icone className="size-5" aria-hidden />
            <span className="max-w-full px-0.5 text-center leading-tight">{curto}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
