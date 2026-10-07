import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, ChevronDown, Plus, Save, Send, ShieldAlert, Sparkles, Trash2, Wrench } from 'lucide-react';
import { api, atualizar, enviar, ErroApi } from '../api';
import { Aviso, Botao, classeEntrada, Esqueleto, Painel, PainelLateral } from '../components/ui';
import { contaAtual } from '../unidades';
import { useAtualizacao } from '../useAtualizacao';
import { dataHora } from '../vocabulario';

// Configurações › Agentes: agentes de IA com instruções próprias e ferramentas de consulta.
// Rodam só no teste desta tela: não respondem no WhatsApp e não passam por cima da regra de violência.

interface Ferramenta { id: string; rotulo: string; descricao: string }
interface Agente {
  id: string; nome: string; descricao: string; instrucoes: string; temperatura: number; ferramentas: string[]; ativo: boolean;
  criado_em: string; criado_por: string | null; atualizado_em: string | null; atualizado_por: string | null;
}
interface Lista { ia_disponivel: boolean; modelo: string; max_passos: number; regras_fixas: string; ferramentas: Ferramenta[]; agentes: Agente[] }
interface Passo { ferramenta: string; argumentos: Record<string, unknown>; resultado: Record<string, unknown>; permitida: boolean }
interface Resposta { resposta: string; passos: Passo[]; violencia: boolean; limite?: boolean }
interface Fala { autor: 'pessoa' | 'agente'; texto: string; passos?: Passo[]; violencia?: boolean }

type Rascunho = Omit<Agente, 'id' | 'criado_em' | 'criado_por' | 'atualizado_em' | 'atualizado_por'>;
const NOVO: Rascunho = { nome: '', descricao: '', instrucoes: '', temperatura: 0.2, ferramentas: ['buscar_base_conhecimento', 'servicos_da_necessidade'], ativo: true };
const erroDe = (e: unknown, padrao: string) => (e instanceof ErroApi ? e.message : padrao);

export function Agentes() {
  const lista = useAtualizacao(useCallback(() => api<Lista>('/agentes'), []), 0);
  const pode = contaAtual().coordenacao;
  const [escolhido, setSelecionado] = useState<string | 'novo' | null>(null);
  // Depois de criar, o formulário troca para o do agente novo: o aviso vem daqui para não sumir
  const [criado, setCriado] = useState<string | null>(null);
  // Proposta do copiloto: preenche o formulário de novo agente, que só é salvo quando a pessoa clica em Criar
  const [proposta, setProposta] = useState<{ chave: number; dados: Rascunho } | null>(null);
  const [copiloto, setCopiloto] = useState(false);
  const d = lista.dados;
  // Sem escolha: o primeiro agente, ou o formulário de novo quando ainda não há nenhum
  const selecionado = escolhido ?? d?.agentes[0]?.id ?? (pode ? 'novo' : null);
  const agente = d?.agentes.find((a) => a.id === selecionado) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[80ch] text-[14.5px] text-texto-2">
        Agentes de IA com instruções próprias, que consultam a base de conhecimento, as respostas do CRAS e a rede de lugares.
        Eles rodam <strong className="text-texto">só no teste desta tela</strong>: não respondem no WhatsApp. Com sinal de violência,
        o agente nem roda e sai a mensagem de emergência do bot.
      </p>
      {lista.erro && <Aviso>{lista.erro}</Aviso>}
      {!d && !lista.erro && <Esqueleto className="h-96" />}
      {d && !d.ia_disponivel && <Aviso tom="info">Os agentes precisam da chave do Gemini (GEMINI_API_KEY). Dá para cadastrar, mas o teste não responde.</Aviso>}
      {d && (
        <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <Painel id="t-agentes" titulo="Agentes" detalhe={`${d.agentes.length}`} semCorpo
            acao={pode ? (
              <span className="flex gap-1.5">
                <Botao tamanho="sm" icone={Sparkles} onClick={() => setCopiloto(true)}>Com IA</Botao>
                <Botao tamanho="sm" icone={Plus} onClick={() => { setProposta(null); setSelecionado('novo'); }}>Novo</Botao>
              </span>
            ) : undefined}>
            {d.agentes.length === 0 && <p className="px-4 py-4 text-[13.5px] text-texto-3">Nenhum agente ainda.{pode ? ' Crie o primeiro em Novo.' : ''}</p>}
            <ul>
              {d.agentes.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => setSelecionado(a.id)} aria-current={selecionado === a.id || undefined}
                    className={`flex w-full flex-col items-start gap-0.5 border-b border-linha px-4 py-2.5 text-left ${selecionado === a.id ? 'bg-caneta-fundo shadow-[inset_3px_0_0_var(--color-acao)]' : 'hover:bg-elevada'}`}>
                    <span className="flex items-center gap-2 text-[14px] font-medium text-texto"><Bot className="size-4 text-texto-2" aria-hidden />{a.nome}</span>
                    <span className="line-clamp-2 text-[12.5px] text-texto-3">{a.descricao || `${a.ferramentas.length} ferramenta${a.ferramentas.length === 1 ? '' : 's'}`}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Painel>

          {selecionado === 'novo' && pode && (
            <Formulario key={proposta ? `ia-${proposta.chave}` : 'novo'} inicial={proposta?.dados ?? NOVO} lista={d}
              avisoInicial={proposta ? 'Proposta da IA: revise e clique em Criar agente para salvar.' : undefined}
              onSalvo={(a) => { lista.recarregar(); setSelecionado(a.id); setCriado(a.id); setProposta(null); }} />
          )}
          {agente && (
            <div className="grid min-w-0 items-start gap-4 2xl:grid-cols-2">
              <Formulario key={agente.id} id={agente.id} inicial={agente} lista={d} somenteLeitura={!pode}
                avisoInicial={criado === agente.id ? 'Agente criado. Teste ao lado.' : undefined}
                onSalvo={() => lista.recarregar()} onApagado={() => { setSelecionado(null); lista.recarregar(); }} />
              <TesteAgente key={`t-${agente.id}`} agente={agente} lista={d} />
            </div>
          )}
        </div>
      )}
      {copiloto && (
        <CopilotoAgente onFechar={() => setCopiloto(false)}
          onProposta={(dados) => { setCopiloto(false); setProposta({ chave: Date.now(), dados }); setSelecionado('novo'); }} />
      )}
    </div>
  );
}

