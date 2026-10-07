import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Play, Plus, RotateCcw, Save, ShieldAlert, Sparkles, Trash2, Wrench } from 'lucide-react';
import { api, atualizar, enviar, ErroApi } from '../api';
import { Aviso, Botao, classeEntrada, Esqueleto, Painel, PainelLateral } from '../components/ui';
import { contaAtual } from '../unidades';
import { useAtualizacao } from '../useAtualizacao';
import { CATEGORIAS, nomeCategoria } from '../vocabulario';

// Configurações › Fluxos: etapas ligadas (sem voltar para trás) montadas pela coordenação e testadas no simulador.
// O bot do WhatsApp continua com o fluxo fixo do CRAS; aqui nada é gravado nem enviado.

type Tipo = 'inicio' | 'mensagem' | 'pergunta' | 'condicao' | 'agente' | 'ferramenta' | 'fila' | 'fim';
interface Etapa {
  id: string; tipo: Tipo; titulo?: string; texto?: string; opcoes?: string[]; variavel?: string;
  operador?: 'igual' | 'contem' | 'vazio'; valor?: string; agente_id?: string; entrada?: string;
  ferramenta?: string; argumentos?: Record<string, string>; necessidade?: string;
}
interface Ligacao { de: string; saida: string; para: string }
interface Fluxo {
  id: string; nome: string; descricao: string; etapas: Etapa[]; ligacoes: Ligacao[]; problemas: string[];
  atualizado_em: string | null; criado_em: string;
}
interface Lista {
  limites: { etapas: number; passos_por_mensagem: number; opcoes: number };
  ferramentas: { id: string; rotulo: string; descricao: string }[];
  agentes: { id: string; nome: string }[];
  fluxos: Fluxo[];
}
interface Evento { etapa?: string; tipo: string; detalhe?: string; resultado?: unknown; argumentos?: unknown }
interface Rodada { respostas: string[]; eventos: Evento[]; estado: { etapa: string | null; variaveis: Record<string, unknown>; terminado: boolean; motivo?: string } }

const TIPOS: { tipo: Tipo; rotulo: string; ajuda: string }[] = [
  { tipo: 'mensagem', rotulo: 'Mensagem', ajuda: 'Envia um texto e segue.' },
  { tipo: 'pergunta', rotulo: 'Pergunta', ajuda: 'Espera a resposta; cada opção segue por um caminho.' },
  { tipo: 'condicao', rotulo: 'Condição', ajuda: 'Compara uma resposta guardada: sim ou não.' },
  { tipo: 'agente', rotulo: 'Agente de IA', ajuda: 'Um dos agentes responde.' },
  { tipo: 'ferramenta', rotulo: 'Consulta', ajuda: 'Roda uma ferramenta de consulta e guarda o resultado.' },
  { tipo: 'fila', rotulo: 'Encaminhar para a fila', ajuda: 'No WhatsApp, o caso entraria na fila do CRAS. Encerra.' },
  { tipo: 'fim', rotulo: 'Fim', ajuda: 'Encerra a conversa.' },
];
const ROTULO_TIPO: Record<Tipo, string> = { inicio: 'Início', ...Object.fromEntries(TIPOS.map((t) => [t.tipo, t.rotulo])) } as Record<Tipo, string>;

const EXEMPLO: Pick<Fluxo, 'nome' | 'descricao' | 'etapas' | 'ligacoes'> = {
  nome: 'Exemplo: alimentação', descricao: 'Pergunta se falta comida e orienta ou encaminha.',
  etapas: [
    { id: 'inicio', tipo: 'inicio', titulo: 'Início' },
    { id: 'oi', tipo: 'mensagem', titulo: 'Boas-vindas', texto: 'Olá! Aqui é a assistência social de Anápolis.' },
    { id: 'fome', tipo: 'pergunta', titulo: 'Falta comida?', texto: 'Está faltando comida em casa?', opcoes: ['Sim', 'Não'], variavel: 'fome' },
    { id: 'consulta', tipo: 'ferramenta', titulo: 'Busca a orientação', ferramenta: 'servicos_da_necessidade', argumentos: { necessidade: 'alimentacao' }, variavel: 'orientacao' },
    { id: 'orienta', tipo: 'mensagem', titulo: 'Orienta', texto: 'Para alimentação, procure o CRAS do seu bairro. Leve documento com foto e comprovante de residência.' },
    { id: 'fila', tipo: 'fila', titulo: 'Pede contato', necessidade: 'alimentacao', texto: 'Vou pedir para a equipe do CRAS falar com você.' },
    { id: 'fim', tipo: 'fim', titulo: 'Fim', texto: 'Tudo bem. Se precisar, é só escrever.' },
  ],
  ligacoes: [
    { de: 'inicio', saida: 'proximo', para: 'oi' }, { de: 'oi', saida: 'proximo', para: 'fome' },
    { de: 'fome', saida: 'opcao:1', para: 'consulta' }, { de: 'fome', saida: 'opcao:2', para: 'fim' }, { de: 'fome', saida: 'outra', para: 'fim' },
    { de: 'consulta', saida: 'proximo', para: 'orienta' }, { de: 'orienta', saida: 'proximo', para: 'fila' },
  ],
};
const VAZIO: Pick<Fluxo, 'nome' | 'descricao' | 'etapas' | 'ligacoes'> = {
  nome: 'Novo fluxo', descricao: '', etapas: [{ id: 'inicio', tipo: 'inicio', titulo: 'Início' }], ligacoes: [],
};

