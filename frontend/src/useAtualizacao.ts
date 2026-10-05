import { useCallback, useEffect, useState } from 'react';
import { ErroApi } from './api';

/** Busca dados e repete a cada `intervalo` ms enquanto a aba estiver visível.
 * `buscar` deve ser estável (useCallback): mudar a função recomeça a busca. */
export function useAtualizacao<T>(buscar: () => Promise<T>, intervalo = 5000) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const recarregar = useCallback(async () => {
    try {
      setDados(await buscar());
      setErro(null);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Erro inesperado ao carregar.');
    }
  }, [buscar]);

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- buscar no servidor é sincronizar com sistema externo; o setState vem depois do await
    recarregar();
    if (!intervalo) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') recarregar();
    }, intervalo);
    return () => clearInterval(id);
  }, [recarregar, intervalo]);

  return { dados, erro, recarregar, setDados };
}
