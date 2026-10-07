import { useCallback, useEffect, useState } from 'react';
import { Check, FileText, Lock, RotateCcw, X, ZoomIn } from 'lucide-react';
import { api, arquivoProtegido, enviar, ErroApi } from '../api';
import { useAtualizacao } from '../useAtualizacao';
import { dataHora } from '../vocabulario';
import { Aviso, Botao, classeEntrada } from './ui';

// Fotos de documentos que a pessoa mandou pelo WhatsApp. A equipe confere aqui e decide no atendimento:
// o sistema só organiza as fotos no caso. Cada foto vem cifrada do servidor e quem abre fica registrado.

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
  'a foto está ilegível ou borrada',
  'o documento saiu cortado',
  'falta o verso do documento',
  'não é o documento pedido',
  'o documento está vencido',
];

export function DocumentosDoCaso({ casoId, quantidade }: { casoId: string; quantidade: number }) {
  const docs = useAtualizacao(useCallback(() => api<Documento[]>(`/triagem/${casoId}/documentos`), [casoId]), quantidade ? 15000 : 0);
  const [ampliado, setAmpliado] = useState<{ url: string; mime: string } | null>(null);

  if (!quantidade && !docs.dados?.length) return null;
  const lista = docs.dados ?? [];
  const aConferir = lista.filter((d) => !d.situacao).length;

  return (
    <section aria-labelledby="t-docs">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="t-docs" className="text-[13px] font-medium text-texto-2">
          Documentos que a pessoa mandou ({lista.length || quantidade}){aConferir > 0 && <span className="text-caneta"> · {aConferir} a conferir</span>}
        </h3>
        <p className="flex items-center gap-1 text-[12px] text-texto-3"><Lock className="size-3" aria-hidden />Protegidos; quem abre fica registrado</p>
      </div>
      {docs.erro && <Aviso>{docs.erro}</Aviso>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {lista.map((d, i) => (
          <ItemDocumento key={d.id} casoId={casoId} doc={d} numero={i + 1} onAmpliar={setAmpliado} onRevisado={docs.recarregar} />
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-texto-3">Quem decide o benefício é o profissional, no atendimento. As fotos são apagadas depois que o caso é fechado.</p>
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
      .catch(() => { if (ativo) setErro('Não foi possível abrir.'); });
    return () => { ativo = false; if (criado) URL.revokeObjectURL(criado); };
  }, [casoId, doc.id]);

  const revisar = async (situacao: 'legivel' | 'refazer') => {
    setSalvando(true);
    setErro(null);
    try {
      const r = await api<{ pedido_enviado: boolean | null }>(`/triagem/${casoId}/documentos/${doc.id}/revisao`,
        enviar({ situacao, motivo: situacao === 'refazer' ? motivo : null }));
      if (situacao === 'refazer' && r.pedido_enviado === false) setErro('Marcado, mas o pedido não saiu pelo WhatsApp. Confira a conexão.');
      setPedindo(false);
      onRevisado();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const borda = doc.situacao === 'legivel' ? 'border-ok/45' : doc.situacao === 'refazer' ? 'border-alta/50' : 'border-linha';
  return (
    <li className={`flex flex-col overflow-hidden rounded-[4px] border bg-superficie ${borda}`}>
      <button type="button" disabled={!url} onClick={() => url && onAmpliar({ url, mime: doc.mime })}
        aria-label={`Ampliar documento ${numero}`}
        className="group relative flex h-36 items-center justify-center bg-elevada disabled:cursor-wait">
        {url && imagem ? (
          <img src={url} alt={`Documento ${numero} enviado pela pessoa`} className="size-full object-contain" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-[13px] text-texto-2">
            <FileText className="size-8 text-texto-3" aria-hidden />{doc.mime === 'application/pdf' ? 'PDF' : url ? 'Arquivo' : 'Abrindo…'}
          </span>
        )}
        {url && <span className="absolute right-2 top-2 rounded-full bg-superficie/90 p-1.5 text-texto-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"><ZoomIn className="size-4" aria-hidden /></span>}
      </button>
      <div className="flex flex-col gap-2 px-3 py-2.5">
        <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-[13px]">
          <span className="font-semibold">Documento {numero}</span>
          <span className="text-texto-3">{dataHora(doc.criado_em)}</span>
        </p>
        {doc.situacao === 'legivel' && <p className="flex items-center gap-1 text-[13px] font-semibold text-ok"><Check className="size-3.5" aria-hidden />Legível{doc.revisado_por ? ` · ${doc.revisado_por}` : ''}</p>}
        {doc.situacao === 'refazer' && <p className="text-[13px] text-alta">Pedida nova foto: {doc.motivo}</p>}
        {pedindo ? (
          <div className="flex flex-col gap-2">
            <label className="text-[12.5px] font-medium text-texto-2" htmlFor={`motivo-${doc.id}`}>O que precisa corrigir</label>
            <select id={`motivo-${doc.id}`} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={`${classeEntrada} h-9 py-1 text-[13.5px]`}>
              {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <div className="flex gap-2">
              <Botao tamanho="sm" variante="primario" carregando={salvando} onClick={() => revisar('refazer')}>Pedir pelo WhatsApp</Botao>
              <Botao tamanho="sm" variante="fantasma" onClick={() => setPedindo(false)}>Cancelar</Botao>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {doc.situacao !== 'legivel' && <Botao tamanho="sm" icone={Check} carregando={salvando} onClick={() => revisar('legivel')}>Legível</Botao>}
            <Botao tamanho="sm" variante="fantasma" icone={RotateCcw} onClick={() => setPedindo(true)}>Pedir outra foto</Botao>
          </div>
        )}
        {erro && <p role="alert" className="text-[12.5px] text-urgente-forte">{erro}</p>}
      </div>
    </li>
  );
}

function Ampliado({ url, mime, onFechar }: { url: string; mime: string; onFechar: () => void }) {
  useEffect(() => {
    // Esc fecha só a foto, não a ficha que está por baixo (captura antes e para a tecla aqui)
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
    <div role="dialog" aria-modal="true" aria-label="Documento ampliado" className="fixed inset-0 z-50 flex items-center justify-center bg-veu/80 p-4" onClick={onFechar}>
      <button type="button" onClick={onFechar} aria-label="Fechar" autoFocus
        className="absolute right-4 top-4 rounded-full bg-superficie p-2 text-texto shadow-[0_6px_16px_-6px_rgb(0_0_0/0.5)] hover:bg-elevada">
        <X className="size-5" aria-hidden />
      </button>
      {mime === 'application/pdf'
        ? <iframe src={url} title="Documento em PDF" className="h-[88vh] w-full max-w-4xl rounded-[4px] bg-superficie" onClick={(e) => e.stopPropagation()} />
        : <img src={url} alt="Documento enviado pela pessoa, ampliado" className="max-h-[88vh] max-w-full rounded-[4px] object-contain" onClick={(e) => e.stopPropagation()} />}
    </div>
  );
}