function CopilotoAgente({ onFechar, onProposta }: { onFechar: () => void; onProposta: (r: Rascunho) => void }) {
  const [pedido, setPedido] = useState('');
  const [montando, setMontando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const montar = async () => {
    setMontando(true); setErro(null);
    try { onProposta((await api<{ proposta: Rascunho }>('/copiloto/agente', enviar({ pedido }))).proposta); }
    catch (e) { setErro(erroDe(e, 'O copiloto não respondeu.')); setMontando(false); }
  };
  return (
    <PainelLateral aberto titulo="Criar agente com IA" onFechar={onFechar} largura="max-w-lg">
      <div className="flex flex-col gap-4">
        <p className="text-[14px] text-texto-2">Descreva o que o agente deve fazer. A IA escreve o nome, as instruções e escolhe as ferramentas; a proposta abre no formulário para você revisar antes de criar.</p>
        <textarea value={pedido} onChange={(e) => setPedido(e.target.value)} rows={4} maxLength={1500} className={`${classeEntrada} text-[14px]`} aria-label="Pedido"
          placeholder="ex.: um agente que explica o BPC para idosos em linguagem bem simples e diz onde pedir" />
        {erro && <Aviso>{erro}</Aviso>}
        <Botao variante="primario" icone={Sparkles} carregando={montando} disabled={pedido.trim().length < 10} onClick={montar}>Montar proposta</Botao>
      </div>
    </PainelLateral>
  );
}

function Formulario({ id, inicial, lista, somenteLeitura = false, avisoInicial, onSalvo, onApagado }: {
  id?: string; inicial: Rascunho; lista: Lista; somenteLeitura?: boolean; avisoInicial?: string; onSalvo: (a: Agente) => void; onApagado?: () => void;
}) {
  const [r, setR] = useState<Rascunho>({ nome: inicial.nome, descricao: inicial.descricao, instrucoes: inicial.instrucoes,
    temperatura: inicial.temperatura, ferramentas: inicial.ferramentas, ativo: inicial.ativo });
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'urgente'; texto: string } | null>(avisoInicial ? { tom: 'ok', texto: avisoInicial } : null);
  const [verRegras, setVerRegras] = useState(false);
  const mudar = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => { setR((x) => ({ ...x, [k]: v })); setAviso(null); };
  const alternar = (f: string) => mudar('ferramentas', r.ferramentas.includes(f) ? r.ferramentas.filter((x) => x !== f) : [...r.ferramentas, f]);

  const salvar = async () => {
    setSalvando(true);
    try {
      const a = id ? await api<Agente>(`/agentes/${id}`, atualizar(r, 'PUT')) : await api<Agente>('/agentes', enviar(r));
      setAviso({ tom: 'ok', texto: id ? 'Agente salvo.' : 'Agente criado. Teste ao lado.' });
      onSalvo(a);
    } catch (e) {
      setAviso({ tom: 'urgente', texto: erroDe(e, 'Não foi possível salvar.') });
    } finally {
      setSalvando(false);
    }
  };
  const apagar = async () => {
    if (!id || !window.confirm(`Apagar o agente “${r.nome}”?`)) return;
    try { await api(`/agentes/${id}`, { method: 'DELETE' }); onApagado?.(); } catch (e) { setAviso({ tom: 'urgente', texto: erroDe(e, 'Não foi possível apagar.') }); }
  };

  return (
    <Painel id={`t-form-${id ?? 'novo'}`} titulo={id ? 'Configuração' : 'Novo agente'}
      detalhe={id ? undefined : 'só no teste do painel'}>
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
        <fieldset disabled={somenteLeitura} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-texto-2">Nome</span>
            <input value={r.nome} onChange={(e) => mudar('nome', e.target.value)} maxLength={80} placeholder="ex.: Orientador de documentos" className={classeEntrada} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-texto-2">Para que serve</span>
            <input value={r.descricao} onChange={(e) => mudar('descricao', e.target.value)} maxLength={300} placeholder="uma frase para a equipe saber quando usar" className={classeEntrada} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-texto-2">Instruções</span>
            <textarea value={r.instrucoes} onChange={(e) => mudar('instrucoes', e.target.value)} rows={7} maxLength={6000}
              placeholder="ex.: Você ajuda quem precisa tirar ou refazer documentos. Pergunte qual documento falta e diga o que levar e onde ir."
              className={`${classeEntrada} text-[14px] leading-relaxed`} />
          </label>
          <div>
            <button type="button" onClick={() => setVerRegras((v) => !v)} aria-expanded={verRegras}
              className="inline-flex items-center gap-1.5 text-[13px] text-texto-2 hover:text-texto">
              <ChevronDown className={`size-4 transition-transform ${verRegras ? 'rotate-180' : ''}`} aria-hidden />Regras fixas que valem para todo agente
            </button>
            {verRegras && <pre className="mt-2 whitespace-pre-wrap rounded-[3px] border border-linha bg-elevada px-3 py-2 font-sans text-[13px] text-texto-2">{lista.regras_fixas}</pre>}
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between text-[13px] font-semibold text-texto-2">
              Criatividade <span className="dado font-normal text-texto">{r.temperatura.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}</span>
            </span>
            <input type="range" min={0} max={1} step={0.1} value={r.temperatura} onChange={(e) => mudar('temperatura', Number(e.target.value))}
              className="accent-[var(--color-acao)]" aria-describedby="dica-temp" />
            <span id="dica-temp" className="text-[12.5px] text-texto-3">Perto de 0: responde sempre do mesmo jeito (melhor para orientação). Perto de 1: varia mais.</span>
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-texto-2"><Wrench className="size-4" aria-hidden />Ferramentas que ele pode usar</legend>
            {lista.ferramentas.map((f) => (
              <label key={f.id} className="flex items-start gap-2.5 rounded-[3px] border border-linha px-3 py-2 hover:bg-elevada">
                <input type="checkbox" checked={r.ferramentas.includes(f.id)} onChange={() => alternar(f.id)} className="mt-0.5 size-4 accent-[var(--color-acao)]" />
                <span><span className="block text-[14px] text-texto">{f.rotulo}</span><span className="block text-[12.5px] text-texto-3">{f.descricao}</span></span>
              </label>
            ))}
            <span className="text-[12.5px] text-texto-3">Todas são de consulta. No máximo {lista.max_passos} consultas por mensagem.</span>
          </fieldset>
        </fieldset>
        {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
        {!somenteLeitura && (
          <div className="flex flex-wrap items-center gap-2">
            <Botao type="submit" variante="primario" icone={Save} carregando={salvando} disabled={!r.nome.trim() || r.instrucoes.trim().length < 20}>
              {id ? 'Salvar' : 'Criar agente'}
            </Botao>
            {id && <Botao type="button" variante="perigo" icone={Trash2} onClick={apagar}>Apagar</Botao>}
          </div>
        )}
        {id && 'atualizado_em' in inicial && (
          <p className="dado text-[12px] text-texto-3">
            {(inicial as Agente).atualizado_por ?? (inicial as Agente).criado_por ?? ''} · {dataHora((inicial as Agente).atualizado_em ?? (inicial as Agente).criado_em)}
          </p>
        )}
      </form>
    </Painel>
  );
}

function TesteAgente({ agente, lista }: { agente: Agente; lista: Lista }) {
  const [falas, setFalas] = useState<Fala[]>([]);
  const [texto, setTexto] = useState('');
  const [esperando, setEsperando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  const rotulos = Object.fromEntries(lista.ferramentas.map((f) => [f.id, f.rotulo]));

  useEffect(() => { rolagem.current?.scrollTo({ top: rolagem.current.scrollHeight }); }, [falas.length, esperando]);

  const mandar = async () => {
    const mensagem = texto.trim();
    if (!mensagem) return;
    const historico = falas.map(({ autor, texto: t }) => ({ autor, texto: t }));
    setFalas((f) => [...f, { autor: 'pessoa', texto: mensagem }]);
    setTexto(''); setErro(null); setEsperando(true);
    try {
      const r = await api<Resposta>(`/agentes/${agente.id}/testar`, enviar({ mensagem, historico }));
      setFalas((f) => [...f, { autor: 'agente', texto: r.resposta, passos: r.passos, violencia: r.violencia }]);
    } catch (e) {
      setErro(erroDe(e, 'O agente não respondeu.'));
    } finally {
      setEsperando(false);
    }
  };

  return (
    <Painel id={`t-teste-${agente.id}`} titulo="Testar" detalhe={`${lista.modelo} · nada é gravado`} semCorpo
      acao={falas.length > 0 ? <Botao tamanho="sm" variante="fantasma" onClick={() => setFalas([])}>Limpar</Botao> : undefined}>
      <div ref={rolagem} className="flex max-h-[60dvh] min-h-[280px] flex-col gap-3 overflow-y-auto px-4 py-4">
        {falas.length === 0 && <p className="text-[13.5px] text-texto-3">Escreva como uma pessoa escreveria no WhatsApp. Cada consulta que o agente fizer aparece abaixo da resposta.</p>}
        {falas.map((f, i) => (
          <div key={i} className={f.autor === 'pessoa' ? 'self-end max-w-[85%]' : 'self-start max-w-[92%]'}>
            <p className={`whitespace-pre-line rounded-[4px] px-3 py-2 text-[14px] leading-relaxed ${f.autor === 'pessoa' ? 'bg-caneta-fundo text-texto' : 'border border-linha bg-elevada text-texto'}`}>
              {f.violencia && <span className="mb-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-urgente"><ShieldAlert className="size-3.5" aria-hidden />Sinal de violência: o agente não rodou</span>}
              {f.texto}
            </p>
            {f.passos && f.passos.length > 0 && (
              <ol className="mt-1.5 flex flex-col gap-1">
                {f.passos.map((p, j) => (
                  <li key={j}>
                    <details className="rounded-[3px] border border-linha text-[12.5px]">
                      <summary className={`cursor-pointer list-none px-2.5 py-1.5 ${p.permitida ? 'text-texto-2' : 'text-urgente'}`}>
                        <Wrench className="mr-1.5 inline size-3.5 align-[-2px]" aria-hidden />
                        {rotulos[p.ferramenta] ?? p.ferramenta}{!p.permitida && ' (não permitida: recusada)'}
                        <span className="dado ml-1.5 text-texto-3">{JSON.stringify(p.argumentos)}</span>
                      </summary>
                      <pre className="dado max-h-48 overflow-auto whitespace-pre-wrap border-t border-linha px-2.5 py-1.5 text-[11.5px] text-texto-3">{JSON.stringify(p.resultado, null, 2)}</pre>
                    </details>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
        {esperando && <p className="self-start text-[13px] text-texto-3">O agente está respondendo…</p>}
      </div>
      {erro && <div className="px-4 pb-2"><Aviso>{erro}</Aviso></div>}
      <form className="flex gap-2 border-t border-linha px-4 py-3" onSubmit={(e) => { e.preventDefault(); mandar(); }}>
        <label className="flex-1">
          <span className="sr-only">Mensagem de teste</span>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={2000} placeholder="ex.: perdi meu rg, o que eu levo pra tirar outro?" className={classeEntrada} />
        </label>
        <Botao type="submit" variante="primario" icone={Send} carregando={esperando} disabled={!texto.trim() || !lista.ia_disponivel}>Enviar</Botao>
      </form>
    </Painel>
  );
}
