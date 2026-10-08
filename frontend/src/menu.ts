import {
  BarChart3, Bell, Layers, Bot, BrainCircuit, Database, FlaskConical, GitBranch, Library, Inbox, LineChart, MessageCircle, Settings2, Building2, FileText, ListOrdered, MessagesSquare, NotebookPen, Smartphone, Sparkles, UsersRound, Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { Rota } from './navegacao';

// Menu do painel: uma gaveta aberta pelo botão ☰, com as telas agrupadas por assunto.
// Cada item é um endereço (#/rota/parametro); os subitens levam direto a uma aba ou a um filtro.
export interface ItemMenu {
  rota: Rota;
  parametro?: string;
  rotulo: string;
  icone: LucideIcon;
  /** Número ao lado (casos, mensagens novas); "urgente" pinta de vermelho. */
  contagem?: number;
  urgente?: boolean;
  subitens?: Omit<ItemMenu, 'icone' | 'subitens'>[];
}

export interface GrupoMenu {
  titulo: string;
  /** O que tem dentro, em poucas palavras (aparece sob o tópico). */
  resumo: string;
  icone: LucideIcon;
  itens: ItemMenu[];
}

export interface Contagens {
  urgentes: number;
  aguardando: number;
  emAtendimento: number;
  naoLidas: number;
}

export function montarMenu(c: Contagens, geral: boolean): GrupoMenu[] {
  return [
    {
      titulo: 'Atendimento', resumo: 'Fila de casos e conversas', icone: Inbox,
      itens: [
        {
          rota: 'fila', rotulo: 'Fila de casos', icone: ListOrdered, subitens: [
            { rota: 'fila', parametro: 'URGENTE_CREAS', rotulo: 'Urgentes', contagem: c.urgentes, urgente: c.urgentes > 0 },
            { rota: 'fila', parametro: 'PENDENTE', rotulo: 'Aguardando', contagem: c.aguardando },
            { rota: 'fila', parametro: 'EM_ATENDIMENTO', rotulo: 'Em atendimento', contagem: c.emAtendimento },
          ],
        },
        { rota: 'conversas', rotulo: 'Conversas', icone: MessagesSquare, contagem: c.naoLidas },
      ],
    },
    {
      titulo: 'Indicadores', resumo: 'Números, temas dos relatos e relatório do mês', icone: LineChart,
      itens: [
        { rota: 'indicadores', rotulo: 'Painel de indicadores', icone: BarChart3 },
        { rota: 'indicadores', parametro: 'temas', rotulo: 'Temas dos relatos', icone: Layers },
        { rota: 'indicadores', parametro: 'relatorio', rotulo: 'Relatório do mês', icone: FileText },
      ],
    },
    {
      titulo: 'Bot do WhatsApp', resumo: 'O que o cidadão recebe e a conexão', icone: MessageCircle,
      itens: [
        { rota: 'servicos', parametro: 'fluxo', rotulo: 'Fluxo da conversa', icone: Workflow },
        { rota: 'servicos', parametro: 'respostas', rotulo: 'Respostas por necessidade', icone: NotebookPen },
        { rota: 'configuracoes', parametro: 'testar', rotulo: 'Testar o bot', icone: Bot },
        { rota: 'configuracoes', parametro: 'whatsapp', rotulo: 'Conexão do WhatsApp', icone: Smartphone },
      ],
    },
    {
      titulo: 'Classificação', resumo: 'Modelo que identifica a necessidade', icone: BrainCircuit,
      itens: [
        { rota: 'configuracoes', parametro: 'modelo', rotulo: 'Modelo de IA', icone: BrainCircuit },
        { rota: 'configuracoes', parametro: 'dados', rotulo: 'Dados de treino', icone: Database },
      ],
    },
    {
      titulo: 'Laboratório de IA', resumo: 'Só no painel, não chega ao WhatsApp', icone: FlaskConical,
      itens: [
        { rota: 'configuracoes', parametro: 'base', rotulo: 'Base de conhecimento', icone: Library },
        { rota: 'configuracoes', parametro: 'agentes', rotulo: 'Agentes de IA', icone: Sparkles },
        { rota: 'configuracoes', parametro: 'fluxos', rotulo: 'Fluxos (simulador)', icone: GitBranch },
      ],
    },
    {
      titulo: 'Gestão', resumo: 'Unidades, equipe, alertas e demonstração', icone: Settings2,
      itens: [
        ...(geral ? [{ rota: 'servicos' as Rota, parametro: 'unidades', rotulo: 'Unidades de atendimento', icone: Building2 }] : []),
        { rota: 'configuracoes', parametro: 'equipe', rotulo: 'Equipe e acesso', icone: UsersRound },
        { rota: 'configuracoes', parametro: 'alertas', rotulo: 'Alertas', icone: Bell },
        ...(geral ? [{ rota: 'configuracoes' as Rota, parametro: 'demonstracao', rotulo: 'Demonstração', icone: FlaskConical }] : []),
      ],
    },
  ];
}

// Aba que cada tela abre quando o endereço não diz qual
const PADRAO: Partial<Record<Rota, string>> = { servicos: 'fluxo', configuracoes: 'whatsapp' };

export const endereco = (rota: Rota, parametro?: string) => (parametro ? `#/${rota}/${encodeURIComponent(parametro)}` : `#/${rota}`);

/** O item do menu correspondente ao endereço atual (para marcar no menu e mostrar no cabeçalho). */
export function itemAtual(grupos: GrupoMenu[], rota: Rota, parametro?: string): { grupo: string; item: string; sub?: string } | null {
  const p = parametro ?? PADRAO[rota];
  for (const g of grupos) {
    for (const i of g.itens) {
      const sub = i.subitens?.find((s) => s.rota === rota && s.parametro === p);
      if (sub) return { grupo: g.titulo, item: i.rotulo, sub: sub.rotulo };
      if (i.rota === rota && (i.parametro ?? PADRAO[rota]) === p) return { grupo: g.titulo, item: i.rotulo };
    }
  }
  // Conversa aberta, ficha etc.: fica marcado o item principal da tela
  for (const g of grupos) {
    const i = g.itens.find((x) => x.rota === rota && !x.parametro);
    if (i) return { grupo: g.titulo, item: i.rotulo };
  }
  return null;
}

