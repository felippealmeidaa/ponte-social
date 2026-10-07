import { useCallback, useState, type FormEvent } from 'react';
import { KeyRound, Save, UserPlus } from 'lucide-react';
import { api, atualizar, enviar, ErroApi, sessaoSalva } from '../api';
import { Aviso, Botao, Campo, classeEntrada, Esqueleto, PainelLateral, Selo } from '../components/ui';
import { contaAtual, nomeUnidade, useUnidades, type UnidadeResumo } from '../unidades';
import { useAtualizacao } from '../useAtualizacao';
import { dataHora } from '../vocabulario';

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

const PAPEL = { ADMIN: 'Coordenação', ATENDENTE: 'Atendimento' } as const;
const SENHA_MINIMA = 8;

const mensagem = (e: unknown, padrao: string) => (e instanceof ErroApi ? e.message : padrao);

export function EquipeEAcesso() {
  const eu = sessaoSalva();
  return (
    <div className="grid gap-10 xl:grid-cols-[360px_1fr]">
      <MinhaSenha />
      {eu?.role === 'ADMIN' ? <GestaoEquipe meuId={eu.id} /> : (
        <p className="text-sm text-texto-2">A equipe é gerenciada pela coordenação. Fale com ela para criar contas ou redefinir senhas.</p>
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
    if (nova !== repetir) return setErro('A confirmação não é igual à nova senha.');
    setEstado('salvando');
    try {
      await api('/auth/trocar-senha', enviar({ senha_atual: atual, nova_senha: nova }));
      setAtual(''); setNova(''); setRepetir('');
      setEstado('salvo');
    } catch (err) {
      setErro(mensagem(err, 'Não foi possível trocar a senha.'));
      setEstado('livre');
    }
  };

  return (
    <section aria-labelledby="t-minha-senha">
      <h2 id="t-minha-senha" className="titulo text-[22px] leading-[1.05] mb-4">Minha senha</h2>
      <form onSubmit={trocar} className="flex flex-col gap-4">
        <Campo id="senha-atual" rotulo="Senha atual">
          <input id="senha-atual" type="password" autoComplete="current-password" required value={atual} onChange={(e) => setAtual(e.target.value)} className={classeEntrada} />
        </Campo>
        <Campo id="senha-nova" rotulo="Nova senha" dica={`Pelo menos ${SENHA_MINIMA} caracteres.`}>
          <input id="senha-nova" type="password" autoComplete="new-password" required minLength={SENHA_MINIMA} value={nova} onChange={(e) => setNova(e.target.value)} className={classeEntrada} />
        </Campo>
        <Campo id="senha-repetir" rotulo="Repita a nova senha">
          <input id="senha-repetir" type="password" autoComplete="new-password" required value={repetir} onChange={(e) => setRepetir(e.target.value)} className={classeEntrada} />
        </Campo>
        {erro && <Aviso>{erro}</Aviso>}
        <div className="flex items-center gap-3">
          <Botao type="submit" variante="primario" icone={KeyRound} carregando={estado === 'salvando'}>Trocar senha</Botao>
          {estado === 'salvo' && <span role="status" className="text-sm text-ok">Senha alterada.</span>}
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
    <section aria-labelledby="t-equipe">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="t-equipe" className="titulo text-[22px] leading-[1.05]">Equipe</h2>
        <Botao variante="primario" icone={UserPlus} onClick={() => setEditando('nova')}>Nova conta</Botao>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      {!dados && !erro && <Esqueleto className="h-48" />}
      {dados && (
        <ul className="divide-y divide-linha overflow-hidden rounded-[6px] border border-linha bg-superficie">
          {dados.map((c) => (
            <li key={c.id}>
              <button onClick={() => setEditando(c)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-elevada/60">
                <span className="min-w-0 flex-1">
                  <span className={`block font-medium ${c.ativo ? '' : 'text-texto-3 line-through'}`}>
                    {c.name}{c.id === meuId && <span className="ml-2 text-xs font-normal text-texto-3">(você)</span>}
                  </span>
                  <span className="block text-[13px] text-texto-2">{c.login}{c.email ? `, ${c.email}` : ''}</span>
                </span>
                {geral && <span className="text-[13px] text-texto-2">{nomeUnidade(unidades.dados, c.unidade_id)}</span>}
                <Selo tom={c.role === 'ADMIN' ? 'caneta' : 'neutro'} semIcone>{PAPEL[c.role]}</Selo>
                {!c.ativo && <Selo tom="neutro" semIcone>Desativada</Selo>}
                <span className="w-full text-xs text-texto-3 sm:w-auto">
                  {c.ultimo_acesso ? `Último acesso ${dataHora(c.ultimo_acesso)}` : 'Nunca entrou'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <PainelLateral aberto={editando !== null} titulo={editando === 'nova' ? 'Nova conta' : 'Editar conta'} onFechar={fechar}>
        {editando === 'nova' && <FormNovaConta unidades={geral ? unidades.dados : null} onPronto={() => { fechar(); recarregar(); }} />}
        {editando && editando !== 'nova' && (
          <FormEditarConta key={editando.id} conta={editando} ehVoce={editando.id === meuId} unidades={geral ? unidades.dados : null}
            onPronto={() => { fechar(); recarregar(); }} />
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
      setErro(mensagem(err, 'Não foi possível criar a conta.'));
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={criar} className="flex flex-col gap-4">
      <Campo id="nc-nome" rotulo="Nome">
        <input id="nc-nome" required value={nome} onChange={(e) => setNome(e.target.value)} className={classeEntrada} />
      </Campo>
      <Campo id="nc-login" rotulo="Login" dica="Sem espaços. É o que a pessoa digita para entrar.">
        <input id="nc-login" required autoComplete="off" value={login} onChange={(e) => setLogin(e.target.value)} className={classeEntrada} />
      </Campo>
      <Campo id="nc-email" rotulo="E-mail (opcional)" dica="Também pode ser usado para entrar.">
        <input id="nc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={classeEntrada} />
      </Campo>
      <Campo id="nc-senha" rotulo="Senha inicial" dica={`Pelo menos ${SENHA_MINIMA} caracteres. Passe por um canal seguro e peça para a pessoa trocar no primeiro acesso.`}>
        <input id="nc-senha" type="password" autoComplete="new-password" required minLength={SENHA_MINIMA} value={senha} onChange={(e) => setSenha(e.target.value)} className={classeEntrada} />
      </Campo>
      <SeletorPapel valor={papel} onMudar={setPapel} />
      {unidades && <SeletorUnidadeConta id="nc-unidade" unidades={unidades} valor={unidade} onMudar={setUnidade} />}
      {erro && <Aviso>{erro}</Aviso>}
      <Botao type="submit" variante="primario" icone={UserPlus} carregando={salvando}>Criar conta</Botao>
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
      setAviso({ tom: 'urgente', texto: mensagem(err, 'Não foi possível salvar.') });
      setSalvando(false);
    }
  };

  const redefinir = async () => {
    setAviso(null);
    try {
      await api(`/equipe/${conta.id}/senha`, enviar({ nova_senha: novaSenha }));
      setNovaSenha('');
      setAviso({ tom: 'ok', texto: 'Senha redefinida. Passe a nova senha à pessoa por um canal seguro.' });
    } catch (err) {
      setAviso({ tom: 'urgente', texto: mensagem(err, 'Não foi possível redefinir a senha.') });
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={salvar} className="flex flex-col gap-4">
        <p className="text-sm text-texto-2">Login: <span className="text-texto">{conta.login}</span></p>
        <Campo id="ec-nome" rotulo="Nome">
          <input id="ec-nome" required value={nome} onChange={(e) => setNome(e.target.value)} className={classeEntrada} />
        </Campo>
        <SeletorPapel valor={papel} onMudar={setPapel} />
        {unidades && <SeletorUnidadeConta id="ec-unidade" unidades={unidades} valor={unidade} onMudar={setUnidade} />}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="size-4 accent-[var(--color-caneta)]" />
          Conta ativa
        </label>
        {!ativo && conta.ativo && (
          <p className="text-[13px] text-texto-2">{ehVoce ? 'Você vai sair do sistema ao salvar.' : 'A pessoa perde o acesso na hora, mesmo com o painel aberto.'}</p>
        )}
        <Botao type="submit" variante="primario" icone={Save} carregando={salvando}>Salvar</Botao>
      </form>

      {!ehVoce && (
        <div className="flex flex-col gap-3 border-t border-linha pt-6">
          <h3 className="font-medium">Redefinir senha</h3>
          <Campo id="ec-senha" rotulo="Nova senha" dica={`Pelo menos ${SENHA_MINIMA} caracteres.`}>
            <input id="ec-senha" type="password" autoComplete="new-password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} className={classeEntrada} />
          </Campo>
          <Botao icone={KeyRound} disabled={novaSenha.length < SENHA_MINIMA} onClick={redefinir}>Redefinir senha</Botao>
        </div>
      )}
      {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
    </div>
  );
}

function SeletorPapel({ valor, onMudar }: { valor: 'ADMIN' | 'ATENDENTE'; onMudar: (p: 'ADMIN' | 'ATENDENTE') => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-[13px] font-medium text-texto-2">Papel</legend>
      {(['ATENDENTE', 'ADMIN'] as const).map((p) => (
        <label key={p} className="flex items-start gap-2 text-sm">
          <input type="radio" name="papel" checked={valor === p} onChange={() => onMudar(p)} className="mt-0.5 size-4 accent-[var(--color-caneta)]" />
          <span>
            {PAPEL[p]}
            <span className="block text-xs text-texto-3">
              {p === 'ADMIN' ? 'Tudo do atendimento, mais criar e desativar contas da equipe.' : 'Fila, conversas, serviços e mensagens do bot.'}
            </span>
          </span>
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
    <Campo id={id} rotulo="Unidade" dica="A conta vê e edita só a fila, as conversas e a configuração da sua unidade. Coordenação geral vê todas.">
      <select id={id} value={valor} onChange={(e) => onMudar(e.target.value)} className={classeEntrada}>
        <option value="">Coordenação geral (todas as unidades)</option>
        {cras.map((u) => <option key={u.id} value={u.id}>{u.nome}{u.ativo ? '' : ' (inativo)'}</option>)}
      </select>
    </Campo>
  );
}
