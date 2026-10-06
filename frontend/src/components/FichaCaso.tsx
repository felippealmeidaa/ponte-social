import { useEffect, useState } from 'react';
import { BellRing, Eye, FileText, History, Languages, MessagesSquare, Phone, Save, ShieldAlert, Sparkles, Star, UserRoundCheck, UserRoundX } from 'lucide-react';
import { api, atualizar, enviar, ErroApi, sessaoSalva } from '../api';
import { irPara } from '../navegacao';
import type { Triagem } from '../tipos';
import { CANAIS, CATEGORIAS, dataHora, ESTADOS, nomeCategoria, PRIORIDADES, tempoDesde } from '../vocabulario';
import { DocumentosDoCaso } from './DocumentosDoCaso';
import { Aviso, Botao, classeEntrada, PainelLateral, Selo } from './ui';

const ACOES_STATUS = ['PENDENTE', 'EM_ATENDIMENTO', 'ENCAMINHADO_CREAS', 'CONCLUIDO', 'ARQUIVADO'];

export function FichaCaso({ caso, onFechar, onAlterado }: { caso: Triagem | null; onFechar: () => void; onAlterado: (t: Triagem) => void }) {
  // Estado inicial vem do caso; quem usa remonta o componente (key) ao trocar de caso
  const [observacoes, setObservacoes] = useState(caso?.observacoes ?? '');
  const [telefone, setTelefone] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [avisar, setAvisar] = useState(true);
  const [aviso, setAviso] = useState<{ enviado: boolean; motivo: string | null } | null>(null);
  const [verOriginal, setVerOriginal] = useState(false);
  const [corrigindo, setCorrigindo] = useState(false);
  const [novaCategoria, setNovaCategoria] = useState(caso?.categoria ?? '');
  const [resumo, setResumo] = useState<string | null | undefined>(undefined); // undefined = carregando
  const [historico, setHistorico] = useState<{ id: string; criado_em: string; categoria: string; status: string; avaliacao: number | null }[]>([]);
  const casoId = caso?.id;

  // Resumo pela IA e outros pedidos da mesma pessoa: carregados ao abrir a ficha
  useEffect(() => {
    if (!casoId) return;
    let ativo = true;
    api<{ resumo: string | null }>(`/triagem/${casoId}/resumo-ia`).then((r) => { if (ativo) setResumo(r.resumo); }).catch(() => { if (ativo) setResumo(null); });
    api<typeof historico>(`/triagem/${casoId}/historico`).then((r) => { if (ativo) setHistorico(r); }).catch(() => {});
    return () => { ativo = false; };
  }, [casoId]);

  if (!caso) return <PainelLateral aberto={false} titulo="" onFechar={onFechar}>{null}</PainelLateral>;

  const salvar = async (status: string, acao: string) => {
    setSalvando(acao);
    setErro(null);
    try {
      const r = await api<{ triagem: Triagem; aviso: { enviado: boolean; motivo: string | null } | null }>(
        `/triagem/${caso.id}/status`, atualizar({ status, observacoes, avisar }));
      setAviso(r.aviso);
      onAlterado(r.triagem);
      if (acao === 'observacoes') setSalvo(true);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(null);
    }
  };

  const corrigir = async () => {
    setSalvando('categoria');
    setErro(null);
    try {
      const r = await api<{ triagem: Triagem }>(`/triagem/${caso.id}/categoria`, atualizar({ categoria: novaCategoria }));
      onAlterado(r.triagem);
      setCorrigindo(false);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível corrigir.');
    } finally {
      setSalvando(null);
    }
  };

  const assumir = async (soltar: boolean) => {
    setSalvando(soltar ? 'soltar' : 'assumir');
    setErro(null);
    try {
      const r = await api<{ triagem: Triagem; aviso: { enviado: boolean; motivo: string | null } | null }>(
        `/triagem/${caso.id}/assumir`, enviar({ soltar, avisar }));
      setAviso(r.aviso);
      onAlterado(r.triagem);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(null);
    }
  };

  const verTelefone = async () => {
    setSalvando('telefone');
    try {
      const r = await api<{ telefone: string }>(`/triagem/${caso.id}/contato`);
      setTelefone(r.telefone);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível consultar o telefone.');
    } finally {
      setSalvando(null);
    }
  };

  const prioridade = PRIORIDADES[caso.prioridade] ?? PRIORIDADES.BAIXA;
  const estado = ESTADOS[caso.status] ?? ESTADOS.PENDENTE;
  const corrigido = caso.categoria_confirmada_pelo_cidadao && caso.categoria !== caso.categoria_modelo;
  const violencia = caso.categoria === 'violencia_protecao' || caso.prioridade === 'URGENTE_VIOLENCIA';
  const temWhatsApp = caso.canal === 'whatsapp' && Boolean(caso.conversa_id);
  const eu = sessaoSalva()?.id;
  const meu = Boolean(eu && caso.responsavel === eu);
  const fechado = caso.status === 'CONCLUIDO' || caso.status === 'ARQUIVADO';

  return (
    <PainelLateral aberto titulo={nomeCategoria(caso.categoria)} onFechar={onFechar}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <Selo tom={prioridade.tom}>Prioridade {prioridade.rotulo.toLowerCase()}</Selo>
          <Selo tom={estado.tom}>{estado.rotulo}</Selo>
          <span className="text-[13px] text-texto-2">
            Chegou por {CANAIS[caso.canal] ?? caso.canal} {tempoDesde(caso.criado_em)} ({dataHora(caso.criado_em)}).
            {caso.bairro !== 'Não informado' && ` Bairro: ${caso.bairro}.`}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[5px] border border-linha bg-elevada px-3.5 py-2.5">
          <p className="flex items-center gap-2 text-[14px]">
            <UserRoundCheck className={`size-4 shrink-0 ${caso.responsavel ? 'text-caneta' : 'text-texto-3'}`} aria-hidden />
            {caso.responsavel_nome
              ? <span>Com <strong className="font-semibold">{meu ? 'você' : caso.responsavel_nome}</strong></span>
              : <span className="text-texto-2">Ninguém assumiu este caso ainda.</span>}
          </p>
          {!fechado && (meu ? (
            <Botao tamanho="sm" variante="fantasma" icone={UserRoundX} carregando={salvando === 'soltar'} onClick={() => assumir(true)}>Soltar o caso</Botao>
          ) : (
            <Botao tamanho="sm" variante={caso.responsavel ? 'secundario' : 'primario'} icone={UserRoundCheck} carregando={salvando === 'assumir'} onClick={() => assumir(false)}>
              {caso.responsavel ? 'Assumir no lugar' : 'Assumir o caso'}
            </Botao>
          ))}
        </div>

        {caso.prioridade === 'URGENTE_VIOLENCIA' && (
          <Aviso>Possível situação de violência. A pessoa já recebeu os contatos 190, 180 e 100. Priorize o contato e avalie encaminhar ao CREAS.</Aviso>
        )}

        {resumo !== null && (
          <section aria-labelledby="t-resumo" className="rounded-[5px] border border-caneta/25 bg-caneta-fundo/60 px-4 py-3">
            <h3 id="t-resumo" className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-caneta">
              <Sparkles className="size-3.5" aria-hidden />Resumo automático (IA)
            </h3>
            {resumo === undefined
              ? <p className="text-[14px] text-texto-3">Resumindo a conversa…</p>
              : <p className="text-[15px] leading-relaxed text-texto">{resumo}</p>}
            <p className="mt-1 text-[12px] text-texto-2">Feito por IA a partir da conversa: confira o relato abaixo antes de agir.</p>
          </section>
        )}

        <section>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[13px] font-medium text-texto-2">O que a pessoa contou</h3>
            {caso.relato_traducao && (
              <button type="button" onClick={() => setVerOriginal((v) => !v)} aria-pressed={verOriginal}
                className="inline-flex items-center gap-1 text-[13px] font-medium text-caneta underline-offset-2 hover:underline">
                <Languages className="size-3.5" aria-hidden />{verOriginal ? 'Ver em português' : 'Ver como a pessoa escreveu'}
              </button>
            )}
          </div>
          <blockquote lang={verOriginal && caso.idioma ? caso.idioma : 'pt-BR'} className="rounded-[5px] border border-linha bg-fundo px-4 py-3 text-[15px] leading-relaxed text-texto">
            {caso.relato_traducao && !verOriginal ? caso.relato_traducao : caso.relato_original}
          </blockquote>
          <p className="mt-1.5 text-xs text-texto-3">
            {caso.relato_traducao && (verOriginal ? 'Escrito em espanhol. ' : 'Traduzido do espanhol pela IA. ')}
            CPF, telefone e e-mail digitados são removidos antes de gravar.
          </p>
        </section>

        <DocumentosDoCaso casoId={caso.id} quantidade={caso.documentos_enviados ?? 0} />

        {(historico.length > 0 || caso.avaliacao) && (
          <section aria-labelledby="t-historico" className="grid gap-4 sm:grid-cols-2">
            {historico.length > 0 && (
              <div>
                <h3 id="t-historico" className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-texto-2">
                  <History className="size-3.5" aria-hidden />Esta pessoa já pediu ajuda {historico.length === 1 ? '1 vez' : `${historico.length} vezes`}
                </h3>
                <ul className="flex flex-col gap-1.5 text-[14px]">
                  {historico.map((h) => (
                    <li key={h.id} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold">{nomeCategoria(h.categoria)}</span>
                      <span className="text-texto-2">{dataHora(h.criado_em).split(',')[0]} · {(ESTADOS[h.status] ?? ESTADOS.PENDENTE).rotulo.toLowerCase()}</span>
                      {h.avaliacao ? <span className="text-texto-3">nota {h.avaliacao}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {caso.avaliacao ? (
              <div>
                <h3 className="mb-2 text-[13px] font-medium text-texto-2">Nota que a pessoa deu</h3>
                <p className="flex items-center gap-1" aria-label={`${caso.avaliacao} de 5`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} className={`size-5 ${n <= caso.avaliacao! ? 'fill-[var(--color-alta)] text-alta' : 'text-linha-forte'}`} aria-hidden />
                  ))}
                  <span className="ml-1.5 text-[14px] text-texto-2 tabular">{caso.avaliacao} de 5</span>
                </p>
              </div>
            ) : null}
          </section>
        )}

        <section className="grid gap-5 sm:grid-cols-2">
          <div>
            <h3 className="text-[13px] font-medium text-texto-2 mb-2">Caminho sugerido</h3>
            <ul className="flex flex-col gap-1.5 text-sm">
              {caso.servicos_recomendados.map((s) => <li key={s} className="flex gap-2"><span className="text-caneta" aria-hidden>•</span>{s}</li>)}
            </ul>
          </div>
          <div>
            <h3 className="text-[13px] font-medium text-texto-2 mb-2">Documentos para levar</h3>
            <ul className="flex flex-col gap-1.5 text-sm">
              {caso.documentos_necessarios.map((d) => <li key={d} className="flex gap-2"><FileText className="size-4 mt-0.5 shrink-0 text-texto-3" aria-hidden />{d}</li>)}
            </ul>
          </div>
        </section>

        <section className="rounded-[5px] border border-linha px-4 py-3 text-[13px] text-texto-2">
          <p>
            <span className="text-texto">Como o sistema chegou aqui:</span> {caso.metodo_decisao}
            {caso.confianca > 0 && `, com ${(caso.confianca * 100).toFixed(0)}% de confiança`}.
          </p>
          {caso.categoria_confirmada_pelo_cidadao && (
            <p className="mt-1">{corrigido ? `A pessoa corrigiu a sugestão (o sistema tinha indicado ${nomeCategoria(caso.categoria_modelo).toLowerCase()}).` : 'A pessoa confirmou a sugestão no WhatsApp.'}</p>
          )}
          {caso.necessidades_secundarias.length > 0 && (
            <p className="mt-1">Também pode envolver: {caso.necessidades_secundarias.map(nomeCategoria).join(', ').toLowerCase()}.</p>
          )}
          {caso.corrigida_por && (
            <p className="mt-1 text-texto">
              Necessidade corrigida pela equipe ({caso.corrigida_por}); o sistema tinha indicado {nomeCategoria(caso.categoria_modelo).toLowerCase()}.
            </p>
          )}
          <p className="mt-1 text-texto-3">É uma sugestão. Quem avalia o direito é o profissional.</p>
          {corrigindo ? (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[12.5px] font-medium text-texto-2">Necessidade certa</span>
                <select value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value)} className={`${classeEntrada} h-9 py-1 text-[14px]`}>
                  {Object.keys(CATEGORIAS).filter((c) => c !== 'nao_identificado').map((c) => <option key={c} value={c}>{nomeCategoria(c)}</option>)}
                </select>
              </label>
              <Botao tamanho="sm" variante="primario" carregando={salvando === 'categoria'} disabled={novaCategoria === caso.categoria} onClick={corrigir}>Salvar correção</Botao>
              <Botao tamanho="sm" variante="fantasma" onClick={() => setCorrigindo(false)}>Cancelar</Botao>
              <p className="w-full text-[12px] text-texto-3">O caminho do caso passa a ser o da necessidade certa, e a correção ensina o modelo no próximo treino.</p>
            </div>
          ) : (
            <button type="button" onClick={() => { setNovaCategoria(caso.categoria); setCorrigindo(true); }}
              className="mt-2 text-[13px] font-medium text-caneta underline-offset-2 hover:underline">
              O sistema errou? Corrigir a necessidade
            </button>
          )}
        </section>

        <section>
          <h3 className="text-[13px] font-medium text-texto-2 mb-2">Contato</h3>
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular text-[15px]">{telefone ?? caso.telefone_mascarado}</span>
            {caso.tem_contato && !telefone && (
              <Botao tamanho="sm" icone={Eye} carregando={salvando === 'telefone'} onClick={verTelefone}>Ver telefone</Botao>
            )}
            {telefone && <a href={`tel:+${telefone}`} className="inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-linha-forte px-3 text-[13px] hover:bg-elevada"><Phone className="size-4" aria-hidden />Ligar</a>}
            {caso.conversa_id && (
              <Botao tamanho="sm" icone={MessagesSquare} onClick={() => irPara('conversas', caso.conversa_id!)}>Abrir conversa</Botao>
            )}
          </div>
          {caso.tem_contato && !telefone && <p className="mt-1.5 text-xs text-texto-3">A consulta ao número fica registrada nas observações.</p>}
        </section>

        <section>
          <h3 className="text-[13px] font-medium text-texto-2 mb-2">Situação do atendimento</h3>
          <div role="group" aria-label="Mudar situação" className="flex flex-wrap gap-2">
            {ACOES_STATUS.map((s) => {
              const ativo = caso.status === s || (s === 'PENDENTE' && caso.status === 'URGENTE_CREAS');
              return (
                <button
                  key={s}
                  aria-pressed={ativo}
                  disabled={salvando !== null}
                  onClick={() => salvar(s, s)}
                  className={`h-9 rounded-[5px] border px-3 text-[13px] transition-colors duration-150 disabled:opacity-60 ${
                    ativo ? 'border-caneta bg-caneta-fundo text-caneta font-semibold' : 'border-linha-forte text-texto-2 hover:text-texto hover:bg-elevada'
                  }`}
                >
                  {s === 'PENDENTE' && caso.status === 'URGENTE_CREAS' ? 'Urgente' : ESTADOS[s].rotulo}
                </button>
              );
            })}
          </div>
          {temWhatsApp && !violencia && (
            <label className="mt-3 flex items-start gap-2.5 text-[13.5px] leading-snug text-texto-2">
              <input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-caneta)]" />
              <span>
                <span className="font-semibold text-texto">Avisar a pessoa pelo WhatsApp</span> ao marcar “Em atendimento” ou “Concluído”.
                Ela recebe uma mensagem curta dizendo que a equipe viu o pedido.
              </span>
            </label>
          )}
          {temWhatsApp && violencia && (
            <p className="mt-3 flex items-start gap-2 text-[13px] leading-snug text-texto-2">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-urgente" aria-hidden />
              Em caso de violência, o sistema não manda aviso pelo WhatsApp: o celular pode estar com quem agride. Fale com a pessoa pelo canal mais seguro.
            </p>
          )}
          {aviso?.enviado && (
            <p role="status" className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-ok">
              <BellRing className="size-4" aria-hidden />A pessoa foi avisada pelo WhatsApp.
            </p>
          )}
          {aviso && !aviso.enviado && aviso.motivo === 'falha_no_envio' && (
            <div className="mt-2"><Aviso tom="info">A situação foi salva, mas o aviso não saiu pelo WhatsApp. Confira a conexão em Configurações.</Aviso></div>
          )}
          {aviso && !aviso.enviado && aviso.motivo === 'conversa_apagada' && (
            <p className="mt-2 text-[13px] text-texto-3">A pessoa apagou a conversa: não há como avisar pelo WhatsApp.</p>
          )}
        </section>

        <section>
          <label htmlFor="observacoes" className="text-[13px] font-medium text-texto-2">Observações da equipe</label>
          <textarea
            id="observacoes"
            rows={4}
            value={observacoes}
            onChange={(e) => { setObservacoes(e.target.value); setSalvo(false); }}
            placeholder="Ex.: liguei às 10h, não atendeu; tentar à tarde."
            className={`${classeEntrada} mt-1.5 resize-y`}
          />
          <div className="mt-2 flex items-center gap-3">
            <Botao tamanho="sm" icone={Save} carregando={salvando === 'observacoes'} onClick={() => salvar(caso.status, 'observacoes')}>Salvar observações</Botao>
            {salvo && <span role="status" className="text-xs text-ok">Salvo.</span>}
          </div>
        </section>

        {erro && <Aviso>{erro}</Aviso>}
      </div>
    </PainelLateral>
  );
}
