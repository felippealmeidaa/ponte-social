import { useCallback, useEffect, useMemo, useState } from 'react';
import { 
  ArrowRight, 
  GitFork, 
  Lock, 
  Pencil, 
  RotateCcw, 
  Save, 
  Trash2 
} from 'lucide-react';
import { api, atualizar, enviar } from '../api';
import { CanvasFluxo } from '../components/CanvasFluxo';
import { TrilhoFluxo } from '../components/TrilhoFluxo';
import { Aviso, Botao, Chave, classeEntrada, Segmentado } from '../components/ui';
import {
  contagemPorEtapa, ETAPAS, etapaDaExtra, type MensagemExtra, type Ponto, etapasPuladas, LIGACOES, type Etapa, type OpcoesFluxo,
} from '../fluxoBot';
import { comUnidade, contaAtual, nomeUnidade, useUnidades, type UnidadeResumo } from '../unidades';
import { useAtualizacao } from '../useAtualizacao';
import { Respostas } from './RespostasNecessidade';
import { Unidades } from './Unidades';

interface TextoBot {
  chave: string;
  descricao: string;
  texto: string;
  padrao: string;
  personalizado: boolean;
  atualizado_em: string | null;
  atualizado_por: string | null;
}

interface RespostaDesenho {
  posicoes: Record<string, Ponto>;
  extras: MensagemExtra[];
  ancoras: string[];
  posicoes_proprias: boolean;
  extras_proprias: boolean;
}

interface RespostaOpcoes {
  opcoes: OpcoesFluxo;
  personalizadas: string[];
  atualizado_em: string | null;
  atualizado_por: string | null;
}

type Aba = 'fluxo' | 'respostas' | 'unidades';

interface Contexto {
  unidade: string | null;
  podeEditar: boolean;
}

const ROTULO_CONTATO = [
  { valor: 'perguntar', rotulo: 'Perguntar no fim' },
  { valor: 'sempre', rotulo: 'Sempre cadastrar' },
  { valor: 'nunca', rotulo: 'Nunca cadastrar' },
] as const;

function formatarWhatsApp(texto: string) {
  const partes = texto.split(/(\*[^*\n]+\*)/g);
  return partes.map((p, i) => (p.startsWith('*') && p.endsWith('*') && p.length > 2 ? <strong key={i} className="font-bold text-texto">{p.slice(1, -1)}</strong> : p));
}

