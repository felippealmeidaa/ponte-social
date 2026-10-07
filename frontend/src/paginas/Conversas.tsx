import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { 
  ArrowLeft, 
  Bot, 
  Hand, 
  Languages, 
  MessagesSquare, 
  Send, 
  UserRound 
} from 'lucide-react';
import { api, enviar, ErroApi } from '../api';
import { RespostasProntas } from '../components/RespostasProntas';
import { Aviso, Botao, Esqueleto, Selo, Vazio } from '../components/ui';
import { irPara } from '../navegacao';
import type { Mensagem, ResumoConversa } from '../tipos';
import type { useAtualizacao } from '../useAtualizacao';
import { ESTADOS, nomeCategoria, PRIORIDADES, tempoDesde } from '../vocabulario';

function TextoWhatsApp({ texto }: { texto: string }) {
  const partes = texto.split(/(\*[^*\n]+\*)/g);
  return (
    <>
      {partes.map((p, i) => (
        p.startsWith('*') && p.endsWith('*') && p.length > 2 
          ? <strong key={i} className="font-bold">{p.slice(1, -1)}</strong> 
          : <Fragment key={i}>{p}</Fragment>
      ))}
    </>
  );
}

export function Conversas({ conversas, selecionada }: { conversas: ReturnType<typeof useAtualizacao<ResumoConversa[]>>; selecionada?: string }) {
  const lista = conversas.dados ?? [];
  const atual = lista.find((c) => c.id === selecionada);

  return (
    <>
      <header className="mb-6 border-b border-linha pb-6">
        <div className="flex items-center gap-3">
          <h1 className="titulo text-[26px] md:text-[30px] text-texto">
            Live Chat & Transbordo Humano
          </h1>
          <span className="mono text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-marca-fundo border border-marca/20 text-marca">
            {lista.length} conversas
          </span>
        </div>
        <p className="mt-2 text-[14.5px] text-texto-2 max-w-[75ch] leading-relaxed">
          Atendimento multicanal em tempo real. Ao digitar uma resposta, o atendente assume o ticket automaticamente e silencia o bot.
        </p>
      </header>

      {conversas.erro && <div className="mb-4"><Aviso>{conversas.erro}</Aviso></div>}

      <div className="grid min-h-[72dvh] overflow-hidden rounded-2xl border border-linha glass-panel lg:grid-cols-[360px_1fr]">
        
        {/* Painel Esquerdo: Lista de Conversas */}
        <nav aria-label="Lista de conversas" className={`border-linha lg:border-r ${selecionada ? 'hidden lg:block' : ''}`}>
          <div className="border-b border-linha bg-elevada p-4">
            <p className="text-[12.5px] font-semibold text-texto-2 uppercase tracking-wide">
              Contatos Ativos
            </p>
          </div>

          {!conversas.dados && !conversas.erro && (
            <div className="flex flex-col gap-3 p-4" aria-busy="true">
              {[0, 1, 2, 3].map((i) => <Esqueleto key={i} className="h-20" />)}
            </div>
          )}

          {conversas.dados && lista.length === 0 && (
            <div className="p-6">
              <Vazio icone={MessagesSquare} titulo="Nenhuma conversa ativa">
                As mensagens recebidas no WhatsApp do CRAS serão listadas aqui em tempo real.
              </Vazio>
            </div>
          )}

          <ul className="max-h-[66dvh] overflow-y-auto divide-y divide-linha">
            {lista.map((c) => <ItemConversa key={c.id} conversa={c} ativa={c.id === selecionada} />)}
          </ul>
        </nav>

        {/* Painel Direito: Chat Selecionado */}
        <section className={`flex min-h-[72dvh] flex-col bg-superficie ${selecionada ? '' : 'hidden lg:flex'}`}>
          {selecionada ? (
            <Conversa key={selecionada} id={selecionada} resumo={atual} onMudou={conversas.recarregar} />
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center text-texto-3">
              <div className="flex flex-col items-center gap-3">
                <div className="p-4 rounded-2xl border border-linha bg-elevada">
                  <MessagesSquare className="size-8 text-marca" />
                </div>
                <p className="text-[15px] font-medium text-texto">Selecione uma conversa ao lado para iniciar</p>
                <p className="text-[13px] text-texto-2 max-w-xs">Você poderá ler o histórico completo, assumir a conversa ou devolver ao bot.</p>
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
        className={`flex flex-col gap-1.5 px-4 py-3.5 transition-all duration-150 cursor-pointer ${
          ativa 
            ? 'bg-elevada border-l-3 border-l-sky-600' 
            : 'hover:bg-elevada/50'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="mono flex items-center gap-2 text-[14px] font-bold text-texto">
            {c.telefone_mascarado || 'Contato'}
            {c.nao_lidas > 0 && c.atendimento_humano && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-600"></span>
              </span>
            )}
          </span>
          <span className="mono text-[11px] text-texto-3">{tempoDesde(c.atualizado_em)}</span>
        </div>

        <p className="line-clamp-1 text-[13px] text-texto-2">
          {c.ultima_mensagem ? (
            <span>
              <strong className="font-semibold text-texto">
                {c.ultima_mensagem.autor === 'cidadao' ? '' : c.ultima_mensagem.autor === 'bot' ? 'Bot: ' : 'Equipe: '}
              </strong>
              {c.ultima_mensagem.texto.replace(/\*/g, '')}
            </span>
          ) : 'Sem mensagens'}
        </p>

        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {c.atendimento_humano ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.2 text-[10.5px] font-semibold text-sky-700 dark:text-sky-300">
              <Hand className="size-2.5" /> Humano
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-linha bg-elevada px-2 py-0.2 text-[10.5px] font-semibold text-texto-2">
              <Bot className="size-2.5" /> Bot IA
            </span>
          )}

          {c.triagem && (
            <Selo tom={urgente ? 'urgente' : 'neutro'} semIcone={!urgente}>
              {nomeCategoria(c.triagem.categoria)}
            </Selo>
          )}
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
  const [idioma, setIdioma] = useState<string | null>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  const ultimoId = useRef(0);
  const buscando = useRef(false);

  const buscar = useCallback(async () => {
    if (buscando.current) return;
    buscando.current = true;
    try {
      const r = await api<{ conversa: { atendimento_humano: boolean; idioma?: string | null }; mensagens: Mensagem[] }>(
        `/atendimento/conversas/${id}/mensagens?depois_de=${ultimoId.current}`
      );
      setHumano(r.conversa.atendimento_humano);
      setIdioma(r.conversa.idioma ?? null);
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
      setErro(e instanceof ErroApi ? e.message : 'Falha ao sincronizar mensagens.');
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
    rolagem.current?.scrollTo({ top: rolagem.current.scrollHeight, behavior: 'smooth' });
  }, [mensagens.length]);

  const acao = async (caminho: 'assumir' | 'devolver') => {
    setOcupado(true);
    try {
      await api(`/atendimento/conversas/${id}/${caminho}`, { method: 'POST' });
      await buscar();
      onMudou();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Erro ao alternar modo de atendimento.');
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
      setErro(err instanceof ErroApi ? err.message : 'Não foi possível enviar mensagem.');
    } finally {
      setOcupado(false);
    }
  };

  const triagem = resumo?.triagem;
  const prioridade = triagem ? PRIORIDADES[triagem.prioridade] : undefined;

  return (
    <>
      {/* Top Header da Conversa */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-linha bg-elevada px-6 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <a href="#/conversas" className="rounded-xl p-1.5 text-texto-2 hover:bg-superficie lg:hidden">
            <ArrowLeft className="size-5" />
          </a>
          <div>
            <p className="mono text-[15px] font-bold text-texto">{resumo?.telefone_mascarado ?? 'Conversa'}</p>
            <p className="text-[12px] text-texto-2 flex items-center gap-1.5 mt-0.5">
              <span className={`inline-block size-2 rounded-full ${humano ? 'bg-sky-500' : 'bg-emerald-500'}`} />
              {humano ? 'Atendimento Humano Ativo (Bot silenciado)' : 'Bot IA Respondendo no WhatsApp'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {triagem && (
            <button onClick={() => irPara('fila')} className="hidden sm:inline-flex items-center gap-2 rounded-xl border border-linha bg-superficie px-3 py-1.5 text-xs text-texto hover:bg-elevada cursor-pointer">
              {prioridade && <span className="font-bold text-amber-600 dark:text-amber-400">{prioridade.rotulo}</span>}
              <span className="font-semibold text-marca">{nomeCategoria(triagem.categoria)}</span>
              <span className="text-texto-3">· {ESTADOS[triagem.status]?.rotulo ?? triagem.status}</span>
            </button>
          )}
          {humano === false && (
            <Botao tamanho="sm" variante="primario" icone={Hand} carregando={ocupado} onClick={() => acao('assumir')}>
              Assumir Chat
            </Botao>
          )}
          {humano === true && (
            <Botao tamanho="sm" variante="secundario" icone={Bot} carregando={ocupado} onClick={() => acao('devolver')}>
              Devolver ao Bot
            </Botao>
          )}
        </div>
      </div>

      {idioma === 'es' && (
        <div className="flex items-center gap-2 border-b border-sky-500/20 bg-superficie px-6 py-2.5 text-[13px] text-texto shadow-xs">
          <Languages className="size-4 shrink-0 text-marca" />
          <span>Usuário escreve em <strong>espanhol</strong>. Suas respostas em português serão traduzidas antes do envio.</span>
        </div>
      )}

      {/* Área de Rolagem das Mensagens */}
      <div ref={rolagem} className="max-h-[58dvh] flex-1 overflow-y-auto p-6 space-y-4" aria-live="polite">
        {!carregou && !erro && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => <Esqueleto key={i} className={`h-16 ${i % 2 ? 'ml-auto w-2/3' : 'w-1/2'}`} />)}
          </div>
        )}
        <ol className="flex flex-col gap-3.5">
          {mensagens.map((m) => <Balao key={m.id} mensagem={m} />)}
        </ol>
      </div>

      {/* Caixa de Envio */}
      <form onSubmit={responder} className="border-t border-linha bg-elevada p-4">
        {erro && <div className="mb-3"><Aviso>{erro}</Aviso></div>}
        {aviso && <div className="mb-3"><Aviso tom="info">{aviso}</Aviso></div>}
        
        <div className="flex items-end gap-3">
          <label htmlFor="resposta" className="sr-only">Mensagem</label>
          <textarea
            id="resposta"
            rows={2}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
            placeholder={
              idioma === 'es' 
                ? 'Escreva em português (traduzido para o espanhol automaticamente)...' 
                : humano 
                  ? 'Digite sua mensagem para o cidadão (Enter envia, Shift+Enter quebra linha)...' 
                  : 'Responder assume o ticket e silencia a IA...'
            }
            className="min-h-12 flex-1 resize-none rounded-xl border border-linha bg-superficie px-4 py-3 text-[14px] text-texto placeholder:text-texto-3 focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/20"
          />
          <RespostasProntas onEscolher={(t) => setTexto((atual) => (atual.trim() ? `${atual.trimEnd()}\n${t}` : t))} />
          <Botao type="submit" variante="primario" icone={Send} carregando={ocupado} disabled={!texto.trim()} className="h-12 px-5">
            Enviar
          </Botao>
        </div>
      </form>
    </>
  );
}

function Balao({ mensagem: m }: { mensagem: Mensagem }) {
  const doCidadao = m.autor === 'cidadao';
  const estilo = doCidadao
    ? 'bg-elevada border border-linha text-texto rounded-bl-xs'
    : m.autor === 'atendente'
      ? 'bg-sky-500/10 border border-sky-500/30 text-texto rounded-br-xs'
      : 'bg-superficie border border-linha text-texto rounded-br-xs';

  const Icone = doCidadao ? UserRound : m.autor === 'bot' ? Bot : Hand;
  const autor = doCidadao ? 'Cidadão' : m.autor === 'bot' ? 'Bot do CRAS' : 'Assistente Social';

  return (
    <li className={`flex max-w-[80%] flex-col gap-1 ${doCidadao ? 'self-start' : 'self-end items-end'}`}>
      <span className="flex items-center gap-1.5 text-[11px] text-texto-3 px-1">
        <Icone className="size-3 text-marca" />
        <span className="font-medium text-texto">{autor}</span>
        <span className="mono">· {new Date(m.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
      </span>

      <div className={`rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed shadow-xs ${estilo}`}>
        <p className="whitespace-pre-wrap"><TextoWhatsApp texto={m.traducao ?? m.texto} /></p>
      </div>

      {m.traducao && (
        <details className={`text-[12px] text-texto-3 px-1 ${doCidadao ? '' : 'text-right'}`}>
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 hover:text-marca">
            <Languages className="size-3" /> {doCidadao ? 'Ver original em espanhol' : 'Enviado em espanhol'}
          </summary>
          <p lang="es" className="mt-1 text-[12px] italic text-texto-2 bg-elevada p-2 rounded-lg border border-linha">
            <TextoWhatsApp texto={m.texto} />
          </p>
        </details>
      )}
    </li>
  );
}
