import { useCallback, useId, useState, type ReactNode } from 'react';
import { BellRing, CalendarCheck, CheckCircle2, ChevronDown, Clock, Inbox, MessageCircleQuestion, ShieldAlert, Undo2 } from 'lucide-react';
import { api, atualizar, ErroApi } from '../api';
import { BalaoTexto, type TextoBot } from '../components/BalaoTexto';
import { Aviso, Botao, Chave, classeEntrada, Esqueleto } from '../components/ui';
import { contaAtual } from '../unidades';
import { useAtualizacao } from '../useAtualizacao';

// Gestão › Alertas: o que acende no painel da equipe e cada mensagem automática que a pessoa recebe pelo WhatsApp
// (liga/desliga, tempos e o texto). Em violência nenhuma dessas mensagens vai, com qualquer valor daqui.

interface Opcoes {
  alerta_urgente_min: number;
  alerta_fila_horas: number;
  aviso_em_atendimento: boolean;
  aviso_concluido: boolean;
  pedir_avaliacao: boolean;
  aviso_agendamento: boolean;
  lembrete_vespera: boolean;
  lembrete_horas: number;
  perguntar_depois: boolean;
  retorno_dias: number;
}
type ChaveOpcao = keyof Opcoes;
interface RespostaOpcoes { opcoes: Opcoes; atualizado_em: string | null; atualizado_por: string | null }

// Mesmos limites do backend (catalogo.LIMITES_NUMERICOS)
const LIMITES: Partial<Record<ChaveOpcao, [number, number]>> = {
  alerta_urgente_min: [1, 240], alerta_fila_horas: [1, 720], lembrete_horas: [2, 72], retorno_dias: [1, 30],
};
const FILA_PADRAO = 48;

