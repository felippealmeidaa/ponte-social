import { useCallback, useEffect, useState } from 'react';
import { Check, FileText, Lock, RotateCcw, X, ZoomIn } from 'lucide-react';
import { api, arquivoProtegido, enviar, ErroApi } from '../api';
import { useAtualizacao } from '../useAtualizacao';
import { dataHora } from '../vocabulario';
import { Aviso, Botao, classeEntrada } from './ui';

interface Documento {
  id: string;
  criado_em: string;
  mime: string;
  tamanho: number;
  largura: number | null;
  altura: number | null;
  situacao: 'legivel' | 'refazer' | null;
  motivo: string | null;
  revisado_por: string | null;
}

const MOTIVOS = [
  'A foto está ilegível ou borrada',
  'O documento saiu cortado',
  'Falta o verso do documento',
  'Não é o documento solicitado',
  'O documento está vencido',
];

export function DocumentosDoCaso({ casoId, quantidade }: { casoId: string; quantidade: number }) {
  const docs = useAtualizacao(useCallback(() => api<Documento[]>(`/triagem/${casoId}/documentos`), [casoId]), quantidade ? 15000 : 0);
  const [ampliado, setAmpliado] = useState<{ url: string; mime: string } | null>(null);

  if (!quantidade && !docs.dados?.length) return null;
  const lista = docs.dados ?? [];
  const aConferir = lista.filter((d) => !d.situacao).length;

  return (
    <section aria-labelledby="t-docs" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-linha pb-2">
        <h3 id="t-docs" className="text-[13px] font-semibold text-texto-2 uppercase tracking-wide flex items-center gap-2">
          Documentos Enviados ({lista.length || quantidade})
          {aConferir > 0 && <span className="mono text-[11px] font-bold text-marca bg-marca-bg border border-marca/30 px-2 py-0.2 rounded-full">{aConferir} a conferir</span>}
        </h3>
        <p className="flex items-center gap-1.5 text-[11.5px] text-texto-3">
          <Lock className="size-3 text-marca" /> Acesso auditado e criptografado
        </p>
      </div>

      {docs.erro && <Aviso>{docs.erro}</Aviso>}
      
      <ul className="grid gap-3 sm:grid-cols-2">
        {lista.map((d, i) => (
          <ItemDocumento key={d.id} casoId={casoId} doc={d} numero={i + 1} onAmpliar={setAmpliado} onRevisado={docs.recarregar} />
        ))}
      </ul>
      
      {ampliado && <Ampliado {...ampliado} onFechar={() => setAmpliado(null)} />}
    </section>
  );
}

