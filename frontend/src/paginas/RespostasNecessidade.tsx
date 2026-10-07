import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import {
  BadgeCheck, CircleAlert, FileText, Heading, ListChecks, MapPin, Plus, RotateCcw, Save, X, type LucideIcon,
} from 'lucide-react';
import { api, atualizar, ErroApi } from '../api';
import { Aviso, Botao, classeEntrada, Esqueleto } from '../components/ui';
import { comUnidade } from '../unidades';
import { useAtualizacao } from '../useAtualizacao';
import { corCategoria, dataHora, ICONE_CATEGORIA, nomeCategoria } from '../vocabulario';

// Aba "Respostas por necessidade": o que o bot manda quando entende a necessidade da pessoa.
// Cada resposta é montada em partes (título, o que procurar, documentos, onde ir) e a prévia do WhatsApp
// acende a parte que está sendo editada, para ninguém precisar adivinhar onde cada campo aparece.

export interface Servico {
  categoria: string;
  titulo: string;
  servicos: string[];
  documentos: string[];
  local_atendimento: string;
  contato_util: string;
  urgencia: boolean;
  personalizado: boolean;
  fonte: string;
  verificado_em: string | null;
  atualizado_em: string | null;
  atualizado_por: string | null;
}

export interface ContextoRespostas {
  unidade: string | null;
  podeEditar: boolean;
}

// Plano, seção 9: cada regra precisa de fonte e data, revisadas a cada ciclo (~6 meses)
const VALIDADE_CONFERENCIA_DIAS = 180;

type Situacao = 'ok' | 'conferir' | 'revisar';

function situacaoFonte(s: Pick<Servico, 'fonte' | 'verificado_em'>): Situacao {
  if (!s.fonte.trim() || !s.verificado_em) return 'conferir';
  const dias = (Date.now() - new Date(`${s.verificado_em}T00:00:00`).getTime()) / 86_400_000;
  return dias > VALIDADE_CONFERENCIA_DIAS ? 'revisar' : 'ok';
}

const SITUACAO: Record<Situacao, { rotulo: string; ponto: string; texto: string }> = {
  ok: { rotulo: 'Conferida', ponto: 'bg-ok', texto: 'text-ok' },
  conferir: { rotulo: 'Falta conferir', ponto: 'bg-caneta', texto: 'text-caneta' },
  revisar: { rotulo: 'Revisar', ponto: 'bg-alta', texto: 'text-alta' },
};


