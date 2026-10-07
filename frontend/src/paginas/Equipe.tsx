import { useCallback, useState, type FormEvent } from 'react';
import { 
  KeyRound, 
  Lock, 
  Save, 
  ShieldCheck, 
  UserPlus, 
  Users 
} from 'lucide-react';
import { api, atualizar, enviar, ErroApi, sessaoSalva } from '../api';
import { Aviso, Botao, Campo, classeEntrada, Esqueleto, PainelLateral, Selo } from '../components/ui';
import { contaAtual, nomeUnidade, useUnidades, type UnidadeResumo } from '../unidades';
import { useAtualizacao } from '../useAtualizacao';

interface Conta {
  id: string;
  login: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'ATENDENTE';
  ativo: boolean;
  unidade_id: string | null;
  ultimo_acesso: string | null;
}

const PAPEL = { ADMIN: 'Coordenação / Admin', ATENDENTE: 'Assistente Social / Atendimento' } as const;
const SENHA_MINIMA = 8;

const mensagem = (e: unknown, padrao: string) => (e instanceof ErroApi ? e.message : padrao);

export function EquipeEAcesso() {
  const eu = sessaoSalva();
  return (
    <div className="grid gap-8 xl:grid-cols-[380px_1fr]">
      <MinhaSenha />
      {eu?.role === 'ADMIN' ? (
        <GestaoEquipe meuId={eu.id} />
      ) : (
        <div className="rounded-2xl border border-linha glass-card p-6 flex flex-col items-center justify-center text-center text-texto-2">
          <ShieldCheck className="size-10 text-marca mb-2" />
          <p className="text-[14px]">O gerenciamento de usuários é restrito à coordenação do CRAS.</p>
        </div>
      )}
    </div>
  );
}

function MinhaSenha() {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [repetir, setRepetir] = useState('');
  const [estado, setEstado] = useState<'livre' | 'salvando' | 'salvo'>('livre');
  const [erro, setErro] = useState<string | null>(null);

  const trocar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (nova !== repetir) return setErro('A confirmação não confere com a nova senha.');
    setEstado('salvando');
    try {
      await api('/auth/trocar-senha', enviar({ senha_atual: atual, nova_senha: nova }));
      setAtual(''); setNova(''); setRepetir('');
      setEstado('salvo');
    } catch (err) {
      setErro(mensagem(err, 'Falha ao trocar a senha.'));
      setEstado('livre');
    }
  };

  return (
    <section aria-labelledby="t-minha-senha" className="rounded-2xl border border-linha glass-card p-6 flex flex-col gap-4">
      <div className="flex items-center gap-2 border-b border-linha pb-3 text-marca">
        <Lock className="size-5" />
        <h2 id="t-minha-senha" className="titulo text-[18px] text-texto">Alterar Minha Senha</h2>
      </div>

      <form onSubmit={trocar} className="flex flex-col gap-4">
        <Campo id="senha-atual" rotulo="Senha Atual">
          <input id="senha-atual" type="password" autoComplete="current-password" required value={atual} onChange={(e) => setAtual(e.target.value)} className={classeEntrada} />
        </Campo>
        <Campo id="senha-nova" rotulo="Nova Senha" dica={`Mínimo de ${SENHA_MINIMA} caracteres.`}>
          <input id="senha-nova" type="password" autoComplete="new-password" required minLength={SENHA_MINIMA} value={nova} onChange={(e) => setNova(e.target.value)} className={classeEntrada} />
        </Campo>
        <Campo id="senha-repetir" rotulo="Confirmar Nova Senha">
          <input id="senha-repetir" type="password" autoComplete="new-password" required value={repetir} onChange={(e) => setRepetir(e.target.value)} className={classeEntrada} />
        </Campo>
        
        {erro && <Aviso>{erro}</Aviso>}
        
        <div className="flex items-center gap-3 pt-2">
          <Botao type="submit" variante="primario" icone={KeyRound} carregando={estado === 'salvando'}>
            Atualizar Senha
          </Botao>
          {estado === 'salvo' && <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Senha alterada com sucesso!</span>}
        </div>
      </form>
    </section>
  );
}