export function ServicosMensagens() {
  const conta = contaAtual();
  const unidades = useUnidades();
  const [aba, setAba] = useState<Aba>('fluxo');
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const unidade = conta.unidadeId ?? escolhida;
  const ctx: Contexto = { unidade, podeEditar: conta.coordenacao };
  const abas: [Aba, string][] = [['fluxo', 'Fluxo Visual da Conversa (No-Code)'], ['respostas', 'Catálogo de Serviços & Benefícios']];
  if (conta.geral) abas.push(['unidades', 'Rede Socioassistencial']);

  return (
    <>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b border-linha pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="titulo text-[28px] md:text-[32px] text-texto">
              Fluxos & Mensagens do Atendimento
            </h1>
            <span className="mono text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-marca-bg border border-marca/30 text-marca">
              ORQUESTRADOR
            </span>
          </div>
          <p className="mt-2 max-w-[75ch] text-[14px] text-texto-2 leading-relaxed">
            Editor visual interativo de fluxos (estilo n8n). As alterações entram em produção em tempo real para as próximas conversas.
          </p>
        </div>
        <SeletorUnidade unidades={unidades.dados} unidade={unidade} fixa={Boolean(conta.unidadeId)} onMudar={setEscolhida} />
      </header>

      {unidade ? (
        <div className="mb-6 rounded-xl border border-marca/20 bg-marca-bg p-3.5 text-xs text-marca">
          📍 Editando parâmetros exclusivos do <strong>{nomeUnidade(unidades.dados, unidade)}</strong>.
        </div>
      ) : (
        <div className="mb-6 rounded-xl border border-linha bg-superficie p-3.5 text-xs text-texto-2">
          ⚙️ <strong>Padrão da Secretaria Municipal:</strong> Aplicado a bairros sem CRAS específico ou sem personalização própria.
        </div>
      )}

      {/* Navegação de Abas */}
      <div role="tablist" aria-label="Navegação de Fluxo" className="mb-8 flex gap-2 overflow-x-auto border-b border-linha pb-3">
        {abas.map(([id, rotulo]) => {
          const ativo = aba === id;
          return (
            <button 
              key={id} 
              role="tab" 
              aria-selected={ativo} 
              onClick={() => setAba(id)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 cursor-pointer ${
                ativo 
                  ? 'bg-marca-bg border border-marca/40 text-marca font-bold shadow-sm' 
                  : 'text-texto-2 hover:text-texto hover:bg-elevada'
              }`}
            >
              {rotulo}
            </button>
          );
        })}
      </div>

      <div className="animate-[fade-in_200ms_ease-out]">
        {aba === 'fluxo' && <Fluxo key={`f-${unidade}`} ctx={ctx} unidades={unidades.dados} irPara={setAba} />}
        {aba === 'respostas' && <Respostas key={`r-${unidade}`} ctx={ctx} />}
        {aba === 'unidades' && conta.geral && <Unidades />}
      </div>
    </>
  );
}

function SeletorUnidade({ unidades, unidade, fixa, onMudar }: {
  unidades: UnidadeResumo[] | null; unidade: string | null; fixa: boolean; onMudar: (u: string | null) => void;
}) {
  if (fixa) {
    return (
      <div className="rounded-xl border border-linha bg-superficie px-4 py-2.5 text-sm">
        <span className="text-texto-3">Unidade: </span>
        <span className="font-bold text-marca">{nomeUnidade(unidades, unidade)}</span>
      </div>
    );
  }
  const cras = (unidades ?? []).filter((u) => u.tipo === 'CRAS');
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="unidade-config" className="text-[12px] font-semibold text-texto-2 uppercase">Contexto de Configuração</label>
      <select id="unidade-config" value={unidade ?? ''} onChange={(e) => onMudar(e.target.value || null)} className={`${classeEntrada} min-w-64 h-10`}>
        <option value="" className="bg-superficie text-texto">Padrão da Secretaria (Geral)</option>
        {cras.map((u) => <option key={u.id} value={u.id} className="bg-superficie text-texto">{u.nome}</option>)}
      </select>
    </div>
  );
}

function useTelaLarga() {
  const consulta = '(min-width: 1024px)';
  const [larga, setLarga] = useState(() => {
    try { return window.matchMedia(consulta).matches; } catch { return true; }
  });
  useEffect(() => {
    let mq: MediaQueryList;
    try { mq = window.matchMedia(consulta); } catch { return; }
    const mudou = () => setLarga(mq.matches);
    mq.addEventListener('change', mudou);
    return () => mq.removeEventListener('change', mudou);
  }, []);
  return larga;
}

interface Agora { por_estado: Record<string, number>; com_atendente: number; janela_minutos: number }
const POR_ID: Record<string, Etapa> = Object.fromEntries(ETAPAS.map((e) => [e.id, e]));

function Fluxo({ ctx, unidades, irPara }: { ctx: Contexto; unidades: UnidadeResumo[] | null; irPara: (aba: Aba) => void }) {
  const { unidade } = ctx;
  const textos = useAtualizacao(useCallback(() => api<TextoBot[]>(comUnidade('/configuracao/textos', unidade)), [unidade]), 0);
  const opcoes = useAtualizacao(useCallback(() => api<RespostaOpcoes>(comUnidade('/configuracao/fluxo/opcoes', unidade)), [unidade]), 0);
  const agora = useAtualizacao(useCallback(() => api<Agora>(comUnidade('/configuracao/fluxo/agora', unidade)), [unidade]), 10000);
  const desenho = useAtualizacao(useCallback(() => api<RespostaDesenho>(comUnidade('/configuracao/fluxo/desenho', unidade)), [unidade]), 0);
  const [selecionada, setSelecionada] = useState('boas_vindas');
  const [orelha, setOrelha] = useState<number | null>(null);
  const larga = useTelaLarga();

  const contagem = useMemo(() => (agora.dados ? contagemPorEtapa(agora.dados.por_estado, agora.dados.com_atendente) : {}), [agora.dados]);
  const temCras = Boolean(unidades && unidades.length > 0);
  const vendoUnidade = Boolean(unidade);
  const puladas = useMemo(() => etapasPuladas(opcoes.dados?.opcoes ?? null, temCras, vendoUnidade), [opcoes.dados, temCras, vendoUnidade]);

  const etapaAtual = POR_ID[selecionada] ?? (desenho.dados?.extras.some((e) => e.id === selecionada) ? etapaDaExtra(desenho.dados.extras.find((e) => e.id === selecionada)!) : null);
  const personalizadas = useMemo(() => {
    const s = new Set<string>();
    const extrasIds = new Set(desenho.dados?.extras.map((e) => e.id));
    for (const t of textos.dados ?? []) {
      if (t.personalizado) {
        ETAPAS.forEach((e) => { if (e.textos.includes(t.chave)) s.add(e.id); });
        extrasIds.forEach((id) => { if (id.replace(/^extra_/, 'extra_') === t.chave) s.add(id); });
      }
    }
    for (const ch of opcoes.dados?.personalizadas ?? []) {
      ETAPAS.forEach((e) => { if (e.opcoes?.some((o) => o.chave === ch)) s.add(e.id); });
    }
    return s;
  }, [textos.dados, opcoes.dados, desenho.dados]);

  const moverBlocos = async (posicoes: Record<string, Ponto>) => {
    await api(comUnidade('/configuracao/fluxo/desenho/posicoes', unidade), atualizar({ posicoes }));
    desenho.recarregar();
  };

  const adicionarExtra = async (antesDe: string) => {
    await api(comUnidade('/configuracao/fluxo/desenho/extras', unidade), enviar({ antes_de: antesDe }));
    desenho.recarregar();
    textos.recarregar();
  };

  const removerExtra = async (id: string) => {
    await api(comUnidade(`/configuracao/fluxo/desenho/extras/${id}`, unidade), { method: 'DELETE' });
    desenho.recarregar();
    textos.recarregar();
    setSelecionada('boas_vindas');
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="relative rounded-2xl border border-linha bg-superficie shadow-sm p-6 overflow-hidden">
        <div className="flex items-center justify-between mb-4 border-b border-linha pb-3">
          <div className="flex items-center gap-2 text-marca">
            <GitFork className="size-5" />
            <h3 className="titulo text-[18px] text-texto">Mapa Interativo de Execução</h3>
          </div>
          <span className="mono text-[11.5px] font-medium text-texto-2">Arraste os blocos para reorganizar o desenho</span>
        </div>

        {larga ? (
          <CanvasFluxo
            selecionada={selecionada}
            onAbrir={setSelecionada}
            contagem={contagem}
            puladas={puladas}
            personalizadas={personalizadas}
            posicoes={desenho.dados?.posicoes ?? {}}
            extras={desenho.dados?.extras ?? []}
            ancoras={desenho.dados?.ancoras ?? []}
            podeEditar={ctx.podeEditar}
            onMover={moverBlocos}
            onAdicionar={adicionarExtra}
            onOrelha={setOrelha}
          />
        ) : (
          <TrilhoFluxo
            selecionada={selecionada}
            onAbrir={setSelecionada}
            contagem={contagem}
            puladas={puladas}
            personalizadas={personalizadas}
          />
        )}
      </div>

      {etapaAtual && (
        <EditorEtapa
          key={etapaAtual.id}
          etapa={etapaAtual}
          ctx={ctx}
          textos={textos.dados ?? []}
          opcoes={opcoes.dados ?? undefined}
          semConfirmacao={Boolean(opcoes.dados && !opcoes.dados.opcoes.confirmar_necessidade)}
          orelha={orelha}
          onAbrir={setSelecionada}
          onIrAba={irPara}
          onSalvoTextos={textos.recarregar}
          onSalvoOpcoes={opcoes.recarregar}
          onRemoverExtra={removerExtra}
        />
      )}
    </div>
  );
}

function EditorEtapa({
  etapa,
  ctx,
  textos,
  opcoes,
  semConfirmacao,
  orelha,
  onAbrir,
  onIrAba,
  onSalvoTextos,
  onSalvoOpcoes,
  onRemoverExtra,
}: {
  etapa: Etapa;
  ctx: Contexto;
  textos: TextoBot[];
  opcoes: RespostaOpcoes | undefined;
  semConfirmacao: boolean;
  orelha: number | null;
  onAbrir: (id: string) => void;
  onIrAba: (aba: Aba) => void;
  onSalvoTextos: () => void;
  onSalvoOpcoes: () => void;
  onRemoverExtra: (id: string) => void;
}) {
  const ehExtra = etapa.id.startsWith('extra_');
  const textosDaEtapa = textos.filter((t) => etapa.textos.includes(t.chave) || (ehExtra && t.chave === etapa.id.replace(/^extra_/, 'extra_')));

  return (
    <section className="relative rounded-2xl border border-linha bg-superficie p-6 shadow-sm">
      {orelha !== null && (
        <span 
          style={{ left: `${orelha}px` }} 
          className="absolute -top-2 size-4 -translate-x-1/2 rotate-45 border-l border-t border-linha bg-superficie" 
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-linha pb-4 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="mono text-[11px] font-bold text-marca uppercase tracking-wider">
              {ehExtra ? 'Mensagem Adicional' : 'Etapa do Bot'}
            </span>
            {etapa.travada && (
              <span className="mono text-[10.5px] font-semibold bg-urgente-fundo border border-urgente/40 text-urgente-forte px-2 py-0.2 rounded-full">
                Travado
              </span>
            )}
          </div>
          <h2 className="titulo text-[22px] text-texto mt-1">{etapa.titulo}</h2>
          <p className="text-[13.5px] text-texto-2 mt-0.5">{etapa.quando}</p>
        </div>

        {ehExtra && ctx.podeEditar && (
          <Botao tamanho="sm" variante="perigo" icone={Trash2} onClick={() => onRemoverExtra(etapa.id)}>
            Remover Mensagem Extra
          </Botao>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <h3 className="text-[13px] font-semibold text-texto-2 uppercase tracking-wide">Mensagens Enviadas no WhatsApp</h3>
          {textosDaEtapa.map((t) => (
            <BalaoTexto key={t.chave} texto={t} ctx={ctx} onSalvo={onSalvoTextos} />
          ))}

          {etapa.editarEm === 'respostas' && (
            <div className="rounded-xl border border-marca/20 bg-marca-bg p-4 flex items-center justify-between">
              <div>
                <p className="text-[14px] font-bold text-texto">Catálogo de Serviços Sociais</p>
                <p className="text-[12.5px] text-texto-2">Configure requisitos e locais por categoria.</p>
              </div>
              <Botao tamanho="sm" variante="primario" onClick={() => onIrAba('respostas')}>Abrir Catálogo</Botao>
            </div>
          )}

          {etapa.editarEm === 'unidades' && (
            <div className="rounded-xl border border-linha bg-elevada p-4 flex items-center justify-between">
              <div>
                <p className="text-[14px] font-bold text-texto">Rede de Unidades</p>
                <p className="text-[12.5px] text-texto-3">Edite os bairros atendidos por cada CRAS.</p>
              </div>
              <Botao tamanho="sm" onClick={() => onIrAba('unidades')}>Ver Unidades</Botao>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6 border-t border-linha pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <OpcoesEtapa etapa={etapa} ctx={ctx} estado={opcoes} onSalvo={onSalvoOpcoes} />
          <ParaOndeVai etapa={etapa} semConfirmacao={semConfirmacao} onAbrir={onAbrir} />
        </div>
      </div>
    </section>
  );
}

function OpcoesEtapa({ etapa, ctx, estado, onSalvo }: { etapa: Etapa; ctx: Contexto; estado: RespostaOpcoes | undefined; onSalvo: () => void }) {
  const opcoes = etapa.opcoes ?? [];
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const mudar = async (chave: string, valor: boolean | string) => {
    setSalvando(chave);
    setErro(null);
    try {
      await api(comUnidade('/configuracao/fluxo/opcoes', ctx.unidade), atualizar({ [chave]: valor }));
      onSalvo();
    } catch {
      setErro('Falha ao salvar opção.');
    } finally {
      setSalvando(null);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[13px] font-semibold text-texto-2 uppercase tracking-wide">Comportamento da Etapa</h3>
      {opcoes.map((op) => {
        const valor = estado?.opcoes[op.chave as keyof OpcoesFluxo];
        const bloqueada = !ctx.podeEditar || (op.soSecretaria && Boolean(ctx.unidade)) || salvando !== null;
        return (
          <div key={op.chave} className="flex flex-col gap-2 rounded-xl border border-linha bg-elevada/50 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13.5px] font-medium text-texto">{op.rotulo}</span>
              {op.tipo === 'bool' ? (
                <Chave id={`op-${op.chave}`} rotuloId={`r-${op.chave}`} ligada={Boolean(valor)} disabled={bloqueada} onMudar={(v) => mudar(op.chave, v)} />
              ) : (
                <Segmentado rotuloId={`r-${op.chave}`} valor={String(valor)} opcoes={[...ROTULO_CONTATO]} disabled={bloqueada} onMudar={(v) => mudar(op.chave, v)} />
              )}
            </div>
            <p className="text-[12px] text-texto-3">{op.ajuda}</p>
          </div>
        );
      })}
      {etapa.travada && (
        <p className="flex items-start gap-2 text-[12.5px] text-texto-3 mt-1">
          <Lock className="size-3.5 text-marca shrink-0 mt-0.5" />
          {etapa.travada}
        </p>
      )}
      {erro && <Aviso>{erro}</Aviso>}
    </section>
  );
}

function ParaOndeVai({ etapa, semConfirmacao, onAbrir }: { etapa: Etapa; semConfirmacao: boolean; onAbrir: (id: string) => void }) {
  const saidas = LIGACOES.filter((l) => l.de === etapa.id && (!l.quando || (l.quando === 'sem_confirmacao' && semConfirmacao)));
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[13px] font-semibold text-texto-2 uppercase tracking-wide">Próximo Passo no Fluxo</h3>
      {saidas.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {saidas.map((l) => (
            <li key={l.para}>
              <button 
                type="button" 
                onClick={() => onAbrir(l.para)}
                className="flex w-full items-center justify-between rounded-xl border border-linha bg-elevada/40 px-3 py-2 text-left text-[13px] text-texto-2 hover:border-marca/40 hover:bg-elevada hover:text-texto cursor-pointer transition-all"
              >
                <span>{l.rotulo ?? 'Segue para'}</span>
                <div className="flex items-center gap-1.5 font-bold text-marca">
                  <span>{POR_ID[l.para]?.titulo ?? l.para}</span>
                  <ArrowRight className="size-3.5 text-marca" />
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-texto-3">{etapa.depois ?? 'A conversa é finalizada ou transferida.'}</p>
      )}
    </section>
  );
}

function BalaoTexto({ texto, ctx, onSalvo }: { texto: TextoBot; ctx: Contexto; onSalvo: () => void }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(texto.texto);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const executar = async (caminho: string, opcoes: RequestInit) => {
    setSalvando(true);
    setErro(null);
    try {
      await api(comUnidade(caminho, ctx.unidade), opcoes);
      setEditando(false);
      onSalvo();
    } catch {
      setErro('Falha ao salvar texto.');
    } finally {
      setSalvando(false);
    }
  };

  const podeVoltar = ctx.unidade ? texto.personalizado : texto.texto !== texto.padrao;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-linha bg-elevada/60 p-4">
      <div className="flex items-center justify-between text-[12.5px]">
        <span className="font-semibold text-texto-2">{texto.descricao}</span>
        {ctx.unidade && texto.personalizado && (
          <span className="mono font-bold text-marca bg-marca-bg px-2 py-0.2 rounded-full border border-marca/30">Personalizado</span>
        )}
      </div>

      {editando ? (
        <div className="flex flex-col gap-2">
          <textarea
            rows={4}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className={`${classeEntrada} resize-y font-mono text-[13px]`}
          />
          <div className="flex items-center gap-2">
            <Botao tamanho="sm" variante="primario" icone={Save} carregando={salvando} onClick={() => executar(`/configuracao/textos/${texto.chave}`, atualizar({ texto: valor }))}>
              Salvar Mensagem
            </Botao>
            <Botao tamanho="sm" variante="fantasma" onClick={() => { setEditando(false); setValor(texto.texto); }}>
              Cancelar
            </Botao>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-linha bg-superficie p-3.5 text-[13.5px] leading-relaxed text-texto shadow-sm">
          {formatarWhatsApp(texto.texto)}
        </div>
      )}

      {erro && <Aviso>{erro}</Aviso>}

      {ctx.podeEditar && !editando && (
        <div className="flex items-center gap-2 pt-1">
          <Botao tamanho="sm" icone={Pencil} onClick={() => setEditando(true)}>Editar</Botao>
          {podeVoltar && (
            <Botao tamanho="sm" variante="fantasma" icone={RotateCcw} carregando={salvando} onClick={() => executar(`/configuracao/textos/${texto.chave}/restaurar`, enviar({}))}>
              Restaurar Padrão
            </Botao>
          )}
        </div>
      )}
    </div>
  );
}
