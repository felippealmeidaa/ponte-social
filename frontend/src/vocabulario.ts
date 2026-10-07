// Vocabulário único do sistema: os mesmos nomes e cores de estado em todas as telas.
import {
  Accessibility, Briefcase, CircleHelp, ClipboardList, FileText, HandCoins, House, ShieldAlert, Utensils, type LucideIcon,
} from 'lucide-react';

export const CATEGORIAS: Record<string, string> = {
  violencia_protecao: 'Violência ou ameaça',
  renda_beneficio: 'Renda e benefícios',
  cadastro_atualizacao: 'Cadastro Único',
  moradia: 'Moradia',
  documentacao: 'Documentos',
  alimentacao: 'Alimentação',
  pessoa_idosa_pcd: 'Pessoa idosa ou com deficiência',
  trabalho_renda: 'Trabalho e cursos',
  nao_identificado: 'Não identificado',
};

export type Tom = 'urgente' | 'alta' | 'media' | 'neutro' | 'ok' | 'info' | 'caneta';

export const ESTADOS: Record<string, { rotulo: string; tom: Tom }> = {
  URGENTE_CREAS: { rotulo: 'Urgente', tom: 'urgente' },
  PENDENTE: { rotulo: 'Aguardando', tom: 'media' },
  EM_ATENDIMENTO: { rotulo: 'Em atendimento', tom: 'ok' },
  ENCAMINHADO_CREAS: { rotulo: 'Encaminhado ao CREAS', tom: 'info' },
  CONCLUIDO: { rotulo: 'Concluído', tom: 'ok' },
  ARQUIVADO: { rotulo: 'Arquivado', tom: 'neutro' },
};

export const ORDEM_ESTADOS = ['URGENTE_CREAS', 'PENDENTE', 'EM_ATENDIMENTO', 'ENCAMINHADO_CREAS', 'CONCLUIDO', 'ARQUIVADO'];

export const PRIORIDADES: Record<string, { rotulo: string; tom: Tom }> = {
  URGENTE_VIOLENCIA: { rotulo: 'Urgente', tom: 'urgente' },
  ALTA: { rotulo: 'Alta', tom: 'alta' },
  MEDIA: { rotulo: 'Média', tom: 'media' },
  BAIXA: { rotulo: 'Baixa', tom: 'neutro' },
};

export const CANAIS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  web: 'Painel',
  presencial: 'Presencial',
  demo: 'Exemplo',
  simulador: 'Simulador',
  evolution: 'WhatsApp',
  meta: 'WhatsApp oficial',
};

export function nomeCategoria(chave: string) {
  return CATEGORIAS[chave] ?? chave;
}

export function tempoDesde(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
}

export function dataHora(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Ícone de cada necessidade (o mesmo na Fila, nas Respostas e nos Indicadores). */
export const ICONE_CATEGORIA: Record<string, LucideIcon> = {
  renda_beneficio: HandCoins,
  cadastro_atualizacao: ClipboardList,
  moradia: House,
  documentacao: FileText,
  alimentacao: Utensils,
  pessoa_idosa_pcd: Accessibility,
  trabalho_renda: Briefcase,
  violencia_protecao: ShieldAlert,
  nao_identificado: CircleHelp,
};

/** Cor de cada necessidade (variável do tema; muda sozinha no modo escuro). */
export const COR_CATEGORIA: Record<string, string> = {
  renda_beneficio: 'var(--color-cat-renda)',
  cadastro_atualizacao: 'var(--color-cat-cadastro)',
  moradia: 'var(--color-cat-moradia)',
  documentacao: 'var(--color-cat-documentos)',
  alimentacao: 'var(--color-cat-alimentacao)',
  pessoa_idosa_pcd: 'var(--color-cat-idosa)',
  trabalho_renda: 'var(--color-cat-trabalho)',
  violencia_protecao: 'var(--color-cat-violencia)',
  nao_identificado: 'var(--color-cat-outro)',
};

export const corCategoria = (c: string) => COR_CATEGORIA[c] ?? 'var(--color-cat-outro)';

/** Minutos como "45 min", "2 h 10 min" ou "3 dias". */
export function duracao(min: number) {
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;
  const d = Math.round(min / 1440);
  return `${d} dia${d > 1 ? 's' : ''}`;
}
