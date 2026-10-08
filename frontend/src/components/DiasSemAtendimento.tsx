import { useCallback, useState } from 'react';
import { CalendarOff, Plus, Save, X } from 'lucide-react';
import { api, atualizar, ErroApi } from '../api';
import { contaAtual } from '../unidades';
import { useAtualizacao } from '../useAtualizacao';
import { Aviso, Botao, classeEntrada } from './ui';

// Gestão › Unidades: dias em que a rede não atende além dos feriados nacionais (que já estão no sistema).
// O "aberto agora" do bot e do painel trata esses dias como fechados o dia todo.

interface Dia { data: string; nome: string }

// Mesma lista do backend (services/funcionamento.py, FERIADOS_NACIONAIS)
const NACIONAIS = [
  '1º/1 Confraternização Universal', '21/4 Tiradentes', '1º/5 Dia do Trabalho', '7/9 Independência',
  '12/10 Nossa Senhora Aparecida', '2/11 Finados', '15/11 Proclamação da República', '20/11 Consciência Negra', '25/12 Natal',
];

export function DiasSemAtendimento() {
  const opcoes = useAtualizacao(useCallback(() => api<{ opcoes: { dias_sem_atendimento: Dia[] } }>('/configuracao/fluxo/opcoes'), []), 0);
  const [rascunho, setRascunho] = useState<Dia[] | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const podeEditar = contaAtual().geral;

  const salvos = opcoes.dados?.opcoes.dias_sem_atendimento ?? [];
  const dias = rascunho ?? salvos;
  const mudou = rascunho !== null && JSON.stringify(rascunho) !== JSON.stringify(salvos);
  const invalido = dias.some((d) => !d.data || !d.nome.trim());

  const mudar = (novos: Dia[]) => { setRascunho(novos); setSalvo(false); };
  const salvar = async () => {
    setSalvando(true);
    setFalha(null);
    try {
      const ordenados = [...dias].sort((a, b) => a.data.localeCompare(b.data)).map((d) => ({ data: d.data, nome: d.nome.trim() }));
      opcoes.setDados(await api('/configuracao/fluxo/opcoes', atualizar({ opcoes: { dias_sem_atendimento: ordenados } }, 'PUT')));
      setRascunho(null);
      setSalvo(true);
    } catch (e) {
      setFalha(e instanceof ErroApi ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section aria-labelledby="t-dias-sem" className="flex flex-col gap-3 rounded-[4px] border border-linha bg-superficie p-4">
      <h3 id="t-dias-sem" className="flex items-center gap-2 font-medium"><CalendarOff className="size-4 text-texto-2" aria-hidden />Feriados e dias sem atendimento</h3>
      <p className="text-[13px] text-texto-2">
        Nesses dias o bot e o painel dizem que os lugares estão fechados, e indicam quando abrem de novo. Os feriados
        nacionais já estão no sistema: {NACIONAIS.join(', ')}. Cadastre aqui o que vale só em Anápolis: feriado municipal,
        Sexta-feira Santa, ponto facultativo, recesso.
      </p>
      {opcoes.erro && <Aviso>{opcoes.erro}</Aviso>}
      {dias.length > 0 && (
        <ul className="flex flex-col gap-2">
          {dias.map((d, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor={`dia-${i}`}>Data</label>
              <span className="w-40"><input id={`dia-${i}`} type="date" value={d.data} disabled={!podeEditar}
                onChange={(e) => mudar(dias.map((x, j) => (j === i ? { ...x, data: e.target.value } : x)))} className={`${classeEntrada} tabular`} /></span>
              <label className="sr-only" htmlFor={`nome-${i}`}>O que é</label>
              <input id={`nome-${i}`} value={d.nome} maxLength={80} disabled={!podeEditar} placeholder="Ex.: Aniversário de Anápolis"
                onChange={(e) => mudar(dias.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} className={`${classeEntrada} min-w-0 flex-1`} />
              {podeEditar && (
                <button type="button" aria-label={`Remover ${d.nome || 'dia'}`} onClick={() => mudar(dias.filter((_, j) => j !== i))}
                  className="rounded-[3px] p-1.5 text-texto-3 hover:bg-realce hover:text-urgente"><X className="size-4" aria-hidden /></button>
              )}
            </li>
          ))}
        </ul>
      )}
      {podeEditar && (
        <div className="flex flex-wrap items-center gap-3">
          <Botao tamanho="sm" icone={Plus} onClick={() => mudar([...dias, { data: '', nome: '' }])}>Adicionar dia</Botao>
          {mudou && <Botao tamanho="sm" variante="primario" icone={Save} carregando={salvando} disabled={invalido} onClick={salvar}>Salvar dias</Botao>}
          {mudou && invalido && <span className="text-[13px] text-urgente-forte">Preencha a data e o nome de cada dia.</span>}
          {salvo && <span role="status" className="text-[13px] font-semibold text-ok">Salvo. Já vale no “aberto agora”.</span>}
        </div>
      )}
      {falha && <Aviso>{falha}</Aviso>}
      {!podeEditar && <p className="text-[12.5px] text-texto-3">Só a coordenação geral cadastra os dias sem atendimento.</p>}
    </section>
  );
}
