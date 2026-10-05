import { memo, useMemo } from 'react';
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ChevronRight, Lock, ShieldAlert } from 'lucide-react';
import { ETAPAS, FAIXAS, LARGURA_ETAPA, LARGURA_MAPA, LIGACOES, type Etapa } from '../fluxoBot';

export interface EstadoMapa {
  selecionada: string | null;
  contagem: Record<string, number>;
  /** Etapas puladas no momento (ex.: Bairro sem CRAS cadastrado), com o motivo. */
  puladas: Record<string, string>;
  /** Unidade com a confirmação desligada: mostra a ligação direta Relato → Caminho. */
  semConfirmacao?: boolean;
  onAbrir: (id: string) => void;
}

type DadosEtapa = { etapa: Etapa; selecionada: boolean; contagem: number; pulada?: string; onAbrir: (id: string) => void };
type DadosFaixa = { titulo: string; largura: number; altura: number };

const ROTULO_TIPO: Partial<Record<Etapa['tipo'], string>> = { automatico: 'texto automático', fim: 'fim' };

function classeEtapa(etapa: Etapa, selecionada: boolean, pulada: boolean) {
  const base = 'group flex w-full flex-col gap-1.5 rounded-xl border px-3.5 py-3 text-left transition-[border-color,background-color,opacity] duration-150';
  const borda = selecionada
    ? 'border-ambar bg-elevada'
    : etapa.tipo === 'urgente'
      ? 'border-urgente/60 bg-urgente-fundo hover:border-urgente'
      : etapa.tipo === 'fim'
        ? 'border-linha bg-fundo hover:border-linha-forte'
        : 'border-linha-forte bg-superficie hover:border-texto-3';
  return `${base} ${borda} ${pulada ? 'opacity-55' : ''}`;
}

const EtapaNo = memo(function EtapaNo({ data }: NodeProps<Node<DadosEtapa>>) {
  const { etapa, selecionada, contagem, pulada, onAbrir } = data;
  const Icone = etapa.icone;
  const urgente = etapa.tipo === 'urgente';
  return (
    <div style={{ width: LARGURA_ETAPA }}>
      {/* Pontos de ligação invisíveis: o fluxo não é editável, só lido */}
      <Handle type="target" position={Position.Left} id="e" className="!opacity-0" isConnectable={false} />
      <Handle type="target" position={Position.Top} id="t" style={{ left: '28%' }} className="!opacity-0" isConnectable={false} />
      <Handle type="target" position={Position.Bottom} id="b-in" style={{ left: '72%' }} className="!opacity-0" isConnectable={false} />
      <Handle type="source" position={Position.Right} id="d" className="!opacity-0" isConnectable={false} />
      <Handle type="source" position={Position.Bottom} id="b" style={{ left: '28%' }} className="!opacity-0" isConnectable={false} />
      <Handle type="source" position={Position.Top} id="t-out" style={{ left: '72%' }} className="!opacity-0" isConnectable={false} />

      <button type="button" onClick={() => onAbrir(etapa.id)} aria-pressed={selecionada}
        aria-label={`${etapa.titulo}${urgente ? ', urgente' : ''}${contagem ? `, ${contagem} conversa(s) aqui agora` : ''}. Abrir detalhes.`}
        className={classeEtapa(etapa, selecionada, Boolean(pulada))}>
        <span className="flex items-start gap-2">
          <Icone className={`mt-0.5 size-[18px] shrink-0 ${urgente ? 'text-urgente' : selecionada ? 'text-ambar' : 'text-texto-2'}`} aria-hidden />
          <span className="line-clamp-2 min-w-0 flex-1 text-[16px] font-semibold leading-tight text-texto">{etapa.titulo}</span>
        </span>
        <span className="line-clamp-3 text-[13.5px] leading-snug text-texto-2">{pulada ?? etapa.quando}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
          {contagem > 0 && (
            <span className="rounded-full bg-info-fundo px-2 py-0.5 font-medium tabular-nums text-info">{contagem} agora</span>
          )}
          {urgente &&<span className="flex items-center gap-1 font-medium text-urgente"><ShieldAlert className="size-3" aria-hidden />Urgente</span>}
          {etapa.textos.length > 0 && <span className="text-texto-3">{etapa.textos.length} texto{etapa.textos.length > 1 ? 's' : ''}</span>}
          {etapa.editarEm && <span className="text-texto-3">{etapa.editarEm === 'respostas' ? 'respostas por necessidade' : 'unidades'}</span>}
          {ROTULO_TIPO[etapa.tipo] && <span className="text-texto-3">{ROTULO_TIPO[etapa.tipo]}</span>}
          {etapa.travada && <span className="flex items-center gap-1 text-texto-3"><Lock className="size-3" aria-hidden />travada</span>}
          {etapa.opcoes && !etapa.travada && <span className="text-texto-3">ajustável</span>}
          <ChevronRight className="ml-auto size-3.5 text-texto-3 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
        </span>
      </button>
    </div>
  );
});

const FaixaNo = memo(function FaixaNo({ data }: NodeProps<Node<DadosFaixa>>) {
  return (
    <div style={{ width: data.largura, height: data.altura }} className="pointer-events-none rounded-2xl border border-linha/70 bg-superficie/30">
      <p className="px-5 pt-3.5 font-display text-[22px] leading-none tracking-[0.06em] text-texto-3">{data.titulo}</p>
    </div>
  );
});

