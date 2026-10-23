import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Bot, Camera, MapPin, Mic, QrCode, RefreshCw, Send, Smartphone, Square, Trash2, UserRound, Wifi, WifiOff } from 'lucide-react';
import { api, enviar, ErroApi } from '../api';
import { Aviso, Botao, Esqueleto, Selo } from '../components/ui';
import { irPara } from '../navegacao';
import { useAtualizacao } from '../useAtualizacao';
import { EquipeEAcesso } from './Equipe';
import { ModeloIA } from './ModeloIA';
import { DadosTreino } from './DadosTreino';
import { Agentes } from './Agentes';
import { Fluxos } from './Fluxos';
import { BaseConhecimento } from './BaseConhecimento';
import { Alertas } from './Alertas';
import { Demonstracao } from './Demonstracao';

const ABAS = [
  { id: 'whatsapp', rotulo: 'WhatsApp' },
  { id: 'testar', rotulo: 'Testar o bot' },
  { id: 'agentes', rotulo: 'Agentes' },
  { id: 'fluxos', rotulo: 'Fluxos' },
  { id: 'modelo', rotulo: 'Modelo de IA' },
  { id: 'dados', rotulo: 'Dados de treino' },
  { id: 'base', rotulo: 'Base de conhecimento' },
  { id: 'alertas', rotulo: 'Alertas' },
  { id: 'demonstracao', rotulo: 'Demonstração' },
  { id: 'equipe', rotulo: 'Equipe e acesso' },
] as const;

export function Configuracoes({ aba }: { aba?: string }) {
  const atual = ABAS.some((a) => a.id === aba) ? aba : 'whatsapp';
  return (
    <>
      {atual === 'whatsapp' && <ConexaoWhatsApp />}
      {atual === 'testar' && <TestarBot />}
      {atual === 'agentes' && <Agentes />}
      {atual === 'fluxos' && <Fluxos />}
      {atual === 'modelo' && <ModeloIA />}
      {atual === 'dados' && <DadosTreino />}
      {atual === 'base' && <BaseConhecimento />}
      {atual === 'alertas' && <Alertas />}
      {atual === 'demonstracao' && <Demonstracao />}
      {atual === 'equipe' && <EquipeEAcesso />}
    </>
  );
}

