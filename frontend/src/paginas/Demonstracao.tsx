import { useCallback, useState } from 'react';
import { FlaskConical, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { api, atualizar, enviar, ErroApi } from '../api';
import { Aviso, Botao, Chave, Esqueleto } from '../components/ui';
import { contaAtual } from '../unidades';
import { useAtualizacao } from '../useAtualizacao';

// Gestão › Demonstração: casos fictícios para apresentar o sistema (banca, reunião com o CRAS) sem misturar com os
// reais. Ligado, Indicadores, Mapa e Relatório contam os exemplos e o topo mostra a etiqueta "Demonstração".

interface Situacao { ligado: boolean; exemplos: number; maximo: number }
const QUANTIDADES = [30, 60, 120];

export function Demonstracao() {
  const situacao = useAtualizacao(useCallback(() => api<Situacao>('/demonstracao'), []), 0);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [quantos, setQuantos] = useState(60);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const geral = contaAtual().geral;

  if (situacao.erro) return <Aviso>{situacao.erro}</Aviso>;
  if (!situacao.dados) return <Esqueleto className="h-60" />;
  const { ligado, exemplos, maximo } = situacao.dados;

  const executar = async (qual: string, acao: () => Promise<string>) => {
    setOcupado(qual);
    setFalha(null);
    setMensagem(null);
    try {
      setMensagem(await acao());
      situacao.recarregar();
    } catch (e) {
      setFalha(e instanceof ErroApi ? e.message : 'Não foi possível concluir.');
    } finally {
      setOcupado(null);
    }
  };
  const ligar = (v: boolean) => executar('ligar', async () => {
    await api('/configuracao/fluxo/opcoes', atualizar({ opcoes: { modo_demonstracao: v } }, 'PUT'));
    window.dispatchEvent(new Event('opcoes-painel'));  // a barra do topo mostra ou tira a etiqueta na hora
    return v ? 'Modo demonstração ligado.' : 'Modo demonstração desligado: os números voltam a ser só dos casos reais.';
  });
  const gerar = () => executar('gerar', async () => {
    const r = await api<{ criados: number }>('/demonstracao/gerar', enviar({ quantos }));
    if (!r.criados) return `Já há ${maximo} exemplos, o máximo.`;
    return `${r.criados} casos de exemplo criados nos últimos 30 dias.` + (ligado ? '' : ' Ligue o modo demonstração (acima) para eles aparecerem nos Indicadores, no Mapa, nos Temas e no Relatório.');
  });
  const apagar = () => {
    if (!window.confirm(`Apagar os ${exemplos} casos de exemplo? Os casos reais não são tocados.`)) return;
    executar('apagar', async () => `${(await api<{ apagados: number }>('/demonstracao', { method: 'DELETE' })).apagados} exemplos apagados.`);
  };

  return (
    <div className="flex max-w-[72ch] flex-col gap-8">
      <section aria-labelledby="t-modo" className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <FlaskConical className={`mt-0.5 size-5 shrink-0 ${ligado ? 'text-caneta' : 'text-texto-3'}`} aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id="t-modo" className="titulo text-[22px] leading-[1.1]">Modo demonstração</h2>
            <p className="text-[14.5px] text-texto-2">
              Para apresentar o sistema com dados cheios. Ligado, a Fila, os Indicadores, o Mapa de demandas, os Temas dos
              relatos e o Relatório mensal passam a incluir os casos de exemplo, e todas as telas mostram a etiqueta
              “Demonstração” no topo. Desligado, tudo volta a mostrar só os casos reais.
            </p>
          </div>
          <Chave id="modo-demo" rotuloId="t-modo" ligada={ligado} disabled={!geral || ocupado !== null} onMudar={ligar} />
        </div>
      </section>

      <section aria-labelledby="t-exemplos" className="flex flex-col gap-3 border-t border-linha pt-6">
        <h2 id="t-exemplos" className="text-[16px] font-semibold">Casos de exemplo</h2>
        <p className="text-[14.5px] text-texto-2">
          Agora: <strong className="dado font-semibold text-texto">{exemplos}</strong> {exemplos === 1 ? 'caso' : 'casos'} de exemplo
          {' '}(máximo {maximo}). São relatos inventados, com necessidades, bairros, situações, notas e horários marcados
          variados, espalhados nos últimos 30 dias. Com o modo ligado, aparecem também na fila, com o canal “Exemplo”; desligado, somem de todas as telas (ficam guardados até você apagar).
        </p>
        {geral && (
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="demo-quantos" className="text-[14px] text-texto-2">Criar</label>
            <select id="demo-quantos" value={quantos} onChange={(e) => setQuantos(Number(e.target.value))}
              className="rounded-[3px] border border-linha-forte bg-superficie px-2 py-1.5 text-[14px]">
              {QUANTIDADES.map((n) => <option key={n} value={n}>{n} casos</option>)}
            </select>
            <Botao icone={Plus} carregando={ocupado === 'gerar'} disabled={ocupado !== null || exemplos >= maximo} onClick={gerar}>Gerar exemplos</Botao>
            <Botao variante="perigo" icone={Trash2} carregando={ocupado === 'apagar'} disabled={ocupado !== null || !exemplos} onClick={apagar}>Apagar exemplos</Botao>
          </div>
        )}
        {mensagem && <p role="status" className="text-[14px] font-semibold text-ok">{mensagem}</p>}
        {falha && <Aviso>{falha}</Aviso>}
      </section>

      <p className="flex items-start gap-2 text-[13.5px] leading-snug text-texto-2">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
        Caso de exemplo nunca recebe mensagem pelo WhatsApp, nunca entra no treino da IA, e “Apagar exemplos” só remove
        casos de exemplo.
      </p>
      {!geral && <p className="text-[13.5px] text-texto-3">Só a coordenação geral liga o modo e cria ou apaga exemplos.</p>}
    </div>
  );
}
