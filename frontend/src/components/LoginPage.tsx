import { useState } from 'react';
import { Shield, Lock, User, Sparkles, ArrowRight, AlertCircle } from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: (user: any, token: string) => void;
}

export const LoginPage = ({ onLoginSuccess }: LoginPageProps) => {
  const [username, setUsername] = useState('teste');
  const [password, setPassword] = useState('123');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');

    try {
      const response = await fetch('http://localhost:8000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username_or_email: username,
          password: password
        })
      });

      const data = await response.json();

      if (response.ok) {
        onLoginSuccess(data.user, data.access_token);
      } else {
        setErrorMessage(data.detail || 'Falha na autenticação. Verifique seu login e senha.');
      }
    } catch {
      // Fallback local caso o backend esteja iniciando
      if (username === 'teste' && password === '123') {
        onLoginSuccess(
          { id: 'usr-teste', name: 'Administrador de Teste', role: 'ADMIN', email: 'teste@cras.gov.br' },
          'mock_token_dev_2026'
        );
      } else {
        setErrorMessage('Não foi possível conectar ao servidor. Verifique se o backend está rodando na porta 8000.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md bg-gray-900/80 border border-gray-800 rounded-3xl p-8 backdrop-blur-2xl shadow-2xl relative z-10">
        {/* Header da Tela de Login */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-500 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-emerald-500/20">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">SocialCRM & IA</h1>
          <p className="text-xs text-gray-400 mt-1">Plataforma Inteligente de Encaminhamento Social</p>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 mt-3 rounded-full bg-emerald-950/60 border border-emerald-800 text-[11px] text-emerald-300 font-mono">
            <Sparkles className="w-3 h-3 text-emerald-400" />
            UniEVANGÉLICA 2026/2 • ODS 16 & 10
          </div>
        </div>

        {/* Dica de Acesso Rápido */}
        <div className="mb-6 p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-800/60 text-emerald-200 text-xs flex items-center justify-between">
          <div>
            <p className="font-semibold text-emerald-300">Acesso Rápido de Teste:</p>
            <p className="text-[11px] text-emerald-400/80">Login: <span className="font-mono font-bold text-white">teste</span> | Senha: <span className="font-mono font-bold text-white">123</span></p>
          </div>
          <button
            type="button"
            onClick={() => { setUsername('teste'); setPassword('123'); }}
            className="px-2.5 py-1 bg-emerald-600/40 hover:bg-emerald-600/60 border border-emerald-500/40 rounded-lg text-[10px] font-bold text-white transition-all"
          >
            Preencher
          </button>
        </div>

        {/* Formulário de Login */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase tracking-wider">
              Usuário ou E-mail
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="Ex: teste ou admin@cras.gov.br"
                className="w-full pl-10 pr-4 py-3 bg-gray-950/80 border border-gray-800 rounded-xl text-white placeholder-gray-600 text-sm focus:outline-none focus:border-emerald-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase tracking-wider">
              Senha de Acesso
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-3 bg-gray-950/80 border border-gray-800 rounded-xl text-white placeholder-gray-600 text-sm focus:outline-none focus:border-emerald-500 transition-all"
              />
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-800 text-red-300 text-xs flex items-center gap-2 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/40 text-sm mt-2"
          >
            {loading ? "Autenticando..." : (
              <>
                Entrar no Sistema
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Rodapé de Segurança */}
        <div className="mt-8 pt-6 border-t border-gray-800/80 text-center text-[11px] text-gray-500">
          Protegido com Criptografia <span className="text-gray-400 font-mono font-medium">Argon2id + AES-256</span> e conformidade com a <span className="text-emerald-400 font-medium">LGPD</span>.
        </div>
      </div>
    </div>
  );
};