function GestaoEquipe({ meuId }: { meuId: string }) {
  const unidades = useUnidades();
  const geral = contaAtual().geral;
  const { dados, erro, recarregar } = useAtualizacao(useCallback(() => api<Conta[]>('/equipe'), []), 0);
  const [editando, setEditando] = useState<Conta | 'nova' | null>(null);
  const fechar = useCallback(() => setEditando(null), []);

  return (
    <section aria-labelledby="t-equipe" className="flex flex-col gap-4 rounded-2xl border border-linha glass-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-linha pb-4">
        <div className="flex items-center gap-2.5">
          <Users className="size-5 text-marca" />
          <h2 id="t-equipe" className="titulo text-[19px] text-texto">Contas da Equipe Técnica</h2>
        </div>
        <Botao variante="primario" icone={UserPlus} onClick={() => setEditando('nova')}>
          Novo Acesso
        </Botao>
      </div>

      {erro && <Aviso>{erro}</Aviso>}
      {!dados && !erro && <Esqueleto className="h-48" />}
      
      {dados && (
        <ul className="divide-y divide-linha overflow-hidden rounded-xl border border-linha bg-superficie">
          {dados.map((c) => (
            <li key={c.id}>
              <button 
                onClick={() => setEditando(c)} 
                className="flex w-full flex-wrap items-center justify-between gap-4 p-4 text-left hover:bg-elevada/50 transition-colors cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <span className={`block font-semibold text-texto ${c.ativo ? '' : 'line-through text-texto-3'}`}>
                    {c.name}{c.id === meuId && <span className="ml-2 text-xs font-bold text-marca">(Você)</span>}
                  </span>
                  <span className="mono text-[12.5px] text-texto-2">{c.login} · {c.email || 'Sem e-mail'}</span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {geral && <span className="text-[12.5px] text-texto-2">{nomeUnidade(unidades.dados, c.unidade_id)}</span>}
                  <Selo tom={c.role === 'ADMIN' ? 'caneta' : 'neutro'}>{c.role === 'ADMIN' ? 'Coordenação' : 'Atendimento'}</Selo>
                  {!c.ativo && <Selo tom="neutro">Inativa</Selo>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <PainelLateral aberto={editando !== null} titulo={editando === 'nova' ? 'Novo Profissional' : 'Editar Conta'} onFechar={fechar} largura="max-w-lg">
        {editando === 'nova' && <FormNovaConta unidades={geral ? unidades.dados : null} onPronto={() => { fechar(); recarregar(); }} />}
        {editando && editando !== 'nova' && (
          <FormEditarConta key={editando.id} conta={editando} ehVoce={editando.id === meuId} unidades={geral ? unidades.dados : null} onPronto={() => { fechar(); recarregar(); }} />
        )}
      </PainelLateral>
    </section>
  );
}

function FormNovaConta({ unidades, onPronto }: { unidades: UnidadeResumo[] | null; onPronto: () => void }) {
  const [unidade, setUnidade] = useState<string>('');
  const [login, setLogin] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [papel, setPapel] = useState<'ATENDENTE' | 'ADMIN'>('ATENDENTE');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const criar = async (e: FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      await api('/equipe', enviar({ login: login.trim(), nome, email, senha, papel, unidade_id: unidade || null }));
      onPronto();
    } catch (err) {
      setErro(mensagem(err, 'Falha ao cadastrar conta.'));
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={criar} className="flex flex-col gap-4 text-texto">
      <Campo id="nc-nome" rotulo="Nome Completo">
        <input id="nc-nome" required value={nome} onChange={(e) => setNome(e.target.value)} className={classeEntrada} placeholder="Nome do assistente social" />
      </Campo>
      <Campo id="nc-login" rotulo="Usuário de Login" dica="Identificador único para acesso.">
        <input id="nc-login" required autoComplete="off" value={login} onChange={(e) => setLogin(e.target.value)} className={classeEntrada} placeholder="nome.sobrenome" />
      </Campo>
      <Campo id="nc-email" rotulo="E-mail Institucional">
        <input id="nc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={classeEntrada} placeholder="email@anapolis.go.gov.br" />
      </Campo>
      <Campo id="nc-senha" rotulo="Senha Provisória" dica={`Mínimo de ${SENHA_MINIMA} caracteres.`}>
        <input id="nc-senha" type="password" autoComplete="new-password" required minLength={SENHA_MINIMA} value={senha} onChange={(e) => setSenha(e.target.value)} className={classeEntrada} />
      </Campo>
      <SeletorPapel valor={papel} onMudar={setPapel} />
      {unidades && <SeletorUnidadeConta id="nc-unidade" unidades={unidades} valor={unidade} onMudar={setUnidade} />}
      {erro && <Aviso>{erro}</Aviso>}
      <div className="pt-2">
        <Botao type="submit" variante="primario" icone={UserPlus} carregando={salvando} className="w-full">
          Cadastrar Profissional
        </Botao>
      </div>
    </form>
  );
}

function FormEditarConta({ conta, ehVoce, unidades, onPronto }: {
  conta: Conta; ehVoce: boolean; unidades: UnidadeResumo[] | null; onPronto: () => void;
}) {
  const [unidade, setUnidade] = useState<string>(conta.unidade_id ?? '');
  const [nome, setNome] = useState(conta.name);
  const [papel, setPapel] = useState(conta.role);
  const [ativo, setAtivo] = useState(conta.ativo);
  const [novaSenha, setNovaSenha] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ tom: 'urgente' | 'ok'; texto: string } | null>(null);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setAviso(null);
    try {
      const mudouUnidade = unidades !== null && unidade !== (conta.unidade_id ?? '');
      await api(`/equipe/${conta.id}`, atualizar({ nome, papel, ativo, ...(mudouUnidade ? { mudar_unidade: true, unidade_id: unidade || null } : {}) }));
      onPronto();
    } catch (err) {
      setAviso({ tom: 'urgente', texto: mensagem(err, 'Falha ao atualizar dados.') });
      setSalvando(false);
    }
  };

  const redefinir = async () => {
    setAviso(null);
    try {
      await api(`/equipe/${conta.id}/senha`, enviar({ nova_senha: novaSenha }));
      setNovaSenha('');
      setAviso({ tom: 'ok', texto: 'Senha redefinida com sucesso!' });
    } catch (err) {
      setAviso({ tom: 'urgente', texto: mensagem(err, 'Falha ao redefinir senha.') });
    }
  };

  return (
    <div className="flex flex-col gap-6 text-texto">
      <form onSubmit={salvar} className="flex flex-col gap-4">
        <p className="text-[13px] text-texto-2">Usuário: <span className="mono font-bold text-texto">{conta.login}</span></p>
        <Campo id="ec-nome" rotulo="Nome">
          <input id="ec-nome" required value={nome} onChange={(e) => setNome(e.target.value)} className={classeEntrada} />
        </Campo>
        <SeletorPapel valor={papel} onMudar={setPapel} />
        {unidades && <SeletorUnidadeConta id="ec-unidade" unidades={unidades} valor={unidade} onMudar={setUnidade} />}
        
        <label className="flex items-center gap-2.5 text-sm cursor-pointer">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="size-4 accent-sky-600 rounded" />
          <span>Conta Ativa no Sistema</span>
        </label>
        
        <Botao type="submit" variante="primario" icone={Save} carregando={salvando}>Salvar Alterações</Botao>
      </form>

      {!ehVoce && (
        <div className="flex flex-col gap-3 border-t border-linha pt-5">
          <h3 className="font-semibold text-texto text-[15px]">Redefinição de Senha</h3>
          <Campo id="ec-senha" rotulo="Nova Senha Provisória">
            <input id="ec-senha" type="password" autoComplete="new-password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} className={classeEntrada} placeholder="••••••••" />
          </Campo>
          <Botao icone={KeyRound} disabled={novaSenha.length < SENHA_MINIMA} onClick={redefinir}>Redefinir Senha</Botao>
        </div>
      )}
      {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
    </div>
  );
}

function SeletorPapel({ valor, onMudar }: { valor: 'ADMIN' | 'ATENDENTE'; onMudar: (p: 'ADMIN' | 'ATENDENTE') => void }) {
  return (
    <fieldset className="flex flex-col gap-2 rounded-xl border border-linha bg-elevada p-4">
      <legend className="text-[12.5px] font-semibold text-texto">Nível de Permissão</legend>
      {(['ATENDENTE', 'ADMIN'] as const).map((p) => (
        <label key={p} className="flex items-start gap-2.5 text-[13.5px] cursor-pointer">
          <input type="radio" name="papel" checked={valor === p} onChange={() => onMudar(p)} className="mt-1 size-4 accent-sky-600" />
          <div>
            <span className="font-semibold text-texto">{PAPEL[p]}</span>
            <p className="text-[12px] text-texto-2">
              {p === 'ADMIN' ? 'Acesso total: triagens, conversas, configurações, modelos de IA e equipe.' : 'Acesso a fila de atendimento, conversas e catálogo.'}
            </p>
          </div>
        </label>
      ))}
    </fieldset>
  );
}

function SeletorUnidadeConta({ id, unidades, valor, onMudar }: {
  id: string; unidades: UnidadeResumo[]; valor: string; onMudar: (v: string) => void;
}) {
  const cras = unidades.filter((u) => u.tipo === 'CRAS');
  return (
    <Campo id={id} rotulo="Unidade CRAS de Lotação">
      <select id={id} value={valor} onChange={(e) => onMudar(e.target.value)} className={classeEntrada}>
        <option value="" className="bg-superficie text-texto">Coordenação Geral (Acesso a todas as unidades)</option>
        {cras.map((u) => <option key={u.id} value={u.id} className="bg-superficie text-texto">{u.nome}</option>)}
      </select>
    </Campo>
  );
}
