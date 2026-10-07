import { useCallback, useEffect, useState } from 'react';
import { 
  BarChart3, 
  BrainCircuit,
  ListOrdered, 
  LogOut, 
  MessagesSquare, 
  NotebookPen, 
  Settings, 
  ShieldCheck, 
  type LucideIcon 
} from 'lucide-react';
import { api, encerrarSessao, sessaoSalva, type Usuario } from './api';
import { LoginPage } from './components/LoginPage';
import { Fila } from './paginas/Fila';
import { Conversas } from './paginas/Conversas';
import { Indicadores } from './paginas/Indicadores';
import { ServicosMensagens } from './paginas/ServicosMensagens';
import { Configuracoes } from './paginas/Configuracoes';
import type { ResumoConversa, Triagem } from './tipos';
import { AlertaUrgente } from './components/AlertaUrgente';
import { useAvisosLigados, useAvisosUrgentes } from './avisosUrgentes';
import { BotaoAvisos } from './components/AvisosNavegador';
import { BotaoTema } from './components/Tema';
import { useAtualizacao } from './useAtualizacao';
import { nomeUnidade, useUnidades } from './unidades';
import type { Rota } from './navegacao';

export const NOME_PRODUTO = 'Ponte Social';

const NAVEGACAO: { id: Rota; rotulo: string; curto: string; icone: LucideIcon }[] = [
  { id: 'fila', rotulo: 'Fila de Triagem', curto: 'Fila', icone: ListOrdered },
  { id: 'conversas', rotulo: 'Live Chat', curto: 'Chat', icone: MessagesSquare },
  { id: 'indicadores', rotulo: 'Indicadores', curto: 'Métricas', icone: BarChart3 },
  { id: 'servicos', rotulo: 'Fluxos e Mensagens', curto: 'Fluxos', icone: NotebookPen },
  { id: 'configuracoes', rotulo: 'Configurações & IA', curto: 'Ajustes', icone: Settings },
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
  // Tempo do alerta de urgência (Configurações → Alertas) e avisos no computador
  const opcoesPainel = useAtualizacao(useCallback(() => api<{ opcoes: { alerta_urgente_min?: number } }>('/configuracao/fluxo/opcoes'), []), 60000);
  const minutosAlerta = opcoesPainel.dados?.opcoes.alerta_urgente_min ?? 10;
  const [avisosLigados, setAvisosLigados] = useAvisosLigados();
  useAvisosUrgentes(triagens, minutosAlerta, avisosLigados);
  const urgentes = triagens.filter((t) => t.status === 'URGENTE_CREAS').length;
  const aguardando = triagens.filter((t) => t.status === 'PENDENTE').length;
  const naoLidas = (conversas.dados ?? []).filter((c) => c.atendimento_humano && c.nao_lidas > 0).length;
  const papel = usuario.role === 'ADMIN' ? 'Coordenação' : 'Atendimento';

  return (
    <div className="min-h-screen pb-24 md:pb-12 text-texto flex flex-col transition-colors duration-200">
      {/* Top Header Adaptativo */}
      <header className="sticky top-0 z-40 border-b border-linha bg-superficie/90 backdrop-blur-xl transition-all">
        <div className="mx-auto max-w-[1440px] px-4 py-3 md:px-8">
          <div className="flex items-center justify-between gap-4">
            
            {/* Logo / Brand */}
            <div className="flex items-center gap-3">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-600 to-emerald-600 text-white shadow-sm">
                <BrainCircuit className="size-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="titulo text-[19px] md:text-[21px] tracking-tight text-texto">
                    {NOME_PRODUTO}
                  </span>
                  <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-sky-700 dark:text-sky-300">
                    v2.5 OMNICHANNEL
                  </span>
                </div>
                <p className="hidden sm:block text-[11.5px] text-texto-2 font-medium">
                  {usuario.unidade_id ? nomeUnidade(unidades.dados, usuario.unidade_id) : 'Rede Municipal Anápolis'} · {papel}
                </p>
              </div>
            </div>

            {/* Status & KPIs no Topo (Desktop) */}
            <div className="hidden lg:flex items-center gap-4">
              <a 
                href="#/fila" 
                className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-1.5 transition-all duration-200 ${
                  urgentes > 0 
                    ? 'border-rose-500/30 bg-superficie text-texto shadow-xs hover:border-rose-500' 
                    : 'border-linha bg-superficie text-texto hover:border-linha-forte shadow-xs'
                }`}
              >
                <div className={`h-2 w-2 rounded-full ${urgentes > 0 ? 'bg-rose-600 animate-pulse' : 'bg-emerald-500'}`} />
                <span className={`text-[13px] font-medium ${urgentes > 0 ? 'text-rose-700 dark:text-rose-400 font-semibold' : 'text-texto'}`}>
                  {urgentes > 0 ? `${urgentes} Urgente${urgentes > 1 ? 's' : ''}` : 'Fila sob controle'}
                </span>
                <span className="mono text-[11.5px] font-semibold bg-elevada border border-linha px-2 py-0.5 rounded-md tabular text-texto-2">
                  {aguardando} na espera
                </span>
              </a>

              <div className="flex items-center gap-2 border-l border-linha pl-4">
                <div className="text-right">
                  <p className="text-[13px] font-semibold text-texto leading-tight">{usuario.name}</p>
                  <p className="text-[11px] text-texto-2 flex items-center justify-end gap-1">
                    <ShieldCheck className="size-3 text-marca" />
                    {usuario.role === 'ADMIN' ? 'Admin / Coordenação' : 'Técnico Social'}
                  </p>
                </div>
              </div>
            </div>

            {/* Ações Rápidas (Avisos, Tema & Logout) */}
            <div className="flex items-center gap-2">
              <BotaoAvisos ligado={avisosLigados} onMudar={setAvisosLigados} />
              <BotaoTema />
              <button
                onClick={onSair}
                title="Encerrar Sessão"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-linha bg-elevada text-texto-2 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-600 transition-all duration-150 cursor-pointer"
                aria-label="Sair do sistema"
              >
                <LogOut className="size-4" aria-hidden />
              </button>
            </div>
          </div>

          {/* Navegação por Abas (Desktop) */}
          <nav aria-label="Principal" className="mt-3 hidden md:flex items-center gap-1 border-t border-linha pt-2.5">
            {NAVEGACAO.map(({ id, rotulo, icone: Icone }) => {
              const ativo = rota === id;
              return (
                <a
                  key={id}
                  href={`#/${id}`}
                  aria-current={ativo ? 'page' : undefined}
                  className={`group relative flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-[13.5px] font-medium transition-all duration-150 ${
                    ativo
                      ? 'bg-elevada border border-linha-forte text-texto font-semibold shadow-xs'
                      : 'text-texto-2 hover:text-texto hover:bg-elevada/60 border border-transparent'
                  }`}
                >
                  <Icone className={`size-4 transition-transform duration-150 group-hover:scale-105 ${ativo ? 'text-marca' : 'text-texto-3'}`} aria-hidden />
                  {rotulo}
                  {id === 'conversas' && naoLidas > 0 && (
                    <span className="mono text-[11px] font-bold px-1.5 py-0.2 rounded-full bg-sky-600 text-white shadow-xs animate-pulse">
                      {naoLidas}
                    </span>
                  )}
                  {id === 'fila' && urgentes > 0 && (
                    <span className="mono text-[11px] font-bold px-1.5 py-0.2 rounded-full bg-rose-600 text-white shadow-xs">
                      {urgentes}
                    </span>
                  )}
                </a>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-8 md:py-8">
        <AlertaUrgente triagens={triagens} minutos={minutosAlerta} />
        <div>
          {rota === 'fila' && <Fila fila={fila} filtroEstado={parametro} />}
          {rota === 'conversas' && <Conversas conversas={conversas} selecionada={parametro} />}
          {rota === 'indicadores' && <Indicadores />}
          {rota === 'servicos' && <ServicosMensagens />}
          {rota === 'configuracoes' && <Configuracoes />}
        </div>
      </main>

      {/* Barra de Navegação Inferior (Mobile) */}
      <nav aria-label="Navegação móvel" className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-linha bg-superficie/95 backdrop-blur-xl px-2 py-2 md:hidden">
        {NAVEGACAO.map(({ id, curto, icone: Icone }) => {
          const ativo = rota === id;
          return (
            <a
              key={id}
              href={`#/${id}`}
              aria-current={ativo ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[11px] font-medium transition-colors ${
                ativo ? 'text-marca font-bold' : 'text-texto-2 hover:text-texto'
              }`}
            >
              <div className="relative">
                <Icone className="size-5" />
                {id === 'conversas' && naoLidas > 0 && (
                  <span className="absolute -top-1 -right-2 size-2 rounded-full bg-sky-600 animate-pulse" />
                )}
                {id === 'fila' && urgentes > 0 && (
                  <span className="absolute -top-1 -right-2 size-2 rounded-full bg-rose-600" />
                )}
              </div>
              <span>{curto}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
