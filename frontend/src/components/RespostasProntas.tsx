import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquareText, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api, atualizar, enviar, ErroApi } from '../api';
import { contaAtual } from '../unidades';
import { useAtualizacao } from '../useAtualizacao';
import { Aviso, Botao, classeEntrada } from './ui';

// Respostas prontas em Conversas: o atendente escolhe um modelo, ele cai na caixa de texto e pode ser ajustado
// antes de enviar. A coordenação cria e edita aqui mesmo (as da secretaria valem para todos os CRAS).

interface Pronta { id: string; titulo: string; texto: string; ordem: number; da_secretaria: boolean }

export function RespostasProntas({ onEscolher }: { onEscolher: (texto: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);

  return (
    <div ref={caixa} className="relative">
      <Botao type="button" variante="secundario" icone={MessageSquareText} aria-expanded={aberto} onClick={() => setAberto((a) => !a)}
        title="Respostas prontas">
        <span className="max-sm:sr-only">Respostas prontas</span>
      </Botao>
      {aberto && <Painel onEscolher={(t) => { onEscolher(t); setAberto(false); }} />}
    </div>
  );
}

function Painel({ onEscolher }: { onEscolher: (texto: string) => void }) {
  const { dados, erro, recarregar } = useAtualizacao(useCallback(() => api<Pronta[]>('/atendimento/respostas-prontas'), []), 0);
  const [editando, setEditando] = useState<Pronta | 'nova' | null>(null);
  const podeEditar = contaAtual().coordenacao;

  return (
    <div role="dialog" aria-label="Respostas prontas"
      className="absolute bottom-full right-0 z-30 mb-2 flex max-h-[60vh] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[6px] border border-linha-forte bg-superficie shadow-[0_16px_36px_-16px_rgb(27_39_51/0.45)]">
      <div className="flex items-center justify-between gap-2 border-b border-linha px-3.5 py-2.5">
        <p className="text-[13.5px] font-semibold">Respostas prontas</p>
        {podeEditar && !editando && <Botao tamanho="sm" variante="fantasma" icone={Plus} onClick={() => setEditando('nova')}>Nova</Botao>}
      </div>
      {editando ? (
        <Formulario item={editando === 'nova' ? null : editando} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); recarregar(); }} />
      ) : (
        <ul className="overflow-y-auto py-1">
          {erro && <li className="px-3.5 py-2"><Aviso>{erro}</Aviso></li>}
          {dados?.map((p) => (
            <li key={p.id} className="group flex items-start gap-1 px-1.5">
              <button type="button" onClick={() => onEscolher(p.texto)}
                className="min-w-0 flex-1 rounded-[5px] px-2 py-2 text-left hover:bg-elevada focus-visible:bg-elevada">
                <span className="block text-[14px] font-semibold">{p.titulo}</span>
                <span className="line-clamp-2 text-[13px] leading-snug text-texto-2">{p.texto}</span>
              </button>
              {podeEditar && (
                <button type="button" onClick={() => setEditando(p)} aria-label={`Editar ${p.titulo}`}
                  className="mt-1.5 rounded-[5px] p-1.5 text-texto-3 opacity-0 hover:bg-elevada hover:text-texto group-hover:opacity-100 focus-visible:opacity-100">
                  <Pencil className="size-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
          {dados?.length === 0 && <li className="px-3.5 py-3 text-[13.5px] text-texto-3">Nenhuma resposta pronta ainda.</li>}
        </ul>
      )}
      <p className="border-t border-linha px-3.5 py-2 text-[12px] text-texto-3">O texto cai na caixa de mensagem: dá para ajustar antes de enviar.</p>
    </div>
  );
}

function Formulario({ item, onFechar, onSalvo }: { item: Pronta | null; onFechar: () => void; onSalvo: () => void }) {
  const [titulo, setTitulo] = useState(item?.titulo ?? '');
  const [texto, setTexto] = useState(item?.texto ?? '');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = async () => {
    setOcupado(true);
    setErro(null);
    try {
      const corpo = { titulo: titulo.trim(), texto: texto.trim(), ordem: item?.ordem ?? 99 };
      await api(item ? `/atendimento/respostas-prontas/${item.id}` : '/atendimento/respostas-prontas', item ? atualizar(corpo, 'PUT') : enviar(corpo));
      onSalvo();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível salvar.');
    } finally {
      setOcupado(false);
    }
  };

  const apagar = async () => {
    if (!item) return;
    setOcupado(true);
    try {
      await api(`/atendimento/respostas-prontas/${item.id}`, { method: 'DELETE' });
      onSalvo();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível apagar.');
      setOcupado(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5 overflow-y-auto p-3.5">
      <label className="flex flex-col gap-1">
        <span className="text-[12.5px] font-medium text-texto-2">Nome (só a equipe vê)</span>
        <input value={titulo} maxLength={80} onChange={(e) => setTitulo(e.target.value)} className={`${classeEntrada} h-9 py-1 text-[14px]`} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[12.5px] font-medium text-texto-2">Mensagem</span>
        <textarea rows={4} value={texto} maxLength={2000} onChange={(e) => setTexto(e.target.value)} className={`${classeEntrada} resize-y text-[14px]`} />
      </label>
      {item?.da_secretaria && <p className="text-[12px] text-texto-3">Da secretaria: vale para todos os CRAS.</p>}
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex flex-wrap items-center gap-2">
        <Botao tamanho="sm" variante="primario" carregando={ocupado} disabled={titulo.trim().length < 2 || texto.trim().length < 2} onClick={salvar}>Salvar</Botao>
        <Botao tamanho="sm" variante="fantasma" icone={X} onClick={onFechar}>Cancelar</Botao>
        {item && <Botao tamanho="sm" variante="perigo" icone={Trash2} disabled={ocupado} onClick={apagar} className="ml-auto">Apagar</Botao>}
      </div>
    </div>
  );
}
