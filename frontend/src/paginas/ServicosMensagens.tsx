import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, LayoutGrid, Lock, Move, Plus, Save, Trash2 } from 'lucide-react';
import { api, atualizar, ErroApi } from '../api';
import { CanvasFluxo } from '../components/CanvasFluxo';
import { TrilhoFluxo } from '../components/TrilhoFluxo';
import { BalaoTexto, whatsapp, type Contexto, type TextoBot } from '../components/BalaoTexto';
import { Aviso, Botao, Campo, Chave, classeEntrada, Esqueleto, Segmentado } from '../components/ui';
import {
  contagemPorEtapa, ETAPAS, etapaDaExtra, type MensagemExtra, type Ponto, etapasPuladas, LIGACOES, TRILHO, type Etapa, type OpcaoEtapa, type OpcoesFluxo,
} from '../fluxoBot';
import { comUnidade, contaAtual, nomeUnidade, useUnidades, type UnidadeResumo } from '../unidades';
import { useAtualizacao } from '../useAtualizacao';
import { Respostas } from './RespostasNecessidade';
import { Unidades } from './Unidades';
import { irPara as irParaRota } from '../navegacao';


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

/** Unidade em edição: null = padrão da secretaria. */
export function ServicosMensagens({ aba: abaPedida }: { aba?: string }) {
  const conta = contaAtual();
  const unidades = useUnidades();
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const unidade = conta.unidadeId ?? escolhida;
  const ctx: Contexto = { unidade, podeEditar: conta.coordenacao };
  const abas: [Aba, string][] = [['fluxo', 'Fluxo da conversa'], ['respostas', 'Respostas por necessidade']];
  if (conta.geral) abas.push(['unidades', 'Unidades de atendimento']);
  // A aba vem do endereço (#/servicos/respostas), para o menu levar direto a ela
  const aba: Aba = abas.some(([id]) => id === abaPedida) ? (abaPedida as Aba) : 'fluxo';
  const setAba = (id: Aba) => irParaRota('servicos', id);

  // Unidades de atendimento é da Gestão: aparece sozinha, sem o seletor e os avisos do bot
  if (aba === 'unidades' && conta.geral) return <Unidades />;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <p className="max-w-[75ch] text-[14.5px] text-texto-2">
          O que o bot responde no WhatsApp. As mudanças valem na hora para as próximas conversas, sem precisar de programador.
        </p>
        <SeletorUnidade unidades={unidades.dados} unidade={unidade} fixa={Boolean(conta.unidadeId)} onMudar={setEscolhida} />
      </div>

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

      {aba === 'fluxo' && <Fluxo key={`f-${unidade}`} ctx={ctx} unidades={unidades.dados} irPara={setAba} />}
      {aba === 'respostas' && <Respostas key={`r-${unidade}`} ctx={ctx} />}
    </>
  );
}