export function Alertas() {
  const opcoes = useAtualizacao(useCallback(() => api<RespostaOpcoes>('/configuracao/fluxo/opcoes'), []), 0);
  const textos = useAtualizacao(useCallback(() => api<TextoBot[]>('/configuracao/textos'), []), 0);
  const [rascunho, setRascunho] = useState<Partial<Opcoes>>({});
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const podeEditar = contaAtual().coordenacao;

  if (opcoes.erro) return <Aviso>{opcoes.erro}</Aviso>;
  if (!opcoes.dados) return <Esqueleto className="h-80" />;
  const salvas = opcoes.dados.opcoes;
  const atual: Opcoes = { ...salvas, ...rascunho };
  const mudancas = (Object.keys(rascunho) as ChaveOpcao[]).filter((k) => rascunho[k] !== salvas[k]);
  const invalidas = (Object.keys(LIMITES) as ChaveOpcao[]).filter((k) => {
    const [min, max] = LIMITES[k]!;
    const v = atual[k] as number;
    if (k === 'alerta_fila_horas' && v === 0) return false; // 0 = desligado
    return !Number.isInteger(v) || v < min || v > max;
  });

  const mudar = <K extends ChaveOpcao>(chave: K, valor: Opcoes[K]) => {
    setRascunho((r) => ({ ...r, [chave]: valor }));
    setSalvo(false);
  };
  const salvar = async () => {
    setSalvando(true);
    setFalha(null);
    try {
      const enviar = Object.fromEntries(mudancas.map((k) => [k, atual[k]]));
      opcoes.setDados(await api<RespostaOpcoes>('/configuracao/fluxo/opcoes', atualizar({ opcoes: enviar }, 'PUT')));
      setRascunho({});
      setSalvo(true);
    } catch (e) {
      setFalha(e instanceof ErroApi ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const ctx = { unidade: null, podeEditar };
  const balao = (chave: string) => {
    const t = textos.dados?.find((x) => x.chave === chave);
    return t ? <BalaoTexto key={chave} texto={t} ctx={ctx} onSalvo={textos.recarregar} /> : null;
  };
  const filaLigada = atual.alerta_fila_horas > 0;

  return (
    <div className="flex max-w-[78ch] flex-col gap-10 pb-24">
      <p className="flex items-start gap-2 rounded-[4px] border border-urgente/30 bg-urgente-fundo px-3 py-2.5 text-[14px] leading-snug text-texto">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-urgente" aria-hidden />
        <span>
          <strong className="font-semibold">Violência é sempre travada:</strong> nenhuma mensagem automática desta tela vai
          pelo WhatsApp em caso de violência (o celular pode estar com quem agride), com qualquer configuração.
        </span>
      </p>

      {/* ---------- Painel da equipe ---------- */}
      <section aria-labelledby="t-painel" className="flex flex-col gap-1">
        <h2 id="t-painel" className="titulo text-[22px] leading-[1.1]">No painel da equipe</h2>
        <p className="text-[14.5px] text-texto-2">Etiquetas pequenas na barra do topo, em todas as telas. Clicar leva para a fila.</p>

        <Item icone={ShieldAlert} tom="urgente" titulo="Caso de violência sem atendimento"
          quando="Quando um caso de violência espera sem ninguém marcar “Em atendimento”. Acende em vermelho e muda o título da aba; o sininho ao lado liga um som.">
          <Numero rotulo="Acender depois de" unidade="minutos" valor={atual.alerta_urgente_min} limites={LIMITES.alerta_urgente_min!}
            disabled={!podeEditar} onMudar={(v) => mudar('alerta_urgente_min', v)} />
        </Item>

        <Item icone={Clock} tom="alta" titulo="Fila parada" ligada={filaLigada} disabled={!podeEditar}
          onLigar={(v) => mudar('alerta_fila_horas', v ? (salvas.alerta_fila_horas || FILA_PADRAO) : 0)}
          quando="Quando um caso comum (não violência) continua “Aguardando” há muito tempo. Acende em âmbar, sem som.">
          {filaLigada && (
            <Numero rotulo="Acender depois de" unidade="horas" valor={atual.alerta_fila_horas} limites={LIMITES.alerta_fila_horas!}
              disabled={!podeEditar} onMudar={(v) => mudar('alerta_fila_horas', v)} />
          )}
        </Item>
      </section>

      {/* ---------- Mensagens à pessoa ---------- */}
      <section aria-labelledby="t-mensagens" className="flex flex-col gap-1">
        <h2 id="t-mensagens" className="titulo text-[22px] leading-[1.1]">Mensagens automáticas pelo WhatsApp</h2>
        <p className="text-[14.5px] text-texto-2">
          O que a pessoa recebe sem ninguém precisar escrever. Desligar aqui vale para todos os casos; ligado, o técnico
          ainda pode não avisar um caso específico na ficha.
        </p>

        <Item icone={Inbox} titulo="“Recebemos seu pedido”" ligada={atual.aviso_em_atendimento} disabled={!podeEditar}
          onLigar={(v) => mudar('aviso_em_atendimento', v)}
          quando="Quando a equipe marca o caso como “Em atendimento”." textos={[balao('aviso_em_atendimento')]} />

        <Item icone={CheckCircle2} titulo="“Seu atendimento foi concluído”" ligada={atual.aviso_concluido} disabled={!podeEditar}
          onLigar={(v) => mudar('aviso_concluido', v)}
          quando="Quando a equipe marca o caso como “Concluído”."
          textos={[balao('aviso_concluido'), ...(atual.pedir_avaliacao ? [balao('pedir_avaliacao'), balao('avaliacao_obrigado')] : [])]}>
          <Sub rotulo="Pedir nota de 1 a 5 junto (vai para o Relatório mensal)" ligada={atual.pedir_avaliacao && atual.aviso_concluido}
            disabled={!podeEditar || !atual.aviso_concluido} onMudar={(v) => mudar('pedir_avaliacao', v)} />
        </Item>

        <Item icone={CalendarCheck} titulo="Atendimento marcado" ligada={atual.aviso_agendamento} disabled={!podeEditar}
          onLigar={(v) => mudar('aviso_agendamento', v)}
          quando="Quando a equipe marca ou desmarca um horário na ficha. A confirmação leva o link para salvar na agenda do celular."
          textos={[balao('agendamento_confirmado'), balao('agenda_salvar'), balao('agendamento_cancelado')]} />

        <Item icone={BellRing} titulo="Lembrete do atendimento" ligada={atual.lembrete_vespera} disabled={!podeEditar}
          onLigar={(v) => mudar('lembrete_vespera', v)}
          quando="Antes do horário marcado. Só vai se o atendimento foi marcado com pelo menos esse tempo de antecedência."
          textos={[balao('agendamento_lembrete')]}>
          {atual.lembrete_vespera && (
            <Numero rotulo="Mandar" unidade="horas antes" valor={atual.lembrete_horas} limites={LIMITES.lembrete_horas!}
              disabled={!podeEditar} onMudar={(v) => mudar('lembrete_horas', v)} />
          )}
        </Item>

        <Item icone={MessageCircleQuestion} titulo="“Conseguiu ir ao CRAS?”" ligada={atual.perguntar_depois} disabled={!podeEditar}
          onLigar={(v) => mudar('perguntar_depois', v)}
          quando="Para quem recebeu a orientação mas não quis contato do CRAS. Se não conseguiu, pode pedir contato e o caso entra na fila."
          textos={[balao('acompanhamento'), balao('acompanhamento_foi'), balao('acompanhamento_nao_precisa')]}>
          {atual.perguntar_depois && (
            <Numero rotulo="Perguntar" unidade="dias depois" valor={atual.retorno_dias} limites={LIMITES.retorno_dias!}
              disabled={!podeEditar} onMudar={(v) => mudar('retorno_dias', v)} />
          )}
        </Item>
        {textos.erro && <Aviso tom="info">Não foi possível carregar os textos: {textos.erro}</Aviso>}
      </section>

      {!podeEditar && <p className="text-[13.5px] text-texto-3">Só a coordenação muda os alertas e os textos.</p>}

      {/* Barra de salvar: só aparece quando há mudança */}
      {podeEditar && (mudancas.length > 0 || salvo || falha) && (
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-linha bg-superficie/95 px-4 py-3 backdrop-blur">
          {mudancas.length > 0 ? (
            <>
              <Botao variante="primario" carregando={salvando} disabled={invalidas.length > 0} onClick={salvar}>
                Salvar {mudancas.length} {mudancas.length === 1 ? 'alteração' : 'alterações'}
              </Botao>
              <Botao variante="fantasma" icone={Undo2} onClick={() => { setRascunho({}); setFalha(null); }}>Desfazer</Botao>
              {invalidas.length > 0 && <span className="text-[13px] text-urgente-forte">Confira os números em vermelho.</span>}
            </>
          ) : salvo ? (
            <span role="status" className="text-[14px] font-semibold text-ok">Salvo. Já vale no painel e nas próximas mensagens.</span>
          ) : null}
          {falha && <Aviso>{falha}</Aviso>}
        </div>
      )}
    </div>
  );
}

/** Um alerta ou mensagem: chave (opcional), quando acontece, controles e os textos que a pessoa recebe. */
function Item({ icone: Icone, tom, titulo, quando, ligada, onLigar, disabled, textos, children }: {
  icone: typeof Inbox; tom?: 'urgente' | 'alta'; titulo: string; quando: string;
  ligada?: boolean; onLigar?: (v: boolean) => void; disabled?: boolean; textos?: ReactNode[]; children?: ReactNode;
}) {
  const id = useId();
  const [verTextos, setVerTextos] = useState(false);
  const desligada = ligada === false;
  const cor = tom === 'urgente' ? 'text-urgente' : tom === 'alta' ? 'text-alta' : 'text-caneta';
  const comTexto = (textos ?? []).filter(Boolean);
  return (
    <div className="flex flex-col gap-3 border-t border-linha py-4 first-of-type:border-t-0">
      <div className="flex items-start gap-3">
        <Icone className={`mt-0.5 size-5 shrink-0 ${desligada ? 'text-texto-3' : cor}`} aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 id={`${id}-t`} className={`text-[16px] font-semibold leading-tight ${desligada ? 'text-texto-2' : 'text-texto'}`}>
            {titulo}{desligada && <span className="ml-2 text-[12.5px] font-semibold uppercase tracking-wide text-texto-3">desligado</span>}
          </h3>
          <p className="text-[14px] leading-snug text-texto-2">{quando}</p>
        </div>
        {onLigar && <Chave id={`${id}-c`} rotuloId={`${id}-t`} ligada={!!ligada} disabled={disabled} onMudar={onLigar} />}
      </div>
      {(children || comTexto.length > 0) && (
        <div className="flex flex-col gap-3 pl-8">
          {children}
          {comTexto.length > 0 && (
            <div className="flex flex-col gap-3">
              <button type="button" aria-expanded={verTextos} onClick={() => setVerTextos((v) => !v)}
                className="flex w-fit items-center gap-1 text-[13.5px] font-semibold text-caneta hover:underline">
                <ChevronDown className={`size-4 transition-transform duration-150 ${verTextos ? 'rotate-180' : ''}`} aria-hidden />
                {verTextos ? 'Esconder' : 'Ver e editar'} {comTexto.length === 1 ? 'o texto' : `os ${comTexto.length} textos`}
              </button>
              {verTextos && <div className={`flex flex-col gap-4 ${desligada ? 'opacity-60' : ''}`}>{comTexto}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Opção dentro de um item (ex.: pedir nota junto do concluído). */
function Sub({ rotulo, ligada, disabled, onMudar }: {
  rotulo: string; ligada: boolean; disabled?: boolean; onMudar: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3 rounded-[4px] border border-linha bg-elevada px-3 py-2.5">
      <span id={`${id}-t`} className="text-[14px] text-texto">{rotulo}</span>
      <Chave id={`${id}-c`} rotuloId={`${id}-t`} ligada={ligada} disabled={disabled} onMudar={onMudar} />
    </div>
  );
}

function Numero({ rotulo, unidade, valor, limites: [min, max], disabled, onMudar }: {
  rotulo: string; unidade: string; valor: number; limites: [number, number]; disabled?: boolean; onMudar: (v: number) => void;
}) {
  const id = useId();
  const valido = Number.isInteger(valor) && valor >= min && valor <= max;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2 text-[14px] text-texto-2">
        <label htmlFor={id}>{rotulo}</label>
        <span className="w-24 shrink-0">
          <input id={id} type="number" min={min} max={max} step={1} inputMode="numeric" value={Number.isNaN(valor) ? '' : valor}
            disabled={disabled} aria-invalid={!valido} aria-describedby={`${id}-u`}
            onChange={(e) => onMudar(e.target.value === '' ? Number.NaN : Number(e.target.value))}
            className={`${classeEntrada} tabular ${valido ? '' : 'border-urgente'}`} />
        </span>
        <span id={`${id}-u`}>{unidade}</span>
      </div>
      {!valido && <p className="text-[13px] text-urgente-forte">Use um número de {min} a {max}.</p>}
    </div>
  );
}
