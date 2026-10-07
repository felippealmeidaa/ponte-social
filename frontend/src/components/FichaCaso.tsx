import { useEffect, useState } from 'react';
import { 
  BellRing, 
  Edit3, 
  Eye, 
  FileText, 
  History, 
  Languages, 
  MapPin, 
  MessagesSquare, 
  Phone, 
  Save, 
  Sparkles, 
  Star, 
  UserRoundCheck, 
  UserRoundX
} from 'lucide-react';
import { api, atualizar, enviar, ErroApi, sessaoSalva } from '../api';
import { irPara } from '../navegacao';
import type { Triagem } from '../tipos';
import { CATEGORIAS, dataHora, ESTADOS, nomeCategoria, PRIORIDADES } from '../vocabulario';
import { AgendamentoCaso } from './AgendamentoCaso';
import { DocumentosDoCaso } from './DocumentosDoCaso';
import { Aviso, Botao, classeEntrada, PainelLateral, Selo } from './ui';

const ACOES_STATUS = ['PENDENTE', 'EM_ATENDIMENTO', 'ENCAMINHADO_CREAS', 'CONCLUIDO', 'ARQUIVADO'];

export function FichaCaso({ caso, onFechar, onAlterado }: { caso: Triagem | null; onFechar: () => void; onAlterado: (t: Triagem) => void }) {
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
  const [resumo, setResumo] = useState<string | null | undefined>(undefined);
  const [historico, setHistorico] = useState<{ id: string; criado_em: string; categoria: string; status: string; avaliacao: number | null }[]>([]);
  const casoId = caso?.id;

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
    <PainelLateral aberto titulo={`Caso #${caso.id.slice(-5)} · ${nomeCategoria(caso.categoria)}`} onFechar={onFechar} largura="max-w-2xl">
      <div className="flex flex-col gap-6 text-texto">
        
        {/* Metadados e Status Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-linha pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <Selo tom={prioridade.tom}>Prioridade {prioridade.rotulo}</Selo>
            <Selo tom={estado.tom}>{estado.rotulo}</Selo>
            {corrigido && <Selo tom="media">Categoria corrigida pelo cidadão</Selo>}
            {caso.bairro !== 'Não informado' && (
              <span className="flex items-center gap-1 text-[12.5px] text-texto-2 font-medium">
                <MapPin className="size-3 text-marca" />
                {caso.bairro}
              </span>
            )}
          </div>
          <span className="mono text-[11.5px] text-texto-3">
            {dataHora(caso.criado_em)}
          </span>
        </div>

        {/* Card de Transbordo Humano */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-linha bg-elevada p-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${caso.responsavel ? 'bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400' : 'bg-superficie border-linha text-texto-3'}`}>
              <UserRoundCheck className="size-5" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-texto">
                {caso.responsavel_nome ? (
                  <span>Responsável: <strong className="text-marca font-bold">{meu ? 'Você' : caso.responsavel_nome}</strong></span>
                ) : (
                  <span className="text-texto-2">Nenhum assistente social assumiu</span>
                )}
              </p>
              <p className="text-[12px] text-texto-3 mt-0.5">
                {caso.responsavel ? 'O bot foi silenciado e o caso está em atendimento humano.' : 'Assuma o caso para responder diretamente e silenciar o bot.'}
              </p>
            </div>
          </div>

          {!fechado && (
            meu ? (
              <Botao tamanho="sm" variante="fantasma" icone={UserRoundX} carregando={salvando === 'soltar'} onClick={() => assumir(true)}>
                Liberar Caso
              </Botao>
            ) : (
              <Botao tamanho="sm" variante={caso.responsavel ? 'secundario' : 'primario'} icone={UserRoundCheck} carregando={salvando === 'assumir'} onClick={() => assumir(false)}>
                {caso.responsavel ? 'Assumir no Lugar' : 'Assumir Atendimento'}
              </Botao>
            )
          )}
        </div>

        {/* Alerta de Violência / Protocolo de Proteção */}
        {caso.prioridade === 'URGENTE_VIOLENCIA' && (
          <Aviso tom="urgente">
            <strong>Protocolo de Violência / Risco Iminente:</strong> A pessoa recebeu contatos dos canais 190, 180 e 100. Não envie mensagens diretas se houver risco de o agressor monitorar o celular. Priorize contato protegido.
          </Aviso>
        )}

        {/* Resumo da IA */}
        {resumo !== null && (
          <section className="rounded-2xl border border-sky-500/30 bg-superficie p-4.5 shadow-xs">
            <div className="flex items-center gap-2 mb-2 text-sky-700 dark:text-sky-300">
              <Sparkles className="size-4 text-sky-600 dark:text-sky-400" />
              <h3 className="titulo text-[14px] font-bold">Resumo Estruturado da IA</h3>
            </div>
            {resumo === undefined ? (
              <p className="text-[13.5px] text-texto-3 italic">Processando resumo da interação...</p>
            ) : (
              <p className="text-[14px] leading-relaxed text-texto-2">{resumo}</p>
            )}
          </section>
        )}

        {/* Relato do Cidadão */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-texto tracking-wide uppercase">Relato do Cidadão</h3>
            {caso.relato_traducao && (
              <button 
                type="button" 
                onClick={() => setVerOriginal((v) => !v)}
                className="flex items-center gap-1 text-[12.5px] font-medium text-marca hover:underline cursor-pointer"
              >
                <Languages className="size-3.5" />
                {verOriginal ? 'Ver tradução em português' : 'Ver original em espanhol'}
              </button>
            )}
          </div>
          <blockquote className="rounded-xl border border-linha bg-elevada p-4 text-[14px] leading-relaxed text-texto italic">
            “{caso.relato_traducao && !verOriginal ? caso.relato_traducao : caso.relato_original}”
          </blockquote>
          <p className="text-[11.5px] text-texto-3">
            {caso.relato_traducao && (verOriginal ? 'Mensagem original em espanhol. ' : 'Traduzido automaticamente por modelo neural. ')}
            Dados sensíveis são tratados sob conformidade LGPD.
          </p>
        </section>

        {/* Fotos de Documentos */}
        <DocumentosDoCaso casoId={caso.id} quantidade={caso.documentos_enviados ?? 0} />

        {/* Histórico Anterior */}
        {(historico.length > 0 || caso.avaliacao) && (
          <section className="grid gap-4 sm:grid-cols-2 rounded-2xl border border-linha bg-elevada p-4">
            {historico.length > 0 && (
              <div>
                <h3 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-semibold text-texto">
                  <History className="size-3.5 text-marca" /> Histórico ({historico.length})
                </h3>
                <ul className="flex flex-col gap-2 text-[13px]">
                  {historico.map((h) => (
                    <li key={h.id} className="flex items-center justify-between border-b border-linha pb-1.5">
                      <span className="font-medium text-texto">{nomeCategoria(h.categoria)}</span>
                      <span className="text-texto-3">{dataHora(h.criado_em).split(',')[0]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {caso.avaliacao && (
              <div>
                <h3 className="mb-2 text-[13px] font-semibold text-texto">Avaliação do Cidadão</h3>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} className={`size-4.5 ${n <= caso.avaliacao! ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-700'}`} />
                  ))}
                  <span className="mono text-[13px] text-texto font-bold ml-1.5">{caso.avaliacao}/5</span>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Caminho e Documentos Necessários */}
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-linha bg-elevada p-4">
            <h3 className="text-[13px] font-semibold text-marca uppercase tracking-wide mb-2.5">Caminho Sugerido</h3>
            <ul className="flex flex-col gap-2 text-[13.5px]">
              {caso.servicos_recomendados.map((s) => (
                <li key={s} className="flex items-start gap-2 text-texto">
                  <span className="text-marca font-bold">•</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-linha bg-elevada p-4">
            <h3 className="text-[13px] font-semibold text-texto uppercase tracking-wide mb-2.5">Documentos a Apresentar</h3>
            <ul className="flex flex-col gap-2 text-[13.5px]">
              {caso.documentos_necessarios.map((d) => (
                <li key={d} className="flex items-start gap-2 text-texto-2">
                  <FileText className="size-4 shrink-0 text-texto-3 mt-0.5" />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Explicabilidade da Decisão e Correção */}
        <section className="rounded-2xl border border-linha bg-elevada p-4 text-[13px] text-texto-2">
          <p className="text-texto">
            <strong>Motor de Decisão:</strong> {caso.metodo_decisao}
            {caso.confianca > 0 && <span className="mono font-semibold text-marca ml-1">({(caso.confianca * 100).toFixed(0)}% confiança)</span>}
          </p>

          {corrigindo ? (
            <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-linha pt-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold text-texto">Selecionar Categoria Correta</span>
                <select value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value)} className={`${classeEntrada} h-9 py-1 text-[13.5px]`}>
                  {Object.keys(CATEGORIAS).filter((c) => c !== 'nao_identificado').map((c) => (
                    <option key={c} value={c} className="bg-superficie text-texto">{nomeCategoria(c)}</option>
                  ))}
                </select>
              </label>
              <Botao tamanho="sm" variante="primario" carregando={salvando === 'categoria'} disabled={novaCategoria === caso.categoria} onClick={corrigir}>
                Salvar Correção
              </Botao>
              <Botao tamanho="sm" variante="fantasma" onClick={() => setCorrigindo(false)}>
                Cancelar
              </Botao>
            </div>
          ) : (
            <button 
              type="button" 
              onClick={() => { setNovaCategoria(caso.categoria); setCorrigindo(true); }}
              className="mt-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-marca hover:underline cursor-pointer"
            >
              <Edit3 className="size-3" /> Corrigir classificação da IA
            </button>
          )}
        </section>

        {/* Contato & Ações */}
        <section className="rounded-2xl border border-linha bg-elevada p-4 flex flex-col gap-3">
          <h3 className="text-[13px] font-semibold text-texto uppercase tracking-wide">Canais de Contato</h3>
          <div className="flex flex-wrap items-center gap-3">
            <span className="mono text-[14.5px] font-bold text-texto bg-superficie px-3 py-1 rounded-xl border border-linha">
              {telefone ?? caso.telefone_mascarado}
            </span>
            {caso.tem_contato && !telefone && (
              <Botao tamanho="sm" icone={Eye} carregando={salvando === 'telefone'} onClick={verTelefone}>
                Consultar Telefone
              </Botao>
            )}
            {telefone && (
              <a href={`tel:+${telefone}`} className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 text-[13px] font-semibold text-sky-700 dark:text-sky-300 hover:bg-sky-500/20">
                <Phone className="size-3.5" /> Ligar
              </a>
            )}
            {caso.conversa_id && (
              <Botao tamanho="sm" variante="primario" icone={MessagesSquare} onClick={() => irPara('conversas', caso.conversa_id!)}>
                Abrir no Live Chat
              </Botao>
            )}
          </div>
        </section>

        {/* Status e Avisos */}
        <section className="flex flex-col gap-3">
          <h3 className="text-[13px] font-semibold text-texto uppercase tracking-wide">Status do Atendimento</h3>
          <div className="flex flex-wrap gap-2">
            {ACOES_STATUS.map((s) => {
              const ativo = caso.status === s || (s === 'PENDENTE' && caso.status === 'URGENTE_CREAS');
              return (
                <button
                  key={s}
                  aria-pressed={ativo}
                  disabled={salvando !== null}
                  onClick={() => salvar(s, s)}
                  className={`h-9 rounded-xl border px-3.5 text-[13px] font-medium transition-all duration-150 cursor-pointer disabled:opacity-50 ${
                    ativo
                      ? 'border-marca bg-marca-fundo text-marca font-semibold shadow-xs'
                      : 'border-linha bg-superficie text-texto-2 hover:text-texto hover:border-linha-forte'
                  }`}
                >
                  {s === 'PENDENTE' && caso.status === 'URGENTE_CREAS' ? 'Urgente CREAS' : ESTADOS[s].rotulo}
                </button>
              );
            })}
          </div>

          {temWhatsApp && !violencia && (
            <label className="mt-2 flex items-start gap-2.5 text-[13px] text-texto-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={avisar} 
                onChange={(e) => setAvisar(e.target.checked)}
                className="mt-0.5 size-4 accent-sky-600 rounded" 
              />
              <span>Notificar cidadão no WhatsApp sobre a mudança de status.</span>
            </label>
          )}

          {aviso?.enviado && (
            <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-600 dark:text-emerald-400">
              <BellRing className="size-3.5" /> Mensagem enviada com sucesso no WhatsApp.
            </p>
          )}
        </section>

        {!fechado && (
          <AgendamentoCaso key={caso.id} caso={caso} podeAvisar={temWhatsApp && !violencia}
            violencia={violencia} onAlterado={onAlterado} />
        )}

        {/* Observações da Equipe */}
        <section className="flex flex-col gap-2">
          <label htmlFor="observacoes" className="text-[13px] font-semibold text-texto uppercase tracking-wide">
            Observações e Parecer Social
          </label>
          <textarea
            id="observacoes"
            rows={4}
            value={observacoes}
            onChange={(e) => { setObservacoes(e.target.value); setSalvo(false); }}
            placeholder="Registre aqui anotações de ligações, encaminhamentos ou dados complementares..."
            className={`${classeEntrada} resize-y`}
          />
          <div className="flex items-center gap-3 mt-1">
            <Botao tamanho="sm" icone={Save} carregando={salvando === 'observacoes'} onClick={() => salvar(caso.status, 'observacoes')}>
              Salvar Observações
            </Botao>
            {salvo && <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">Salvo com sucesso.</span>}
          </div>
        </section>

        {erro && <Aviso>{erro}</Aviso>}
      </div>
    </PainelLateral>
  );
}
