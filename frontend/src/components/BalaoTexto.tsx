import { useState } from 'react';
import { Pencil, RotateCcw, Save } from 'lucide-react';
import { api, atualizar, enviar, ErroApi } from '../api';
import { comUnidade } from '../unidades';
import { dataHora } from '../vocabulario';
import { Aviso, Botao } from './ui';

// Mensagem do bot no balão do WhatsApp, editada ali mesmo. Usada no Fluxo da conversa e em Gestão › Alertas.

export interface TextoBot {
  chave: string;
  descricao: string;
  texto: string;
  padrao: string;
  personalizado: boolean;
  atualizado_em: string | null;
  atualizado_por: string | null;
}

/** Onde o texto é salvo (CRAS ou secretaria) e se quem está vendo pode mudar. */
export interface Contexto {
  unidade: string | null;
  podeEditar: boolean;
}

/** Negrito do WhatsApp (*assim*) na prévia. */
export function whatsapp(texto: string) {
  return texto.split(/(\*[^*\n]+\*)/g).map((parte, i) =>
    parte.length > 2 && parte.startsWith('*') && parte.endsWith('*') ? <strong key={i} className="font-semibold">{parte.slice(1, -1)}</strong> : parte,
  );
}

/** A caixa de edição cresce com o texto, como o próprio balão. */
function crescer(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

/** Uma mensagem do bot no balão do WhatsApp, editada ali mesmo. */
export function BalaoTexto({ texto, ctx, onSalvo }: { texto: TextoBot; ctx: Contexto; onSalvo: () => void }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(texto.texto);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const executar = async (caminho: string, opcoes: RequestInit) => {
    setSalvando(true);
    setErro(null);
    try {
      await api(comUnidade(caminho, ctx.unidade), opcoes);
      setSalvo(true);
      setEditando(false);
      onSalvo();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  // No CRAS, "voltar" apaga a personalização; na secretaria, volta ao texto original do sistema
  const podeVoltar = ctx.unidade ? texto.personalizado : texto.texto !== texto.padrao;
  const id = `texto-${texto.chave}`;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex flex-wrap items-baseline gap-x-2 pl-2 text-[12.5px] text-whats-2">
        <label htmlFor={editando ? id : undefined}>{texto.descricao}</label>
        {ctx.unidade && texto.personalizado && <span className="font-semibold text-caneta">personalizado neste CRAS</span>}
      </p>
      {editando ? (
        <div className="balao-whats ml-2 max-w-[560px] p-1.5 ring-2 ring-caneta/45">
          <textarea id={id} ref={crescer} autoFocus value={valor} rows={3}
            onChange={(e) => { setValor(e.target.value); crescer(e.target); }}
            className="w-full resize-none overflow-hidden rounded-[4px] bg-transparent px-1.5 py-1 text-[14.5px] leading-[1.45] text-whats-texto focus:outline-none" />
        </div>
      ) : (
        <div className="balao-whats ml-2 max-w-[560px] whitespace-pre-wrap px-3 py-2 text-[14.5px] leading-[1.45]">{whatsapp(texto.texto)}</div>
      )}
      {erro && <div className="ml-2 max-w-[560px]"><Aviso>{erro}</Aviso></div>}
      {ctx.podeEditar && (
        <div className="ml-2 flex flex-wrap items-center gap-2 pt-0.5">
          {editando ? (
            <>
              <Botao tamanho="sm" variante="primario" icone={Save} carregando={salvando} disabled={valor === texto.texto}
                onClick={() => executar(`/configuracao/textos/${texto.chave}`, atualizar({ texto: valor }, 'PUT'))}>
                {ctx.unidade ? 'Salvar para este CRAS' : 'Salvar'}
              </Botao>
              <Botao tamanho="sm" variante="fantasma" onClick={() => { setEditando(false); setValor(texto.texto); setErro(null); }}>Cancelar</Botao>
              <span className="text-[12.5px] text-whats-2">Use *asteriscos* para negrito.</span>
            </>
          ) : (
            <>
              <Botao tamanho="sm" icone={Pencil} onClick={() => { setEditando(true); setSalvo(false); }}>Editar texto</Botao>
              {podeVoltar && (
                <Botao tamanho="sm" variante="fantasma" icone={RotateCcw} carregando={salvando}
                  onClick={() => executar(`/configuracao/textos/${texto.chave}/restaurar`, enviar({}))}>
                  {ctx.unidade ? 'Voltar ao padrão da secretaria' : 'Voltar ao original'}
                </Botao>
              )}
              {salvo && <span role="status" className="text-[12.5px] font-semibold text-ok">Salvo. Já vale nas próximas conversas.</span>}
              {!salvo && texto.atualizado_em && (
                <span className="text-[12.5px] text-whats-2">Alterado em {dataHora(texto.atualizado_em)}{texto.atualizado_por ? ` por ${texto.atualizado_por}` : ''}</span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
