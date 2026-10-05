import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Bot, Hand, MessagesSquare, Send, UserRound } from 'lucide-react';
import { api, enviar, ErroApi } from '../api';
import { Aviso, Botao, Esqueleto, Selo, Vazio } from '../components/ui';
import { irPara } from '../navegacao';
import type { Mensagem, ResumoConversa } from '../tipos';
import type { useAtualizacao } from '../useAtualizacao';
import { CANAIS, ESTADOS, nomeCategoria, PRIORIDADES, tempoDesde } from '../vocabulario';

/** Mostra o *negrito* do WhatsApp como negrito de verdade. */
function TextoWhatsApp({ texto }: { texto: string }) {
  const partes = texto.split(/(\*[^*\n]+\*)/g);
  return (
    <>
      {partes.map((p, i) => (p.startsWith('*') && p.endsWith('*') && p.length > 2 ? <strong key={i}>{p.slice(1, -1)}</strong> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}

export function Conversas({ conversas, selecionada }: { conversas: ReturnType<typeof useAtualizacao<ResumoConversa[]>>; selecionada?: string }) {
  const lista = conversas.dados ?? [];
  const atual = lista.find((c) => c.id === selecionada);

  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-[44px] leading-[0.95] tracking-[0.03em]">Conversas</h1>
        <p className="mt-2 text-texto-2 max-w-[75ch]">
          Conversas do WhatsApp com o bot. Ao responder, você assume a conversa e o bot fica em silêncio até você devolver.
        </p>
      </header>

      {conversas.erro && <div className="mb-4"><Aviso>{conversas.erro}</Aviso></div>}

      <div className="grid min-h-[70dvh] overflow-hidden rounded-2xl border border-linha bg-superficie lg:grid-cols-[340px_1fr]">
        <nav aria-label="Lista de conversas" className={`border-linha lg:border-r ${selecionada ? 'hidden lg:block' : ''}`}>
          {!conversas.dados && !conversas.erro && (
            <div className="flex flex-col gap-3 p-4" aria-busy="true">{[0, 1, 2, 3].map((i) => <Esqueleto key={i} className="h-16" />)}</div>
          )}
          {conversas.dados && lista.length === 0 && (
            <div className="p-5">
              <Vazio icone={MessagesSquare} titulo="Nenhuma conversa ainda">
                As conversas aparecem aqui quando alguém escreve no WhatsApp do CRAS. Para testar sem celular, use <a className="text-ambar underline underline-offset-2" href="#/configuracoes/testar">Configurações › Testar o bot</a>.
              </Vazio>
            </div>
          )}
          <ul className="max-h-[70dvh] overflow-y-auto">
            {lista.map((c) => <ItemConversa key={c.id} conversa={c} ativa={c.id === selecionada} />)}
          </ul>
        </nav>

        <section className={`flex min-h-[70dvh] flex-col ${selecionada ? '' : 'hidden lg:flex'}`}>
          {selecionada ? (
            <Conversa key={selecionada} id={selecionada} resumo={atual} onMudou={conversas.recarregar} />
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center text-texto-3">
              <div>
                <MessagesSquare className="mx-auto size-8" aria-hidden />
                <p className="mt-2">Escolha uma conversa na lista.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function ItemConversa({ conversa: c, ativa }: { conversa: ResumoConversa; ativa: boolean }) {
  const urgente = c.triagem?.prioridade === 'URGENTE_VIOLENCIA';
  return (
    <li>
      <a
        href={`#/conversas/${c.id}`}
        aria-current={ativa ? 'true' : undefined}
        className={`flex flex-col gap-1 border-b border-linha px-4 py-3 transition-colors duration-150 ${ativa ? 'bg-elevada' : 'hover:bg-elevada/60'}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-medium tabular">
            {c.telefone_mascarado || 'Contato'}
            {c.nao_lidas > 0 && c.atendimento_humano && <span className="size-2 rounded-full bg-ambar" aria-label="mensagens novas" />}
          </span>
          <span className="text-xs text-texto-3">{tempoDesde(c.atualizado_em)}</span>
        </div>
        <p className="line-clamp-1 text-[13px] text-texto-2">
          {c.ultima_mensagem ? `${c.ultima_mensagem.autor === 'cidadao' ? '' : c.ultima_mensagem.autor === 'bot' ? 'Bot: ' : 'Equipe: '}${c.ultima_mensagem.texto.replace(/\*/g, '')}` : 'Sem mensagens'}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {c.atendimento_humano ? <Selo tom="ambar" semIcone>Com a equipe</Selo> : <Selo tom="neutro" semIcone>Bot</Selo>}
          {c.triagem && <Selo tom={urgente ? 'urgente' : 'neutro'} semIcone={!urgente}>{nomeCategoria(c.triagem.categoria)}</Selo>}
          {c.canal === 'simulador' && <span className="text-[11px] text-texto-3">simulador</span>}
        </div>
      </a>
    </li>
  );
}

function Conversa({ id, resumo, onMudou }: { id: string; resumo?: ResumoConversa; onMudou: () => void }) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [humano, setHumano] = useState<boolean | null>(null);
  const [carregou, setCarregou] = useState(false);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const rolagem = useRef<HTMLDivElement>(null);
  const ultimoId = useRef(0);

  const buscando = useRef(false);

  const buscar = useCallback(async () => {
    if (buscando.current) return; // uma busca por vez, senão as mesmas mensagens chegam duas vezes
    buscando.current = true;
    try {
      const r = await api<{ conversa: { atendimento_humano: boolean }; mensagens: Mensagem[] }>(`/atendimento/conversas/${id}/mensagens?depois_de=${ultimoId.current}`);
      setHumano(r.conversa.atendimento_humano);
      if (r.mensagens.length) {
        ultimoId.current = Math.max(ultimoId.current, r.mensagens[r.mensagens.length - 1].id);
        setMensagens((m) => {
          const vistos = new Set(m.map((x) => x.id));
          return [...m, ...r.mensagens.filter((x) => !vistos.has(x.id))];
        });
      }
      setCarregou(true);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível carregar a conversa.');
    } finally {
      buscando.current = false;
    }
  }, [id]);

  useEffect(() => {
    buscar();
    api(`/atendimento/conversas/${id}/lida`, { method: 'POST' }).then(onMudou).catch(() => {});
    const t = setInterval(() => document.visibilityState === 'visible' && buscar(), 2500);
    return () => clearInterval(t);
  }, [id, buscar, onMudou]);

  useEffect(() => {
    // rola só a área de mensagens, nunca a página
    rolagem.current?.scrollTo({ top: rolagem.current.scrollHeight });
  }, [mensagens.length]);

  const acao = async (caminho: 'assumir' | 'devolver') => {
    setOcupado(true);
    try {
      await api(`/atendimento/conversas/${id}/${caminho}`, { method: 'POST' });
      await buscar();
      onMudou();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível concluir.');
    } finally {
      setOcupado(false);
    }
  };

  const responder = async (e: FormEvent) => {
    e.preventDefault();
    if (!texto.trim()) return;
    setOcupado(true);
    setAviso(null);
    try {
      const r = await api<{ enviada: boolean; aviso: string | null }>(`/atendimento/conversas/${id}/responder`, enviar({ texto }));
      setTexto('');
      if (!r.enviada) setAviso(r.aviso);
      await buscar();
      onMudou();
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'Não foi possível enviar.');
    } finally {
      setOcupado(false);
    }
  };

  const triagem = resumo?.triagem;
  const prioridade = triagem ? PRIORIDADES[triagem.prioridade] : undefined;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-linha px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <a href="#/conversas" className="rounded-md p-1 text-texto-2 hover:bg-elevada lg:hidden" aria-label="Voltar para a lista"><ArrowLeft className="size-5" aria-hidden /></a>
          <div className="min-w-0">
            <p className="font-medium tabular">{resumo?.telefone_mascarado ?? 'Conversa'}</p>
            <p className="text-xs text-texto-3">
              {resumo ? CANAIS[resumo.canal] ?? resumo.canal : ''}
              {humano === null ? '' : humano ? ' · você está atendendo, o bot está em silêncio' : ' · o bot está respondendo'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {triagem && prioridade && (
            <button onClick={() => irPara('fila')} className="hidden sm:inline-flex items-center gap-2 text-xs text-texto-2 hover:text-texto" title="Ver na fila">
              <Selo tom={prioridade.tom}>{nomeCategoria(triagem.categoria)}</Selo>
              <Selo tom={ESTADOS[triagem.status]?.tom ?? 'neutro'} semIcone>{ESTADOS[triagem.status]?.rotulo ?? triagem.status}</Selo>
            </button>
          )}
          {humano === false && <Botao tamanho="sm" variante="primario" icone={Hand} carregando={ocupado} onClick={() => acao('assumir')}>Assumir conversa</Botao>}
          {humano === true && <Botao tamanho="sm" icone={Bot} carregando={ocupado} onClick={() => acao('devolver')}>Devolver ao bot</Botao>}
        </div>
      </div>

      <div ref={rolagem} className="max-h-[60dvh] flex-1 overflow-y-auto px-5 py-5" aria-live="polite">
        {!carregou && !erro && <div className="flex flex-col gap-3" aria-busy="true">{[0, 1, 2].map((i) => <Esqueleto key={i} className={`h-14 ${i % 2 ? 'ml-auto w-2/3' : 'w-1/2'}`} />)}</div>}
        <ol className="flex flex-col gap-3">
          {mensagens.map((m) => <Balao key={m.id} mensagem={m} />)}
        </ol>
      </div>

      <form onSubmit={responder} className="border-t border-linha px-5 py-4">
        {erro && <div className="mb-3"><Aviso>{erro}</Aviso></div>}
        {aviso && <div className="mb-3"><Aviso tom="info">{aviso}</Aviso></div>}
        <div className="flex items-end gap-2">
          <label htmlFor="resposta" className="sr-only">Responder</label>
          <textarea
            id="resposta"
            rows={2}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
            placeholder={humano ? 'Escreva para a pessoa (Enter envia, Shift+Enter quebra linha)' : 'Responder assume a conversa e pausa o bot'}
            className="min-h-11 flex-1 resize-none rounded-lg border border-linha-forte bg-fundo px-3 py-2.5 text-sm hover:border-texto-3 focus:border-ambar focus:outline-none"
          />
          <Botao type="submit" variante="primario" icone={Send} carregando={ocupado} disabled={!texto.trim()}>Enviar</Botao>
        </div>
      </form>
    </>
  );
}

function Balao({ mensagem: m }: { mensagem: Mensagem }) {
  const doCidadao = m.autor === 'cidadao';
  const estilo = doCidadao
    ? 'bg-elevada text-texto rounded-bl-sm'
    : m.autor === 'atendente'
      ? 'bg-ambar-escuro text-[#ffe3a8] border border-ambar/25 rounded-br-sm'
      : 'bg-fundo text-texto-2 border border-linha rounded-br-sm';
  const Icone = doCidadao ? UserRound : m.autor === 'bot' ? Bot : Hand;
  const autor = doCidadao ? 'Pessoa' : m.autor === 'bot' ? 'Bot' : 'Equipe';
  return (
    <li className={`flex max-w-[78%] flex-col gap-1 ${doCidadao ? 'self-start' : 'self-end items-end'}`}>
      <span className="flex items-center gap-1 text-[11px] text-texto-3">
        <Icone className="size-3" aria-hidden />{autor} · {new Date(m.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </span>
      <p className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${estilo}`}><TextoWhatsApp texto={m.texto} /></p>
    </li>
  );
}
