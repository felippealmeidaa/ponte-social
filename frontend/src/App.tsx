import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, LogOut, Menu } from 'lucide-react';
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
import { GavetaMenu } from './components/MenuPrincipal';
import { itemAtual, montarMenu } from './menu';
import { contaAtual } from './unidades';

export const NOME_PRODUTO = 'Ponte Social';

const ROTAS: Rota[] = ['fila', 'conversas', 'indicadores', 'servicos', 'configuracoes'];

function rotaAtual(): { rota: Rota; parametro?: string } {
  const [, rota, parametro] = window.location.hash.split('/');
  const valida = ROTAS.includes(rota as Rota) ? (rota as Rota) : 'fila';
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

/** Campo da barra do topo: rótulo e valor na mesma linha, sem caixa. */
function CampoCabecalho({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap text-[13px]">
      <dt className="text-sobre-topo-2">{rotulo}</dt>
      <dd className="truncate font-medium text-sobre-topo">{children}</dd>
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
  // Tempo do alerta de urgência (Configurações → Alertas) e avisos no computador
  const opcoesPainel = useAtualizacao(useCallback(() => api<{ opcoes: { alerta_urgente_min?: number } }>('/configuracao/fluxo/opcoes'), []), 60000);
  const minutosAlerta = opcoesPainel.dados?.opcoes.alerta_urgente_min ?? 10;
  const [avisosLigados, setAvisosLigados] = useAvisosLigados();
  useAvisosUrgentes(triagens, minutosAlerta, avisosLigados);
  // Mesma regra da Fila: violência que ainda espera alguém (urgente ou aguardando com prioridade de violência)
  const urgentes = triagens.filter((t) => t.status === 'URGENTE_CREAS' || (t.prioridade === 'URGENTE_VIOLENCIA' && t.status === 'PENDENTE')).length;
  const aguardando = triagens.filter((t) => t.status === 'PENDENTE').length;
  const naoLidas = (conversas.dados ?? []).filter((c) => c.atendimento_humano && c.nao_lidas > 0).length;
  const papel = usuario.role === 'ADMIN' ? 'Coordenação' : 'Atendimento';
  const emAtendimento = triagens.filter((t) => t.status === 'EM_ATENDIMENTO').length;
  const geral = contaAtual().geral;
  const menu = useMemo(() => montarMenu({ urgentes, aguardando, emAtendimento, naoLidas }, geral), [urgentes, aguardando, emAtendimento, naoLidas, geral]);
  const aqui = itemAtual(menu, rota, parametro);
  const [menuAberto, setMenuAberto] = useState(false);
  const fecharMenu = useCallback(() => setMenuAberto(false), []);

  return (
    <div className="min-h-dvh pb-10">
      <div className="topo">
      <header className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 md:px-8">
        <button type="button" onClick={() => setMenuAberto(true)} aria-expanded={menuAberto} aria-controls="menu-principal"
          className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-[3px] border border-linha-forte text-sobre-topo hover:border-caneta hover:text-caneta">
          <Menu className="size-[18px]" aria-hidden />
          <span className="sr-only">Abrir menu</span>
          {(urgentes > 0 || naoLidas > 0) && (
            <span className={`absolute -right-1 -top-1 size-2.5 rounded-full border-2 border-topo ${urgentes > 0 ? 'bg-urgente-topo' : 'bg-sobre-topo'}`} aria-hidden />
          )}
        </button>
        <a href="#/fila" className="flex shrink-0 items-center gap-2.5" aria-label={`${NOME_PRODUTO}: ir para a fila`}>
          <span className="dado inline-flex size-8 items-center justify-center rounded-[3px] bg-sobre-topo text-[13px] font-semibold text-topo" aria-hidden>PS</span>
          <span className="titulo hidden text-[15.5px] text-sobre-topo sm:inline">{NOME_PRODUTO}</span>
        </a>

        {aqui && (
          <p className="ml-1 hidden min-w-0 items-center gap-1.5 border-l border-linha pl-4 text-[13.5px] text-sobre-topo-2 md:flex" aria-label="Você está em">
            <span className="truncate">{aqui.grupo}</span>
            <ChevronRight className="size-3.5 shrink-0" aria-hidden />
            <span className={`truncate ${aqui.sub ? '' : 'font-semibold text-sobre-topo'}`}>{aqui.item}</span>
            {aqui.sub && <><ChevronRight className="size-3.5 shrink-0" aria-hidden /><span className="truncate font-semibold text-sobre-topo">{aqui.sub}</span></>}
          </p>
        )}
        {aqui && <p className="min-w-0 truncate text-[13.5px] font-semibold text-sobre-topo md:hidden">{aqui.sub ?? aqui.item}</p>}

        <dl className="ml-auto hidden items-center gap-5 xl:flex">
          <CampoCabecalho rotulo="Unidade">{usuario.unidade_id ? nomeUnidade(unidades.dados, usuario.unidade_id) : 'Todas as unidades'}</CampoCabecalho>
          <CampoCabecalho rotulo={papel}>{usuario.name}</CampoCabecalho>
          <CampoCabecalho rotulo="Na fila">
            {fila.dados ? (
              <a href="#/fila" className="hover:underline">
                {urgentes > 0 && <span className="text-urgente-topo">{urgentes} urgente{urgentes > 1 ? 's' : ''} · </span>}
                <span className="tabular">{aguardando}</span> aguardando
              </a>
            ) : '–'}
          </CampoCabecalho>
        </dl>
        <div className="ml-auto flex shrink-0 items-center gap-1 xl:ml-3 xl:border-l xl:border-linha xl:pl-3">
          <span className="hidden md:inline-flex"><BotaoAvisos ligado={avisosLigados} onMudar={setAvisosLigados} /></span>
          <BotaoTema compacto naFaixa className="p-2" />
          <button onClick={onSair} className="rounded-[3px] p-2 text-sobre-topo-2 hover:bg-sobre-topo/10 hover:text-sobre-topo" aria-label="Sair do sistema" title="Sair">
            <LogOut className="size-[18px]" aria-hidden />
          </button>
        </div>
      </header>
      </div>

      <main className="mx-auto max-w-[1440px] md:px-8">
        <div className="folha min-h-[70vh] px-4 py-5 md:px-0 md:py-6">
          <AlertaUrgente triagens={triagens} minutos={minutosAlerta} />
          {rota === 'fila' && <Fila fila={fila} filtroEstado={parametro} />}
          {rota === 'conversas' && <Conversas conversas={conversas} selecionada={parametro} />}
          {rota === 'indicadores' && <Indicadores parametro={parametro} />}
          {rota === 'servicos' && <ServicosMensagens aba={parametro} />}
          {rota === 'configuracoes' && <Configuracoes aba={parametro} />}
        </div>
      </main>

      {/* Só existe aberta: ao reabrir, começa com os tópicos fechados */}
      {menuAberto && <GavetaMenu aberto onFechar={fecharMenu} grupos={menu} rota={rota} parametro={parametro}
        rodape={
          <div className="text-[13.5px]">
            <p className="font-semibold">{usuario.name}</p>
            <p className="text-texto-2">{papel} · {usuario.unidade_id ? nomeUnidade(unidades.dados, usuario.unidade_id) : 'Todas as unidades'}</p>
          </div>
        } />}
    </div>
  );
}
