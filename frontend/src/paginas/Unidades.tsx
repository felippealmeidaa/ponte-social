import { useCallback, useState, type FormEvent } from 'react';
import { Building2, CircleAlert, MapPin, Plus, Save, Search, Trash2 } from 'lucide-react';
import { api, atualizar, enviar, ErroApi } from '../api';
import { Aviso, Botao, Campo, classeEntrada, Esqueleto, PainelLateral, Selo, Vazio } from '../components/ui';
import { useAtualizacao } from '../useAtualizacao';

interface Unidade {
  id: string;
  nome: string;
  tipo: 'CRAS' | 'CREAS' | 'CENTRO_POP';
  endereco: string;
  telefone: string;
  horario: string;
  bairros: string[];
  fonte: string;
  verificado_em: string | null;
  ativo: boolean;
}

const TIPOS = { CRAS: 'CRAS', CREAS: 'CREAS', CENTRO_POP: 'Centro POP' } as const;
const VAZIA: Omit<Unidade, 'id'> = {
  nome: '', tipo: 'CRAS', endereco: '', telefone: '', horario: '', bairros: [], fonte: '', verificado_em: null, ativo: true,
};

export function Unidades() {
  const { dados, erro, recarregar } = useAtualizacao(useCallback(() => api<Unidade[]>('/configuracao/unidades'), []), 0);
  const [editando, setEditando] = useState<Unidade | 'nova' | null>(null);
  const fechar = useCallback(() => setEditando(null), []);

  if (erro) return <Aviso>{erro}</Aviso>;
  if (!dados) return <Esqueleto className="h-64" />;

  const temCras = dados.some((u) => u.tipo === 'CRAS' && u.ativo);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-[70ch] text-sm text-texto-2">
          {temCras
            ? 'O bot pergunta o bairro da pessoa e indica o CRAS que atende aquele bairro. Na emergência, mostra o CREAS cadastrado.'
            : 'Enquanto não houver CRAS cadastrado, o bot não pergunta o bairro e usa o texto “Onde ir” de cada necessidade.'}
          {' '}Use a lista oficial da prefeitura e registre a fonte.
        </p>
        <Botao variante="primario" icone={Plus} onClick={() => setEditando('nova')}>Nova unidade</Botao>
      </div>

      {dados.length === 0 ? (
        <Vazio icone={Building2} titulo="Nenhuma unidade cadastrada">
          Cadastre os CRAS do município com os bairros que cada um atende.
        </Vazio>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {dados.map((u) => (
            <li key={u.id}>
              <button onClick={() => setEditando(u)}
                className="flex h-full w-full flex-col gap-2 rounded-[6px] border border-linha bg-superficie p-4 text-left hover:border-linha-forte">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={`font-medium ${u.ativo ? '' : 'text-texto-3 line-through'}`}>{u.nome}</span>
                  <Selo tom={u.tipo === 'CREAS' ? 'urgente' : 'neutro'} semIcone>{TIPOS[u.tipo]}</Selo>
                  {(!u.fonte || !u.verificado_em) && <span className="text-[11px] text-caneta">a conferir</span>}
                </span>
                {u.endereco && <span className="flex items-start gap-1.5 text-[13px] text-texto-2"><MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />{u.endereco}</span>}
                {u.bairros.length > 0 && (
                  <span className="text-[13px] text-texto-3">{u.bairros.length} bairro{u.bairros.length > 1 ? 's' : ''}: {u.bairros.slice(0, 4).join(', ')}{u.bairros.length > 4 ? '…' : ''}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {temCras && <TestarBairro />}

      <PainelLateral aberto={editando !== null} titulo={editando === 'nova' ? 'Nova unidade' : 'Editar unidade'} onFechar={fechar}>
        {editando && (
          <FormUnidade key={editando === 'nova' ? 'nova' : editando.id} unidade={editando === 'nova' ? null : editando}
            onPronto={() => { fechar(); recarregar(); }} />
        )}
      </PainelLateral>
    </div>
  );
}

function TestarBairro() {
  const [bairro, setBairro] = useState('');
  const [resultado, setResultado] = useState<{ bairro: string; unidade: Unidade | null } | null>(null);

  const buscar = async (e: FormEvent) => {
    e.preventDefault();
    if (!bairro.trim()) return;
    setResultado(await api(`/configuracao/unidades/buscar?bairro=${encodeURIComponent(bairro)}`));
  };

  return (
    <section aria-labelledby="t-testar-bairro" className="rounded-[6px] border border-linha bg-superficie p-4">
      <h3 id="t-testar-bairro" className="font-medium">Testar um bairro</h3>
      <p className="mt-1 text-[13px] text-texto-2">Veja qual CRAS o bot indicaria. Aceita erro de digitação e falta de acento.</p>
      <form onSubmit={buscar} className="mt-3 flex flex-wrap gap-2">
        <label htmlFor="testar-bairro" className="sr-only">Bairro</label>
        <input id="testar-bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Ex.: Vila Jaiara" className={`${classeEntrada} max-w-xs`} />
        <Botao type="submit" icone={Search}>Testar</Botao>
      </form>
      {resultado && (
        <p role="status" className="mt-3 text-sm">
          {resultado.unidade
            ? <>“{resultado.bairro}” é atendido pelo <strong className="font-semibold">{resultado.unidade.nome}</strong>.</>
            : <span className="text-texto-2">Nenhum CRAS cadastrado atende “{resultado.bairro}”. O bot vai sugerir o Disque Social 121.</span>}
        </p>
      )}
    </section>
  );
}

function FormUnidade({ unidade, onPronto }: { unidade: Unidade | null; onPronto: () => void }) {
  const base = unidade ?? { ...VAZIA, id: '' };
  const [nome, setNome] = useState(base.nome);
  const [tipo, setTipo] = useState(base.tipo);
  const [endereco, setEndereco] = useState(base.endereco);
  const [telefone, setTelefone] = useState(base.telefone);
  const [horario, setHorario] = useState(base.horario);
  const [bairros, setBairros] = useState(base.bairros.join('\n'));
  const [fonte, setFonte] = useState(base.fonte);
  const [verificadoEm, setVerificadoEm] = useState(base.verificado_em ?? '');
  const [ativo, setAtivo] = useState(base.ativo);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [hoje] = useState(() => new Date().toLocaleDateString('sv-SE'));

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    const corpo = {
      nome, tipo, endereco, telefone, horario, fonte, ativo,
      bairros: bairros.split('\n').map((b) => b.trim()).filter(Boolean),
      verificado_em: verificadoEm || null,
    };
    try {
      await api(unidade ? `/configuracao/unidades/${unidade.id}` : '/configuracao/unidades',
        unidade ? atualizar(corpo, 'PUT') : enviar(corpo));
      onPronto();
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'Não foi possível salvar.');
      setSalvando(false);
    }
  };

  const remover = async () => {
    if (!unidade || !window.confirm(`Remover ${unidade.nome}? O bot deixa de indicá-la.`)) return;
    try {
      await api(`/configuracao/unidades/${unidade.id}`, { method: 'DELETE' });
      onPronto();
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'Não foi possível remover.');
    }
  };

  return (
    <form onSubmit={salvar} className="flex flex-col gap-4">
      <Campo id="un-nome" rotulo="Nome">
        <input id="un-nome" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="CRAS Norte" className={classeEntrada} />
      </Campo>
      <Campo id="un-tipo" rotulo="Tipo">
        <select id="un-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as Unidade['tipo'])} className={classeEntrada}>
          {Object.entries(TIPOS).map(([id, rotulo]) => <option key={id} value={id}>{rotulo}</option>)}
        </select>
      </Campo>
      <Campo id="un-endereco" rotulo="Endereço">
        <input id="un-endereco" value={endereco} onChange={(e) => setEndereco(e.target.value)} className={classeEntrada} />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="un-telefone" rotulo="Telefone">
          <input id="un-telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} className={classeEntrada} />
        </Campo>
        <Campo id="un-horario" rotulo="Horário">
          <input id="un-horario" value={horario} onChange={(e) => setHorario(e.target.value)} placeholder="Seg a sex, 8h às 17h" className={classeEntrada} />
        </Campo>
      </div>
      <Campo id="un-bairros" rotulo="Bairros atendidos" dica={tipo === 'CRAS' ? 'Um por linha. Obrigatório para CRAS: é por aqui que o bot escolhe a unidade.' : 'Um por linha (opcional).'}>
        <textarea id="un-bairros" rows={6} value={bairros} onChange={(e) => setBairros(e.target.value)} className={`${classeEntrada} resize-y`} />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-[1fr_170px]">
        <Campo id="un-fonte" rotulo="Fonte oficial" dica="Link ou documento da prefeitura.">
          <input id="un-fonte" value={fonte} onChange={(e) => setFonte(e.target.value)} placeholder="https://…" className={classeEntrada} />
        </Campo>
        <Campo id="un-verificado" rotulo="Conferido em">
          <input id="un-verificado" type="date" max={hoje} value={verificadoEm} onChange={(e) => setVerificadoEm(e.target.value)} className={classeEntrada} />
        </Campo>
      </div>
      {(!fonte.trim() || !verificadoEm) && (
        <p className="flex items-center gap-2 text-[13px] text-texto-2">
          <CircleAlert className="size-4 shrink-0 text-caneta" aria-hidden />
          Sem fonte e data, ninguém sabe se esse endereço está certo.
        </p>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="size-4 accent-[var(--color-caneta)]" />
        Unidade ativa (o bot só indica unidades ativas)
      </label>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex flex-wrap gap-3">
        <Botao type="submit" variante="primario" icone={Save} carregando={salvando}>Salvar unidade</Botao>
        {unidade && <Botao type="button" variante="perigo" icone={Trash2} onClick={remover}>Remover</Botao>}
      </div>
    </form>
  );
}
