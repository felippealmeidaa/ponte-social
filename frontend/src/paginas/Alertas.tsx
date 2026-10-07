import { useCallback, useState } from 'react';
import { Save, ShieldAlert } from 'lucide-react';
import { api, atualizar, ErroApi } from '../api';
import { Aviso, Botao, classeEntrada, Esqueleto } from '../components/ui';
import { contaAtual } from '../unidades';
import { useAtualizacao } from '../useAtualizacao';

// Configurações → Alertas: quanto tempo um caso de violência pode esperar sem ninguém atender antes de
// aparecer o aviso na barra do topo.

interface Opcoes { opcoes: { alerta_urgente_min: number } }

export function Alertas() {
  const { dados, erro, setDados } = useAtualizacao(useCallback(() => api<Opcoes>('/configuracao/fluxo/opcoes'), []), 0);
  const [valor, setValor] = useState<string | null>(null);
  const [estado, setEstado] = useState<'livre' | 'salvando' | 'salvo'>('livre');
  const [falha, setFalha] = useState<string | null>(null);
  const podeEditar = contaAtual().coordenacao;

  if (erro) return <Aviso>{erro}</Aviso>;
  if (!dados) return <Esqueleto className="h-40" />;
  const atual = dados.opcoes.alerta_urgente_min;
  const campo = valor ?? String(atual);
  const numero = Number(campo);
  const valido = Number.isInteger(numero) && numero >= 1 && numero <= 240;

  const salvar = async () => {
    setEstado('salvando');
    setFalha(null);
    try {
      setDados(await api<Opcoes>('/configuracao/fluxo/opcoes', atualizar({ opcoes: { alerta_urgente_min: numero } }, 'PUT')));
      setValor(null);
      setEstado('salvo');
    } catch (e) {
      setFalha(e instanceof ErroApi ? e.message : 'Não foi possível salvar.');
      setEstado('livre');
    }
  };

  return (
    <div className="flex max-w-[68ch] flex-col gap-8">
      <section aria-labelledby="t-tempo-alerta" className="flex flex-col gap-3">
        <h2 id="t-tempo-alerta" className="flex items-center gap-2 titulo text-[22px] leading-[1.1]">
          <ShieldAlert className="size-5 text-urgente" aria-hidden />Caso de violência sem atendimento
        </h2>
        <p className="text-[15px] text-texto-2">
          Quando um caso de violência espera mais que este tempo sem ninguém marcar “Em atendimento”, aparece um aviso
          vermelho pequeno na barra do topo de todas as telas e no título da aba, com som opcional (o sininho ao lado do aviso).
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold text-texto-2">Acender o alerta depois de</span>
            <span className="flex items-center gap-2">
              <input type="number" min={1} max={240} step={1} inputMode="numeric" value={campo} disabled={!podeEditar}
                onChange={(e) => { setValor(e.target.value); setEstado('livre'); }}
                className={`${classeEntrada} w-24 tabular`} />
              <span className="text-[15px] text-texto-2">minutos</span>
            </span>
          </label>
          {podeEditar && (
            <Botao variante="primario" icone={Save} carregando={estado === 'salvando'} disabled={!valido || numero === atual} onClick={salvar}>Salvar</Botao>
          )}
          {estado === 'salvo' && <span role="status" className="text-[14px] font-semibold text-ok">Salvo. Já vale no painel.</span>}
        </div>
        {!valido && <p className="text-[13px] text-urgente-forte">Use um número de 1 a 240.</p>}
        {!podeEditar && <p className="text-[13px] text-texto-3">Só a coordenação muda este tempo.</p>}
        {falha && <Aviso>{falha}</Aviso>}
      </section>
    </div>
  );
}
