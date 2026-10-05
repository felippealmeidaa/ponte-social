import { useCallback, useState } from 'react';
import { CircleAlert, RotateCcw, Save, ShieldAlert } from 'lucide-react';
import { api, atualizar, ErroApi } from '../api';
import { Aviso, Botao, Campo, classeEntrada, Esqueleto } from '../components/ui';
import { useAtualizacao } from '../useAtualizacao';
import { dataHora, nomeCategoria } from '../vocabulario';

interface Servico {
  categoria: string;
  titulo: string;
  servicos: string[];
  documentos: string[];
  local_atendimento: string;
  contato_util: string;
  urgencia: boolean;
  fonte: string;
  verificado_em: string | null;
  atualizado_em: string | null;
  atualizado_por: string | null;
}

// Plano, seção 9: cada regra precisa de fonte e data, revisadas a cada ciclo (~6 meses)
const VALIDADE_CONFERENCIA_DIAS = 180;

function situacaoFonte(s: Pick<Servico, 'fonte' | 'verificado_em'>): 'ok' | 'conferir' | 'revisar' {
  if (!s.fonte.trim() || !s.verificado_em) return 'conferir';
  const dias = (Date.now() - new Date(`${s.verificado_em}T00:00:00`).getTime()) / 86_400_000;
  return dias > VALIDADE_CONFERENCIA_DIAS ? 'revisar' : 'ok';
}

const ROTULO_SITUACAO = { conferir: 'a conferir', revisar: 'revisar' } as const;

interface TextoBot {
  chave: string;
  descricao: string;
  texto: string;
  padrao: string;
  atualizado_em: string | null;
  atualizado_por: string | null;
}

const ETAPAS = [
  { titulo: 'Boas-vindas', detalhe: 'Apresenta o serviço e pede consentimento.' },
  { titulo: 'Relato', detalhe: 'A pessoa conta a situação com as palavras dela.' },
  { titulo: 'Confirmação', detalhe: '“Entendi que é X. Está certo?” Se não, ela escolhe no menu.' },
  { titulo: 'Caminho', detalhe: 'Serviços, documentos e onde ir da necessidade.' },
  { titulo: 'Contato', detalhe: 'Se pedir, o caso entra na fila do CRAS.' },
];

