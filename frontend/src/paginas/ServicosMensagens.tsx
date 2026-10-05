import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, CircleAlert, Lock, Pencil, RotateCcw, Save, ShieldAlert } from 'lucide-react';
import { api, atualizar, enviar, ErroApi } from '../api';
import { TrilhoFluxo } from '../components/TrilhoFluxo';
import { Aviso, Botao, Campo, Chave, classeEntrada, Esqueleto, Segmentado } from '../components/ui';
import {
  colunaDaEtapa, contagemPorEtapa, ETAPAS, etapasPuladas, LIGACOES, TRILHO, type Etapa, type OpcaoEtapa, type OpcoesFluxo,
} from '../fluxoBot';
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

const POR_ID: Record<string, Etapa> = Object.fromEntries(ETAPAS.map((e) => [e.id, e]));

function Fluxo({ ctx, unidades, irPara }: { ctx: Contexto; unidades: UnidadeResumo[] | null; irPara: (aba: Aba) => void }) {
  const { unidade } = ctx;
  const textos = useAtualizacao(useCallback(() => api<TextoBot[]>(comUnidade('/configuracao/textos', unidade)), [unidade]), 0);
  const opcoes = useAtualizacao(useCallback(() => api<RespostaOpcoes>(comUnidade('/configuracao/fluxo/opcoes', unidade)), [unidade]), 0);
  const agora = useAtualizacao(useCallback(() => api<Agora>(comUnidade('/configuracao/fluxo/agora', unidade)), [unidade]), 10000);
  const [selecionada, setSelecionada] = useState('boas_vindas');
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

  const etapa = POR_ID[selecionada];
  const usados = new Set(ETAPAS.flatMap((e) => e.textos));
  const avulsos = textos.dados?.filter((t) => !usados.has(t.chave)) ?? [];
  const totalAgora = Object.values(contagem).reduce((a, b) => a + b, 0);
  const coluna = colunaDaEtapa(etapa.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="max-w-[72ch] text-[15px] text-texto-2">
          A conversa segue o trilho, na ordem dos números; os desvios ficam embaixo da etapa de onde saem.
          Escolha uma etapa para ver e editar o que o bot diz nela.
        </p>
        {agora.dados && (
          <p role="status" className="text-[13px] text-texto-3">
            {totalAgora ? `${totalAgora} conversa${totalAgora > 1 ? 's' : ''} em andamento` : 'Nenhuma conversa em andamento'} nos últimos {agora.dados.janela_minutos} min
          </p>
        )}
      </div>

      {opcoes.erro && <Aviso>{opcoes.erro}</Aviso>}
      <TrilhoFluxo selecionada={selecionada} contagem={contagem} puladas={puladas} personalizadas={personalizadas} onAbrir={abrir} />

      <section ref={editor} aria-labelledby="t-etapa" data-sem-orelha={coluna === null ? '' : undefined}
        style={coluna === null ? undefined : { '--orelha': `calc(21px + ${coluna} * ((100% - 102px) / 6 + 12px) + (100% - 102px) / 12)` } as CSSProperties}
        className="editor-etapa mt-2 scroll-mt-4 rounded-[6px] border border-linha-forte bg-superficie shadow-[0_10px_28px_-20px_rgb(23_40_74/0.45)]">
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
      </section>

      {avulsos.length > 0 && (
        <section aria-labelledby="t-avulsos" className="mt-4">
          <h2 id="t-avulsos" className="mb-3 titulo text-[19px] leading-[1.05]">Outros textos</h2>
          <div className="conversa-whats flex flex-col gap-4 rounded-[6px] border border-linha px-4 py-5 sm:px-6">
            {avulsos.map((t) => <BalaoTexto key={t.chave + (t.atualizado_em ?? '')} texto={t} ctx={ctx} onSalvo={textos.recarregar} />)}
          </div>
        </section>
      )}
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
        <span className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full border-2 ${urgente ? 'border-urgente bg-urgente-fundo text-urgente' : 'border-texto bg-texto text-white'}`}>
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
    <div className="conversa-whats flex flex-col gap-5 rounded-[6px] border border-linha px-4 py-5 sm:px-6">
      {etapa.textos.map((chave) => {
        const t = textos.dados?.find((x) => x.chave === chave);
        return t ? <BalaoTexto key={t.chave + (t.atualizado_em ?? '') + t.personalizado} texto={t} ctx={ctx} onSalvo={textos.recarregar} /> : null;
      })}
      {etapa.exemplo && (
        <div className="flex flex-col gap-1.5">
          <p className="pl-2 text-[12.5px] text-[#54656f]">Texto automático, montado pelo sistema a cada conversa</p>
          <div className="balao-whats ml-2 max-w-[560px] whitespace-pre-wrap px-3 py-2 text-[14.5px] leading-[1.45]">{whatsapp(etapa.exemplo)}</div>
        </div>
      )}
      {etapa.textos.length === 0 && !etapa.exemplo && (
        <p className="text-[14px] text-[#54656f]">
          {etapa.tipo === 'fim' ? 'Aqui a conversa chega ao fim: esta etapa não manda mensagem própria.' : 'Esta etapa não manda mensagem própria.'}
        </p>
      )}
    </div>
  );
}

/** Negrito do WhatsApp (*assim*) na prévia. */
function whatsapp(texto: string) {
  return texto.split(/(\*[^*\n]+\*)/g).map((parte, i) =>
    parte.length > 2 && parte.startsWith('*') && parte.endsWith('*') ? <strong key={i} className="font-semibold">{parte.slice(1, -1)}</strong> : parte,
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
    <section aria-labelledby="t-ajustes" className="flex flex-col gap-4 rounded-[6px] border border-linha p-4">
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
                className="group flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left text-[14px] hover:bg-elevada focus-visible:outline-2 focus-visible:outline-caneta">
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
        <p className="mb-2 text-[13.5px] font-semibold text-texto-2">O que a pessoa vê no WhatsApp</p>
        <div className="conversa-whats rounded-[6px] border border-linha py-4 pl-5 pr-4">
          <div className="balao-whats px-3.5 py-2.5 text-[13.5px] leading-relaxed">
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

/** A caixa de edição cresce com o texto, como o próprio balão. */
function crescer(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

/** Uma mensagem do bot no balão do WhatsApp, editada ali mesmo. */
function BalaoTexto({ texto, ctx, onSalvo }: { texto: TextoBot; ctx: Contexto; onSalvo: () => void }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(texto.texto);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const executar = async (caminho: string, opcoes: RequestInit) => {
    setSalvando(true);
    setErro(null);
    try {
      await api(comUnidade(caminho, ctx.unidade), opcoes);
      setSalvo(true);
      setEditando(false);
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
    <div className="flex flex-col gap-1.5">
      <p className="flex flex-wrap items-baseline gap-x-2 pl-2 text-[12.5px] text-[#54656f]">
        <label htmlFor={editando ? id : undefined}>{texto.descricao}</label>
        {ctx.unidade && texto.personalizado && <span className="font-semibold text-caneta">personalizado neste CRAS</span>}
      </p>
      {editando ? (
        <div className="balao-whats ml-2 max-w-[560px] p-1.5 ring-2 ring-caneta/45">
          <textarea id={id} ref={crescer} autoFocus value={valor} rows={3}
            onChange={(e) => { setValor(e.target.value); crescer(e.target); }}
            className="w-full resize-none overflow-hidden rounded-[4px] bg-transparent px-1.5 py-1 text-[14.5px] leading-[1.45] text-[#111b21] focus:outline-none" />
        </div>
      ) : (
        <div className="balao-whats ml-2 max-w-[560px] whitespace-pre-wrap px-3 py-2 text-[14.5px] leading-[1.45]">{whatsapp(texto.texto)}</div>
      )}
      {erro && <div className="ml-2 max-w-[560px]"><Aviso>{erro}</Aviso></div>}
      {ctx.podeEditar && (
        <div className="ml-2 flex flex-wrap items-center gap-2 pt-0.5">
          {editando ? (
            <>
              <Botao tamanho="sm" variante="primario" icone={Save} carregando={salvando} disabled={valor === texto.texto}
                onClick={() => executar(`/configuracao/textos/${texto.chave}`, atualizar({ texto: valor }, 'PUT'))}>
                {ctx.unidade ? 'Salvar para este CRAS' : 'Salvar'}
              </Botao>
              <Botao tamanho="sm" variante="fantasma" onClick={() => { setEditando(false); setValor(texto.texto); setErro(null); }}>Cancelar</Botao>
              <span className="text-[12.5px] text-[#54656f]">Use *asteriscos* para negrito.</span>
            </>
          ) : (
            <>
              <Botao tamanho="sm" icone={Pencil} onClick={() => { setEditando(true); setSalvo(false); }}>Editar texto</Botao>
              {podeVoltar && (
                <Botao tamanho="sm" variante="fantasma" icone={RotateCcw} carregando={salvando}
                  onClick={() => executar(`/configuracao/textos/${texto.chave}/restaurar`, enviar({}))}>
                  {ctx.unidade ? 'Voltar ao padrão da secretaria' : 'Voltar ao original'}
                </Botao>
              )}
              {salvo && <span role="status" className="text-[12.5px] font-semibold text-ok">Salvo. Já vale nas próximas conversas.</span>}
              {!salvo && texto.atualizado_em && (
                <span className="text-[12.5px] text-[#54656f]">Alterado em {dataHora(texto.atualizado_em)}{texto.atualizado_por ? ` por ${texto.atualizado_por}` : ''}</span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
