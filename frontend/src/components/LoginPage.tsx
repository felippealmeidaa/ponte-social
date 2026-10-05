import { useState, type FormEvent } from 'react';
import { LogIn } from 'lucide-react';
import { api, enviar, ErroApi, salvarSessao, type Usuario } from '../api';
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
      setErro(err instanceof ErroApi ? err.message : 'Não foi possível entrar.');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <main className="min-h-dvh grid lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden lg:flex flex-col justify-between border-r border-linha bg-[#0d1016] p-12">
        <div>
          <p className="font-display text-[34px] leading-[0.9] tracking-[0.06em]">CRAS Anápolis</p>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.22em] text-ambar">Encaminhamento social</p>
        </div>
        <div className="max-w-[640px]">
          <p className="font-display text-[64px] leading-[0.92] tracking-[0.02em]">Cada relato chega organizado, o mais urgente primeiro.</p>
          <p className="mt-5 text-texto-2 max-w-[46ch]">
            A pessoa conta a situação pelo WhatsApp. O sistema sugere o caminho; quem decide é a equipe do CRAS.
          </p>
        </div>
        <p className="text-xs text-texto-3">Projeto Integrador · Inteligência Artificial · UniEVANGÉLICA 2026/2</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <form onSubmit={entrar} className="w-full max-w-sm flex flex-col gap-5">
          <div className="lg:hidden mb-2">
            <p className="font-display text-[34px] leading-[0.9] tracking-[0.06em]">CRAS Anápolis</p>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.22em] text-ambar">Encaminhamento social</p>
          </div>
          <h1 className="font-display text-[40px] leading-none tracking-[0.03em]">Entrar no painel</h1>
          <Campo id="usuario" rotulo="Usuário ou e-mail">
            <input id="usuario" autoComplete="username" required value={usuario} onChange={(e) => setUsuario(e.target.value)} className={classeEntrada} />
          </Campo>
          <Campo id="senha" rotulo="Senha">
            <input id="senha" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} className={classeEntrada} />
          </Campo>
          {erro && <Aviso>{erro}</Aviso>}
          <Botao type="submit" variante="primario" icone={LogIn} carregando={carregando}>Entrar</Botao>
        </form>
      </section>
    </main>
  );
}