function ItemDocumento({ casoId, doc, numero, onAmpliar, onRevisado }: {
  casoId: string; doc: Documento; numero: number; onAmpliar: (a: { url: string; mime: string }) => void; onRevisado: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pedindo, setPedindo] = useState(false);
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [salvando, setSalvando] = useState(false);
  const imagem = doc.mime.startsWith('image/') && doc.mime !== 'image/heic' && doc.mime !== 'image/heif';

  useEffect(() => {
    let ativo = true;
    let criado: string | null = null;
    arquivoProtegido(`/triagem/${casoId}/documentos/${doc.id}/arquivo`)
      .then((u) => { criado = u; if (ativo) setUrl(u); else URL.revokeObjectURL(u); })
      .catch(() => { if (ativo) setErro('Não foi possível carregar.'); });
    return () => { ativo = false; if (criado) URL.revokeObjectURL(criado); };
  }, [casoId, doc.id]);

  const revisar = async (situacao: 'legivel' | 'refazer') => {
    setSalvando(true);
    setErro(null);
    try {
      const r = await api<{ pedido_enviado: boolean | null }>(`/triagem/${casoId}/documentos/${doc.id}/revisao`,
        enviar({ situacao, motivo: situacao === 'refazer' ? motivo : null }));
      if (situacao === 'refazer' && r.pedido_enviado === false) setErro('Aviso: falha no envio WhatsApp.');
      setPedindo(false);
      onRevisado();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const statusBorder = doc.situacao === 'legivel' ? 'border-emerald-500/40 bg-emerald-500/5' : doc.situacao === 'refazer' ? 'border-amber-500/40 bg-amber-500/5' : 'border-linha bg-superficie';

  return (
    <li className={`flex flex-col overflow-hidden rounded-2xl border shadow-sm transition-all ${statusBorder}`}>
      <button 
        type="button" 
        disabled={!url} 
        onClick={() => url && onAmpliar({ url, mime: doc.mime })}
        aria-label={`Ampliar documento ${numero}`}
        className="group relative flex h-40 items-center justify-center bg-elevada overflow-hidden cursor-pointer disabled:cursor-wait"
      >
        {url && imagem ? (
          <img src={url} alt={`Documento ${numero}`} className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-texto-3">
            <FileText className="size-8 text-marca" />
            <span className="text-[12px] font-medium">{doc.mime === 'application/pdf' ? 'Documento PDF' : 'Carregando...'}</span>
          </div>
        )}
        {url && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span className="flex items-center gap-1.5 rounded-xl bg-marca px-3 py-1.5 text-[12px] font-bold text-white shadow-lg">
              <ZoomIn className="size-3.5" /> Ampliar
            </span>
          </span>
        )}
      </button>

      <div className="flex flex-col gap-2 p-3.5">
        <div className="flex items-center justify-between text-[12.5px]">
          <span className="font-semibold text-texto">Documento #{numero}</span>
          <span className="mono text-[11px] text-texto-3">{dataHora(doc.criado_em)}</span>
        </div>

        {doc.situacao === 'legivel' && (
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
            <Check className="size-3.5" /> Legível e aprovado
          </p>
        )}
        {doc.situacao === 'refazer' && (
          <p className="text-[12px] text-amber-600 dark:text-amber-400 font-medium">
            Solicitada nova foto: {doc.motivo}
          </p>
        )}

        {pedindo ? (
          <div className="flex flex-col gap-2 mt-1">
            <label className="text-[11.5px] font-semibold text-texto-2" htmlFor={`motivo-${doc.id}`}>Motivo da Solicitação</label>
            <select id={`motivo-${doc.id}`} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={`${classeEntrada} h-9 py-1 text-[13px]`}>
              {MOTIVOS.map((m) => <option key={m} value={m} className="bg-superficie text-texto">{m}</option>)}
            </select>
            <div className="flex gap-2">
              <Botao tamanho="sm" variante="primario" carregando={salvando} onClick={() => revisar('refazer')}>Pedir via WhatsApp</Botao>
              <Botao tamanho="sm" variante="fantasma" onClick={() => setPedindo(false)}>Cancelar</Botao>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 mt-1">
            {doc.situacao !== 'legivel' && (
              <Botao tamanho="sm" icone={Check} carregando={salvando} onClick={() => revisar('legivel')}>
                Aprovar
              </Botao>
            )}
            <Botao tamanho="sm" variante="fantasma" icone={RotateCcw} onClick={() => setPedindo(true)}>
              Pedir outra
            </Botao>
          </div>
        )}
        {erro && <p className="text-[11.5px] text-urgente-forte">{erro}</p>}
      </div>
    </li>
  );
}

function Ampliado({ url, mime, onFechar }: { url: string; mime: string; onFechar: () => void }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      onFechar();
    };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [onFechar]);

  return (
    <div 
      role="dialog" 
      aria-modal="true" 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-[fade-in_150ms_ease-out]" 
      onClick={onFechar}
    >
      <button 
        type="button" 
        onClick={onFechar} 
        aria-label="Fechar" 
        autoFocus
        className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full border border-linha bg-superficie text-texto shadow-2xl hover:bg-elevada transition-colors cursor-pointer"
      >
        <X className="size-5" />
      </button>
      {mime === 'application/pdf' ? (
        <iframe src={url} title="Documento PDF" className="h-[85vh] w-full max-w-4xl rounded-2xl border border-linha bg-superficie shadow-2xl" onClick={(e) => e.stopPropagation()} />
      ) : (
        <img src={url} alt="Documento ampliado" className="max-h-[85vh] max-w-full rounded-2xl border border-linha object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
      )}
    </div>
  );
}
