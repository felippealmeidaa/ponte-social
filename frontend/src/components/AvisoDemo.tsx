import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { api, atualizar, ErroApi } from '../api';
import { contaAtual } from '../unidades';
import { Botao } from './ui';

/** Há casos de exemplo guardados, mas o modo demonstração está desligado: eles ficam fora dos números.
 *  Avisa e, para a coordenação geral, oferece ligar o modo ali mesmo. */
export function AvisoDemoDesligado({ quantos, onLigado }: { quantos: number; onLigado: () => void }) {
  const [ligando, setLigando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  if (!quantos) return null;
  const ligar = async () => {
    setLigando(true);
    setErro(null);
    try {
      await api('/configuracao/fluxo/opcoes', atualizar({ opcoes: { modo_demonstracao: true } }, 'PUT'));
      window.dispatchEvent(new Event('opcoes-painel'));
      onLigado();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível ligar o modo.');
    } finally {
      setLigando(false);
    }
  };
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-[4px] border border-caneta/40 bg-caneta-fundo px-3 py-2.5 text-[14px] text-texto">
      <FlaskConical className="size-4 shrink-0 text-caneta" aria-hidden />
      <span className="min-w-0 flex-1">
        Há <strong className="dado font-semibold">{quantos}</strong> {quantos === 1 ? 'caso de exemplo guardado' : 'casos de exemplo guardados'}, mas o
        modo demonstração está desligado: eles não entram nestes números.
      </span>
      {contaAtual().geral
        ? <Botao tamanho="sm" variante="primario" carregando={ligando} onClick={ligar}>Ligar o modo demonstração</Botao>
        : <span className="text-[13px] text-texto-2">A coordenação geral liga em Gestão › Demonstração.</span>}
      {erro && <span className="w-full text-[13px] text-urgente-forte">{erro}</span>}
    </div>
  );
}
