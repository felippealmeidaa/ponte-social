import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { 
  BellRing,
  Bot, 
  BrainCircuit, 
  CheckCircle2, 
  MapPin, 
  Mic, 
  QrCode, 
  Send, 
  Smartphone, 
  Square, 
  Trash2, 
  Users, 
  Wifi, 
  WifiOff 
} from 'lucide-react';
import { api, enviar, ErroApi } from '../api';
import { Aviso, Botao, Esqueleto, classeEntrada } from '../components/ui';
import { irPara } from '../navegacao';
import { useAtualizacao } from '../useAtualizacao';
import { EquipeEAcesso } from './Equipe';
import { ModeloIA } from './ModeloIA';
import { Alertas } from './Alertas';

const ABAS = [
  { id: 'whatsapp', rotulo: 'Conexão WhatsApp & Canais', icone: Smartphone },
  { id: 'testar', rotulo: 'Simulador do Bot (Voz & Texto)', icone: Bot },
  { id: 'modelo', rotulo: 'Benchmark de IA & MLOps', icone: BrainCircuit },
  { id: 'alertas', rotulo: 'Alertas de Espera', icone: BellRing },
  { id: 'equipe', rotulo: 'Equipe, Unidades & Acesso', icone: Users },
] as const;

export function Configuracoes({ aba }: { aba?: string }) {
  const atual = ABAS.some((a) => a.id === aba) ? aba : 'whatsapp';
  return (
    <>
      <header className="mb-8 border-b border-linha pb-6">
        <div className="flex items-center gap-3">
          <h1 className="titulo text-[26px] md:text-[30px] text-texto">
            Configurações do Painel de Controle
          </h1>
          <span className="mono text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-marca-fundo border border-marca/20 text-marca">
            ADMIN
          </span>
        </div>
        <p className="mt-2 text-[14.5px] text-texto-2 max-w-[75ch] leading-relaxed">
          Gerenciamento de canais de mensageria, simulador omnichannel de testes, métricas do modelo e controle de acesso dos técnicos.
        </p>
      </header>

      {/* Navegação por Sub-Abas em Pílulas */}
      <div role="tablist" aria-label="Configurações" className="mb-8 flex gap-2 overflow-x-auto border-b border-linha pb-3">
        {ABAS.map((a) => {
          const ativo = atual === a.id;
          const Icone = a.icone;
          return (
            <button 
              key={a.id} 
              role="tab" 
              aria-selected={ativo} 
              onClick={() => irPara('configuracoes', a.id)}
              className={`flex items-center gap-2 shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150 cursor-pointer ${
                ativo 
                  ? 'bg-elevada border border-linha-forte text-texto font-semibold shadow-xs' 
                  : 'text-texto-2 hover:text-texto hover:bg-elevada/60'
              }`}
            >
              <Icone className={`size-4 ${ativo ? 'text-marca' : 'text-texto-3'}`} />
              {a.rotulo}
            </button>
          );
        })}
      </div>

      <div>
        {atual === 'whatsapp' && <ConexaoWhatsApp />}
        {atual === 'testar' && <TestarBot />}
        {atual === 'modelo' && <ModeloIA />}
        {atual === 'alertas' && <Alertas />}
        {atual === 'equipe' && <EquipeEAcesso />}
      </div>
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
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="flex flex-col gap-5 rounded-2xl border border-linha glass-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {status.dados ? (
              conectado ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  <Wifi className="size-3.5" /> Conectado à Rede
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-linha bg-elevada px-3 py-1 text-xs font-medium text-texto-2">
                  <WifiOff className="size-3.5" /> Desconectado
                </span>
              )
            ) : <Esqueleto className="h-6 w-28" />}
          </div>
          <span className="mono text-[11.5px] text-texto-3">Evolution API Gateway</span>
        </div>

        {status.erro && <Aviso>{status.erro}</Aviso>}
        
        <p className="text-[14px] text-texto-2 leading-relaxed">
          Instância dedicada do WhatsApp para atendimento dos cidadãos. O webhook processa áudios, textos e documentos com segurança e conformidade LGPD.
        </p>

        <ol className="flex flex-col gap-3 text-[13.5px] text-texto-2 border-t border-linha pt-4">
          <li className="flex gap-2.5">
            <Smartphone className="size-4 text-marca shrink-0 mt-0.5" />
            <span>No celular da instituição, abra o WhatsApp ➔ Aparelhos Conectados ➔ Conectar um aparelho.</span>
          </li>
          <li className="flex gap-2.5">
            <QrCode className="size-4 text-marca shrink-0 mt-0.5" />
            <span>Clique no botão abaixo para gerar o QR Code de autenticação.</span>
          </li>
          <li className="flex gap-2.5">
            <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <span>Aponte a câmera para parear. O status mudará para conectado automaticamente.</span>
          </li>
        </ol>

        <div className="pt-2">
          <Botao variante="primario" icone={QrCode} carregando={gerando} onClick={gerarQr} disabled={conectado}>
            {conectado ? 'WhatsApp Já Conectado' : 'Gerar Novo QR Code'}
          </Botao>
        </div>
      </section>

      <section aria-live="polite" className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-linha bg-superficie p-8 text-center min-h-[300px]">
        {qr?.erro && <Aviso tom="info">{qr.erro}</Aviso>}
        {imagem && (
          <div className="p-3 rounded-2xl bg-white shadow-xl border border-slate-200">
            <img src={imagem} alt="QR Code WhatsApp" className="size-60 rounded-xl" />
          </div>
        )}
        {qr?.pairing_code && (
          <div className="mt-4 rounded-xl border border-marca/30 bg-marca-fundo px-4 py-2 text-texto">
            Código de pareamento: <strong className="mono text-[16px] font-bold text-marca">{qr.pairing_code}</strong>
          </div>
        )}
        {!qr && !imagem && (
          <div className="flex flex-col items-center gap-2 text-texto-3">
            <QrCode className="size-12 opacity-60" />
            <p className="text-[13.5px]">O QR Code gerado será exibido aqui</p>
          </div>
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
  const [gravando, setGravando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  const gravador = useRef<MediaRecorder | null>(null);
  const relogio = useRef<number | undefined>(undefined);

  useEffect(() => () => { window.clearInterval(relogio.current); gravador.current?.stream.getTracks().forEach((t) => t.stop()); }, []);
  useEffect(() => { rolagem.current?.scrollTo({ top: rolagem.current.scrollHeight }); }, [conversa.length]);

  const mandar = (e: FormEvent) => {
    e.preventDefault();
    const t = texto.trim();
    if (!t) return;
    setTexto('');
    falar({ texto: t }, t);
  };

  const mandarLocalizacao = () => {
    setErro(null);
    if (!navigator.geolocation) {
      setErro('Geolocalização não suportada. Digite as coordenadas.');
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
        setErro('Falha ao obter localização.');
      },
      { timeout: 10000 },
    );
  };

  const alternarGravacao = async () => {
    setErro(null);
    if (gravador.current) {
      gravador.current.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErro('Navegador não suporta gravação de áudio.');
      return;
    }
    try {
      const fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
      const pedacos: Blob[] = [];
      const rec = new MediaRecorder(fluxo, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '' });
      gravador.current = rec;
      rec.ondataavailable = (e) => { if (e.data.size) pedacos.push(e.data); };
      rec.onstop = async () => {
        fluxo.getTracks().forEach((t) => t.stop());
        window.clearInterval(relogio.current);
        gravador.current = null;
        setGravando(null);
        if (!pedacos.length) return;
        const blob = new Blob(pedacos, { type: rec.mimeType || 'audio/webm' });
        const leitor = new FileReader();
        leitor.onloadend = () => {
          const b64 = (leitor.result as string).split(',')[1];
          falar({ audio_b64: b64, audio_mime: blob.type }, '🎤 Mensagem de voz enviada');
        };
        leitor.readAsDataURL(blob);
      };
      rec.start(250);
      setGravando(0);
      relogio.current = window.setInterval(() => setGravando((s) => (s === null ? 0 : s + 1)), 1000);
    } catch {
      setErro('Permissão de microfone negada.');
    }
  };

  const falar = async (carga: Record<string, unknown>, rotulo: string) => {
    setEnviando(true);
    setErro(null);
    setConversa((c) => [...c, { de: 'pessoa', texto: rotulo }]);
    try {
      const r = await api<{ conversa_id: string; respostas: { texto: string }[] }>('/whatsapp/simular', enviar({
        telefone,
        conversa_id: conversaId ?? undefined,
        ...carga,
      }));
      setConversaId(r.conversa_id);
      r.respostas.forEach((resp) => {
        setConversa((c) => [...c, { de: 'bot', texto: resp.texto }]);
      });
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Falha na simulação.');
    } finally {
      setEnviando(false);
    }
  };

  const limparConversa = () => {
    setConversa([]);
    setConversaId(null);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
      <section className="flex flex-col gap-4 rounded-2xl border border-linha glass-card p-6">
        <div className="flex items-center gap-2 text-marca">
          <Bot className="size-5" />
          <h3 className="titulo text-[18px] text-texto">Simulador de Atendimento</h3>
        </div>
        <p className="text-[13.5px] text-texto-2 leading-relaxed">
          Permite testar o fluxo de triagem sem gastar mensagens no celular. Suporta envio de texto livre, áudios e localização geográfica.
        </p>

        <div className="flex flex-col gap-2 pt-2">
          <label htmlFor="sim-tel" className="text-[12.5px] font-semibold text-texto">Número de Telefone Simulado</label>
          <input 
            id="sim-tel" 
            value={telefone} 
            onChange={(e) => setTelefone(e.target.value)} 
            className={classeEntrada}
          />
        </div>

        <div className="flex gap-2 pt-2">
          <Botao tamanho="sm" variante="secundario" icone={Trash2} onClick={limparConversa}>
            Limpar Chat
          </Botao>
        </div>
      </section>

      {/* Terminal de Chat do Simulador */}
      <section className="flex flex-col rounded-2xl border border-linha glass-panel overflow-hidden min-h-[500px]">
        <div className="border-b border-linha bg-elevada px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-block size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="mono text-[13px] font-bold text-texto">Terminal de Teste Interativo</span>
          </div>
          <span className="mono text-[11.5px] text-texto-3">{conversa.length} mensagens</span>
        </div>

        <div ref={rolagem} className="flex-1 overflow-y-auto p-5 space-y-3 max-h-[400px]">
          {conversa.length === 0 && (
            <div className="flex h-full items-center justify-center p-8 text-center text-texto-3">
              <p className="text-[14px]">Envie uma mensagem abaixo para iniciar a conversa com o bot.</p>
            </div>
          )}
          {conversa.map((m, i) => (
            <div key={i} className={`flex flex-col ${m.de === 'pessoa' ? 'items-end' : 'items-start'}`}>
              <div className={`rounded-2xl px-4 py-2.5 text-[13.5px] max-w-[85%] leading-relaxed ${
                m.de === 'pessoa' 
                  ? 'bg-marca-fundo border border-marca/30 text-texto' 
                  : 'bg-elevada border border-linha text-texto'
              }`}>
                {m.texto}
              </div>
            </div>
          ))}
        </div>

        {erro && <div className="p-3"><Aviso>{erro}</Aviso></div>}

        <form onSubmit={mandar} className="border-t border-linha bg-superficie p-3 flex items-center gap-2">
          <button 
            type="button" 
            onClick={alternarGravacao} 
            title={gravando !== null ? 'Parar gravação' : 'Gravar áudio'}
            className={`flex size-10 items-center justify-center rounded-xl border transition-all cursor-pointer ${
              gravando !== null ? 'bg-rose-600 border-rose-500 text-white animate-pulse' : 'border-linha bg-elevada text-texto-2 hover:text-marca'
            }`}
          >
            {gravando !== null ? <Square className="size-4" /> : <Mic className="size-4" />}
          </button>

          <button 
            type="button" 
            onClick={mandarLocalizacao} 
            disabled={localizando}
            title="Enviar Localização"
            className="flex size-10 items-center justify-center rounded-xl border border-linha bg-elevada text-texto-2 hover:text-marca transition-all cursor-pointer"
          >
            <MapPin className="size-4" />
          </button>

          <input 
            value={texto} 
            onChange={(e) => setTexto(e.target.value)} 
            placeholder="Digite como se fosse o cidadão no WhatsApp..."
            className="flex-1 rounded-xl border border-linha bg-elevada px-4 py-2 text-[13.5px] text-texto placeholder:text-texto-3 focus:border-marca focus:outline-none"
          />

          <Botao type="submit" variante="primario" icone={Send} carregando={enviando} disabled={!texto.trim()}>
            Enviar
          </Botao>
        </form>
      </section>
    </div>
  );
}
