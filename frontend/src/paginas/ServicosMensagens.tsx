import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CircleAlert, Lock, RotateCcw, Save, ShieldAlert } from 'lucide-react';
import { api, atualizar, enviar, ErroApi } from '../api';
import { ListaFluxo, MapaFluxo } from '../components/MapaFluxo';
import { Aviso, Botao, Campo, classeEntrada, Esqueleto, PainelLateral } from '../components/ui';
import { contagemPorEtapa, ETAPAS, etapasPuladas, type OpcaoEtapa, type OpcoesFluxo } from '../fluxoBot';
import { comUnidade, contaAtual, nomeUnidade, useUnidades, type UnidadeResumo } from '../unidades';
import { useAtualizacao } from '../useAtualizacao';
import { Unidades } from './Unidades';
import { dataHora, nomeCategoria } from '../vocabulario';

interface Servico {
  categoria: string;
  titulo: string;
  servicos: string[];
  documentos: string[];
  local_atendimento: string;
  contato_util: string;
  urgencia: boolean;
  personalizado: boolean;
  fonte: string;
  verificado_em: string | null;
  atualizado_em: string | null;
  atualizado_por: string | null;
}

interface TextoBot {
  chave: string;
  descricao: string;
  texto: string;
  padrao: string;
  personalizado: boolean;
  atualizado_em: string | null;
  atualizado_por: string | null;
}

interface RespostaOpcoes {
  opcoes: OpcoesFluxo;
  personalizadas: string[];
  atualizado_em: string | null;
  atualizado_por: string | null;
}

// Plano, seção 9: cada regra precisa de fonte e data, revisadas a cada ciclo (~6 meses)
const VALIDADE_CONFERENCIA_DIAS = 180;

function situacaoFonte(s: Pick<Servico, 'fonte' | 'verificado_em'>): 'ok' | 'conferir' | 'revisar' {
  if (!s.fonte.trim() || !s.verificado_em) return 'conferir';
  const dias = (Date.now() - new Date(`${s.verificado_em}T00:00:00`).getTime()) / 86_400_000;
  return dias > VALIDADE_CONFERENCIA_DIAS ? 'revisar' : 'ok';
}

const ROTULO_SITUACAO = { conferir: 'a conferir', revisar: 'revisar' } as const;

type Aba = 'fluxo' | 'respostas' | 'unidades';

/** Unidade em edição: null = padrão da secretaria. */
interface Contexto {
  unidade: string | null;
  podeEditar: boolean;
}