const limpar = (itens: string[]) => itens.map((i) => i.trim()).filter(Boolean);
const iguais = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function Respostas({ ctx }: { ctx: ContextoRespostas }) {
  const { dados, erro, recarregar } = useAtualizacao(useCallback(() => api<Servico[]>(comUnidade('/configuracao/servicos', ctx.unidade)), [ctx.unidade]), 0);
  const [selecionada, setSelecionada] = useState<string>('renda_beneficio');
  const servico = dados?.find((s) => s.categoria === selecionada);

  if (erro) return <Aviso>{erro}</Aviso>;
  if (!dados) return <Esqueleto className="h-96" />;

  const conferidas = dados.filter((s) => situacaoFonte(s) === 'ok').length;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[264px_minmax(0,1fr)] lg:gap-8">
      <nav aria-labelledby="t-necessidades" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3 lg:flex-col lg:items-start lg:gap-1">
          <h2 id="t-necessidades" className="text-[13.5px] font-semibold text-texto-2">Necessidades</h2>
          <p className="text-[12.5px] text-texto-3">
            <span className="tabular font-semibold text-texto-2">{conferidas} de {dados.length}</span> conferidas numa fonte oficial
          </p>
        </div>
        <ul className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
          {dados.map((s) => {
            const Icone = ICONE_CATEGORIA[s.categoria] ?? ICONE_CATEGORIA.nao_identificado;
            const ativa = selecionada === s.categoria;
            const sit = SITUACAO[situacaoFonte(s)];
            return (
              <li key={s.categoria} className="shrink-0">
                <button type="button" onClick={() => setSelecionada(s.categoria)} aria-current={ativa ? 'true' : undefined}
                  className={`group flex w-full items-center gap-3 rounded-[4px] border px-2.5 py-2 text-left transition-colors duration-150 max-lg:min-w-[200px] ${ativa
                    ? 'border-caneta/35 bg-caneta-fundo'
                    : 'border-transparent hover:border-linha hover:bg-elevada'}`}>
                  <span style={{ '--cat': corCategoria(s.categoria) } as CSSProperties}
                    className={`flex size-9 shrink-0 items-center justify-center rounded-[4px] ${ativa ? 'bg-[var(--cat)] text-sobre' : 'chip-cat'}`}>
                    <Icone className="size-[18px]" strokeWidth={1.9} aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className={`text-[14.5px] leading-snug ${ativa ? 'font-semibold text-texto' : 'text-texto'}`}>{nomeCategoria(s.categoria)}</span>
                    <span className="flex items-center gap-1.5 text-[12px] leading-snug text-texto-3">
                      <span className={`size-1.5 shrink-0 rounded-full ${sit.ponto}`} aria-hidden />
                      {sit.rotulo}
                      {ctx.unidade && s.personalizado && <span className="text-caneta">· deste CRAS</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      {servico && <EditorServico key={servico.categoria + (servico.atualizado_em ?? '') + servico.personalizado} servico={servico} ctx={ctx} onSalvo={recarregar} />}
    </div>
  );
}

type Parte = 'titulo' | 'servicos' | 'documentos' | 'local';

function EditorServico({ servico, ctx, onSalvo }: { servico: Servico; ctx: ContextoRespostas; onSalvo: () => void }) {
  const [titulo, setTitulo] = useState(servico.titulo);
  const [servicos, setServicos] = useState(servico.servicos);
  const [documentos, setDocumentos] = useState(servico.documentos);
  const [local, setLocal] = useState(servico.local_atendimento);
  const [contato, setContato] = useState(servico.contato_util);
  const [fonte, setFonte] = useState(servico.fonte);
  const [verificadoEm, setVerificadoEm] = useState(servico.verificado_em ?? '');
  const [estado, setEstado] = useState<'livre' | 'salvando' | 'salvo' | 'restaurando'>('livre');
  const [erro, setErro] = useState<string | null>(null);
  const [parte, setParte] = useState<Parte | null>(null);
  const [hoje] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const somenteLeitura = !ctx.podeEditar;
  const Icone = ICONE_CATEGORIA[servico.categoria] ?? ICONE_CATEGORIA.nao_identificado;

  const alterado = titulo !== servico.titulo || !iguais(limpar(servicos), servico.servicos) || !iguais(limpar(documentos), servico.documentos)
    || local !== servico.local_atendimento || contato !== servico.contato_util
    || fonte !== servico.fonte || verificadoEm !== (servico.verificado_em ?? '');
  const incompleto = !titulo.trim() || limpar(servicos).length === 0 || limpar(documentos).length === 0 || local.trim().length < 3 || contato.trim().length < 3;
  const sit = situacaoFonte({ fonte, verificado_em: verificadoEm || null });

  const descartar = () => {
    setTitulo(servico.titulo); setServicos(servico.servicos); setDocumentos(servico.documentos);
    setLocal(servico.local_atendimento); setContato(servico.contato_util); setFonte(servico.fonte); setVerificadoEm(servico.verificado_em ?? '');
    setErro(null);
  };

  const salvar = async () => {
    setEstado('salvando');
    setErro(null);
    try {
      await api(comUnidade(`/configuracao/servicos/${servico.categoria}`, ctx.unidade), atualizar({
        titulo: titulo.trim(), servicos: limpar(servicos), documentos: limpar(documentos), local_atendimento: local.trim(), contato_util: contato.trim(),
        fonte: fonte.trim(), verificado_em: verificadoEm || null,
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
      await api(comUnidade(`/configuracao/servicos/${servico.categoria}/restaurar`, ctx.unidade), { method: 'POST' });
      onSalvo();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível restaurar.');
      setEstado('livre');
    }
  };

  // Destaca na prévia a parte em que a pessoa está mexendo (foco ou mouse)
  const marcar = (p: Parte) => ({ onFocus: () => setParte(p), onMouseEnter: () => setParte(p) });

  return (
    <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col" onMouseLeave={() => setParte(null)}>
        <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-linha pb-5">
          <div className="flex items-start gap-3.5">
            <span style={{ '--cat': corCategoria(servico.categoria) } as CSSProperties}
              className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-[4px] bg-[var(--cat)] text-sobre">
              <Icone className="size-[22px]" strokeWidth={1.9} aria-hidden />
            </span>
            <div>
              <h2 className="titulo text-[26px] leading-[1.1]">{nomeCategoria(servico.categoria)}</h2>
              <p className="mt-1.5 max-w-[60ch] text-[14.5px] leading-relaxed text-texto-2">
                Quando o bot entende que a pessoa precisa disso, ele responde com a mensagem montada abaixo.
                {ctx.unidade && (servico.personalizado ? ' Esta versão vale só para este CRAS.' : ' Hoje usa o padrão da secretaria; ao salvar, vira uma versão só deste CRAS.')}
              </p>
            </div>
          </div>
          {!somenteLeitura && (!ctx.unidade || servico.personalizado) && (
            <Botao tamanho="sm" variante="fantasma" icone={RotateCcw} carregando={estado === 'restaurando'} onClick={restaurar}>
              {ctx.unidade ? 'Voltar ao padrão da secretaria' : 'Voltar ao texto original'}
            </Botao>
          )}
        </header>

        {servico.urgencia && (
          <div className="mt-5"><Aviso>Em violência, o bot manda primeiro a mensagem de emergência (190, 180 e 100). Esta resposta complementa a orientação.</Aviso></div>
        )}

        <fieldset disabled={somenteLeitura} className="flex min-w-0 flex-col disabled:opacity-85">
          <Secao icone={Heading} titulo="Título da resposta" ajuda="A primeira linha da mensagem, em negrito." {...marcar('titulo')}>
            <input aria-label="Título da resposta" value={titulo} onChange={(e) => setTitulo(e.target.value)} className={classeEntrada} />
          </Secao>

          <Secao icone={ListChecks} titulo="O que a pessoa pode procurar" ajuda="Serviços e benefícios ligados a esta necessidade. Cada item vira um tópico." {...marcar('servicos')}>
            <ListaItens rotulo="Serviço" itens={servicos} onMudar={setServicos} somenteLeitura={somenteLeitura} />
          </Secao>

          <Secao icone={FileText} titulo="Documentos para levar" ajuda="O que a pessoa precisa ter em mãos para não perder a viagem." {...marcar('documentos')}>
            <ListaItens rotulo="Documento" itens={documentos} onMudar={setDocumentos} somenteLeitura={somenteLeitura} />
          </Secao>

          <Secao icone={MapPin} titulo="Onde ir e contato" ajuda="Os lugares cadastrados mais perto da pessoa entram logo depois, sozinhos." {...marcar('local')}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-texto-2">Onde ir</span>
                <textarea rows={3} value={local} onChange={(e) => setLocal(e.target.value)} className={`${classeEntrada} resize-y`} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-texto-2">Contato</span>
                <textarea rows={3} value={contato} onChange={(e) => setContato(e.target.value)} className={`${classeEntrada} resize-y`} />
              </label>
            </div>
          </Secao>

          <section aria-labelledby="t-conferencia" className="mt-7 flex flex-col gap-4 rounded-[4px] border border-linha bg-elevada/70 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <BadgeCheck className="mt-0.5 size-[18px] shrink-0 text-texto-2" aria-hidden />
                <div>
                  <h3 id="t-conferencia" className="text-[15px] font-semibold">Conferência com a fonte oficial</h3>
                  <p className="mt-0.5 max-w-[62ch] text-[13.5px] leading-snug text-texto-2">
                    Antes de usar com o público, confira serviços, documentos e local numa fonte oficial (gov.br, prefeitura, CRAS) e registre aqui.
                  </p>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full border border-current/25 bg-superficie px-2.5 py-0.5 text-[12.5px] font-semibold ${SITUACAO[sit].texto}`}>
                <span className={`size-1.5 rounded-full ${SITUACAO[sit].ponto}`} aria-hidden />
                {SITUACAO[sit].rotulo}
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_190px]">
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-texto-2">Link ou documento da fonte</span>
                <input value={fonte} onChange={(e) => setFonte(e.target.value)} placeholder="https://…" className={classeEntrada} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-texto-2">Conferido em</span>
                <input type="date" max={hoje} value={verificadoEm} onChange={(e) => setVerificadoEm(e.target.value)} className={classeEntrada} />
              </label>
            </div>
            {sit === 'revisar' && (
              <p className="flex items-center gap-2 text-[13px] text-texto-2">
                <CircleAlert className="size-4 shrink-0 text-alta" aria-hidden />
                Conferida há mais de {VALIDADE_CONFERENCIA_DIAS / 30} meses: vale ver se as regras mudaram.
              </p>
            )}
          </section>
        </fieldset>

        {servico.atualizado_em && (
          <p className="mt-4 text-[12.5px] text-texto-3">Última alteração em {dataHora(servico.atualizado_em)}{servico.atualizado_por ? ` por ${servico.atualizado_por}` : ''}.</p>
        )}

        {!somenteLeitura && (alterado || estado === 'salvo' || erro) && (
          <div role="region" aria-label="Salvar alterações"
            className="sticky bottom-3 z-10 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-linha-forte bg-superficie px-4 py-3 shadow-[0_12px_28px_-14px_rgb(27_39_51/0.45)]">
            <p role="status" className={`text-[14px] ${erro ? 'text-urgente' : alterado ? 'text-texto' : 'text-ok font-semibold'}`}>
              {erro ?? (alterado ? (incompleto ? 'Preencha título, ao menos um serviço, um documento, onde ir e contato.' : 'Alterações ainda não salvas.') : 'Salvo. Já vale para as próximas conversas.')}
            </p>
            {alterado && (
              <div className="flex items-center gap-2">
                <Botao variante="fantasma" onClick={descartar}>Descartar</Botao>
                <Botao variante="primario" icone={Save} carregando={estado === 'salvando'} disabled={incompleto} onClick={salvar}>
                  {ctx.unidade ? 'Salvar para este CRAS' : 'Salvar resposta'}
                </Botao>
              </div>
            )}
          </div>
        )}
      </div>

      <aside aria-label="Prévia no WhatsApp" className="self-start xl:sticky xl:top-6">
        <p className="mb-2 text-[13.5px] font-semibold text-texto-2">O que a pessoa vê no WhatsApp</p>
        <div className="conversa-whats rounded-[4px] border border-linha py-4 pl-5 pr-4">
          <div className="balao-whats flex flex-col gap-1.5 px-2 py-2 text-[13.5px] leading-relaxed">
            <Trecho ativo={parte === 'titulo'}><p className="font-semibold">📋 {titulo || '…'}</p></Trecho>
            <Trecho ativo={parte === 'servicos'}>
              <p className="font-semibold">O que você pode procurar:</p>
              {limpar(servicos).map((s, i) => <p key={i}>• {s}</p>)}
            </Trecho>
            <Trecho ativo={parte === 'documentos'}>
              <p className="font-semibold">Documentos para levar:</p>
              {limpar(documentos).map((d, i) => <p key={i}>• {d}</p>)}
            </Trecho>
            <Trecho ativo={parte === 'local'}>
              <p><span className="font-semibold">Onde ir:</span> {local}</p>
              <p><span className="font-semibold">Contato:</span> {contato}</p>
            </Trecho>
            <p className="px-1.5 pt-2 text-[12.5px] text-whats-2">📍 Depois vêm os lugares mais perto da pessoa e o aviso de que é só uma orientação.</p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Secao({ icone: Icone, titulo, ajuda, children, onFocus, onMouseEnter }: {
  icone: LucideIcon; titulo: string; ajuda: string; children: ReactNode; onFocus: () => void; onMouseEnter: () => void;
}) {
  return (
    <section onFocus={onFocus} onMouseEnter={onMouseEnter} className="flex flex-col gap-3 border-b border-linha py-6 last-of-type:border-b-0">
      <div className="flex items-start gap-2.5">
        <Icone className="mt-0.5 size-[18px] shrink-0 text-texto-2" aria-hidden />
        <div>
          <h3 className="text-[15px] font-semibold leading-snug">{titulo}</h3>
          <p className="mt-0.5 text-[13.5px] leading-snug text-texto-2">{ajuda}</p>
        </div>
      </div>
      <div className="sm:pl-7">{children}</div>
    </section>
  );
}

/** Um bloco da prévia, aceso quando a parte correspondente está sendo editada. */
function Trecho({ ativo, children }: { ativo: boolean; children: ReactNode }) {
  return (
    <div className={`rounded-[3px] px-1.5 py-1 transition-[background-color,box-shadow] duration-200 ${ativo ? 'bg-caneta-fundo shadow-[inset_0_0_0_1.5px_rgb(36_87_197/0.45)]' : ''}`}>
      {children}
    </div>
  );
}

/** Lista editável: um campo por item, Enter cria o próximo, X remove. */
function ListaItens({ rotulo, itens, onMudar, somenteLeitura }: {
  rotulo: string; itens: string[]; onMudar: (itens: string[]) => void; somenteLeitura: boolean;
}) {
  const campos = useRef<(HTMLInputElement | null)[]>([]);
  // O foco muda depois que a lista nova aparece na tela (Enter cria o item e já leva o cursor para ele)
  const focoPendente = useRef<number | null>(null);
  const focar = (i: number) => { focoPendente.current = i; };
  useLayoutEffect(() => {
    if (focoPendente.current === null) return;
    campos.current[focoPendente.current]?.focus();
    focoPendente.current = null;
  }, [itens]);

  const mudar = (i: number, valor: string) => onMudar(itens.map((x, j) => (j === i ? valor : x)));
  const remover = (i: number) => {
    onMudar(itens.filter((_, j) => j !== i));
    focar(Math.max(0, i - 1));
  };
  const inserir = (depois: number) => {
    onMudar([...itens.slice(0, depois + 1), '', ...itens.slice(depois + 1)]);
    focar(depois + 1);
  };
  const tecla = (e: KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      inserir(i);
    } else if (e.key === 'Backspace' && !itens[i] && itens.length > 1) {
      e.preventDefault();
      remover(i);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-2">
        {itens.map((item, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-right text-[13px] tabular text-texto-3" aria-hidden>{i + 1}.</span>
            <input ref={(el) => { campos.current[i] = el; }} value={item} aria-label={`${rotulo} ${i + 1}`}
              onChange={(e) => mudar(i, e.target.value)} onKeyDown={(e) => tecla(e, i)} className={`${classeEntrada} flex-1`} />
            {!somenteLeitura && (
              <button type="button" onClick={() => remover(i)} aria-label={`Remover ${rotulo.toLowerCase()} ${i + 1}`} title="Remover"
                className="flex size-9 shrink-0 items-center justify-center rounded-[3px] text-texto-3 transition-colors duration-150 hover:bg-urgente-fundo hover:text-urgente">
                <X className="size-4" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ol>
      {!somenteLeitura && (
        <button type="button" onClick={() => inserir(itens.length - 1)}
          className="ml-7 inline-flex items-center gap-1.5 self-start rounded-[3px] px-2 py-1.5 text-[14px] font-medium text-caneta transition-colors duration-150 hover:bg-caneta-fundo">
          <Plus className="size-4" aria-hidden />
          Adicionar {rotulo.toLowerCase()}
        </button>
      )}
    </div>
  );
}