function saidas(e: Etapa): { saida: string; rotulo: string }[] {
  if (['inicio', 'mensagem', 'agente', 'ferramenta'].includes(e.tipo)) return [{ saida: 'proximo', rotulo: 'depois' }];
  if (e.tipo === 'pergunta') return [...(e.opcoes ?? []).map((o, i) => ({ saida: `opcao:${i + 1}`, rotulo: `se “${o || `opção ${i + 1}`}”` })), { saida: 'outra', rotulo: 'outra resposta' }];
  if (e.tipo === 'condicao') return [{ saida: 'sim', rotulo: 'se sim' }, { saida: 'nao', rotulo: 'se não' }];
  return [];
}
const novoId = () => `e${Math.random().toString(36).slice(2, 8)}`;
const erroDe = (e: unknown, padrao: string) => (e instanceof ErroApi ? e.message : padrao);

export function Fluxos() {
  const lista = useAtualizacao(useCallback(() => api<Lista>('/fluxos'), []), 0);
  const pode = contaAtual().coordenacao;
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'urgente'; texto: string } | null>(null);
  const [copiloto, setCopiloto] = useState<{ ajustar?: Fluxo } | null>(null);
  const d = lista.dados;
  const selecionado = escolhido ?? d?.fluxos[0]?.id ?? null;
  const fluxo = d?.fluxos.find((f) => f.id === selecionado) ?? null;

  const criar = async (base: typeof VAZIO) => {
    try {
      const f = await api<Fluxo>('/fluxos', enviar(base));
      await lista.recarregar();
      setEscolhido(f.id);
      setAviso({ tom: 'ok', texto: `“${f.nome}” criado.` });
    } catch (e) { setAviso({ tom: 'urgente', texto: erroDe(e, 'Não foi possível criar o fluxo.') }); }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[82ch] text-[14.5px] text-texto-2">
        Monte conversas em etapas ligadas: mensagens, perguntas com opções, condições, agentes de IA e consultas. Os fluxos rodam
        <strong className="text-texto"> só no simulador desta tela</strong>; o bot do WhatsApp continua com o fluxo do CRAS. Em qualquer
        mensagem com sinal de violência, o fluxo para e sai a mensagem de emergência.
      </p>
      {lista.erro && <Aviso>{lista.erro}</Aviso>}
      {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
      {!d && !lista.erro && <Esqueleto className="h-96" />}
      {d && (
        <div className="grid items-start gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <Painel id="t-fluxos" titulo="Fluxos" detalhe={`${d.fluxos.length}`} semCorpo>
            <ul>
              {d.fluxos.map((f) => (
                <li key={f.id}>
                  <button type="button" onClick={() => setEscolhido(f.id)} aria-current={selecionado === f.id || undefined}
                    className={`flex w-full flex-col items-start gap-0.5 border-b border-linha px-4 py-2.5 text-left ${selecionado === f.id ? 'bg-caneta-fundo shadow-[inset_3px_0_0_var(--color-acao)]' : 'hover:bg-elevada'}`}>
                    <span className="text-[14px] font-medium text-texto">{f.nome}</span>
                    <span className={`flex items-center gap-1 text-[12px] ${f.problemas.length ? 'text-alta' : 'text-ok'}`}>
                      {f.problemas.length ? <AlertTriangle className="size-3.5" aria-hidden /> : <CheckCircle2 className="size-3.5" aria-hidden />}
                      <span className="dado">{f.etapas.length}</span> etapas · {f.problemas.length ? `${f.problemas.length} problema${f.problemas.length > 1 ? 's' : ''}` : 'pronto para testar'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {pode && (
              <div className="flex flex-col gap-2 px-4 py-3">
                <Botao tamanho="sm" variante="primario" icone={Sparkles} onClick={() => setCopiloto({})}>Criar com IA</Botao>
                <Botao tamanho="sm" icone={Plus} onClick={() => criar(VAZIO)}>Fluxo em branco</Botao>
                <Botao tamanho="sm" variante="fantasma" onClick={() => criar(EXEMPLO)}>Começar com um exemplo</Botao>
              </div>
            )}
            {d.fluxos.length === 0 && !pode && <p className="px-4 py-4 text-[13.5px] text-texto-3">Nenhum fluxo ainda. A coordenação cria os fluxos.</p>}
          </Painel>
          {fluxo && <Editor key={`${fluxo.id}-${fluxo.atualizado_em ?? ''}`} fluxo={fluxo} lista={d} pode={pode} onSalvo={() => lista.recarregar()}
            onApagado={() => { setEscolhido(null); lista.recarregar(); }} onAjustarIA={() => setCopiloto({ ajustar: fluxo })} />}
        </div>
      )}
      {d && copiloto && (
        <CopilotoFluxo ajustar={copiloto.ajustar} onFechar={() => setCopiloto(null)}
          onCriado={async (f, texto) => { setCopiloto(null); await lista.recarregar(); setEscolhido(f.id); setAviso({ tom: 'ok', texto }); }} />
      )}
    </div>
  );
}

function Editor({ fluxo, lista, pode, onSalvo, onApagado, onAjustarIA }: {
  fluxo: Fluxo; lista: Lista; pode: boolean; onSalvo: () => void; onApagado: () => void; onAjustarIA: () => void;
}) {
  const [nome, setNome] = useState(fluxo.nome);
  const [descricao, setDescricao] = useState(fluxo.descricao);
  const [etapas, setEtapas] = useState<Etapa[]>(fluxo.etapas);
  const [ligacoes, setLigacoes] = useState<Ligacao[]>(fluxo.ligacoes);
  const [problemas, setProblemas] = useState<string[]>(fluxo.problemas);
  const [mudou, setMudou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [novoTipo, setNovoTipo] = useState<Tipo>('mensagem');
  const [foco, setFoco] = useState<string | null>(null);

  const marcar = () => setMudou(true);
  const mudarEtapa = (id: string, campos: Partial<Etapa>) => { setEtapas((es) => es.map((e) => (e.id === id ? { ...e, ...campos } : e))); marcar(); };
  const ligar = (de: string, saida: string, para: string) => {
    setLigacoes((ls) => [...ls.filter((l) => !(l.de === de && l.saida === saida)), ...(para ? [{ de, saida, para }] : [])]);
    marcar();
  };
  const remover = (id: string) => {
    setEtapas((es) => es.filter((e) => e.id !== id));
    setLigacoes((ls) => ls.filter((l) => l.de !== id && l.para !== id));
    marcar();
  };
  const adicionar = () => {
    const id = novoId();
    const base: Etapa = { id, tipo: novoTipo, titulo: ROTULO_TIPO[novoTipo] };
    if (novoTipo === 'pergunta') Object.assign(base, { texto: '', opcoes: ['Sim', 'Não'] });
    if (novoTipo === 'condicao') Object.assign(base, { operador: 'igual', variavel: '', valor: '' });
    if (novoTipo === 'agente') Object.assign(base, { agente_id: lista.agentes[0]?.id ?? '', entrada: '{{mensagem}}' });
    if (novoTipo === 'ferramenta') Object.assign(base, { ferramenta: lista.ferramentas[0]?.id ?? '', argumentos: {}, variavel: 'resultado' });
    setEtapas((es) => [...es, base]);
    setFoco(id);
    marcar();
  };
  // Opções da pergunta mudam as saídas: tira as ligações de opções que deixaram de existir
  const mudarOpcoes = (id: string, opcoes: string[]) => {
    mudarEtapa(id, { opcoes });
    setLigacoes((ls) => ls.filter((l) => !(l.de === id && l.saida.startsWith('opcao:') && Number(l.saida.split(':')[1]) > opcoes.length)));
  };

  const salvar = async () => {
    setSalvando(true); setErro(null);
    try {
      const f = await api<Fluxo>(`/fluxos/${fluxo.id}`, atualizar({ nome, descricao, etapas, ligacoes }, 'PUT'));
      setProblemas(f.problemas); setMudou(false); onSalvo();
    } catch (e) { setErro(erroDe(e, 'Não foi possível salvar.')); } finally { setSalvando(false); }
  };
  const apagar = async () => {
    if (!window.confirm(`Apagar o fluxo “${fluxo.nome}”?`)) return;
    try { await api(`/fluxos/${fluxo.id}`, { method: 'DELETE' }); onApagado(); } catch (e) { setErro(erroDe(e, 'Não foi possível apagar.')); }
  };

  const variaveis = useMemo(() => ['mensagem', 'resposta', 'agente', ...etapas.filter((e) => e.variavel).map((e) => e.variavel as string)]
    .filter((v, i, a) => v && a.indexOf(v) === i), [etapas]);

  return (
    <div className="grid min-w-0 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Painel id="t-desenho" titulo="Desenho" detalhe="clique numa etapa para editar" semCorpo>
          <Desenho etapas={etapas} ligacoes={ligacoes} foco={foco} onFoco={setFoco} />
        </Painel>

        <Painel id="t-editor" titulo={pode ? 'Etapas' : 'Etapas (só leitura)'} detalhe={`${etapas.length}/${lista.limites.etapas}`}
          acao={pode ? (
            <div className="flex items-center gap-2">
              {mudou && <span className="text-[12.5px] text-alta">alterações não salvas</span>}
              <Botao tamanho="sm" icone={Sparkles} disabled={mudou} title={mudou ? 'Salve antes de pedir ajustes à IA' : undefined} onClick={onAjustarIA}>Ajustar com IA</Botao>
              <Botao tamanho="sm" variante="primario" icone={Save} carregando={salvando} disabled={!mudou} onClick={salvar}>Salvar</Botao>
            </div>
          ) : undefined}>
          <fieldset disabled={!pode} className="flex flex-col gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-texto-2">Nome do fluxo</span>
                <input value={nome} onChange={(e) => { setNome(e.target.value); marcar(); }} maxLength={80} className={classeEntrada} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-texto-2">Para que serve</span>
                <input value={descricao} onChange={(e) => { setDescricao(e.target.value); marcar(); }} maxLength={300} className={classeEntrada} />
              </label>
            </div>
            {erro && <Aviso>{erro}</Aviso>}
            {problemas.length > 0 ? (
              <div className="rounded-[3px] border border-alta/40 bg-alta-fundo px-3 py-2 text-[13.5px]">
                <p className="flex items-center gap-1.5 font-semibold text-alta"><AlertTriangle className="size-4" aria-hidden />Falta resolver antes de testar{mudou ? ' (salve para conferir de novo)' : ''}:</p>
                <ul className="mt-1 list-inside list-disc text-texto-2">{problemas.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            ) : !mudou && <p className="flex items-center gap-1.5 text-[13.5px] text-ok"><CheckCircle2 className="size-4" aria-hidden />Fluxo sem problemas: pode testar no simulador.</p>}

            <ol className="flex flex-col gap-3">
              {etapas.map((e) => (
                <CartaoEtapa key={e.id} e={e} etapas={etapas} ligacoes={ligacoes} lista={lista} variaveis={variaveis} foco={foco === e.id}
                  onFoco={() => setFoco(e.id)} onMudar={(c) => mudarEtapa(e.id, c)} onOpcoes={(o) => mudarOpcoes(e.id, o)}
                  onLigar={(saida, para) => ligar(e.id, saida, para)} onRemover={() => remover(e.id)} />
              ))}
            </ol>
            <div className="flex flex-wrap items-end gap-2 border-t border-linha pt-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-texto-2">Nova etapa</span>
                <select value={novoTipo} onChange={(e) => setNovoTipo(e.target.value as Tipo)} className={`${classeEntrada} w-auto`}>
                  {TIPOS.map((t) => <option key={t.tipo} value={t.tipo}>{t.rotulo}</option>)}
                </select>
              </label>
              <Botao icone={Plus} disabled={etapas.length >= lista.limites.etapas} onClick={adicionar}>Adicionar</Botao>
              <span className="pb-2 text-[12.5px] text-texto-3">{TIPOS.find((t) => t.tipo === novoTipo)?.ajuda}</span>
              <span className="ml-auto"><Botao variante="perigo" icone={Trash2} onClick={apagar}>Apagar fluxo</Botao></span>
            </div>
          </fieldset>
        </Painel>
      </div>
      <Simulador fluxoId={fluxo.id} pronto={problemas.length === 0 && !mudou} etapas={etapas} limite={lista.limites.passos_por_mensagem} />
    </div>
  );
}

function CartaoEtapa({ e, etapas, ligacoes, lista, variaveis, foco, onFoco, onMudar, onOpcoes, onLigar, onRemover }: {
  e: Etapa; etapas: Etapa[]; ligacoes: Ligacao[]; lista: Lista; variaveis: string[]; foco: boolean;
  onFoco: () => void; onMudar: (c: Partial<Etapa>) => void; onOpcoes: (o: string[]) => void; onLigar: (saida: string, para: string) => void; onRemover: () => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => { if (foco) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [foco]);
  const destinos = etapas.filter((x) => x.id !== e.id && x.tipo !== 'inicio');
  const campo = 'flex flex-col gap-1 text-[12.5px] font-semibold text-texto-2';
  const entrada = `${classeEntrada} py-1.5 text-[14px] font-normal`;
  return (
    <li ref={ref} onFocusCapture={onFoco} className={`rounded-[4px] border bg-superficie px-3 py-3 ${foco ? 'border-caneta' : 'border-linha'}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="dado rounded-[3px] bg-elevada px-1.5 py-0.5 text-[11.5px] text-texto-2">{ROTULO_TIPO[e.tipo]}</span>
        <input value={e.titulo ?? ''} onChange={(x) => onMudar({ titulo: x.target.value })} maxLength={60} aria-label="Nome da etapa"
          className="min-w-0 flex-1 border-b border-transparent bg-transparent text-[15px] font-semibold text-texto hover:border-linha focus:border-caneta focus:outline-none" />
        {e.tipo !== 'inicio' && <Botao tamanho="sm" variante="fantasma" icone={Trash2} onClick={onRemover} aria-label={`Remover etapa ${e.titulo ?? ''}`}>Remover</Botao>}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {(e.tipo === 'mensagem' || e.tipo === 'pergunta' || e.tipo === 'fila' || e.tipo === 'fim') && (
          <label className={`${campo} md:col-span-2`}>{e.tipo === 'pergunta' ? 'Pergunta' : 'Texto enviado'}{e.tipo === 'fila' || e.tipo === 'fim' ? ' (opcional)' : ''}
            <textarea value={e.texto ?? ''} onChange={(x) => onMudar({ texto: x.target.value })} rows={2} maxLength={1500} className={entrada}
              placeholder="Use {{bairro}} para colocar uma resposta guardada" />
          </label>
        )}
        {e.tipo === 'pergunta' && (
          <>
            <label className={campo}>Opções (uma por linha, até {lista.limites.opcoes})
              <textarea value={(e.opcoes ?? []).join('\n')} rows={3} className={entrada}
                onChange={(x) => onOpcoes(x.target.value.split('\n').slice(0, lista.limites.opcoes))} />
            </label>
            <label className={campo}>Guardar a resposta como
              <input value={e.variavel ?? ''} onChange={(x) => onMudar({ variavel: x.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} maxLength={30} placeholder="ex.: bairro" className={entrada} />
            </label>
          </>
        )}
        {e.tipo === 'condicao' && (
          <>
            <label className={campo}>Resposta guardada
              <select value={e.variavel ?? ''} onChange={(x) => onMudar({ variavel: x.target.value })} className={entrada}>
                <option value="">Escolha…</option>{variaveis.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-[130px_1fr] gap-2">
              <label className={campo}>Comparação
                <select value={e.operador ?? 'igual'} onChange={(x) => onMudar({ operador: x.target.value as Etapa['operador'] })} className={entrada}>
                  <option value="igual">é igual a</option><option value="contem">contém</option><option value="vazio">está vazia</option>
                </select>
              </label>
              {e.operador !== 'vazio' && <label className={campo}>Valor<input value={e.valor ?? ''} onChange={(x) => onMudar({ valor: x.target.value })} maxLength={100} className={entrada} /></label>}
            </div>
          </>
        )}
        {e.tipo === 'agente' && (
          <>
            <label className={campo}>Agente
              <select value={e.agente_id ?? ''} onChange={(x) => onMudar({ agente_id: x.target.value })} className={entrada}>
                <option value="">Escolha…</option>{lista.agentes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </label>
            <label className={campo}>O que o agente recebe
              <input value={e.entrada ?? '{{mensagem}}'} onChange={(x) => onMudar({ entrada: x.target.value })} maxLength={500} className={entrada} />
            </label>
          </>
        )}
        {e.tipo === 'ferramenta' && (
          <>
            <label className={campo}>Consulta
              <select value={e.ferramenta ?? ''} onChange={(x) => onMudar({ ferramenta: x.target.value, argumentos: {} })} className={entrada}>
                {lista.ferramentas.map((f) => <option key={f.id} value={f.id}>{f.rotulo}</option>)}
              </select>
            </label>
            <label className={campo}>Guardar o resultado como
              <input value={e.variavel ?? ''} onChange={(x) => onMudar({ variavel: x.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} maxLength={30} className={entrada} />
            </label>
            <ArgumentosFerramenta e={e} onMudar={onMudar} classe={entrada} rotulo={campo} />
          </>
        )}
        {e.tipo === 'fila' && (
          <label className={campo}>Necessidade (opcional)
            <select value={e.necessidade ?? ''} onChange={(x) => onMudar({ necessidade: x.target.value })} className={entrada}>
              <option value="">Sem necessidade definida</option>
              {Object.keys(CATEGORIAS).filter((c) => c !== 'nao_identificado').map((c) => <option key={c} value={c}>{nomeCategoria(c)}</option>)}
            </select>
          </label>
        )}
      </div>
      {saidas(e).length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5 border-t border-linha pt-2">
          {saidas(e).map((s) => (
            <label key={s.saida} className="grid grid-cols-[minmax(0,180px)_1fr] items-center gap-2 text-[13px] text-texto-2">
              <span className="truncate">{s.rotulo} →</span>
              <select value={ligacoes.find((l) => l.de === e.id && l.saida === s.saida)?.para ?? ''} onChange={(x) => onLigar(s.saida, x.target.value)}
                className={`h-8 w-full rounded-[3px] border bg-superficie px-2 text-[13.5px] text-texto focus:border-caneta focus:outline-none ${ligacoes.some((l) => l.de === e.id && l.saida === s.saida) ? 'border-linha-forte' : 'border-alta'}`}>
                <option value="">— escolha a próxima etapa —</option>
                {destinos.map((x) => <option key={x.id} value={x.id}>{x.titulo || ROTULO_TIPO[x.tipo]} ({ROTULO_TIPO[x.tipo]})</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
    </li>
  );
}

function ArgumentosFerramenta({ e, onMudar, classe, rotulo }: { e: Etapa; onMudar: (c: Partial<Etapa>) => void; classe: string; rotulo: string }) {
  const args = e.argumentos ?? {};
  const mudar = (k: string, v: string) => onMudar({ argumentos: { ...args, [k]: v } });
  const necessidade = (
    <label className={rotulo}>Necessidade
      <select value={args.necessidade ?? ''} onChange={(x) => mudar('necessidade', x.target.value)} className={classe}>
        <option value="">Escolha…</option>
        {Object.keys(CATEGORIAS).filter((c) => c !== 'nao_identificado').map((c) => <option key={c} value={c}>{nomeCategoria(c)}</option>)}
      </select>
    </label>
  );
  if (e.ferramenta === 'servicos_da_necessidade') return necessidade;
  if (e.ferramenta === 'lugares_da_rede') return (<>{necessidade}<label className={rotulo}>Bairro (opcional)<input value={args.bairro ?? ''} onChange={(x) => mudar('bairro', x.target.value)} placeholder="{{bairro}}" className={classe} /></label></>);
  if (e.ferramenta === 'cras_do_bairro') return <label className={rotulo}>Bairro<input value={args.bairro ?? ''} onChange={(x) => mudar('bairro', x.target.value)} placeholder="{{bairro}}" className={classe} /></label>;
  return <label className={`${rotulo} md:col-span-2`}>O que buscar<input value={args.pergunta ?? ''} onChange={(x) => mudar('pergunta', x.target.value)} placeholder="{{mensagem}}" className={classe} /></label>;
}

/** Desenho automático, de cima para baixo: cada etapa numa faixa pela distância do início; as setas levam o nome da saída. */
function Desenho({ etapas, ligacoes, foco, onFoco }: { etapas: Etapa[]; ligacoes: Ligacao[]; foco: string | null; onFoco: (id: string) => void }) {
  const L = 150, A = 44, GX = 28, GY = 46;
  const { pos, largura, altura } = useMemo(() => {
    const nivel: Record<string, number> = {};
    const inicio = etapas.find((e) => e.tipo === 'inicio');
    if (inicio) nivel[inicio.id] = 0;
    for (let rodada = 0; rodada < etapas.length; rodada++) {  // caminho mais longo (o fluxo não tem ciclo)
      for (const l of ligacoes) if (nivel[l.de] !== undefined && (nivel[l.para] ?? -1) < nivel[l.de] + 1 && nivel[l.de] + 1 < etapas.length) nivel[l.para] = nivel[l.de] + 1;
    }
    const ultimo = Math.max(0, ...Object.values(nivel));
    etapas.forEach((e) => { if (nivel[e.id] === undefined) nivel[e.id] = ultimo + 1; });  // soltas embaixo
    const porNivel: Record<number, string[]> = {};
    etapas.forEach((e) => { (porNivel[nivel[e.id]] ??= []).push(e.id); });
    const maisLarga = Math.max(...Object.values(porNivel).map((x) => x.length), 1);
    const largura = 24 + maisLarga * (L + GX) - GX;
    const pos: Record<string, { x: number; y: number }> = {};
    Object.entries(porNivel).forEach(([n, ids]) => {
      const total = ids.length * (L + GX) - GX;
      ids.forEach((id, k) => { pos[id] = { x: 12 + (largura - 24 - total) / 2 + k * (L + GX), y: 12 + Number(n) * (A + GY) }; });
    });
    return { pos, largura, altura: 24 + (Math.max(...Object.keys(porNivel).map(Number)) + 1) * (A + GY) - GY };
  }, [etapas, ligacoes]);
  // Saídas da mesma etapa para o mesmo destino viram uma seta só (senão os nomes se sobrepõem)
  const setas = useMemo(() => {
    const grupos = new Map<string, Ligacao & { juntas: number }>();
    for (const l of ligacoes) {
      const chave = `${l.de}>${l.para}`;
      const g = grupos.get(chave);
      if (g) g.juntas += 1; else grupos.set(chave, { ...l, juntas: 1 });
    }
    return [...grupos.values()];
  }, [ligacoes]);
  const rotuloSaida = (l: Ligacao) => {
    const de = etapas.find((e) => e.id === l.de);
    if (l.saida === 'proximo') return '';
    if (l.saida.startsWith('opcao:')) return de?.opcoes?.[Number(l.saida.split(':')[1]) - 1] ?? '';
    return { outra: 'outra', sim: 'sim', nao: 'não' }[l.saida] ?? l.saida;
  };
  return (
    <div className="overflow-x-auto px-2 py-2">
      <svg width={largura} height={altura} role="img" aria-label={`Desenho do fluxo com ${etapas.length} etapas`} className="mx-auto block">
        <defs><marker id="seta" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(--color-linha-forte)" /></marker></defs>
        {setas.map((l, i) => {
          const a = pos[l.de], b = pos[l.para];
          if (!a || !b) return null;
          const irmas = setas.filter((x) => x.de === l.de);
          const k = irmas.indexOf(l);
          // saídas de uma mesma etapa partem de pontos diferentes da borda de baixo, para os nomes não se sobreporem
          const x1 = a.x + (L * (k + 1)) / (irmas.length + 1), y1 = a.y + A, x2 = b.x + L / 2, y2 = b.y, meio = (y1 + y2) / 2;
          const nome = l.juntas > 1 ? `${l.juntas} saídas` : rotuloSaida(l);
          return (
            <g key={i}>
              <path d={`M${x1},${y1} C${x1},${meio} ${x2},${meio} ${x2},${y2 - 2}`} fill="none" stroke="var(--color-linha-forte)" strokeWidth={1.3} markerEnd="url(#seta)" />
              {nome && <text x={x1 + 4} y={y1 + 13} className="fill-[var(--color-texto-3)] text-[10.5px]">{nome.slice(0, 12)}</text>}
            </g>
          );
        })}
        {etapas.map((e) => {
          const p = pos[e.id];
          const terminal = e.tipo === 'fim' || e.tipo === 'fila';
          const solta = e.tipo !== 'inicio' && !ligacoes.some((l) => l.para === e.id);
          return (
            <g key={e.id} onClick={() => onFoco(e.id)} className="cursor-pointer">
              <title>{solta ? 'Nenhuma etapa leva até aqui' : e.titulo}</title>
              <rect x={p.x} y={p.y} width={L} height={A} rx={3} fill="var(--color-superficie)" strokeDasharray={solta ? '5 4' : undefined}
                stroke={foco === e.id ? 'var(--color-acao)' : solta ? 'var(--color-alta)' : terminal ? 'var(--color-texto-3)' : 'var(--color-linha-forte)'} strokeWidth={foco === e.id ? 2 : 1} />
              <text x={p.x + 9} y={p.y + 16} className="fill-[var(--color-texto-3)] font-mono text-[10px]">{ROTULO_TIPO[e.tipo]}</text>
              <text x={p.x + 9} y={p.y + 33} className="fill-[var(--color-texto)] text-[12.5px] font-semibold">{(e.titulo || ROTULO_TIPO[e.tipo]).slice(0, 19)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Simulador({ fluxoId, pronto, etapas, limite }: { fluxoId: string; pronto: boolean; etapas: Etapa[]; limite: number }) {
  const [falas, setFalas] = useState<{ autor: 'pessoa' | 'fluxo'; texto: string; eventos?: Evento[] }[]>([]);
  const [estado, setEstado] = useState<Rodada['estado'] | null>(null);
  const [texto, setTexto] = useState('');
  const [esperando, setEsperando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  const nomes = Object.fromEntries(etapas.map((e) => [e.id, e.titulo || ROTULO_TIPO[e.tipo]]));
  useEffect(() => { rolagem.current?.scrollTo({ top: rolagem.current.scrollHeight }); }, [falas.length]);

  const rodar = async (mensagem: string | null) => {
    setEsperando(true); setErro(null);
    if (mensagem) setFalas((f) => [...f, { autor: 'pessoa', texto: mensagem }]);
    try {
      const r = await api<Rodada>(`/fluxos/${fluxoId}/simular`, enviar({ estado: mensagem === null ? null : estado, mensagem }));
      setEstado(r.estado);
      setFalas((f) => [...f, ...(r.respostas.length ? r.respostas.map((t, i) => ({ autor: 'fluxo' as const, texto: t, eventos: i === r.respostas.length - 1 ? r.eventos : undefined }))
        : [{ autor: 'fluxo' as const, texto: '', eventos: r.eventos }])]);
    } catch (e) { setErro(erroDe(e, 'O simulador não respondeu.')); } finally { setEsperando(false); }
  };
  const comecar = () => { setFalas([]); setEstado(null); rodar(null); };

  return (
    <Painel id={`t-sim-${fluxoId}`} titulo="Simulador" detalhe={`até ${limite} etapas por mensagem · nada é gravado`} semCorpo className="2xl:sticky 2xl:top-4"
      acao={<Botao tamanho="sm" icone={falas.length ? RotateCcw : Play} disabled={!pronto || esperando} onClick={comecar}>{falas.length ? 'Recomeçar' : 'Começar'}</Botao>}>
      <div ref={rolagem} className="flex max-h-[60dvh] min-h-[300px] flex-col gap-2.5 overflow-y-auto px-4 py-4">
        {!pronto && <p className="text-[13.5px] text-texto-3">Salve o fluxo sem problemas para testar.</p>}
        {pronto && falas.length === 0 && <p className="text-[13.5px] text-texto-3">Clique em Começar. Responda como a pessoa responderia: pelo número da opção ou com palavras.</p>}
        {falas.map((f, i) => (
          <div key={i} className={f.autor === 'pessoa' ? 'self-end max-w-[85%]' : 'self-start max-w-[95%]'}>
            {f.texto && <p className={`whitespace-pre-line rounded-[4px] px-3 py-2 text-[14px] leading-relaxed ${f.autor === 'pessoa' ? 'bg-caneta-fundo' : 'border border-linha bg-elevada'}`}>{f.texto}</p>}
            {f.eventos && f.eventos.length > 0 && (
              <ol className="mt-1 flex flex-col gap-0.5 text-[12px] text-texto-3">
                {f.eventos.map((ev, j) => (
                  <li key={j} className={ev.tipo === 'violencia' || ev.tipo === 'erro' ? 'text-urgente' : ''}>
                    {ev.tipo === 'violencia' ? <ShieldAlert className="mr-1 inline size-3.5 align-[-2px]" aria-hidden /> : ev.tipo === 'ferramenta' ? <Wrench className="mr-1 inline size-3.5 align-[-2px]" aria-hidden /> : <span className="dado mr-1">›</span>}
                    {ev.etapa && <span className="text-texto-2">{nomes[ev.etapa] ?? ev.etapa}: </span>}{ev.detalhe}
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
        {estado?.terminado && <p className="self-center text-[12.5px] text-texto-3">Fluxo encerrado ({estado.motivo === 'fila' ? 'encaminhado à fila' : estado.motivo === 'violencia' ? 'violência' : estado.motivo}).</p>}
      </div>
      {erro && <div className="px-4 pb-2"><Aviso>{erro}</Aviso></div>}
      <form className="flex gap-2 border-t border-linha px-4 py-3" onSubmit={(e) => { e.preventDefault(); if (texto.trim()) { rodar(texto.trim()); setTexto(''); } }}>
        <label className="flex-1"><span className="sr-only">Resposta</span>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={2000} disabled={!estado || estado.terminado} placeholder={estado && !estado.terminado ? 'Responda aqui' : 'Comece o teste'} className={classeEntrada} />
        </label>
        <Botao type="submit" variante="primario" carregando={esperando} disabled={!estado || estado.terminado || !texto.trim()}>Responder</Botao>
      </form>
    </Painel>
  );
}

interface PropostaFluxo { proposta: Pick<Fluxo, 'nome' | 'descricao' | 'etapas' | 'ligacoes'>; problemas: string[]; tentativas: number }

/** Copiloto: descreve em texto, a IA monta o fluxo; a prévia aparece aqui e nada é salvo até a pessoa confirmar. */
function CopilotoFluxo({ ajustar, onFechar, onCriado }: { ajustar?: Fluxo; onFechar: () => void; onCriado: (f: Fluxo, aviso: string) => void }) {
  const [pedido, setPedido] = useState('');
  const [resultado, setResultado] = useState<PropostaFluxo | null>(null);
  const [montando, setMontando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const montar = async () => {
    setMontando(true); setErro(null);
    try { setResultado(await api<PropostaFluxo>('/copiloto/fluxo', enviar({ pedido, fluxo_id: ajustar?.id }))); }
    catch (e) { setErro(erroDe(e, 'O copiloto não respondeu.')); } finally { setMontando(false); }
  };
  const confirmar = async () => {
    if (!resultado) return;
    setSalvando(true); setErro(null);
    try {
      const f = ajustar
        ? await api<Fluxo>(`/fluxos/${ajustar.id}`, atualizar(resultado.proposta, 'PUT'))
        : await api<Fluxo>('/fluxos', enviar(resultado.proposta));
      onCriado(f, ajustar ? 'Ajuste da IA aplicado. Confira e teste no simulador.' : `“${f.nome}” criado pela IA. Confira e teste no simulador.`);
    } catch (e) { setErro(erroDe(e, 'Não foi possível salvar.')); setSalvando(false); }
  };
  return (
    <PainelLateral aberto titulo={ajustar ? `Ajustar “${ajustar.nome}” com IA` : 'Criar fluxo com IA'} onFechar={onFechar} largura="max-w-2xl">
      <div className="flex flex-col gap-4">
        <p className="text-[14px] text-texto-2">
          {ajustar ? 'Diga o que mudar no fluxo. ' : 'Descreva a conversa que você quer. '}
          A IA monta as etapas e as ligações; nada é salvo até você confirmar, e depois tudo pode ser editado. Violência não entra
          no fluxo: o sistema já para qualquer conversa com a mensagem de emergência.
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-texto-2">{ajustar ? 'O que mudar' : 'Pedido'}</span>
          <textarea value={pedido} onChange={(e) => setPedido(e.target.value)} rows={4} maxLength={1500} className={`${classeEntrada} text-[14px]`}
            placeholder={ajustar ? 'ex.: antes de encaminhar para a fila, pergunte o bairro da pessoa' : 'ex.: pergunte o bairro da pessoa, diga qual é o CRAS dela e pergunte se ela quer que o CRAS entre em contato'} />
        </label>
        <div className="flex gap-2">
          <Botao variante="primario" icone={Sparkles} carregando={montando} disabled={pedido.trim().length < 10} onClick={montar}>
            {resultado ? 'Montar de novo' : 'Montar proposta'}
          </Botao>
        </div>
        {erro && <Aviso>{erro}</Aviso>}
        {resultado && (
          <>
            <div className="border-t border-linha pt-3">
              <p className="titulo text-[17px]">{resultado.proposta.nome}</p>
              {resultado.proposta.descricao && <p className="text-[13.5px] text-texto-2">{resultado.proposta.descricao}</p>}
              <p className="dado mt-1 text-[12px] text-texto-3">{resultado.proposta.etapas.length} etapas · {resultado.tentativas === 2 ? 'a IA corrigiu a primeira versão' : 'montado de primeira'}</p>
            </div>
            {resultado.problemas.length > 0 ? (
              <div className="rounded-[3px] border border-alta/40 bg-alta-fundo px-3 py-2 text-[13.5px]">
                <p className="font-semibold text-alta">A proposta ainda tem problemas (dá para criar e corrigir no editor, ou montar de novo):</p>
                <ul className="mt-1 list-inside list-disc text-texto-2">{resultado.problemas.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            ) : <p className="flex items-center gap-1.5 text-[13.5px] text-ok"><CheckCircle2 className="size-4" aria-hidden />Sem problemas: pronto para testar no simulador.</p>}
            <div className="rounded-[4px] border border-linha"><Desenho etapas={resultado.proposta.etapas} ligacoes={resultado.proposta.ligacoes} foco={null} onFoco={() => {}} /></div>
            <ol className="flex flex-col gap-1.5 text-[13.5px]">
              {resultado.proposta.etapas.map((e) => (
                <li key={e.id} className="rounded-[3px] border border-linha px-3 py-2">
                  <span className="dado mr-2 text-[11.5px] text-texto-3">{ROTULO_TIPO[e.tipo] ?? e.tipo}</span>
                  <strong className="font-semibold">{e.titulo}</strong>
                  {e.texto && <p className="mt-0.5 whitespace-pre-line text-texto-2">{e.texto}</p>}
                  {e.opcoes && <p className="mt-0.5 text-texto-3">Opções: {e.opcoes.join(' · ')}</p>}
                </li>
              ))}
            </ol>
            <div className="sticky bottom-0 flex gap-2 border-t border-linha bg-superficie py-3">
              <Botao variante="primario" icone={ajustar ? Save : Plus} carregando={salvando} onClick={confirmar}>{ajustar ? 'Aplicar ao fluxo' : 'Criar este fluxo'}</Botao>
              <Botao variante="fantasma" onClick={onFechar}>Descartar</Botao>
            </div>
          </>
        )}
      </div>
    </PainelLateral>
  );
}
