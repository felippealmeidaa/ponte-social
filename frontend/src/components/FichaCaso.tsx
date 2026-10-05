import { useState } from 'react';
import { Eye, FileText, MessagesSquare, Phone, Save } from 'lucide-react';
import { api, atualizar, ErroApi } from '../api';
import { irPara } from '../navegacao';
import type { Triagem } from '../tipos';
import { CANAIS, dataHora, ESTADOS, nomeCategoria, PRIORIDADES, tempoDesde } from '../vocabulario';
import { Aviso, Botao, classeEntrada, PainelLateral, Selo } from './ui';

const ACOES_STATUS = ['PENDENTE', 'EM_ATENDIMENTO', 'ENCAMINHADO_CREAS', 'CONCLUIDO', 'ARQUIVADO'];

export function FichaCaso({ caso, onFechar, onAlterado }: { caso: Triagem | null; onFechar: () => void; onAlterado: (t: Triagem) => void }) {
  // Estado inicial vem do caso; quem usa remonta o componente (key) ao trocar de caso
  const [observacoes, setObservacoes] = useState(caso?.observacoes ?? '');
  const [telefone, setTelefone] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  if (!caso) return <PainelLateral aberto={false} titulo="" onFechar={onFechar}>{null}</PainelLateral>;

  const salvar = async (status: string, acao: string) => {
    setSalvando(acao);
    setErro(null);
    try {
      const r = await api<{ triagem: Triagem }>(`/triagem/${caso.id}/status`, atualizar({ status, observacoes }));
      onAlterado(r.triagem);
      if (acao === 'observacoes') setSalvo(true);
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

  return (
    <PainelLateral aberto titulo={nomeCategoria(caso.categoria)} onFechar={onFechar}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <Selo tom={prioridade.tom}>Prioridade {prioridade.rotulo.toLowerCase()}</Selo>
          <Selo tom={estado.tom}>{estado.rotulo}</Selo>
          <span className="text-xs text-texto-3">
            {CANAIS[caso.canal] ?? caso.canal} · chegou {tempoDesde(caso.criado_em)} ({dataHora(caso.criado_em)})
            {caso.bairro !== 'Não informado' && ` · ${caso.bairro}`}
          </span>
        </div>

        {caso.prioridade === 'URGENTE_VIOLENCIA' && (
          <Aviso>Possível situação de violência. A pessoa já recebeu os contatos 190, 180 e 100. Priorize o contato e avalie encaminhar ao CREAS.</Aviso>
        )}

        <section>
          <h3 className="text-[13px] font-medium text-texto-2 mb-2">O que a pessoa contou</h3>
          <blockquote className="rounded-lg border border-linha bg-fundo px-4 py-3 text-[15px] leading-relaxed text-texto">
            {caso.relato_original}
          </blockquote>
          <p className="mt-1.5 text-xs text-texto-3">CPF, telefone e e-mail digitados são removidos antes de gravar.</p>
        </section>

        <section className="grid gap-5 sm:grid-cols-2">
          <div>
            <h3 className="text-[13px] font-medium text-texto-2 mb-2">Caminho sugerido</h3>
            <ul className="flex flex-col gap-1.5 text-sm">
              {caso.servicos_recomendados.map((s) => <li key={s} className="flex gap-2"><span className="text-ambar" aria-hidden>•</span>{s}</li>)}
            </ul>
          </div>
          <div>
            <h3 className="text-[13px] font-medium text-texto-2 mb-2">Documentos para levar</h3>
            <ul className="flex flex-col gap-1.5 text-sm">
              {caso.documentos_necessarios.map((d) => <li key={d} className="flex gap-2"><FileText className="size-4 mt-0.5 shrink-0 text-texto-3" aria-hidden />{d}</li>)}
            </ul>
          </div>
        </section>

        <section className="rounded-lg border border-linha px-4 py-3 text-[13px] text-texto-2">
          <p>
            <span className="text-texto">Como o sistema chegou aqui:</span> {caso.metodo_decisao}
            {caso.confianca > 0 && ` · confiança ${(caso.confianca * 100).toFixed(0)}%`}
          </p>
          {caso.categoria_confirmada_pelo_cidadao && (
            <p className="mt-1">{corrigido ? `A pessoa corrigiu a sugestão (o sistema tinha indicado ${nomeCategoria(caso.categoria_modelo).toLowerCase()}).` : 'A pessoa confirmou a sugestão no WhatsApp.'}</p>
          )}
          {caso.necessidades_secundarias.length > 0 && (
            <p className="mt-1">Também pode envolver: {caso.necessidades_secundarias.map(nomeCategoria).join(', ').toLowerCase()}.</p>
          )}
          <p className="mt-1 text-texto-3">É uma sugestão. Quem avalia o direito é o profissional.</p>
        </section>

        <section>
          <h3 className="text-[13px] font-medium text-texto-2 mb-2">Contato</h3>
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular text-[15px]">{telefone ?? caso.telefone_mascarado}</span>
            {caso.tem_contato && !telefone && (
              <Botao tamanho="sm" icone={Eye} carregando={salvando === 'telefone'} onClick={verTelefone}>Ver telefone</Botao>
            )}
            {telefone && <a href={`tel:+${telefone}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-linha-forte px-3 text-[13px] hover:bg-elevada"><Phone className="size-4" aria-hidden />Ligar</a>}
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
                  className={`h-9 rounded-lg border px-3 text-[13px] transition-colors duration-150 disabled:opacity-60 ${
                    ativo ? 'border-ambar bg-ambar-escuro text-ambar font-semibold' : 'border-linha-forte text-texto-2 hover:text-texto hover:bg-elevada'
                  }`}
                >
                  {s === 'PENDENTE' && caso.status === 'URGENTE_CREAS' ? 'Urgente' : ESTADOS[s].rotulo}
                </button>
              );
            })}
          </div>
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