export function ServicosMensagens() {
  const conta = contaAtual();
  const unidades = useUnidades();
  const [aba, setAba] = useState<Aba>('fluxo');
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const unidade = conta.unidadeId ?? escolhida;
  const ctx: Contexto = { unidade, podeEditar: conta.coordenacao };
  const abas: [Aba, string][] = [['fluxo', 'Fluxo da conversa'], ['respostas', 'Respostas por necessidade']];
  if (conta.geral) abas.push(['unidades', 'Unidades de atendimento']);

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <h1 className="titulo text-[35px] leading-[1.05]">Serviços e mensagens</h1>
          <p className="mt-2 max-w-[75ch] text-texto-2">
            O que o bot responde no WhatsApp. As mudanças valem na hora para as próximas conversas, sem precisar de programador.
          </p>
        </div>
        <SeletorUnidade unidades={unidades.dados} unidade={unidade} fixa={Boolean(conta.unidadeId)} onMudar={setEscolhida} />
      </header>

      {unidade ? (
        <p className="mb-5 max-w-[90ch] text-[13px] text-texto-2">
          Conversas de quem mora nos bairros do <strong className="font-medium text-texto">{nomeUnidade(unidades.dados, unidade)}</strong> seguem esta configuração.
          O que não foi personalizado aqui usa o padrão da secretaria.
        </p>
      ) : (
        <p className="mb-5 max-w-[90ch] text-[13px] text-texto-2">
          Padrão da secretaria: vale para quem ainda não informou o bairro, para bairros sem CRAS e para tudo o que um CRAS não personalizou.
        </p>
      )}
      {!ctx.podeEditar && (
        <p className="mb-5 flex items-center gap-2 text-[13px] text-texto-2">
          <Lock className="size-4 shrink-0 text-texto-3" aria-hidden />
          Só a coordenação edita. Você pode consultar tudo.
        </p>
      )}

      <div role="tablist" aria-label="O que ver ou editar" className="mb-6 flex gap-1 overflow-x-auto border-b border-linha">
        {abas.map(([id, rotulo]) => (
          <button key={id} role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ${aba === id ? 'border-caneta text-texto font-semibold' : 'border-transparent text-texto-2 hover:text-texto'}`}>
            {rotulo}
          </button>
        ))}
      </div>

      {aba === 'fluxo' && <Fluxo key={`f-${unidade}`} ctx={ctx} unidades={unidades.dados} irPara={setAba} />}
      {aba === 'respostas' && <Respostas key={`r-${unidade}`} ctx={ctx} />}
      {aba === 'unidades' && conta.geral && <Unidades />}
    </>
  );
}

function SeletorUnidade({ unidades, unidade, fixa, onMudar }: {
  unidades: UnidadeResumo[] | null; unidade: string | null; fixa: boolean; onMudar: (u: string | null) => void;
}) {
  if (fixa) {
    return (
      <p className="rounded-[5px] border border-linha bg-superficie px-3 py-2 text-sm">
        <span className="text-texto-3">Configuração do </span><span className="font-medium">{nomeUnidade(unidades, unidade)}</span>
      </p>
    );
  }
  const cras = (unidades ?? []).filter((u) => u.tipo === 'CRAS');
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="unidade-config" className="text-[13px] font-medium text-texto-2">Configuração de</label>
      <select id="unidade-config" value={unidade ?? ''} onChange={(e) => onMudar(e.target.value || null)} className={`${classeEntrada} min-w-64`}>
        <option value="">Padrão da secretaria</option>
        {cras.map((u) => <option key={u.id} value={u.id}>{u.nome}{u.ativo ? '' : ' (inativo)'}</option>)}
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

function Fluxo({ ctx, unidades, irPara }: { ctx: Contexto; unidades: UnidadeResumo[] | null; irPara: (aba: Aba) => void }) {
  const { unidade, podeEditar } = ctx;
  const textos = useAtualizacao(useCallback(() => api<TextoBot[]>(comUnidade('/configuracao/textos', unidade)), [unidade]), 0);
  const opcoes = useAtualizacao(useCallback(() => api<RespostaOpcoes>(comUnidade('/configuracao/fluxo/opcoes', unidade)), [unidade]), 0);
  const agora = useAtualizacao(useCallback(() => api<Agora>(comUnidade('/configuracao/fluxo/agora', unidade)), [unidade]), 10000);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const larga = useTelaLarga();

  const contagem = useMemo(() => (agora.dados ? contagemPorEtapa(agora.dados.por_estado, agora.dados.com_atendente) : {}), [agora.dados]);
  const temCras = Boolean(unidades?.some((u) => u.tipo === 'CRAS' && u.ativo));
  const puladas = useMemo(() => etapasPuladas(opcoes.dados?.opcoes ?? null, temCras, Boolean(unidade)),
    [opcoes.dados, temCras, unidade]);
  const fechar = useCallback(() => setSelecionada(null), []);
  const abrir = useCallback((id: string) => setSelecionada((atual) => (atual === id ? null : id)), []);

  const etapa = ETAPAS.find((e) => e.id === selecionada) ?? null;
  const usados = new Set(ETAPAS.flatMap((e) => e.textos));
  const avulsos = textos.dados?.filter((t) => !usados.has(t.chave)) ?? [];
  const totalAgora = Object.values(contagem).reduce((a, b) => a + b, 0);
  const props = { selecionada, contagem, puladas, semConfirmacao: opcoes.dados ? !opcoes.dados.opcoes.confirmar_necessidade : false, onAbrir: abrir };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <p className="max-w-[78ch] text-sm text-texto-2">
          Cada caixa é uma etapa da conversa no WhatsApp; as setas mostram para onde ela vai. Clique numa etapa para ver quando ela acontece,
          ligar ou desligar o que é opcional e editar o que o bot diz.
        </p>
        <div className="flex flex-col gap-1 text-[13px] text-texto-2" role="status">
          <p className="flex items-center gap-2">
            <ShieldAlert className="size-4 shrink-0 text-urgente" aria-hidden />
            Violência interrompe qualquer etapa, em todos os CRAS.
          </p>
          {agora.dados && (
            <p className="pl-6 text-texto-3">
              {totalAgora ? `${totalAgora} conversa${totalAgora > 1 ? 's' : ''} em andamento` : 'Nenhuma conversa em andamento'} nos últimos {agora.dados.janela_minutos} min
            </p>
          )}
        </div>
      </div>

      {opcoes.erro && <Aviso>{opcoes.erro}</Aviso>}
      {larga ? <MapaFluxo {...props} /> : <ListaFluxo {...props} />}

      {avulsos.length > 0 && (
        <section aria-labelledby="t-avulsos" className="mt-4">
          <h2 id="t-avulsos" className="mb-3 titulo text-[19px] leading-[1.05]">Outros textos</h2>
          <ul className="flex flex-col gap-4">
            {avulsos.map((t) => <li key={t.chave + (t.atualizado_em ?? '')}><EditorTexto texto={t} ctx={ctx} onSalvo={textos.recarregar} /></li>)}
          </ul>
        </section>
      )}

      <PainelLateral aberto={etapa !== null} titulo={etapa?.titulo ?? ''} onFechar={fechar}>
        {etapa && (
          <div className="flex flex-col gap-6">
            <dl className="flex flex-col gap-4 text-sm">
              <div>
                <dt className="text-[13px] font-medium text-texto-3">Quando acontece</dt>
                <dd className="mt-1 leading-relaxed">{etapa.quando}</dd>
              </div>
              {etapa.depois && (
                <div>
                  <dt className="text-[13px] font-medium text-texto-3">Depois</dt>
                  <dd className="mt-1 leading-relaxed">{etapa.depois}</dd>
                </div>
              )}
              {puladas[etapa.id] && (
                <div>
                  <dt className="text-[13px] font-medium text-texto-3">Nesta configuração</dt>
                  <dd className="mt-1 leading-relaxed">{puladas[etapa.id]}</dd>
                </div>
              )}
              {(contagem[etapa.id] ?? 0) > 0 && (
                <div>
                  <dt className="text-[13px] font-medium text-texto-3">Agora</dt>
                  <dd className="mt-1">{contagem[etapa.id]} conversa(s) parada(s) nesta etapa.</dd>
                </div>
              )}
            </dl>

            {etapa.travada && (
              <p className="flex items-start gap-2 rounded-[5px] border border-linha bg-fundo px-3 py-2.5 text-[13px] text-texto-2">
                <Lock className="mt-0.5 size-4 shrink-0 text-texto-3" aria-hidden />
                {etapa.travada}
              </p>
            )}

            {etapa.opcoes && opcoes.dados && (
              <OpcoesDaEtapa key={`${etapa.id}-${opcoes.dados.atualizado_em}`} opcoes={etapa.opcoes} estado={opcoes.dados}
                ctx={ctx} onSalvo={(novo) => opcoes.setDados(novo)} />
            )}

            {etapa.exemplo && (
              <div>
                <p className="mb-2 text-[13px] font-medium text-texto-3">Texto automático (montado pelo sistema)</p>
                <p className="whitespace-pre-line rounded-[6px] rounded-tr-[2px] bg-[#d9fdd3] px-4 py-3 text-[13.5px] leading-relaxed text-[#111b21]">{etapa.exemplo}</p>
              </div>
            )}

            {etapa.editarEm && (etapa.editarEm === 'respostas' || contaAtual().geral) && (
              <Botao icone={ArrowRight} onClick={() => { fechar(); irPara(etapa.editarEm!); }}>
                {etapa.editarEm === 'respostas' ? 'Editar respostas por necessidade' : 'Cadastrar unidades e bairros'}
              </Botao>
            )}

            {etapa.textos.length > 0 && (
              textos.erro ? <Aviso>{textos.erro}</Aviso> : !textos.dados ? <Esqueleto className="h-40" /> : (
                <div className="flex flex-col gap-4">
                  <p className="text-[13px] font-medium text-texto-3">O que o bot diz nesta etapa</p>
                  {etapa.textos.map((chave) => {
                    const t = textos.dados!.find((x) => x.chave === chave);
                    return t ? <EditorTexto key={t.chave + (t.atualizado_em ?? '') + t.personalizado} texto={t} ctx={ctx} onSalvo={textos.recarregar} /> : null;
                  })}
                </div>
              )
            )}

            {etapa.textos.length === 0 && !etapa.exemplo && !etapa.editarEm && !etapa.opcoes && (
              <p className="text-sm text-texto-2">Esta etapa não envia texto próprio.</p>
            )}
            {!podeEditar && (etapa.textos.length > 0 || etapa.opcoes) && (
              <p className="text-[13px] text-texto-3">Só a coordenação pode mudar esta etapa.</p>
            )}
          </div>
        )}
      </PainelLateral>
    </div>
  );
}

const ROTULO_CONTATO = { perguntar: 'Perguntar se quer contato', sempre: 'Sempre colocar na fila', nunca: 'Nunca (só orientar)' } as const;

function OpcoesDaEtapa({ opcoes, estado, ctx, onSalvo }: {
  opcoes: OpcaoEtapa[]; estado: RespostaOpcoes; ctx: Contexto; onSalvo: (novo: RespostaOpcoes) => void;
}) {
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const mudar = async (chave: string, valor: boolean | string) => {
    setSalvando(chave);
    setErro(null);
    try {
      onSalvo(await api<RespostaOpcoes>(comUnidade('/configuracao/fluxo/opcoes', ctx.unidade), atualizar({ opcoes: { [chave]: valor } }, 'PUT')));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(null);
    }
  };

  return (
    <fieldset className="flex flex-col gap-4 rounded-[6px] border border-linha bg-superficie p-4">
      <legend className="px-1 text-[13px] font-medium text-texto-3">{ctx.unidade ? 'Opções deste CRAS' : 'Opções do padrão da secretaria'}</legend>
      {opcoes.map((op) => {
        const valor = estado.opcoes[op.chave as keyof OpcoesFluxo];
        const bloqueada = !ctx.podeEditar || (op.soSecretaria && Boolean(ctx.unidade));
        const personalizada = estado.personalizadas.includes(op.chave);
        const id = `op-${op.chave}`;
        return (
          <div key={op.chave} className="flex flex-col gap-1.5">
            {op.tipo === 'bool' ? (
              <label htmlFor={id} className="flex items-start gap-3 text-sm">
                <input id={id} type="checkbox" checked={Boolean(valor)} disabled={bloqueada || salvando !== null}
                  onChange={(e) => mudar(op.chave, e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--color-caneta)] disabled:opacity-50" />
                <span className="font-medium">{op.rotulo}</span>
              </label>
            ) : (
              <>
                <label htmlFor={id} className="text-sm font-medium">{op.rotulo}</label>
                <select id={id} value={String(valor)} disabled={bloqueada || salvando !== null}
                  onChange={(e) => mudar(op.chave, e.target.value)} className={`${classeEntrada} disabled:opacity-50`}>
                  {Object.entries(ROTULO_CONTATO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                </select>
              </>
            )}
            <p className={`text-xs text-texto-3 ${op.tipo === 'bool' ? 'pl-7' : ''}`}>
              {op.ajuda}
              {op.soSecretaria && ctx.unidade && ' Definida pela secretaria.'}
              {personalizada && <span className="ml-1 text-caneta">Diferente do padrão da secretaria.</span>}
            </p>
            {op.tipo === 'contato' && valor === 'nunca' && (
              <Aviso>Com “Nunca”, os casos deste fluxo não chegam à Fila: a equipe só fica sabendo de quem for ao CRAS. O bot avisa a pessoa disso no fim. Casos de violência continuam entrando.</Aviso>
            )}
            {op.tipo === 'contato' && valor === 'perguntar' && (
              <Aviso tom="info">Quem responder 2 recebe a orientação, mas o caso não chega à Fila. O bot avisa a pessoa disso antes de ela escolher.</Aviso>
            )}
          </div>
        );
      })}
      {erro && <Aviso>{erro}</Aviso>}
    </fieldset>
  );
}

const linhas = (t: string) => t.split('\n').map((l) => l.trim()).filter(Boolean);

function Respostas({ ctx }: { ctx: Contexto }) {
  const { dados, erro, recarregar } = useAtualizacao(useCallback(() => api<Servico[]>(comUnidade('/configuracao/servicos', ctx.unidade)), [ctx.unidade]), 0);
  const [selecionada, setSelecionada] = useState<string>('renda_beneficio');
  const servico = dados?.find((s) => s.categoria === selecionada);

  if (erro) return <Aviso>{erro}</Aviso>;
  if (!dados) return <Esqueleto className="h-96" />;

  const pendentes = dados.filter((s) => situacaoFonte(s) !== 'ok').length;

  return (
    <>
    {pendentes > 0 && (
      <p className="mb-4 flex items-center gap-2 text-[13px] text-texto-2">
        <CircleAlert className="size-4 shrink-0 text-caneta" aria-hidden />
        {pendentes === 1 ? '1 necessidade está' : `${pendentes} necessidades estão`} sem fonte oficial conferida.
        Antes de usar com o público, confira cada resposta numa fonte oficial e registre o link e a data.
      </p>
    )}
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav aria-label="Necessidades">
        <ul className="flex gap-1 overflow-x-auto lg:flex-col">
          {dados.map((s) => (
            <li key={s.categoria} className="shrink-0">
              <button onClick={() => setSelecionada(s.categoria)} aria-current={selecionada === s.categoria ? 'true' : undefined}
                className={`flex w-full items-center gap-2 rounded-[5px] px-3 py-2 text-left text-sm ${selecionada === s.categoria ? 'bg-elevada text-texto font-medium' : 'text-texto-2 hover:bg-elevada/60 hover:text-texto'}`}>
                {s.urgencia && <ShieldAlert className="size-4 shrink-0 text-urgente" aria-hidden />}
                {nomeCategoria(s.categoria)}
                {s.personalizado && <span className="ml-auto shrink-0 whitespace-nowrap pl-2 text-[11px] text-texto-3">personalizada</span>}
                {situacaoFonte(s) !== 'ok' && (
                  <span className={`${s.personalizado ? '' : 'ml-auto'} shrink-0 whitespace-nowrap pl-2 text-[11px] text-caneta`}>{ROTULO_SITUACAO[situacaoFonte(s) as 'conferir' | 'revisar']}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {servico && <EditorServico key={servico.categoria + (servico.atualizado_em ?? '') + servico.personalizado} servico={servico} ctx={ctx} onSalvo={recarregar} />}
    </div>
    </>
  );
}

function EditorServico({ servico, ctx, onSalvo }: { servico: Servico; ctx: Contexto; onSalvo: () => void }) {
  const [titulo, setTitulo] = useState(servico.titulo);
  const [servicos, setServicos] = useState(servico.servicos.join('\n'));
  const [documentos, setDocumentos] = useState(servico.documentos.join('\n'));
  const [local, setLocal] = useState(servico.local_atendimento);
  const [contato, setContato] = useState(servico.contato_util);
  const [fonte, setFonte] = useState(servico.fonte);
  const [verificadoEm, setVerificadoEm] = useState(servico.verificado_em ?? '');
  const [estado, setEstado] = useState<'livre' | 'salvando' | 'salvo' | 'restaurando'>('livre');
  const [erro, setErro] = useState<string | null>(null);
  const somenteLeitura = !ctx.podeEditar;

  const alterado = titulo !== servico.titulo || servicos !== servico.servicos.join('\n') || documentos !== servico.documentos.join('\n')
    || local !== servico.local_atendimento || contato !== servico.contato_util
    || fonte !== servico.fonte || verificadoEm !== (servico.verificado_em ?? '');
  const [hoje] = useState(() => new Date().toLocaleDateString('sv-SE'));

  const salvar = async () => {
    setEstado('salvando');
    setErro(null);
    try {
      await api(comUnidade(`/configuracao/servicos/${servico.categoria}`, ctx.unidade), atualizar({
        titulo, servicos: linhas(servicos), documentos: linhas(documentos), local_atendimento: local, contato_util: contato,
        fonte, verificado_em: verificadoEm || null,
      }, 'PUT'));
      setEstado('salvo');
      onSalvo();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível salvar.');
      setEstado('livre');
    }
  };

  const restaurar = async () => {
    setEstado('restaurando');
    try {
      await api(comUnidade(`/configuracao/servicos/${servico.categoria}/restaurar`, ctx.unidade), { method: 'POST' });
      onSalvo();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível restaurar.');
      setEstado('livre');
    }
  };

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-4">
        {ctx.unidade && (
          <p className="text-[13px] text-texto-2">
            {servico.personalizado ? 'Personalizada para este CRAS.' : 'Usando o padrão da secretaria. Ao salvar, vira uma versão só deste CRAS.'}
          </p>
        )}
        <fieldset disabled={somenteLeitura} className="flex flex-col gap-4 disabled:opacity-80">
          <Campo id="titulo" rotulo="Título da resposta">
            <input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} className={classeEntrada} />
          </Campo>
          <div className="grid gap-4 md:grid-cols-2">
            <Campo id="servicos" rotulo="O que a pessoa pode procurar" dica="Um item por linha.">
              <textarea id="servicos" rows={6} value={servicos} onChange={(e) => setServicos(e.target.value)} className={`${classeEntrada} resize-y`} />
            </Campo>
            <Campo id="documentos" rotulo="Documentos para levar" dica="Um item por linha.">
              <textarea id="documentos" rows={6} value={documentos} onChange={(e) => setDocumentos(e.target.value)} className={`${classeEntrada} resize-y`} />
            </Campo>
          </div>
          <Campo id="local" rotulo="Onde ir" dica="Endereço e horário ajudam a pessoa a não perder a viagem.">
            <textarea id="local" rows={2} value={local} onChange={(e) => setLocal(e.target.value)} className={`${classeEntrada} resize-y`} />
          </Campo>
          <Campo id="contato" rotulo="Contato">
            <input id="contato" value={contato} onChange={(e) => setContato(e.target.value)} className={classeEntrada} />
          </Campo>
          <div className="grid gap-4 md:grid-cols-[1fr_180px]">
            <Campo id="fonte" rotulo="Fonte oficial" dica="Link ou documento de onde vieram serviços, documentos e local (gov.br, prefeitura, CRAS).">
              <input id="fonte" value={fonte} onChange={(e) => setFonte(e.target.value)} placeholder="https://…" className={classeEntrada} />
            </Campo>
            <Campo id="verificado" rotulo="Conferido em" dica="Data em que alguém conferiu.">
              <input id="verificado" type="date" max={hoje} value={verificadoEm} onChange={(e) => setVerificadoEm(e.target.value)} className={classeEntrada} />
            </Campo>
          </div>
        </fieldset>
        {situacaoFonte({ fonte, verificado_em: verificadoEm || null }) === 'conferir' && (
          <p className="flex items-center gap-2 text-[13px] text-texto-2">
            <CircleAlert className="size-4 shrink-0 text-caneta" aria-hidden />
            Sem fonte e data, esta resposta ainda não foi conferida numa fonte oficial.
          </p>
        )}
        {situacaoFonte({ fonte, verificado_em: verificadoEm || null }) === 'revisar' && (
          <p className="flex items-center gap-2 text-[13px] text-texto-2">
            <CircleAlert className="size-4 shrink-0 text-caneta" aria-hidden />
            Conferida há mais de {VALIDADE_CONFERENCIA_DIAS / 30} meses: vale revisar se as regras mudaram.
          </p>
        )}
        {erro && <Aviso>{erro}</Aviso>}
        {!somenteLeitura && (
          <div className="flex flex-wrap items-center gap-3">
            <Botao variante="primario" icone={Save} carregando={estado === 'salvando'} disabled={!alterado} onClick={salvar}>
              {ctx.unidade ? 'Salvar para este CRAS' : 'Salvar resposta'}
            </Botao>
            {(!ctx.unidade || servico.personalizado) && (
              <Botao variante="fantasma" icone={RotateCcw} carregando={estado === 'restaurando'} onClick={restaurar}>
                {ctx.unidade ? 'Voltar ao padrão da secretaria' : 'Voltar ao texto original'}
              </Botao>
            )}
            {estado === 'salvo' && !alterado && <span role="status" className="text-sm text-ok">Salvo. Já vale para as próximas conversas.</span>}
          </div>
        )}
        {servico.atualizado_em && (
          <p className="text-xs text-texto-3">Última alteração em {dataHora(servico.atualizado_em)}{servico.atualizado_por ? ` por ${servico.atualizado_por}` : ''}.</p>
        )}
      </div>

      <aside aria-label="Prévia no WhatsApp" className="xl:sticky xl:top-6 self-start">
        <p className="mb-2 text-[13px] font-medium text-texto-2">Como aparece no WhatsApp</p>
        <div className="rounded-[6px] border border-linha bg-[#efeae2] p-4">
          <div className="ml-6 rounded-[6px] rounded-tr-[2px] bg-[#d9fdd3] px-4 py-3 text-[13.5px] leading-relaxed text-[#111b21] shadow-[0_1px_0_rgb(0_0_0/0.08)]">
            <p className="font-semibold">📋 {titulo}</p>
            <p className="mt-3 font-semibold">O que você pode procurar:</p>
            {linhas(servicos).map((s) => <p key={s}>• {s}</p>)}
            <p className="mt-3 font-semibold">Documentos para levar:</p>
            {linhas(documentos).map((d) => <p key={d}>• {d}</p>)}
            <p className="mt-3"><span className="font-semibold">Onde ir:</span> {local}</p>
            <p><span className="font-semibold">Contato:</span> {contato}</p>
            <p className="mt-3 text-[#54656f]">Lembre: é uma orientação. Quem confirma o seu direito é o profissional do atendimento.</p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function EditorTexto({ texto, ctx, onSalvo }: { texto: TextoBot; ctx: Contexto; onSalvo: () => void }) {
  const [valor, setValor] = useState(texto.texto);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const somenteLeitura = !ctx.podeEditar;

  const executar = async (caminho: string, opcoes: RequestInit) => {
    setSalvando(true);
    setErro(null);
    try {
      await api(comUnidade(caminho, ctx.unidade), opcoes);
      setSalvo(true);
      onSalvo();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  // No CRAS, "voltar" apaga a personalização; na secretaria, volta ao texto original do sistema
  const podeVoltar = ctx.unidade ? texto.personalizado : texto.texto !== texto.padrao;
  const id = `texto-${texto.chave}`;
  return (
    <div className="rounded-[6px] border border-linha bg-superficie p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={id} className="font-medium">{texto.descricao}</label>
        {ctx.unidade && <span className={`text-[11px] ${texto.personalizado ? 'text-caneta' : 'text-texto-3'}`}>{texto.personalizado ? 'personalizado neste CRAS' : 'padrão da secretaria'}</span>}
      </div>
      <textarea id={id} rows={Math.min(10, Math.max(3, valor.split('\n').length + 1))} value={valor} readOnly={somenteLeitura}
        onChange={(e) => { setValor(e.target.value); setSalvo(false); }}
        className={`${classeEntrada} mt-2 resize-y font-[inherit] leading-relaxed ${somenteLeitura ? 'opacity-80' : ''}`} />
      {!somenteLeitura && <p className="mt-1 text-xs text-texto-3">Use *asteriscos* para negrito no WhatsApp.</p>}
      {erro && <div className="mt-2"><Aviso>{erro}</Aviso></div>}
      {!somenteLeitura && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Botao tamanho="sm" variante="primario" icone={Save} carregando={salvando} disabled={valor === texto.texto}
            onClick={() => executar(`/configuracao/textos/${texto.chave}`, atualizar({ texto: valor }, 'PUT'))}>
            {ctx.unidade ? 'Salvar para este CRAS' : 'Salvar'}
          </Botao>
          {podeVoltar && (
            <Botao tamanho="sm" variante="fantasma" icone={RotateCcw}
              onClick={() => executar(`/configuracao/textos/${texto.chave}/restaurar`, enviar({}))}>
              {ctx.unidade ? 'Voltar ao padrão da secretaria' : 'Voltar ao original'}
            </Botao>
          )}
          {salvo && <span role="status" className="text-xs text-ok">Salvo.</span>}
          {texto.atualizado_em && <span className="text-xs text-texto-3">Alterado em {dataHora(texto.atualizado_em)}{texto.atualizado_por ? ` por ${texto.atualizado_por}` : ''}</span>}
        </div>
      )}
    </div>
  );
}
