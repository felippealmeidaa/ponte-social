import { useState, type FormEvent } from 'react';
import { 
  BrainCircuit, 
  LogIn, 
  Mic, 
  Radio, 
  ShieldAlert, 
  ShieldCheck, 
  Sparkles 
} from 'lucide-react';
import { api, enviar, ErroApi, salvarSessao, type Usuario } from '../api';
import { BotaoTema } from './Tema';
import { Aviso, Botao, Campo, classeEntrada } from './ui';

export function LoginPage({ onEntrar }: { onEntrar: (u: Usuario) => void }) {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const r = await api<{ access_token: string; user: Usuario }>('/auth/login', enviar({ username_or_email: usuario.trim(), password: senha }));
      salvarSessao(r.user, r.access_token);
      onEntrar(r.user);
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'Falha na autenticação. Verifique usuário e senha.');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden px-4 py-12 bg-fundo">
      {/* Botão de Tema Flutuante */}
      <div className="fixed right-6 top-6 z-20">
        <BotaoTema />
      </div>

      {/* Luzes de Fundo Ambientais Discretas */}
      <div className="pointer-events-none absolute -top-40 -left-40 size-[550px] rounded-full bg-marca/5 blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 size-[550px] rounded-full bg-marca/5 blur-[130px]" />

      <main className="relative z-10 mx-auto grid w-full max-w-[1180px] gap-12 lg:grid-cols-[1.1fr_480px] lg:items-center lg:gap-16">
        
        {/* Coluna Esquerda: Apresentação de Alto Impacto */}
        <section className="flex flex-col gap-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-marca/30 bg-marca-bg px-3.5 py-1 text-xs font-semibold text-marca w-fit">
            <Radio className="size-3 animate-pulse text-marca" />
            <span>PLATAFORMA SOCIAL CRM & GOVTECH</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-marca text-white shadow-lg shadow-marca/25">
              <BrainCircuit className="size-8 text-white" />
            </div>
            <div>
              <h1 className="titulo text-[36px] sm:text-[48px] lg:text-[56px] tracking-tight text-texto">
                Ponte Social
              </h1>
              <p className="text-[14px] text-marca font-medium">Sistema Inteligente de Encaminhamento & Atendimento</p>
            </div>
          </div>

          <p className="max-w-[48ch] text-[16px] leading-relaxed text-texto-2">
            Acolhimento automatizado via WhatsApp com transcrição de áudio Whisper, geolocalização e classificação supervisionada de vulnerabilidade com prioridade máxima para proteção integral.
          </p>

          {/* Destaques Tecnológicos */}
          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl border border-linha bg-superficie p-3 shadow-sm">
              <ShieldAlert className="size-5 text-urgente-forte shrink-0" />
              <div>
                <p className="text-[13px] font-semibold text-texto">Recall 100% Violência</p>
                <p className="text-[11.5px] text-texto-3">Proteção prioritária imediata</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-linha bg-superficie p-3 shadow-sm">
              <Mic className="size-5 text-marca shrink-0" />
              <div>
                <p className="text-[13px] font-semibold text-texto">Transcrição Whisper</p>
                <p className="text-[11.5px] text-texto-3">Acessibilidade a áudios</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-linha bg-superficie p-3 shadow-sm">
              <Sparkles className="size-5 text-marca shrink-0" />
              <div>
                <p className="text-[13px] font-semibold text-texto">LLM Especializado</p>
                <p className="text-[11.5px] text-texto-3">Interpretação e triagem</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-linha bg-superficie p-3 shadow-sm">
              <ShieldCheck className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <p className="text-[13px] font-semibold text-texto">Conformidade LGPD</p>
                <p className="text-[11.5px] text-texto-3">Criptografia e auditoria</p>
              </div>
            </div>
          </div>

          <p className="text-[12px] text-texto-3 pt-2">
            Projeto Integrador de Inteligência Artificial · UniEVANGÉLICA 2026/2 · CRAS Anápolis-GO
          </p>
        </section>

        {/* Coluna Direita: Card de Autenticação */}
        <form 
          onSubmit={entrar} 
          className="rounded-3xl border border-linha bg-superficie p-8 shadow-xl flex flex-col gap-5 relative overflow-hidden"
          aria-labelledby="t-entrar"
        >
          <div className="border-b border-linha pb-4">
            <h2 id="t-entrar" className="titulo text-[24px] text-texto">Acesso Institucional</h2>
            <p className="text-[13px] text-texto-2 mt-1">Insira suas credenciais de assistente social ou coordenação.</p>
          </div>

          <Campo id="usuario" rotulo="Usuário ou E-mail Institucional">
            <input 
              id="usuario" 
              autoComplete="username" 
              required 
              value={usuario} 
              onChange={(e) => setUsuario(e.target.value)} 
              placeholder="Ex.: admin ou seu.nome@cras.gov.br"
              className={classeEntrada} 
            />
          </Campo>

          <Campo id="senha" rotulo="Senha de Acesso">
            <input 
              id="senha" 
              type="password" 
              autoComplete="current-password" 
              required 
              value={senha} 
              onChange={(e) => setSenha(e.target.value)} 
              placeholder="••••••••"
              className={classeEntrada} 
            />
          </Campo>

          {erro && <Aviso>{erro}</Aviso>}

          <div className="pt-2">
            <Botao type="submit" variante="primario" icone={LogIn} carregando={carregando} className="w-full h-12 text-[15px]">
              Acessar Painel de Atendimento
            </Botao>
          </div>

          <div className="flex items-center justify-between text-[11.5px] text-texto-3 pt-2 border-t border-linha">
            <span>Ambiente Seguro SSL/TLS</span>
            <span>v2.5 Release</span>
          </div>
        </form>
      </main>
    </div>
  );
}