function ConexaoWhatsApp() {
  const status = useAtualizacao(useCallback(() => api<{ connected: boolean; state: string; profile_name?: string; evolution_url: string }>('/whatsapp/status'), []), 10000);
  const [qr, setQr] = useState<{ qrcode?: string; pairing_code?: string; erro?: string; message?: string; connected?: boolean } | null>(null);
  const [gerando, setGerando] = useState(false);
  const [desconectando, setDesconectando] = useState(false);

  const gerarQr = async () => {
    setGerando(true);
    setQr(null);
    try {
      let resp = await api<{ qrcode?: string; pairing_code?: string; erro?: string; message?: string; connected?: boolean }>('/whatsapp/qrcode', { method: 'POST' });
      // Se a primeira chamada veio enquanto inicializava, tenta novamente após 1.5s antes de alertar
      if (!resp?.qrcode && !resp?.connected && resp?.erro?.includes('inicializando')) {
        await new Promise((r) => setTimeout(r, 1500));
        resp = await api('/whatsapp/qrcode', { method: 'POST' });
      }
      setQr(resp);
      if (resp.connected) {
        status.recarregar();
      }
    } catch (e) {
      setQr({ erro: e instanceof ErroApi ? e.message : 'Não foi possível gerar o QR Code.' });
    } finally {
      setGerando(false);
    }
  };

  const desconectar = async () => {
    if (!window.confirm('Tem certeza que deseja desconectar/resetar a instância do WhatsApp?')) return;
    setDesconectando(true);
    try {
      await api('/whatsapp/disconnect', { method: 'POST' });
      setQr(null);
      await status.recarregar();
    } catch (e) {
      setQr({ erro: e instanceof ErroApi ? e.message : 'Não foi possível desconectar.' });
    } finally {
      setDesconectando(false);
    }
  };

  const conectado = Boolean(status.dados?.connected || qr?.connected);
  const imagem = qr?.qrcode ? (qr.qrcode.startsWith('data:') ? qr.qrcode : `data:image/png;base64,${qr.qrcode}`) : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          {status.dados ? (
            conectado ? (
              <Selo tom="ok">Conectado {status.dados.profile_name ? `(${status.dados.profile_name})` : ''}</Selo>
            ) : (
              <Selo tom="neutro">Desconectado</Selo>
            )
          ) : <Esqueleto className="h-6 w-28" />}
          <span className="text-sm text-texto-2">Número do CRAS na Evolution API</span>
        </div>
        {status.erro && <Aviso>{status.erro}</Aviso>}
        {qr?.erro && <Aviso tom="urgente">{qr.erro}</Aviso>}
        {qr?.message && !qr?.erro && <Aviso tom="info">{qr.message}</Aviso>}
        <p className="text-sm text-texto-2 max-w-[60ch]">
          O bot só responde a quem escreve para o número, nunca dispara mensagens em massa. Use um chip dedicado ao serviço.
        </p>
        <ol className="flex flex-col gap-2 text-sm text-texto-2">
          <li className="flex gap-2"><Smartphone className="size-4 mt-0.5 shrink-0 text-texto-3" aria-hidden />No celular do CRAS, abra o WhatsApp › Aparelhos conectados › Conectar aparelho.</li>
          <li className="flex gap-2"><QrCode className="size-4 mt-0.5 shrink-0 text-texto-3" aria-hidden />Gere o QR Code aqui e aponte a câmera.</li>
          <li className="flex gap-2">{conectado ? <Wifi className="size-4 mt-0.5 shrink-0 text-ok" aria-hidden /> : <WifiOff className="size-4 mt-0.5 shrink-0 text-texto-3" aria-hidden />}O estado acima muda para “Conectado” em alguns segundos.</li>
        </ol>
        <div className="flex flex-wrap items-center gap-3">
          {!conectado ? (
            <Botao variante="primario" icone={QrCode} carregando={gerando} onClick={gerarQr}>
              Gerar QR Code
            </Botao>
          ) : (
            <Botao variante="perigo" icone={WifiOff} carregando={desconectando} onClick={desconectar}>
              Desconectar WhatsApp
            </Botao>
          )}
          {!conectado && (
            <Botao variante="secundario" icone={RefreshCw} carregando={desconectando} onClick={desconectar} title="Reinicia a instância na Evolution API se estiver travada">
              Limpar / Resetar Conexão
            </Botao>
          )}
        </div>
      </section>
      <section aria-live="polite" className="grid min-h-64 place-items-center rounded-[4px] border border-dashed border-linha-forte p-6 text-center">
        {gerando && (
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="size-8 animate-spin text-primaria" />
            <p className="text-sm text-texto-2">Solicitando QR Code à Evolution API...</p>
          </div>
        )}
        {!gerando && conectado && (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-full bg-ok/10 p-3 text-ok">
              <Wifi className="size-8" />
            </div>
            <p className="font-medium text-texto">WhatsApp Conectado!</p>
            <p className="text-xs text-texto-2 max-w-[32ch]">
              {status.dados?.profile_name ? `Conectado como ${status.dados.profile_name}. ` : ''}
              O bot está ativo e pronto para responder mensagens.
            </p>
          </div>
        )}
        {!gerando && !conectado && imagem && (
          <div className="flex flex-col items-center">
            <img src={imagem} alt="QR Code para conectar o WhatsApp do CRAS" className="size-64 rounded-[3px] bg-white p-2 shadow-sm" />
            {qr?.pairing_code && (
              <p className="mt-3 text-sm text-texto-2">
                Código de pareamento: <strong className="tabular text-texto">{qr.pairing_code}</strong>
              </p>
            )}
            <p className="mt-2 text-xs text-texto-3">Aponte a câmera do WhatsApp para conectar</p>
          </div>
        )}
        {!gerando && !conectado && !imagem && (
          <p className="text-sm text-texto-3">O QR Code aparece aqui ao clicar em &ldquo;Gerar QR Code&rdquo;.</p>
        )}
      </section>
    </div>
  );
}