function SeletorUnidade({ unidades, unidade, fixa, onMudar }: {
  unidades: UnidadeResumo[] | null; unidade: string | null; fixa: boolean; onMudar: (u: string | null) => void;
}) {
  if (fixa) {
    return (
      <p className="rounded-[3px] border border-linha bg-superficie px-3 py-2 text-sm">
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

const POR_ID: Record<string, Etapa> = Object.fromEntries(ETAPAS.map((e) => [e.id, e]));

function Fluxo({ ctx, unidades, irPara }: { ctx: Contexto; unidades: UnidadeResumo[] | null; irPara: (aba: Aba) => void }) {
  const { unidade } = ctx;
  const textos = useAtualizacao(useCallback(() => api<TextoBot[]>(comUnidade('/configuracao/textos', unidade)), [unidade]), 0);
  const opcoes = useAtualizacao(useCallback(() => api<RespostaOpcoes>(comUnidade('/configuracao/fluxo/opcoes', unidade)), [unidade]), 0);
  const agora = useAtualizacao(useCallback(() => api<Agora>(comUnidade('/configuracao/fluxo/agora', unidade)), [unidade]), 10000);
  const desenho = useAtualizacao(useCallback(() => api<RespostaDesenho>(comUnidade('/configuracao/fluxo/desenho', unidade)), [unidade]), 0);
  const [selecionada, setSelecionada] = useState('boas_vindas');
  const [orelha, setOrelha] = useState<number | null>(null);
  const [salvandoDesenho, setSalvandoDesenho] = useState<'salvando' | 'salvo' | null>(null);
  const [erroDesenho, setErroDesenho] = useState<string | null>(null);
  const editor = useRef<HTMLElement>(null);
  const larga = useTelaLarga();

  const contagem = useMemo(() => (agora.dados ? contagemPorEtapa(agora.dados.por_estado, agora.dados.com_atendente) : {}), [agora.dados]);
  const temCras = Boolean(unidades?.some((u) => u.tipo === 'CRAS' && u.ativo));
  const puladas = useMemo(() => etapasPuladas(opcoes.dados?.opcoes ?? null, temCras, Boolean(unidade)), [opcoes.dados, temCras, unidade]);
  const personalizadas = useMemo(() => {
    const saida = new Set<string>();
    if (!unidade) return saida;
    for (const e of ETAPAS) {
      const texto = e.textos.some((k) => textos.dados?.find((t) => t.chave === k)?.personalizado);
      const opcao = e.opcoes?.some((o) => opcoes.dados?.personalizadas.includes(o.chave));
      if (texto || opcao) saida.add(e.id);
    }
    return saida;
  }, [unidade, textos.dados, opcoes.dados]);

  const abrir = useCallback((id: string) => {
    setSelecionada(id);
    // No celular o trilho é comprido: leva até o editor
    if (!larga) requestAnimationFrame(() => editor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [larga]);

  /** Salva só o que mudou (posições ou extras; null volta ao padrão). A tela mostra a mudança antes da resposta. */
  const { dados: dadosDesenho, setDados: setDesenho, recarregar: recarregarDesenho } = desenho;
  const salvarDesenho = useCallback(async (parcial: { posicoes?: Record<string, Ponto> | null; extras?: MensagemExtra[] }) => {
    if (dadosDesenho) {
      setDesenho({
        ...dadosDesenho,
        posicoes: parcial.posicoes === null ? {} : parcial.posicoes ?? dadosDesenho.posicoes,
        extras: parcial.extras ?? dadosDesenho.extras,
      });
    }
    setSalvandoDesenho('salvando');
    setErroDesenho(null);
    try {
      setDesenho(await api<RespostaDesenho>(comUnidade('/configuracao/fluxo/desenho', unidade), atualizar(parcial, 'PUT')));
      setSalvandoDesenho('salvo');
      return true;
    } catch (e) {
      setErroDesenho(e instanceof ErroApi ? e.message : 'Não foi possível salvar o desenho.');
      setSalvandoDesenho(null);
      recarregarDesenho();
      return false;
    }
  }, [dadosDesenho, setDesenho, recarregarDesenho, unidade]);

  const adicionar = useCallback((antesDe: string) => {
    setSelecionada(`novo:${antesDe}`);
    requestAnimationFrame(() => editor.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }, []);

  const extras = dadosDesenho?.extras ?? [];
  const extraEscolhida = extras.find((e) => e.id === selecionada) ?? null;
  const novaAntesDe = selecionada.startsWith('novo:') ? selecionada.slice(5) : null;
  const etapa = extraEscolhida ? etapaDaExtra(extraEscolhida) : POR_ID[selecionada] ?? (novaAntesDe ? null : POR_ID.boas_vindas);
  const usados = new Set(ETAPAS.flatMap((e) => e.textos));
  const avulsos = textos.dados?.filter((t) => !usados.has(t.chave)) ?? [];
  const totalAgora = Object.values(contagem).reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="max-w-[72ch] text-[15px] text-texto-2">
          {larga
            ? 'A conversa vai da esquerda para a direita; os desvios descem da etapa de onde saem.'
            : 'A conversa segue o trilho, na ordem dos números; os desvios ficam embaixo da etapa de onde saem.'}
          {' '}Escolha uma etapa para ver e editar o que o bot diz nela.
        </p>
        {agora.dados && (
          <p role="status" className="text-[13px] text-texto-3">
            {totalAgora ? `${totalAgora} conversa${totalAgora > 1 ? 's' : ''} em andamento` : 'Nenhuma conversa em andamento'} nos últimos {agora.dados.janela_minutos} min
          </p>
        )}
      </div>

      {opcoes.erro && <Aviso>{opcoes.erro}</Aviso>}
      {erroDesenho && <Aviso>{erroDesenho}</Aviso>}
      {larga && ctx.podeEditar && dadosDesenho && (
        <div className="-mb-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="flex items-center gap-2 text-[13.5px] text-texto-2">
            <Move className="size-4 shrink-0 text-texto-3" aria-hidden />
            Arraste os quadradinhos para organizar. No <Plus className="inline size-3.5" aria-label="mais" /> de uma ligação, ponha uma mensagem a mais.
          </p>
          <div className="flex items-center gap-3">
            <p role="status" className="text-[13px] text-texto-3">
              {salvandoDesenho === 'salvando' ? 'Salvando…' : salvandoDesenho === 'salvo' ? 'Desenho salvo.' : ''}
            </p>
            <Botao tamanho="sm" icone={LayoutGrid} disabled={Object.keys(dadosDesenho.posicoes).length === 0}
              onClick={() => salvarDesenho({ posicoes: null })}>
              Organizar automaticamente
            </Botao>
          </div>
        </div>
      )}
      {larga
        ? <CanvasFluxo selecionada={selecionada} contagem={contagem} puladas={puladas} personalizadas={personalizadas} onAbrir={abrir}
            posicoes={dadosDesenho?.posicoes ?? {}} extras={extras} ancoras={dadosDesenho?.ancoras ?? []}
            podeEditar={ctx.podeEditar && Boolean(dadosDesenho)} onMover={(posicoes) => { void salvarDesenho({ posicoes }); }}
            onAdicionar={adicionar} onOrelha={setOrelha} />
        : <TrilhoFluxo selecionada={selecionada} contagem={contagem} puladas={puladas} personalizadas={personalizadas} onAbrir={abrir} extras={extras} />}

      <section ref={editor} aria-labelledby="t-etapa" data-sem-orelha={orelha === null || novaAntesDe ? '' : undefined}
        style={orelha === null ? undefined : { '--orelha': `${orelha}px` } as CSSProperties}
        className="editor-etapa mt-2 scroll-mt-4 rounded-[4px] border border-linha-forte bg-superficie shadow-[0_10px_28px_-20px_rgb(27_39_51/0.45)]">
        {(extraEscolhida || novaAntesDe) && dadosDesenho ? (
          <EditorExtra key={selecionada} extra={extraEscolhida} antesDe={extraEscolhida?.antes_de ?? novaAntesDe!} desenho={dadosDesenho} ctx={ctx}
            onSalvar={async (lista, id) => { if (await salvarDesenho({ extras: lista })) setSelecionada(id); }}
            onRemover={async (lista, antesDe) => { if (await salvarDesenho({ extras: lista })) setSelecionada(antesDe); }} />
        ) : etapa && (
        <div key={etapa.id} className="assentar flex flex-col gap-6 p-5 sm:p-6">
          <CabecalhoEtapa etapa={etapa} contagem={contagem[etapa.id] ?? 0} />
          {puladas[etapa.id] && <Aviso tom="info">{puladas[etapa.id].motivo}</Aviso>}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex min-w-0 flex-col gap-3">
              <h3 className="text-[13.5px] font-semibold text-texto-2">O que a pessoa vê no WhatsApp</h3>
              <MensagensEtapa etapa={etapa} textos={textos} ctx={ctx} />
              {etapa.editarEm && (etapa.editarEm === 'respostas' || contaAtual().geral) && (
                <Botao className="self-start" icone={ArrowRight} onClick={() => irPara(etapa.editarEm!)}>
                  {etapa.editarEm === 'respostas' ? 'Editar serviços e documentos de cada necessidade' : 'Cadastrar lugares e bairros'}
                </Botao>
              )}
            </div>
            <aside className="flex flex-col gap-5">
              <AjustesEtapa etapa={etapa} estado={opcoes.dados} ctx={ctx} onSalvo={(novo) => opcoes.setDados(novo)} />
              <ParaOndeVai etapa={etapa} semConfirmacao={opcoes.dados ? !opcoes.dados.opcoes.confirmar_necessidade : false} onAbrir={abrir} />
            </aside>
          </div>
        </div>
        )}
      </section>

      {avulsos.length > 0 && (
        <section aria-labelledby="t-avulsos" className="mt-4">
          <h2 id="t-avulsos" className="mb-3 titulo text-[19px] leading-[1.05]">Outros textos</h2>
          <div className="conversa-whats flex flex-col gap-4 rounded-[4px] border border-linha px-4 py-5 sm:px-6">
            {avulsos.map((t) => <BalaoTexto key={t.chave + (t.atualizado_em ?? '')} texto={t} ctx={ctx} onSalvo={textos.recarregar} />)}
          </div>
        </section>
      )}
    </div>
  );
}

/** Mensagem extra: o que a pessoa recebe e antes de qual etapa. Salvar manda a lista inteira deste fluxo. */
function EditorExtra({ extra, antesDe, desenho, ctx, onSalvar, onRemover }: {
  extra: MensagemExtra | null; antesDe: string; desenho: RespostaDesenho; ctx: Contexto;
  onSalvar: (lista: MensagemExtra[], id: string) => Promise<void>; onRemover: (lista: MensagemExtra[], antesDe: string) => Promise<void>;
}) {
  const [titulo, setTitulo] = useState(extra?.titulo ?? '');
  const [texto, setTexto] = useState(extra?.texto ?? '');
  const [ancora, setAncora] = useState(antesDe);
  const [ocupado, setOcupado] = useState<'salvando' | 'removendo' | null>(null);
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);
  const somenteLeitura = !ctx.podeEditar;
  const nova = !extra;
  const alterado = nova ? texto.trim().length > 0 : titulo !== extra.titulo || texto !== extra.texto || ancora !== extra.antes_de;
  const herdadas = Boolean(ctx.unidade) && !desenho.extras_proprias && desenho.extras.length > 0;
  const cabecalho = etapaDaExtra({ id: extra?.id ?? 'novo', antes_de: ancora, titulo: titulo.trim() || (nova ? 'Nova mensagem extra' : 'Mensagem extra'), texto });

  const salvar = async () => {
    setOcupado('salvando');
    const id = extra?.id ?? `x-${Math.random().toString(36).slice(2, 10)}`;
    const item = { id, antes_de: ancora, titulo: titulo.trim() || 'Mensagem extra', texto: texto.trim() };
    const lista = nova ? [...desenho.extras, item] : desenho.extras.map((e) => (e.id === id ? item : e));
    await onSalvar(lista, id);
    setOcupado(null);
  };

  const remover = async () => {
    if (!extra) return;
    setOcupado('removendo');
    await onRemover(desenho.extras.filter((e) => e.id !== extra.id), extra.antes_de);
    setOcupado(null);
  };

  return (
    <div className="assentar flex flex-col gap-6 p-5 sm:p-6">
      <CabecalhoEtapa etapa={cabecalho} contagem={0} />
      {herdadas && (
        <Aviso tom="info">Estas mensagens extras vêm do padrão da secretaria. Ao salvar, este CRAS passa a ter as suas próprias.</Aviso>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-3">
          <h3 className="text-[13.5px] font-semibold text-texto-2">O que a pessoa vê no WhatsApp</h3>
          <div className="conversa-whats flex flex-col gap-3 rounded-[4px] border border-linha px-4 py-5 sm:px-6">
            <div className="balao-whats ml-2 max-w-[560px] whitespace-pre-wrap px-3 py-2 text-[14.5px] leading-[1.45]">
              {texto.trim() ? whatsapp(texto) : <span className="text-whats-2">A mensagem aparece aqui enquanto você escreve.</span>}
            </div>
            <p className="pl-2 text-[12.5px] text-whats-2">Logo depois vem a mensagem de “{POR_ID[ancora]?.titulo}”.</p>
          </div>
        </div>
        <aside className="flex flex-col gap-4 rounded-[4px] border border-linha p-4">
          <fieldset disabled={somenteLeitura || ocupado !== null} className="flex flex-col gap-4 disabled:opacity-80">
            <Campo id="extra-titulo" rotulo="Nome do quadradinho" dica="Só aparece no painel.">
              <input id="extra-titulo" maxLength={60} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Horário de atendimento" className={classeEntrada} />
            </Campo>
            <Campo id="extra-texto" rotulo="Mensagem" dica="Use *asteriscos* para negrito, como no WhatsApp.">
              <textarea id="extra-texto" rows={5} maxLength={1000} value={texto} onChange={(e) => setTexto(e.target.value)} className={`${classeEntrada} resize-y`} />
            </Campo>
            <Campo id="extra-ancora" rotulo="Enviar logo antes de">
              <select id="extra-ancora" value={ancora} onChange={(e) => setAncora(e.target.value)} className={classeEntrada}>
                {desenho.ancoras.map((a) => <option key={a} value={a}>{POR_ID[a]?.titulo ?? a}</option>)}
              </select>
            </Campo>
          </fieldset>
          <p className="flex items-start gap-2 text-[13px] leading-snug text-texto-2">
            <Lock className="mt-0.5 size-4 shrink-0 text-texto-3" aria-hidden />
            Antes do aceite e na violência não entra mensagem extra: essas etapas são travadas.
          </p>
          {!somenteLeitura && (
            <div className="flex flex-wrap items-center gap-2">
              <Botao variante="primario" icone={Save} disabled={!alterado || !texto.trim() || ocupado !== null} onClick={salvar}>
                {ocupado === 'salvando' ? 'Salvando…' : nova ? 'Adicionar ao fluxo' : 'Salvar'}
              </Botao>
              {!nova && (confirmarRemocao ? (
                <Botao variante="perigo" icone={Trash2} disabled={ocupado !== null} onClick={remover}>{ocupado === 'removendo' ? 'Removendo…' : 'Confirmar remoção'}</Botao>
              ) : (
                <Botao icone={Trash2} onClick={() => setConfirmarRemocao(true)}>Remover do fluxo</Botao>
              ))}
            </div>
          )}
          {somenteLeitura && <p className="text-[13px] text-texto-3">Só a coordenação muda as mensagens extras.</p>}
        </aside>
      </div>
    </div>
  );
}

function CabecalhoEtapa({ etapa, contagem }: { etapa: Etapa; contagem: number }) {
  const Icone = etapa.icone;
  const numero = TRILHO.indexOf(etapa.id);
  const urgente = etapa.tipo === 'urgente';
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3.5">
        <span className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full border-2 ${urgente ? 'border-urgente bg-urgente-fundo text-urgente' : 'border-acao bg-acao text-sobre-acao'}`}>
          {numero >= 0 && etapa.tipo !== 'fim'
            ? <span className="titulo text-[17px] leading-none tabular">{numero + 1}</span>
            : <Icone className="size-[18px]" aria-hidden />}
        </span>
        <div>
          <h2 id="t-etapa" className="titulo text-[24px] leading-[1.1]">{etapa.titulo}</h2>
          <p className="mt-1.5 max-w-[68ch] text-[15px] leading-relaxed text-texto-2">{etapa.quando}</p>
        </div>
      </div>
      {contagem > 0 && (
        <span className="rounded-full bg-info-fundo px-2.5 py-1 text-[13px] font-medium tabular text-info">
          {contagem} conversa{contagem > 1 ? 's' : ''} aqui agora
        </span>
      )}
    </header>
  );
}

function MensagensEtapa({ etapa, textos, ctx }: {
  etapa: Etapa; textos: ReturnType<typeof useAtualizacao<TextoBot[]>>; ctx: Contexto;
}) {
  if (etapa.textos.length > 0) {
    if (textos.erro) return <Aviso>{textos.erro}</Aviso>;
    if (!textos.dados) return <Esqueleto className="h-40" />;
  }
  return (
    <div className="conversa-whats flex flex-col gap-5 rounded-[4px] border border-linha px-4 py-5 sm:px-6">
      {etapa.textos.map((chave) => {
        const t = textos.dados?.find((x) => x.chave === chave);
        return t ? <BalaoTexto key={t.chave + (t.atualizado_em ?? '') + t.personalizado} texto={t} ctx={ctx} onSalvo={textos.recarregar} /> : null;
      })}
      {etapa.exemplo && (
        <div className="flex flex-col gap-1.5">
          <p className="pl-2 text-[12.5px] text-whats-2">Texto automático, montado pelo sistema a cada conversa</p>
          <div className="balao-whats ml-2 max-w-[560px] whitespace-pre-wrap px-3 py-2 text-[14.5px] leading-[1.45]">{whatsapp(etapa.exemplo)}</div>
        </div>
      )}
      {etapa.textos.length === 0 && !etapa.exemplo && (
        <p className="text-[14px] text-whats-2">
          {etapa.tipo === 'fim' ? 'Aqui a conversa chega ao fim: esta etapa não manda mensagem própria.' : 'Esta etapa não manda mensagem própria.'}
        </p>
      )}
    </div>
  );
}

const ROTULO_CONTATO = [
  { valor: 'perguntar', rotulo: 'Perguntar' },
  { valor: 'sempre', rotulo: 'Sempre' },
  { valor: 'nunca', rotulo: 'Nunca' },
] as const;

function AjustesEtapa({ etapa, estado, ctx, onSalvo }: {
  etapa: Etapa; estado: RespostaOpcoes | null; ctx: Contexto; onSalvo: (novo: RespostaOpcoes) => void;
}) {
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const opcoes: OpcaoEtapa[] = etapa.opcoes ?? [];

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
    <section aria-labelledby="t-ajustes" className="flex flex-col gap-4 rounded-[4px] border border-linha p-4">
      <h3 id="t-ajustes" className="text-[13.5px] font-semibold text-texto-2">{ctx.unidade ? 'Ajustes deste CRAS' : 'Ajustes do padrão da secretaria'}</h3>
      {opcoes.length > 0 && !estado && <Esqueleto className="h-16" />}
      {estado && opcoes.map((op) => {
        const valor = estado.opcoes[op.chave as keyof OpcoesFluxo];
        const bloqueada = !ctx.podeEditar || (op.soSecretaria && Boolean(ctx.unidade)) || salvando !== null;
        const rotuloId = `rot-${op.chave}`;
        const nota = (
          <>
            {op.soSecretaria && ctx.unidade && <span className="block text-texto-3">Definida pela secretaria.</span>}
            {estado.personalizadas.includes(op.chave) && <span className="block text-caneta">Diferente do padrão da secretaria.</span>}
          </>
        );
        if (op.tipo === 'bool') {
          return (
            <div key={op.chave} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p id={rotuloId} className="text-[14.5px] font-semibold leading-snug">{op.rotulo}</p>
                <p className="mt-1 text-[13px] leading-snug text-texto-2">{op.ajuda}{nota}</p>
              </div>
              <Chave id={`op-${op.chave}`} rotuloId={rotuloId} ligada={Boolean(valor)} disabled={bloqueada} onMudar={(v) => mudar(op.chave, v)} />
            </div>
          );
        }
        return (
          <div key={op.chave} className="flex flex-col gap-2">
            <p id={rotuloId} className="text-[14.5px] font-semibold leading-snug">{op.rotulo}</p>
            <Segmentado rotuloId={rotuloId} valor={String(valor)} opcoes={[...ROTULO_CONTATO]} disabled={bloqueada} onMudar={(v) => mudar(op.chave, v)} />
            <p className="text-[13px] leading-snug text-texto-2">
              {valor === 'perguntar' && 'O bot pergunta no fim. Quem responder 2 recebe a orientação, mas o caso não chega à Fila (o bot avisa a pessoa antes).'}
              {valor === 'sempre' && 'Todo caso concluído entra na Fila, sem perguntar.'}
              {valor === 'nunca' && 'O bot só orienta: a equipe só fica sabendo de quem for ao CRAS. Casos de violência continuam entrando.'}
              {nota}
            </p>
            {valor === 'nunca' && <Aviso>Com “Nunca”, nenhum caso deste fluxo chega à Fila, a não ser os de violência.</Aviso>}
          </div>
        );
      })}
      {etapa.travada && (
        <p className="flex items-start gap-2 text-[13px] leading-snug text-texto-2">
          <Lock className="mt-0.5 size-4 shrink-0 text-texto-3" aria-hidden />
          {etapa.travada}
        </p>
      )}
      {opcoes.length === 0 && !etapa.travada && <p className="text-[13px] text-texto-3">Nada para ligar ou desligar nesta etapa.</p>}
      {!ctx.podeEditar && opcoes.length > 0 && <p className="text-[13px] text-texto-3">Só a coordenação muda os ajustes.</p>}
      {erro && <Aviso>{erro}</Aviso>}
    </section>
  );
}

function ParaOndeVai({ etapa, semConfirmacao, onAbrir }: { etapa: Etapa; semConfirmacao: boolean; onAbrir: (id: string) => void }) {
  const saidas = LIGACOES.filter((l) => l.de === etapa.id && (!l.quando || (l.quando === 'sem_confirmacao' && semConfirmacao)));
  return (
    <section aria-labelledby="t-depois" className="flex flex-col gap-2">
      <h3 id="t-depois" className="text-[13.5px] font-semibold text-texto-2">Para onde a conversa vai</h3>
      {saidas.length > 0 ? (
        <ul className="flex flex-col">
          {saidas.map((l) => (
            <li key={l.para}>
              <button type="button" onClick={() => onAbrir(l.para)}
                className="group flex w-full items-center gap-2 rounded-[3px] px-2 py-1.5 text-left text-[14px] hover:bg-elevada focus-visible:outline-2 focus-visible:outline-caneta">
                <span className="text-texto-2">{l.rotulo ?? 'depois'}</span>
                <ArrowRight className={`size-3.5 shrink-0 ${l.urgente ? 'text-urgente' : 'text-texto-3'}`} aria-hidden />
                <span className="font-semibold group-hover:underline group-hover:underline-offset-4">{POR_ID[l.para].titulo}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] leading-relaxed text-texto-2">{etapa.depois ?? (etapa.tipo === 'fim' ? 'A conversa termina aqui.' : 'Depois disso, a conversa segue de onde estava.')}</p>
      )}
    </section>
  );
}
