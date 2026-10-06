import { useState } from 'react';
import { BellRing, CalendarClock, CalendarX } from 'lucide-react';
import { api, enviar, ErroApi } from '../api';
import type { Triagem } from '../tipos';
import { Aviso, Botao, classeEntrada } from './ui';

// Marcar o atendimento: a pessoa recebe a confirmação pelo WhatsApp e, se for com antecedência, um lembrete
// na véspera. Em violência o horário fica só registrado (nada vai para o celular da pessoa).

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

function descrever(iso: string) {
  const d = new Date(iso);
  const hora = d.getMinutes() ? `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}` : `${d.getHours()}h`;
  return `${DIAS[d.getDay()]}, ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, às ${hora}`;
}

const hojeISO = () => new Date().toLocaleDateString('sv-SE');

type ResultadoAviso = { enviado: boolean; motivo: string | null } | null;

export function AgendamentoCaso({ caso, podeAvisar, violencia, onAlterado }: {
  caso: Triagem; podeAvisar: boolean; violencia: boolean; onAlterado: (t: Triagem) => void;
}) {
  const [editando, setEditando] = useState(!caso.agendado_para);
  const [dia, setDia] = useState('');
  const [hora, setHora] = useState('09:00');
  const [local, setLocal] = useState(caso.agendado_local ?? '');
  const [avisar, setAvisar] = useState(true);
  const [ocupado, setOcupado] = useState<'marcar' | 'desmarcar' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<ResultadoAviso>(null);

  const marcar = async () => {
    setOcupado('marcar');
    setErro(null);
    try {
      const r = await api<{ triagem: Triagem; aviso: ResultadoAviso }>(`/triagem/${caso.id}/agendamento`,
        enviar({ quando: `${dia}T${hora}`, local: local.trim() || null, avisar: podeAvisar && avisar }));
      setAviso(r.aviso);
      setEditando(false);
      onAlterado(r.triagem);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível marcar.');
    } finally {
      setOcupado(null);
    }
  };

  const desmarcar = async () => {
    setOcupado('desmarcar');
    setErro(null);
    try {
      const r = await api<{ triagem: Triagem; aviso: ResultadoAviso }>(`/triagem/${caso.id}/agendamento?avisar=${podeAvisar}`, { method: 'DELETE' });
      setAviso(r.aviso);
      setEditando(true);
      onAlterado(r.triagem);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível desmarcar.');
    } finally {
      setOcupado(null);
    }
  };

  return (
    <section aria-labelledby="t-agenda">
      <h3 id="t-agenda" className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-texto-2">
        <CalendarClock className="size-3.5" aria-hidden />Atendimento marcado
      </h3>
      {caso.agendado_para && !editando ? (
        <div className="flex flex-col gap-2 rounded-[5px] border border-caneta/25 bg-caneta-fundo/60 px-4 py-3">
          <p className="text-[15px]"><strong className="font-semibold">{descrever(caso.agendado_para)}</strong>{caso.agendado_local && <> no {caso.agendado_local}</>}</p>
          <p className="text-[12.5px] text-texto-2">
            Marcado por {caso.agendado_por ?? 'equipe'}.{' '}
            {violencia ? 'Sem mensagem para a pessoa (caso de violência).'
              : caso.lembrete_enviado_em ? 'Lembrete da véspera enviado.' : podeAvisar ? 'A pessoa recebe um lembrete na véspera.' : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            <Botao tamanho="sm" icone={CalendarClock} onClick={() => { setEditando(true); setDia(''); }}>Remarcar</Botao>
            <Botao tamanho="sm" variante="fantasma" icone={CalendarX} carregando={ocupado === 'desmarcar'} onClick={desmarcar}>Desmarcar</Botao>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
            <label className="flex flex-col gap-1">
              <span className="text-[12.5px] font-medium text-texto-2">Dia</span>
              <input type="date" min={hojeISO()} value={dia} onChange={(e) => setDia(e.target.value)} className={`${classeEntrada} h-9 py-1 text-[14px]`} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12.5px] font-medium text-texto-2">Hora</span>
              <input type="time" step={900} value={hora} onChange={(e) => setHora(e.target.value)} className={`${classeEntrada} h-9 py-1 text-[14px]`} />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[12.5px] font-medium text-texto-2">Onde</span>
            <input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="CRAS do caso (deixe em branco para usar o endereço cadastrado)"
              maxLength={160} className={`${classeEntrada} h-9 py-1 text-[14px]`} />
          </label>
          {podeAvisar && (
            <label className="flex items-start gap-2 text-[13px] text-texto-2">
              <input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-caneta)]" />
              <span><BellRing className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />Avisar pelo WhatsApp agora (com link para salvar na agenda do celular) e lembrar na véspera</span>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <Botao tamanho="sm" variante="primario" icone={CalendarClock} disabled={!dia || !hora} carregando={ocupado === 'marcar'} onClick={marcar}>
              {caso.agendado_para ? 'Salvar novo horário' : 'Marcar atendimento'}
            </Botao>
            {caso.agendado_para && <Botao tamanho="sm" variante="fantasma" onClick={() => setEditando(false)}>Cancelar</Botao>}
          </div>
        </div>
      )}
      {aviso?.enviado && <p role="status" className="mt-2 text-[13px] font-semibold text-ok">A pessoa foi avisada pelo WhatsApp.</p>}
      {aviso && !aviso.enviado && aviso.motivo === 'falha_no_envio' && <div className="mt-2"><Aviso tom="info">Salvo, mas a mensagem não saiu pelo WhatsApp. Confira a conexão.</Aviso></div>}
      {erro && <div className="mt-2"><Aviso>{erro}</Aviso></div>}
    </section>
  );
}