export function ServicosMensagens() {
  const [aba, setAba] = useState<'respostas' | 'textos'>('respostas');
  return (
    <>
      <header className="mb-8">
        <h1 className="font-display text-[44px] leading-[0.95] tracking-[0.03em]">Serviços e mensagens</h1>
        <p className="mt-2 max-w-[75ch] text-texto-2">
          O que o bot responde no WhatsApp. As mudanças valem na hora para as próximas conversas, sem precisar de programador.
        </p>
      </header>

      <section aria-labelledby="t-percurso" className="mb-10">
        <h2 id="t-percurso" className="font-display text-[28px] leading-none tracking-[0.04em] mb-4">Como o bot conversa</h2>
        <ol className="grid gap-px overflow-hidden rounded-xl border border-linha bg-linha sm:grid-cols-5">
          {ETAPAS.map((e, i) => (
            <li key={e.titulo} className="grid grid-cols-[1.25rem_1fr] gap-x-2 bg-superficie px-4 py-3">
              <span className="text-sm text-texto-3 tabular leading-6" aria-hidden>{i + 1}</span>
              <p className="font-medium leading-6"><span className="sr-only">Etapa {i + 1}: </span>{e.titulo}</p>
              <p className="col-start-2 mt-1 text-[13px] leading-snug text-texto-2">{e.detalhe}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 flex items-center gap-2 text-[13px] text-texto-2">
          <ShieldAlert className="size-4 shrink-0 text-urgente" aria-hidden />
          Em qualquer etapa, sinal de violência interrompe a conversa: o bot manda os contatos de emergência e o caso entra como urgente.
        </p>
        <p className="mt-1 pl-6 text-[13px] text-texto-2">
          A pessoa também pode enviar <strong className="font-medium text-texto">apagar</strong> para excluir os dados dela
          ou <strong className="font-medium text-texto">recomeçar</strong> para contar de novo. Quem já aceitou não precisa aceitar outra vez.
        </p>
      </section>

      <div role="tablist" aria-label="O que editar" className="mb-6 flex gap-1 border-b border-linha">
        {([['respostas', 'Respostas por necessidade'], ['textos', 'Textos da conversa']] as const).map(([id, rotulo]) => (
          <button key={id} role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm ${aba === id ? 'border-ambar text-texto font-semibold' : 'border-transparent text-texto-2 hover:text-texto'}`}>
            {rotulo}
          </button>
        ))}
      </div>

      {aba === 'respostas' ? <Respostas /> : <Textos />}
    </>
  );
}

const linhas = (t: string) => t.split('\n').map((l) => l.trim()).filter(Boolean);

function Respostas() {
  const { dados, erro, recarregar } = useAtualizacao(useCallback(() => api<Servico[]>('/configuracao/servicos'), []), 0);
  const [selecionada, setSelecionada] = useState<string>('renda_beneficio');
  const servico = dados?.find((s) => s.categoria === selecionada);

  if (erro) return <Aviso>{erro}</Aviso>;
  if (!dados) return <Esqueleto className="h-96" />;

  const pendentes = dados.filter((s) => situacaoFonte(s) !== 'ok').length;

  return (
    <>
    {pendentes > 0 && (
      <p className="mb-4 flex items-center gap-2 text-[13px] text-texto-2">
        <CircleAlert className="size-4 shrink-0 text-ambar" aria-hidden />
        {pendentes === 1 ? '1 necessidade está' : `${pendentes} necessidades estão`} sem fonte oficial conferida.
        Antes de usar com o público, confira cada resposta numa fonte oficial e registre o link e a data.
      </p>
    )}
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav aria-label="Necessidades">
        <ul className="flex gap-1 overflow-x-auto lg:flex-col">
          {dados.map((s) => (
            <li key={s.categoria} className="shrink-0">
              <button onClick={() => setSelecionada(s.categoria)} aria-current={selecionada === s.categoria ? 'true' : undefined}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${selecionada === s.categoria ? 'bg-elevada text-texto font-medium' : 'text-texto-2 hover:bg-elevada/60 hover:text-texto'}`}>
                {s.urgencia && <ShieldAlert className="size-4 shrink-0 text-urgente" aria-hidden />}
                {nomeCategoria(s.categoria)}
                {situacaoFonte(s) !== 'ok' && (
                  <span className="ml-auto shrink-0 whitespace-nowrap pl-2 text-[11px] text-ambar">{ROTULO_SITUACAO[situacaoFonte(s) as 'conferir' | 'revisar']}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {servico && <EditorServico key={servico.categoria + (servico.atualizado_em ?? '')} servico={servico} onSalvo={recarregar} />}
    </div>
    </>
  );
}

function EditorServico({ servico, onSalvo }: { servico: Servico; onSalvo: () => void }) {
  const [titulo, setTitulo] = useState(servico.titulo);
  const [servicos, setServicos] = useState(servico.servicos.join('\n'));
  const [documentos, setDocumentos] = useState(servico.documentos.join('\n'));
  const [local, setLocal] = useState(servico.local_atendimento);
  const [contato, setContato] = useState(servico.contato_util);
  const [fonte, setFonte] = useState(servico.fonte);
  const [verificadoEm, setVerificadoEm] = useState(servico.verificado_em ?? '');
  const [estado, setEstado] = useState<'livre' | 'salvando' | 'salvo' | 'restaurando'>('livre');
  const [erro, setErro] = useState<string | null>(null);

  const alterado = titulo !== servico.titulo || servicos !== servico.servicos.join('\n') || documentos !== servico.documentos.join('\n')
    || local !== servico.local_atendimento || contato !== servico.contato_util
    || fonte !== servico.fonte || verificadoEm !== (servico.verificado_em ?? '');
  const [hoje] = useState(() => new Date().toLocaleDateString('sv-SE'));

  const salvar = async () => {
    setEstado('salvando');
    setErro(null);
    try {
      await api(`/configuracao/servicos/${servico.categoria}`, atualizar({
        titulo, servicos: linhas(servicos), documentos: linhas(documentos), local_atendimento: local, contato_util: contato,
        fonte, verificado_em: verificadoEm || null,
      }, 'PUT'));
      setEstado('salvo');
      onSalvo();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível salvar.');
      setEstado('livre');
    }
  };

  const restaurar = async () => {
    setEstado('restaurando');
    try {
      await api(`/configuracao/servicos/${servico.categoria}/restaurar`, { method: 'POST' });
      onSalvo();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível restaurar.');
      setEstado('livre');
    }
  };

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-4">
        <Campo id="titulo" rotulo="Título da resposta">
          <input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} className={classeEntrada} />
        </Campo>
        <div className="grid gap-4 md:grid-cols-2">
          <Campo id="servicos" rotulo="O que a pessoa pode procurar" dica="Um item por linha.">
            <textarea id="servicos" rows={6} value={servicos} onChange={(e) => setServicos(e.target.value)} className={`${classeEntrada} resize-y`} />
          </Campo>
          <Campo id="documentos" rotulo="Documentos para levar" dica="Um item por linha.">
            <textarea id="documentos" rows={6} value={documentos} onChange={(e) => setDocumentos(e.target.value)} className={`${classeEntrada} resize-y`} />
          </Campo>
        </div>
        <Campo id="local" rotulo="Onde ir" dica="Endereço e horário ajudam a pessoa a não perder a viagem.">
          <textarea id="local" rows={2} value={local} onChange={(e) => setLocal(e.target.value)} className={`${classeEntrada} resize-y`} />
        </Campo>
        <Campo id="contato" rotulo="Contato">
          <input id="contato" value={contato} onChange={(e) => setContato(e.target.value)} className={classeEntrada} />
        </Campo>
        <div className="grid gap-4 md:grid-cols-[1fr_180px]">
          <Campo id="fonte" rotulo="Fonte oficial" dica="Link ou documento de onde vieram serviços, documentos e local (gov.br, prefeitura, CRAS).">
            <input id="fonte" value={fonte} onChange={(e) => setFonte(e.target.value)} placeholder="https://…" className={classeEntrada} />
          </Campo>
          <Campo id="verificado" rotulo="Conferido em" dica="Data em que alguém conferiu.">
            <input id="verificado" type="date" max={hoje} value={verificadoEm} onChange={(e) => setVerificadoEm(e.target.value)} className={classeEntrada} />
          </Campo>
        </div>
        {situacaoFonte({ fonte, verificado_em: verificadoEm || null }) === 'conferir' && (
          <p className="flex items-center gap-2 text-[13px] text-texto-2">
            <CircleAlert className="size-4 shrink-0 text-ambar" aria-hidden />
            Sem fonte e data, esta resposta ainda não foi conferida numa fonte oficial.
          </p>
        )}
        {situacaoFonte({ fonte, verificado_em: verificadoEm || null }) === 'revisar' && (
          <p className="flex items-center gap-2 text-[13px] text-texto-2">
            <CircleAlert className="size-4 shrink-0 text-ambar" aria-hidden />
            Conferida há mais de {VALIDADE_CONFERENCIA_DIAS / 30} meses: vale revisar se as regras mudaram.
          </p>
        )}
        {erro && <Aviso>{erro}</Aviso>}
        <div className="flex flex-wrap items-center gap-3">
          <Botao variante="primario" icone={Save} carregando={estado === 'salvando'} disabled={!alterado} onClick={salvar}>Salvar resposta</Botao>
          <Botao variante="fantasma" icone={RotateCcw} carregando={estado === 'restaurando'} onClick={restaurar}>Voltar ao texto original</Botao>
          {estado === 'salvo' && !alterado && <span role="status" className="text-sm text-ok">Salvo. Já vale para as próximas conversas.</span>}
        </div>
        {servico.atualizado_em && (
          <p className="text-xs text-texto-3">Última alteração em {dataHora(servico.atualizado_em)}{servico.atualizado_por ? ` por ${servico.atualizado_por}` : ''}.</p>
        )}
      </div>

      <aside aria-label="Prévia no WhatsApp" className="xl:sticky xl:top-6 self-start">
        <p className="mb-2 text-[13px] font-medium text-texto-2">Como aparece no WhatsApp</p>
        <div className="rounded-2xl border border-linha bg-[#0e1a14] p-4">
          <div className="rounded-2xl rounded-tl-sm bg-[#1f2c26] px-4 py-3 text-[13px] leading-relaxed text-[#e9efe9]">
            <p className="font-semibold">📋 {titulo}</p>
            <p className="mt-3 font-semibold">O que você pode procurar:</p>
            {linhas(servicos).map((s) => <p key={s}>• {s}</p>)}
            <p className="mt-3 font-semibold">Documentos para levar:</p>
            {linhas(documentos).map((d) => <p key={d}>• {d}</p>)}
            <p className="mt-3"><span className="font-semibold">Onde ir:</span> {local}</p>
            <p><span className="font-semibold">Contato:</span> {contato}</p>
            <p className="mt-3 text-[#b9c6bd]">Lembre: é uma orientação. Quem confirma o seu direito é o profissional do atendimento.</p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Textos() {
  const { dados, erro, recarregar } = useAtualizacao(useCallback(() => api<TextoBot[]>('/configuracao/textos'), []), 0);
  if (erro) return <Aviso>{erro}</Aviso>;
  if (!dados) return <Esqueleto className="h-96" />;
  return (
    <ul className="flex flex-col gap-6">
      {dados.map((t) => <li key={t.chave + (t.atualizado_em ?? '')}><EditorTexto texto={t} onSalvo={recarregar} /></li>)}
    </ul>
  );
}

function EditorTexto({ texto, onSalvo }: { texto: TextoBot; onSalvo: () => void }) {
  const [valor, setValor] = useState(texto.texto);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      await api(`/configuracao/textos/${texto.chave}`, atualizar({ texto: valor }, 'PUT'));
      setSalvo(true);
      onSalvo();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const id = `texto-${texto.chave}`;
  return (
    <div className="rounded-xl border border-linha bg-superficie p-4">
      <label htmlFor={id} className="font-medium">{texto.descricao}</label>
      <textarea id={id} rows={Math.min(10, Math.max(3, valor.split('\n').length + 1))} value={valor} onChange={(e) => { setValor(e.target.value); setSalvo(false); }}
        className={`${classeEntrada} mt-2 resize-y font-[inherit] leading-relaxed`} />
      <p className="mt-1 text-xs text-texto-3">Use *asteriscos* para negrito no WhatsApp.</p>
      {erro && <div className="mt-2"><Aviso>{erro}</Aviso></div>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Botao tamanho="sm" variante="primario" icone={Save} carregando={salvando} disabled={valor === texto.texto} onClick={salvar}>Salvar</Botao>
        {valor !== texto.padrao && <Botao tamanho="sm" variante="fantasma" icone={RotateCcw} onClick={() => { setValor(texto.padrao); setSalvo(false); }}>Voltar ao original</Botao>}
        {salvo && <span role="status" className="text-xs text-ok">Salvo.</span>}
        {texto.atualizado_em && <span className="text-xs text-texto-3">Alterado em {dataHora(texto.atualizado_em)}{texto.atualizado_por ? ` por ${texto.atualizado_por}` : ''}</span>}
      </div>
    </div>
  );
}