const tiposNo = { etapa: EtapaNo, faixa: FaixaNo };

export function MapaFluxo({ selecionada, contagem, puladas, semConfirmacao, onAbrir }: EstadoMapa) {
  const nos = useMemo<Node[]>(() => [
    ...FAIXAS.map((f) => ({
      id: `faixa-${f.id}`, type: 'faixa', position: { x: 0, y: f.y }, zIndex: -1, selectable: false, focusable: false,
      data: { titulo: f.titulo, largura: LARGURA_MAPA, altura: f.altura },
    })),
    ...ETAPAS.map((etapa) => ({
      // Nó não arrastável nem selecionável recebe pointer-events: none do React Flow; o clique fica no botão interno
      id: etapa.id, type: 'etapa', position: { x: etapa.x, y: etapa.y }, selectable: false, focusable: false, style: { pointerEvents: 'all' as const },
      data: { etapa, selecionada: selecionada === etapa.id, contagem: contagem[etapa.id] ?? 0, pulada: puladas[etapa.id], onAbrir },
    })),
  ], [selecionada, contagem, puladas, onAbrir]);

  const ligacoes = useMemo<Edge[]>(() => LIGACOES.filter((l) => !l.quando || (l.quando === 'sem_confirmacao' && semConfirmacao)).map((l) => {
    const cor = l.urgente ? 'var(--color-urgente)' : 'var(--color-linha-forte)';
    const ativa = selecionada !== null && (l.de === selecionada || l.para === selecionada);
    const apagada = Boolean(puladas[l.de] || puladas[l.para]);
    return {
      id: `${l.de}-${l.para}`, source: l.de, target: l.para, sourceHandle: l.saida ?? 'd', targetHandle: l.entrada ?? 'e',
      type: 'smoothstep', label: l.rotulo, focusable: false,
      style: { stroke: ativa ? 'var(--color-ambar)' : cor, strokeWidth: ativa ? 2 : 1.5, opacity: apagada && !ativa ? 0.35 : 1,
        strokeDasharray: l.quando ? '6 4' : undefined },
      markerEnd: { type: MarkerType.ArrowClosed, color: ativa ? '#ffc857' : l.urgente ? '#f2564d' : '#3a4252', width: 16, height: 16 },
      labelStyle: { fill: ativa ? 'var(--color-texto)' : 'var(--color-texto-2)', fontSize: 13, fontWeight: 500 },
      labelBgStyle: { fill: 'var(--color-fundo)' },
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 4,
    };
  }), [selecionada, puladas, semConfirmacao]);

  return (
    <div className="mapa-fluxo h-[min(72vh,700px)] min-h-[520px] overflow-hidden rounded-2xl border border-linha bg-fundo">
      <ReactFlow
        nodes={nos}
        edges={ligacoes}
        nodeTypes={tiposNo}
        colorMode="dark"
        fitView
        fitViewOptions={{ padding: 0.03 }}
        minZoom={0.35}
        maxZoom={1.6}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        panOnScroll={false}
        aria-label="Mapa do fluxo do bot: arraste para mover, use os botões para aproximar"
      >
        <Background gap={22} size={1.2} color="#1f2430" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}

/** Mesmo conteúdo do mapa em lista, para telas estreitas (arrastar canvas no celular é ruim). */
export function ListaFluxo({ selecionada, contagem, puladas, onAbrir }: EstadoMapa) {
  return (
    <div className="flex flex-col gap-8">
      {FAIXAS.map((f) => (
        <section key={f.id} aria-labelledby={`lista-${f.id}`}>
          <h3 id={`lista-${f.id}`} className="mb-3 font-display text-[22px] leading-none tracking-[0.05em] text-texto-2">{f.titulo}</h3>
          <ol className="flex flex-col gap-2">
            {ETAPAS.filter((e) => e.faixa === f.id).map((etapa) => {
              const Icone = etapa.icone;
              return (
                <li key={etapa.id}>
                  <button type="button" onClick={() => onAbrir(etapa.id)} aria-pressed={selecionada === etapa.id}
                    className={classeEtapa(etapa, selecionada === etapa.id, Boolean(puladas[etapa.id]))}>
                    <span className="flex items-center gap-2">
                      <Icone className={`size-4 shrink-0 ${etapa.tipo === 'urgente' ? 'text-urgente' : 'text-texto-2'}`} aria-hidden />
                      <span className="flex-1 font-semibold">{etapa.titulo}</span>
                      {(contagem[etapa.id] ?? 0) > 0 && (
                        <span className="rounded-full bg-info-fundo px-2 py-0.5 text-[11px] font-medium tabular-nums text-info">{contagem[etapa.id]} agora</span>
                      )}
                    </span>
                    <span className="text-[13px] leading-snug text-texto-2">{puladas[etapa.id] ?? etapa.quando}</span>
                    {etapa.depois && <span className="text-[12px] text-texto-3">{etapa.depois}</span>}
                    {etapa.travada && <span className="flex items-center gap-1 text-[12px] text-texto-3"><Lock className="size-3" aria-hidden />Travada para todos os CRAS</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