function TestarBot() {
  const [telefone, setTelefone] = useState('5562900000001');
  const [texto, setTexto] = useState('');
  const [conversa, setConversa] = useState<{ de: 'pessoa' | 'bot'; texto: string; audio?: string }[]>([]);
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

  // Como uma foto no WhatsApp: imagem ou PDF deste computador (para testar o envio de documentos)
  const arquivo = useRef<HTMLInputElement>(null);
  const mandarFoto = async (f: File | undefined) => {
    if (!f) return;
    setErro(null);
    setConversa((c) => [...c, { de: 'pessoa', texto: `📎 ${f.type === 'application/pdf' ? 'PDF' : 'Foto'}: ${f.name}` }]);
    setEnviando(true);
    try {
      const dados = new FormData();
      dados.append('telefone', telefone);
      dados.append('arquivo', f, f.name);
      const r = await api<{ respostas: string[]; conversa_id: string }>('/webhooks/simular-anexo', { method: 'POST', body: dados });
      setConversaId(r.conversa_id);
      setConversa((c) => [...c, ...r.respostas.map((x) => ({ de: 'bot' as const, texto: x }))]);
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'Não foi possível mandar a foto.');
    } finally {
      setEnviando(false);
      if (arquivo.current) arquivo.current.value = '';
    }
  };

  const mandarAudio = async (audio: Blob, segundos: number) => {
    setConversa((c) => [...c, { de: 'pessoa', texto: `🎤 Áudio de ${segundos} s` }]);
    setEnviando(true);
    try {
      const dados = new FormData();
      dados.append('telefone', telefone);
      dados.append('audio', audio, 'audio.' + (audio.type.includes('ogg') ? 'ogg' : 'webm'));
      const r = await api<{ respostas: string[]; conversa_id: string; audio_resposta: string | null }>('/webhooks/simular-audio', { method: 'POST', body: dados });
      setConversaId(r.conversa_id);
      setConversa((c) => [...c, ...r.respostas.map((x) => ({ de: 'bot' as const, texto: x })),
        ...(r.audio_resposta ? [{ de: 'bot' as const, texto: '🔊 Resposta falada', audio: r.audio_resposta }] : [])]);
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
      const r = await api<{ respostas: string[]; conversa_id: string; audio_resposta?: string | null }>('/webhooks/simular', enviar({ telefone, ...corpo }));
      setConversaId(r.conversa_id);
      setConversa((c) => [...c, ...r.respostas.map((x) => ({ de: 'bot' as const, texto: x })),
        ...(r.audio_resposta ? [{ de: 'bot' as const, texto: '🔊 Resposta falada', audio: r.audio_resposta }] : [])]);
      if (r.respostas.length === 0) setConversa((c) => [...c, { de: 'bot', texto: '(Sem resposta automática: um atendente assumiu esta conversa.)' }]);
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'Não foi possível falar com o bot.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <section className="flex flex-col overflow-hidden rounded-[4px] border border-linha bg-superficie">
        <div ref={rolagem} className="h-[52dvh] overflow-y-auto px-5 py-5" aria-live="polite">
          {conversa.length === 0 && <p className="text-sm text-texto-3">Mande “oi” para começar, como se fosse uma pessoa no WhatsApp.</p>}
          <ol className="flex flex-col gap-3">
            {conversa.map((m, i) => (
              <li key={i} className={`flex max-w-[78%] flex-col gap-1 ${m.de === 'pessoa' ? 'self-end items-end' : 'self-start'}`}>
                <span className="flex items-center gap-1 text-[11px] text-texto-3">
                  {m.de === 'pessoa' ? <UserRound className="size-3" aria-hidden /> : <Bot className="size-3" aria-hidden />}
                  {m.de === 'pessoa' ? 'Pessoa' : 'Bot'}
                </span>
                {m.audio ? (
                  <audio controls src={m.audio} className="h-10 max-w-full" aria-label="Resposta falada do bot" />
                ) : (
                  <p className={`whitespace-pre-wrap rounded-[4px] px-3.5 py-2.5 text-sm leading-relaxed ${m.de === 'pessoa' ? 'bg-whats-enviada text-whats-texto rounded-br-[2px]' : 'bg-elevada text-texto rounded-bl-[2px]'}`}>
                    <ComLinks texto={m.texto.replace(/\*/g, '')} />
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
        <form onSubmit={mandar} className="flex gap-2 border-t border-linha px-5 py-4">
          <label htmlFor="msg-teste" className="sr-only">Mensagem da pessoa</label>
          <input id="msg-teste" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Mensagem da pessoa"
            className="h-10 flex-1 rounded-[3px] border border-linha-forte bg-fundo px-3 text-sm hover:border-texto-3 focus:border-caneta focus:outline-none" />
          <Botao type="button" icone={MapPin} carregando={localizando} disabled={enviando || gravando !== null} onClick={mandarLocalizacao}
            title="Envia a localização deste navegador, como o pino do WhatsApp">Localização</Botao>
          <Botao type="button" variante={gravando !== null ? 'perigo' : 'secundario'} icone={gravando !== null ? Square : Mic}
            disabled={enviando && gravando === null} onClick={alternarGravacao} aria-pressed={gravando !== null}
            title="Grava pelo microfone, como um áudio do WhatsApp">
            {gravando !== null ? `Parar e enviar (${gravando} s)` : 'Áudio'}
          </Botao>
          <input ref={arquivo} type="file" accept="image/*,application/pdf" className="sr-only" tabIndex={-1}
            aria-hidden onChange={(e) => mandarFoto(e.target.files?.[0])} />
          <Botao type="button" icone={Camera} disabled={enviando || gravando !== null} onClick={() => arquivo.current?.click()}
            title="Manda uma foto ou PDF, como uma foto de documento no WhatsApp">Foto</Botao>
          <Botao type="submit" variante="primario" icone={Send} carregando={enviando} disabled={!texto.trim()}>Enviar</Botao>
        </form>
      </section>
      <aside className="flex flex-col gap-4 text-sm text-texto-2">
        <p>Usa o mesmo fluxo e o mesmo banco do WhatsApp de verdade. Se a pessoa pedir contato, o caso entra na fila; a conversa aparece em <a href="#/conversas" className="text-caneta underline underline-offset-2">Conversas</a>.</p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tel-teste" className="text-[13px] font-medium">Telefone fictício</label>
          <input id="tel-teste" value={telefone} onChange={(e) => { setTelefone(e.target.value); setConversa([]); setConversaId(null); }}
            className="h-9 rounded-[3px] border border-linha-forte bg-fundo px-3 text-sm tabular focus:border-caneta focus:outline-none" />
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

