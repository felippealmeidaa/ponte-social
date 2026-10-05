// Unidades (CRAS/CREAS/Centro POP) e o escopo da conta logada.
import { useCallback } from 'react';
import { api, sessaoSalva } from './api';
import { useAtualizacao } from './useAtualizacao';

export interface UnidadeResumo {
  id: string;
  nome: string;
  tipo: 'CRAS' | 'CREAS' | 'CENTRO_POP';
  ativo: boolean;
}

/** Lista de unidades (para seletores e nomes). Qualquer conta pode ler. */
export function useUnidades() {
  return useAtualizacao(useCallback(() => api<UnidadeResumo[]>('/configuracao/unidades'), []), 0);
}

/** Sufixo ?unidade= para as rotas de configuração. null = padrão da secretaria. */
export const comUnidade = (caminho: string, unidade: string | null) =>
  unidade ? `${caminho}${caminho.includes('?') ? '&' : '?'}unidade=${encodeURIComponent(unidade)}` : caminho;

export function contaAtual() {
  const u = sessaoSalva();
  return {
    unidadeId: u?.unidade_id ?? null,
    coordenacao: u?.role === 'ADMIN',
    geral: u?.role === 'ADMIN' && !u?.unidade_id,
  };
}

export function nomeUnidade(unidades: UnidadeResumo[] | null, id: string | null | undefined) {
  if (!id) return 'Coordenação geral';
  return unidades?.find((u) => u.id === id)?.nome ?? 'Unidade';
}
