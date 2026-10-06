import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Bot, MapPin, Mic, QrCode, RefreshCw, Send, Smartphone, Square, Trash2, UserRound, Wifi, WifiOff } from 'lucide-react';
import { api, enviar, ErroApi } from '../api';
import { Aviso, Botao, Esqueleto, Selo } from '../components/ui';
import { irPara } from '../navegacao';
import { useAtualizacao } from '../useAtualizacao';
import { EquipeEAcesso } from './Equipe';

const ABAS = [
  { id: 'whatsapp', rotulo: 'WhatsApp' },
  { id: 'testar', rotulo: 'Testar o bot' },
  { id: 'modelo', rotulo: 'Modelo de IA' },
  { id: 'equipe', rotulo: 'Equipe e acesso' },
] as const;

export function Configuracoes({ aba }: { aba?: string }) {
  const atual = ABAS.some((a) => a.id === aba) ? aba : 'whatsapp';
  return (
    <>
      <header className="mb-6">
        <h1 className="titulo text-[35px] leading-[1.05]">Configurações</h1>
        <p className="mt-2 text-texto-2">Conexão do WhatsApp, teste do bot, qualidade do modelo e contas da equipe.</p>
      </header>
      <div role="tablist" aria-label="Configurações" className="mb-8 flex gap-1 overflow-x-auto border-b border-linha">
        {ABAS.map((a) => (
          <button key={a.id} role="tab" aria-selected={atual === a.id} onClick={() => irPara('configuracoes', a.id)}
            ref={(el) => { if (atual === a.id) el?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ${atual === a.id ? 'border-caneta text-texto font-semibold' : 'border-transparent text-texto-2 hover:text-texto'}`}>
            {a.rotulo}
          </button>
        ))}
      </div>
      {atual === 'whatsapp' && <ConexaoWhatsApp />}
      {atual === 'testar' && <TestarBot />}
      {atual === 'modelo' && <ModeloIA />}
      {atual === 'equipe' && <EquipeEAcesso />}
    </>
  );
}

function ConexaoWhatsApp() {
  const status = useAtualizacao(useCallback(() => api<{ connected: boolean; state: string; evolution_url: string }>('/whatsapp/status'), []), 10000);
  const [qr, setQr] = useState<{ qrcode?: string; pairing_code?: string; erro?: string } | null>(null);
  const [gerando, setGerando] = useState(false);

  const gerarQr = async () => {
    setGerando(true);
    try {
      setQr(await api('/whatsapp/qrcode', { method: 'POST' }));
    } catch (e) {
      setQr({ erro: e instanceof ErroApi ? e.message : 'Não foi possível gerar o QR Code.' });
    } finally {
      setGerando(false);
    }
  };

  const conectado = status.dados?.connected;
  const imagem = qr?.qrcode ? (qr.qrcode.startsWith('data:') ? qr.qrcode : `data:image/png;base64,${qr.qrcode}`) : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          {status.dados ? (
            conectado ? <Selo tom="ok">Conectado</Selo> : <Selo tom="neutro">Desconectado</Selo>
          ) : <Esqueleto className="h-6 w-28" />}
          <span className="text-sm text-texto-2">Número do CRAS na Evolution API</span>
        </div>
        {status.erro && <Aviso>{status.erro}</Aviso>}
        <p className="text-sm text-texto-2 max-w-[60ch]">
          O bot só responde a quem escreve para o número, nunca dispara mensagens em massa. Use um chip dedicado ao serviço.
        </p>
        <ol className="flex flex-col gap-2 text-sm text-texto-2">
          <li className="flex gap-2"><Smartphone className="size-4 mt-0.5 shrink-0 text-texto-3" aria-hidden />No celular do CRAS, abra o WhatsApp › Aparelhos conectados › Conectar aparelho.</li>
          <li className="flex gap-2"><QrCode className="size-4 mt-0.5 shrink-0 text-texto-3" aria-hidden />Gere o QR Code aqui e aponte a câmera.</li>
          <li className="flex gap-2">{conectado ? <Wifi className="size-4 mt-0.5 shrink-0 text-ok" aria-hidden /> : <WifiOff className="size-4 mt-0.5 shrink-0 text-texto-3" aria-hidden />}O estado acima muda para “Conectado” em alguns segundos.</li>
        </ol>
        <div><Botao variante="primario" icone={QrCode} carregando={gerando} onClick={gerarQr} disabled={conectado}>Gerar QR Code</Botao></div>
      </section>
      <section aria-live="polite" className="grid min-h-64 place-items-center rounded-[6px] border border-dashed border-linha-forte p-6">
        {qr?.erro && <Aviso tom="info">{qr.erro}</Aviso>}
        {imagem && <img src={imagem} alt="QR Code para conectar o WhatsApp do CRAS" className="size-64 rounded-[5px] bg-white p-2" />}
        {qr?.pairing_code && <p className="mt-3 text-sm text-texto-2">Código de pareamento: <strong className="tabular text-texto">{qr.pairing_code}</strong></p>}
        {!qr && <p className="text-sm text-texto-3">O QR Code aparece aqui.</p>}
      </section>
    </div>
  );
}

function TestarBot() {
  const [telefone, setTelefone] = useState('5562900000001');
  const [texto, setTexto] = useState('');
  const [conversa, setConversa] = useState<{ de: 'pessoa' | 'bot'; texto: string }[]>([]);
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [localizando, setLocalizando] = useState(false);
  const [gravando, setGravando] = useState<number | null>(null); // segundos gravados
  const [erro, setErro] = useState<string | null>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  const gravador = useRef<MediaRecorder | null>(null);
  const relogio = useRef<number | undefined>(undefined);
  useEffect(() => () => { window.clearInterval(relogio.current); gravador.current?.stream.getTracks().forEach((t) => t.stop()); }, []);
  // Chaves de propósito: em navegadores novos scrollTo devolve uma Promise, e o React trataria
  // o retorno como função de limpeza do efeito (a tela inteira quebrava).
  useEffect(() => { rolagem.current?.scrollTo({ top: rolagem.current.scrollHeight }); }, [conversa.length]);

  const mandar = (e: FormEvent) => {
    e.preventDefault();
    const t = texto.trim();
    if (!t) return;
    setTexto('');
    falar({ texto: t }, t);
  };

  // Como o pino de localização do WhatsApp: usa a localização deste navegador
  const mandarLocalizacao = () => {
    setErro(null);
    if (!navigator.geolocation) {
      setErro('Este navegador não informa a localização. Digite as coordenadas na mensagem, por exemplo: -16.3267, -48.9528');
      return;
    }
    setLocalizando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocalizando(false);
        falar({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }, '📍 Localização enviada');
      },
      () => {
        setLocalizando(false);
        setErro('Não foi possível pegar a localização (permissão negada ou indisponível). Digite as coordenadas na mensagem, por exemplo: -16.3267, -48.9528');
      },
      { timeout: 10000 },
    );
  };

  // Como o áudio do WhatsApp: grava pelo microfone deste computador; o bot transcreve e segue a conversa
  const alternarGravacao = async () => {
    setErro(null);
    if (gravador.current) {
      gravador.current.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErro('Este navegador não grava áudio.');
      return;
    }
    let fluxo: MediaStream;
    try {
      fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErro('Sem permissão para usar o microfone. Libere o microfone para este site e tente de novo.');
      return;
    }
    const partes: Blob[] = [];
    const rec = new MediaRecorder(fluxo);
    gravador.current = rec;
    const inicio = Date.now();
    setGravando(0);
    relogio.current = window.setInterval(() => setGravando(Math.floor((Date.now() - inicio) / 1000)), 250);
    rec.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
    rec.onstop = () => {
      window.clearInterval(relogio.current);
      fluxo.getTracks().forEach((t) => t.stop());
      gravador.current = null;
      setGravando(null);
      const segundos = Math.max(1, Math.round((Date.now() - inicio) / 1000));
      void mandarAudio(new Blob(partes, { type: rec.mimeType || 'audio/webm' }), segundos);
    };
    rec.start();
  };

  const mandarAudio = async (audio: Blob, segundos: number) => {
    setConversa((c) => [...c, { de: 'pessoa', texto: `🎤 Áudio de ${segundos} s` }]);
    setEnviando(true);
    try {
      const dados = new FormData();
      dados.append('telefone', telefone);
      dados.append('audio', audio, 'audio.' + (audio.type.includes('ogg') ? 'ogg' : 'webm'));
      const r = await api<{ respostas: string[]; conversa_id: string }>('/webhooks/simular-audio', { method: 'POST', body: dados });
      setConversaId(r.conversa_id);
      setConversa((c) => [...c, ...r.respostas.map((x) => ({ de: 'bot' as const, texto: x }))]);
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'Não foi possível mandar o áudio.');
    } finally {
      setEnviando(false);
    }
  };

  const falar = async (corpo: { texto?: string; latitude?: number; longitude?: number }, rotulo: string) => {
    setErro(null);
    setConversa((c) => [...c, { de: 'pessoa', texto: rotulo }]);
    setEnviando(true);
    try {
      const r = await api<{ respostas: string[]; conversa_id: string }>('/webhooks/simular', enviar({ telefone, ...corpo }));
      setConversaId(r.conversa_id);
      setConversa((c) => [...c, ...r.respostas.map((x) => ({ de: 'bot' as const, texto: x }))]);
      if (r.respostas.length === 0) setConversa((c) => [...c, { de: 'bot', texto: '(Sem resposta automática: um atendente assumiu esta conversa.)' }]);
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'Não foi possível falar com o bot.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <section className="flex flex-col overflow-hidden rounded-[6px] border border-linha bg-superficie">
        <div ref={rolagem} className="h-[52dvh] overflow-y-auto px-5 py-5" aria-live="polite">
          {conversa.length === 0 && <p className="text-sm text-texto-3">Mande “oi” para começar, como se fosse uma pessoa no WhatsApp.</p>}
          <ol className="flex flex-col gap-3">
            {conversa.map((m, i) => (
              <li key={i} className={`flex max-w-[78%] flex-col gap-1 ${m.de === 'pessoa' ? 'self-end items-end' : 'self-start'}`}>
                <span className="flex items-center gap-1 text-[11px] text-texto-3">
                  {m.de === 'pessoa' ? <UserRound className="size-3" aria-hidden /> : <Bot className="size-3" aria-hidden />}
                  {m.de === 'pessoa' ? 'Pessoa' : 'Bot'}
                </span>
                <p className={`whitespace-pre-wrap rounded-[6px] px-3.5 py-2.5 text-sm leading-relaxed ${m.de === 'pessoa' ? 'bg-[#d9fdd3] text-[#111b21] rounded-br-[2px]' : 'bg-elevada text-texto rounded-bl-[2px]'}`}>
                  <ComLinks texto={m.texto.replace(/\*/g, '')} />
                </p>
              </li>
            ))}
          </ol>
        </div>
        <form onSubmit={mandar} className="flex gap-2 border-t border-linha px-5 py-4">
          <label htmlFor="msg-teste" className="sr-only">Mensagem da pessoa</label>
          <input id="msg-teste" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Mensagem da pessoa"
            className="h-10 flex-1 rounded-[5px] border border-linha-forte bg-fundo px-3 text-sm hover:border-texto-3 focus:border-caneta focus:outline-none" />
          <Botao type="button" icone={MapPin} carregando={localizando} disabled={enviando || gravando !== null} onClick={mandarLocalizacao}
            title="Envia a localização deste navegador, como o pino do WhatsApp">Localização</Botao>
          <Botao type="button" variante={gravando !== null ? 'perigo' : 'secundario'} icone={gravando !== null ? Square : Mic}
            disabled={enviando && gravando === null} onClick={alternarGravacao} aria-pressed={gravando !== null}
            title="Grava pelo microfone, como um áudio do WhatsApp">
            {gravando !== null ? `Parar e enviar (${gravando} s)` : 'Áudio'}
          </Botao>
          <Botao type="submit" variante="primario" icone={Send} carregando={enviando} disabled={!texto.trim()}>Enviar</Botao>
        </form>
      </section>
      <aside className="flex flex-col gap-4 text-sm text-texto-2">
        <p>Usa o mesmo fluxo e o mesmo banco do WhatsApp de verdade. Se a pessoa pedir contato, o caso entra na fila; a conversa aparece em <a href="#/conversas" className="text-caneta underline underline-offset-2">Conversas</a>.</p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tel-teste" className="text-[13px] font-medium">Telefone fictício</label>
          <input id="tel-teste" value={telefone} onChange={(e) => { setTelefone(e.target.value); setConversa([]); setConversaId(null); }}
            className="h-9 rounded-[5px] border border-linha-forte bg-fundo px-3 text-sm tabular focus:border-caneta focus:outline-none" />
          <p className="text-xs text-texto-3">Trocar o número começa outra conversa.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao tamanho="sm" variante="fantasma" icone={Trash2} onClick={() => setConversa([])}>Limpar tela</Botao>
          {conversaId && <Botao tamanho="sm" onClick={() => irPara('conversas', conversaId)}>Abrir em Conversas</Botao>}
        </div>
        {erro && <Aviso>{erro}</Aviso>}
      </aside>
    </div>
  );
}

/** Texto do bot com os links (mapa) clicáveis, como no WhatsApp. */
function ComLinks({ texto }: { texto: string }) {
  return texto.split(/(https?:\/\/\S+)/g).map((parte, i) =>
    /^https?:\/\//.test(parte)
      ? <a key={i} href={parte} target="_blank" rel="noreferrer" className="break-all text-caneta underline underline-offset-2">{parte}</a>
      : parte,
  );
}

interface Metricas { f1_macro: number; acuracia: number; recall_violencia: number; f1_macro_ic95?: [number, number]; taxa_nao_identificado?: number }
interface Relatorio {
  timestamp: string;
  dataset_size: number;
  test_size: number;
  metodologia: Record<string, string>;
  baselines: Record<string, { teste_informal: Metricas }>;
  modelos_avaliados_cv5: Record<string, { f1_macro_mean: number; teste_informal: Metricas }>;
  modelo_final: { nome: string; teste_sistema_completo: Metricas };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const n2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ModeloIA() {
  const { dados, erro, recarregar } = useAtualizacao(useCallback(() => api<Relatorio>('/ml/metrics'), []), 0);
  const [treinando, setTreinando] = useState(false);

  const retreinar = async () => {
    setTreinando(true);
    const antes = dados?.timestamp;
    try {
      await api('/ml/retrain', { method: 'POST' });
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const novo = await api<Relatorio>('/ml/metrics');
        if (novo.timestamp !== antes) break;
      }
      await recarregar();
    } finally {
      setTreinando(false);
    }
  };

  if (erro) return <Aviso>{erro}</Aviso>;
  if (!dados) return <Esqueleto className="h-72" />;
  const s = dados.modelo_final.teste_sistema_completo;
  const linhas: [string, Metricas, boolean][] = [
    ['Sempre a categoria mais comum', dados.baselines.classe_majoritaria.teste_informal, false],
    ['Só palavras-chave', dados.baselines.regras_palavras_chave.teste_informal, false],
    ...Object.entries(dados.modelos_avaliados_cv5).map(([nome, m]) => [`${nome} (sozinho)`, m.teste_informal, false] as [string, Metricas, boolean]),
    ['Sistema em uso (regra de violência + modelo + palavras-chave)', s, true],
  ];

  return (
    <div className="flex flex-col gap-8">
      <Aviso tom="info">{dados.metodologia.limitacao}. Os números abaixo são de relatos simulados.</Aviso>
      <p className="max-w-[75ch] text-texto-2">
        No teste com {dados.test_size} relatos escritos como no WhatsApp, o sistema acertou a necessidade em{' '}
        <strong className="text-texto">{pct(s.acuracia)}</strong> dos casos e reconheceu{' '}
        <strong className={s.recall_violencia < 0.9 ? 'text-urgente' : 'text-texto'}>{pct(s.recall_violencia)}</strong> das situações de violência.
        Em {pct(s.taxa_nao_identificado ?? 0)} ele preferiu não arriscar e indicou o Disque Social 121.
      </p>
      <div className="overflow-x-auto rounded-[6px] border border-linha">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-superficie text-left text-texto-2">
            <tr>
              <th className="px-4 py-2.5 font-medium">Abordagem</th>
              <th className="px-4 py-2.5 font-medium text-right">F1 macro</th>
              <th className="px-4 py-2.5 font-medium text-right">Acerto</th>
              <th className="px-4 py-2.5 font-medium text-right">Violência reconhecida</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(([nome, m, destaque]) => (
              <tr key={nome} className={`border-t border-linha ${destaque ? 'bg-caneta-fundo/50 font-medium' : ''}`}>
                <td className="px-4 py-2.5">{nome}</td>
                <td className="px-4 py-2.5 text-right tabular">{n2(m.f1_macro)}{m.f1_macro_ic95 && <span className="ml-1 text-xs text-texto-3">({n2(m.f1_macro_ic95[0])}–{n2(m.f1_macro_ic95[1])})</span>}</td>
                <td className="px-4 py-2.5 text-right tabular">{pct(m.acuracia)}</td>
                <td className="px-4 py-2.5 text-right tabular">{pct(m.recall_violencia)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Botao icone={RefreshCw} carregando={treinando} onClick={retreinar}>{treinando ? 'Retreinando (cerca de 1 minuto)' : 'Retreinar e reavaliar'}</Botao>
        <span className="text-[13px] text-texto-3">Relatório de {new Date(dados.timestamp).toLocaleString('pt-BR')}, modelo {dados.modelo_final.nome}, {dados.dataset_size} relatos de treino.</span>
      </div>
    </div>
  );
}
