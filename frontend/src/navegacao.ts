export type Rota = 'fila' | 'conversas' | 'indicadores' | 'servicos' | 'configuracoes';

export function irPara(rota: Rota, parametro?: string) {
  window.location.hash = parametro ? `/${rota}/${encodeURIComponent(parametro)}` : `/${rota}`;
}
