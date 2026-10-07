import { useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { CHAVE_AVISOS, notificar } from '../avisosUrgentes';

// Aviso do sistema (notificação do computador) para casos de violência: quando chega um novo e quando um
// fica parado além do tempo do alerta. Funciona com o painel em outra aba ou minimizado. A pessoa liga no
// cabeçalho (o navegador pede permissão uma vez); a escolha fica neste navegador.

export function BotaoAvisos({ ligado, onMudar }: { ligado: boolean; onMudar: (v: boolean) => void }) {
  const [negado, setNegado] = useState(false);
  if (typeof Notification === 'undefined') return null;

  const alternar = async () => {
    if (ligado) {
      onMudar(false);
      try { localStorage.setItem(CHAVE_AVISOS, '0'); } catch { /* só nesta aba */ }
      return;
    }
    const permissao = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permissao !== 'granted') {
      setNegado(true);
      return;
    }
    onMudar(true);
    try { localStorage.setItem(CHAVE_AVISOS, '1'); } catch { /* só nesta aba */ }
    notificar('Avisos ligados', 'Você será avisado quando chegar ou ficar parado um caso de violência.', 'teste');
  };

  return (
    <button type="button" onClick={alternar} aria-pressed={ligado}
      title={negado ? 'O navegador bloqueou as notificações. Libere nas configurações do site.' : ligado ? 'Desligar avisos no computador' : 'Avisar no computador quando chegar um caso de violência'}
      className="mb-1 inline-flex items-center gap-1.5 rounded-[3px] px-2 py-1.5 text-[13.5px] text-sobre-topo-2 transition-colors duration-150 hover:bg-sobre-topo/10 hover:text-sobre-topo">
      {ligado ? <Bell className="size-4" aria-hidden /> : <BellOff className="size-4" aria-hidden />}
      {negado ? 'Avisos bloqueados' : ligado ? 'Avisos ligados' : 'Ligar avisos'}
    </button>
  );
}
