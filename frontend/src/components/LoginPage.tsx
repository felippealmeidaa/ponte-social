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
    <main className="mx-auto grid min-h-dvh max-w-[1180px] content-center gap-12 px-5 py-12 lg:grid-cols-[1fr_520px] lg:items-center lg:gap-16 lg:px-10">
      <section>
        <h1 className="titulo text-[44px] sm:text-[64px] lg:text-[76px]">Ponte Social</h1>
        <p className="mt-5 max-w-[34ch] text-[19px] leading-snug text-texto-2">
          A pessoa conta a situação no WhatsApp. A equipe recebe o caso já com o caminho sugerido, o mais urgente primeiro.
        </p>
        <p className="mt-3 max-w-[46ch] text-[15px] text-texto-3">O sistema orienta; quem decide é sempre o profissional do atendimento.</p>
      </section>

      <form onSubmit={entrar} className="folha guia overflow-visible" aria-labelledby="t-entrar">
        <div className="guia-canhoto flex flex-col justify-between gap-6 bg-elevada px-5 py-6">
          <div>
            <p className="text-[12px] text-texto-3">Guia de acesso</p>
            <p className="titulo mt-1 text-[22px]">Equipe</p>
          </div>
          <p className="text-[12px] leading-snug text-texto-3">Projeto Integrador de Inteligência Artificial, UniEVANGÉLICA, 2026/2</p>
        </div>
        <div className="flex flex-col gap-5 px-6 py-7 sm:px-8">
          <h2 id="t-entrar" className="titulo text-[24px]">Entrar no painel</h2>
          <Campo id="usuario" rotulo="Usuário ou e-mail">
            <input id="usuario" autoComplete="username" required value={usuario} onChange={(e) => setUsuario(e.target.value)} className={classeEntrada} />
          </Campo>
          <Campo id="senha" rotulo="Senha">
            <input id="senha" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} className={classeEntrada} />
          </Campo>
          {erro && <Aviso>{erro}</Aviso>}
          <Botao type="submit" variante="primario" icone={LogIn} carregando={carregando}>Entrar</Botao>
        </div>
      </form>
    </main>
  );
}
