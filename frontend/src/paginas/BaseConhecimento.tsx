import { useCallback, useRef, useState } from 'react';
import { ArrowLeft, FileUp, Merge, RefreshCw, Scissors, Search, Trash2, Upload } from 'lucide-react';
import { api, atualizar, enviar, ErroApi } from '../api';
import { Aviso, Botao, classeEntrada, Esqueleto, FaixaLeitura, Leitura, Painel } from '../components/ui';
import { contaAtual } from '../unidades';
import { useAtualizacao } from '../useAtualizacao';
import { dataHora } from '../vocabulario';

// Configurações › Base de conhecimento: leis, decretos, manuais e tabelas de critérios, cortados em trechos
// que a equipe pode conferir e corrigir. Ainda não é usada nas respostas do WhatsApp: serve para montar e testar.

interface Doc {
  id: string; titulo: string; nome_arquivo: string; tipo: string; fonte: string; tags: string[]; versao: number;
  criado_em: string; criado_por: string | null; atualizado_em: string | null; atualizado_por: string | null;
  trechos: number; com_vetor: number; editados: number;
}
interface Lista {
  vetores_disponiveis: boolean; modelo_vetores: string;
  totais: { documentos: number; trechos: number; com_vetor: number; editados: number };
  documentos: Doc[];
}
interface Trecho {
  id: string; indice: number; conteudo: string; secao: string; pagina: number | null;
  editado_manualmente: boolean; tem_vetor: boolean; atualizado_em: string | null; atualizado_por: string | null;
}
interface Aberto extends Doc { texto: string; lista_trechos: Trecho[] }
interface Busca {
  modo: string; trechos_sem_vetor?: number;
  reescrita: { consulta: string; termos: string[] } | null;
  reordenado: boolean;
  resultados: {
    trecho: Trecho; documento: { id: string; titulo: string };
    nota: number; nota_busca: number; nota_palavras: number; nota_significado: number | null; nota_ia: number | null;
  }[];
}

type Aviso = { tom: 'ok' | 'urgente'; texto: string } | null;
const erroDe = (e: unknown, padrao: string) => (e instanceof ErroApi ? e.message : padrao);
const nota = (n: number | null) => (n === null ? '–' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export function BaseConhecimento() {
  const lista = useAtualizacao(useCallback(() => api<Lista>('/base/documentos'), []), 60000);
  const [aberto, setAberto] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);
  const pode = contaAtual().coordenacao;

  if (aberto) {
    return <Documento id={aberto} pode={pode} onVoltar={() => { setAberto(null); lista.recarregar(); }} />;
  }
  const d = lista.dados;
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[80ch] text-[14.5px] text-texto-2">
        Leis, decretos, manuais e tabelas de critérios, cortados em trechos que a equipe confere e corrige. Ainda não é usada nas
        respostas do WhatsApp: serve para montar a base e testar se a busca encontra o trecho certo. Telefone e endereço de órgãos ficam;
        CPF e NIS de exemplo são apagados.
      </p>
      {lista.erro && <Aviso>{lista.erro}</Aviso>}
      {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
      {!d && !lista.erro && <div className="flex flex-col gap-3" aria-busy="true"><Esqueleto className="h-[70px]" /><Esqueleto className="h-72" /></div>}
      {d && (
        <>
          {!d.vetores_disponiveis && (
            <Aviso tom="info">Sem a chave do Gemini, a busca funciona só por palavras (não entende sinônimos). Com a chave, os trechos ganham vetores de significado.</Aviso>
          )}
          <FaixaLeitura>
            <Leitura rotulo="Documentos" valor={d.totais.documentos} />
            <Leitura rotulo="Trechos" valor={d.totais.trechos} />
            <Leitura rotulo="Com vetor" valor={d.totais.com_vetor} detalhe={d.vetores_disponiveis ? d.modelo_vetores : 'sem chave do Gemini'} />
            <Leitura rotulo="Sem vetor" valor={d.totais.trechos - d.totais.com_vetor} detalhe="buscam só por palavras" />
            <Leitura rotulo="Editados à mão" valor={d.totais.editados} />
          </FaixaLeitura>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div className="flex min-w-0 flex-col gap-4">
              {pode && <EnviarDocumento onEnviado={(titulo) => { setAviso({ tom: 'ok', texto: `“${titulo}” foi cortado em trechos e já entra na busca.` }); lista.recarregar(); }}
                onErro={(e) => setAviso({ tom: 'urgente', texto: erroDe(e, 'Não foi possível enviar o documento.') })} />}
              <Painel id="t-docs" titulo="Documentos" detalhe={`${d.documentos.length}`} semCorpo>
                {d.documentos.length === 0 ? (
                  <p className="px-4 py-6 text-[14px] text-texto-3">Nenhum documento ainda. {pode ? 'Envie uma lei, um decreto ou um manual em PDF, DOCX ou TXT.' : 'A coordenação envia os documentos.'}</p>
                ) : (
                  <table className="w-full table-fixed border-collapse text-left text-[14px]">
                    <thead>
                      <tr className="border-b border-linha text-[12.5px] text-texto-3">
                        <th scope="col" className="px-4 py-2 font-medium">Documento</th>
                        <th scope="col" className="w-[90px] px-3 py-2 font-medium">Trechos</th>
                        <th scope="col" className="w-[110px] px-3 py-2 font-medium">Vetores</th>
                        <th scope="col" className="w-[150px] px-4 py-2 font-medium">Atualizado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.documentos.map((doc) => (
                        <tr key={doc.id} onClick={() => setAberto(doc.id)} className="cursor-pointer border-b border-linha hover:bg-elevada">
                          <td className="px-4 py-2">
                            <button type="button" onClick={(e) => { e.stopPropagation(); setAberto(doc.id); }} className="block max-w-full truncate text-left font-medium text-texto hover:underline">
                              {doc.titulo}
                            </button>
                            <span className="block truncate text-[12.5px] text-texto-3">
                              <span className="dado uppercase">{doc.tipo}</span> · versão <span className="dado">{doc.versao}</span>
                              {doc.tags.length > 0 && <> · {doc.tags.map((t) => `#${t}`).join(' ')}</>}
                            </span>
                          </td>
                          <td className="dado px-3 py-2 text-texto-2">{doc.trechos}{doc.editados > 0 && <span className="block text-[11.5px] text-texto-3">{doc.editados} editado{doc.editados > 1 ? 's' : ''}</span>}</td>
                          <td className={`dado px-3 py-2 ${doc.com_vetor < doc.trechos ? 'text-alta' : 'text-ok'}`}>{doc.com_vetor}/{doc.trechos}</td>
                          <td className="dado px-4 py-2 text-[12.5px] text-texto-3">{dataHora(doc.atualizado_em ?? doc.criado_em)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Painel>
            </div>
            <TesteBusca vazia={d.totais.trechos === 0} comIA={d.vetores_disponiveis} onAbrir={setAberto} />
          </div>
        </>
      )}
    </div>
  );
}

function EnviarDocumento({ onEnviado, onErro }: { onEnviado: (titulo: string) => void; onErro: (e: unknown) => void }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [titulo, setTitulo] = useState('');
  const [fonte, setFonte] = useState('');
  const [tags, setTags] = useState('');
  const [enviando, setEnviando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const mandar = async () => {
    if (!arquivo) return;
    setEnviando(true);
    const corpo = new FormData();
    corpo.append('arquivo', arquivo);
    corpo.append('titulo', titulo || arquivo.name.replace(/\.[^.]+$/, ''));
    corpo.append('fonte', fonte);
    corpo.append('tags', tags);
    try {
      const doc = await api<Doc>('/base/documentos', { method: 'POST', body: corpo });
      setArquivo(null); setTitulo(''); setFonte(''); setTags('');
      if (campo.current) campo.current.value = '';
      onEnviado(doc.titulo);
    } catch (e) {
      onErro(e);
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Painel id="t-enviar" titulo="Enviar documento" detalhe="PDF com texto, DOCX, TXT ou MD · até 8 MB">
      <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); mandar(); }}>
        <label className="flex flex-col gap-1.5 md:col-span-2">
          <span className="text-[13px] font-semibold text-texto-2">Arquivo</span>
          <input ref={campo} type="file" accept=".pdf,.docx,.txt,.md" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            className="text-[14px] text-texto-2 file:mr-3 file:rounded-[3px] file:border file:border-linha-forte file:bg-elevada file:px-3 file:py-1.5 file:text-texto" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-texto-2">Título</span>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} placeholder="ex.: Lei municipal do Aluguel Social" className={classeEntrada} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-texto-2">De onde veio</span>
          <input value={fonte} onChange={(e) => setFonte(e.target.value)} maxLength={1000} placeholder="ex.: Lei 1.234/2023, Diário Oficial de Anápolis" className={classeEntrada} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-texto-2">Assuntos</span>
          <input value={tags} onChange={(e) => setTags(e.target.value)} maxLength={500} placeholder="separados por vírgula: AluguelSocial, moradia" className={classeEntrada} />
        </label>
        <div className="flex items-end">
          <Botao type="submit" variante="primario" icone={Upload} carregando={enviando} disabled={!arquivo}>Enviar e cortar em trechos</Botao>
        </div>
      </form>
    </Painel>
  );
}

function TesteBusca({ vazia, comIA, onAbrir }: { vazia: boolean; comIA: boolean; onAbrir: (id: string) => void }) {
  const [pergunta, setPergunta] = useState('');
  const [reescrever, setReescrever] = useState(true);
  const [reordenar, setReordenar] = useState(true);
  const [resultado, setResultado] = useState<Busca | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const buscar = async () => {
    setBuscando(true); setErro(null);
    try { setResultado(await api<Busca>('/base/buscar', enviar({ pergunta, reescrever: comIA && reescrever, reordenar: comIA && reordenar }))); } catch (e) { setErro(erroDe(e, 'Não foi possível buscar.')); } finally { setBuscando(false); }
  };
  return (
    <Painel id="t-busca" titulo="Testar a busca" detalhe="quais trechos responderiam" semCorpo>
      <form className="flex gap-2 border-b border-linha px-4 py-3" onSubmit={(e) => { e.preventDefault(); buscar(); }}>
        <label className="relative flex-1">
          <span className="sr-only">Pergunta</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-3" aria-hidden />
          <input value={pergunta} onChange={(e) => setPergunta(e.target.value)} maxLength={500} placeholder="ex.: quanto tempo dura o aluguel social?" className={`${classeEntrada} pl-9`} />
        </label>
        <Botao type="submit" carregando={buscando} disabled={vazia || pergunta.trim().length < 3}>Buscar</Botao>
      </form>
      <fieldset className="flex flex-wrap gap-x-5 gap-y-1 border-b border-linha px-4 py-2 text-[13px] text-texto-2" disabled={!comIA}>
        <legend className="sr-only">Etapas com IA</legend>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={comIA && reescrever} onChange={(e) => setReescrever(e.target.checked)} className="size-4 accent-[var(--color-acao)]" />
          Reescrever a pergunta
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={comIA && reordenar} onChange={(e) => setReordenar(e.target.checked)} className="size-4 accent-[var(--color-acao)]" />
          Reordenar com IA
        </label>
        {!comIA && <span className="text-texto-3">precisa da chave do Gemini</span>}
      </fieldset>
      {erro && <div className="px-4 pt-3"><Aviso>{erro}</Aviso></div>}
      {!resultado && <p className="px-4 py-4 text-[13.5px] text-texto-3">{vazia ? 'Envie um documento para testar.' : 'Escreva como a pessoa perguntaria. A IA reescreve nos termos dos documentos, a busca acha os 10 trechos mais próximos e a IA reordena pelo que de fato responde.'}</p>}
      {resultado && (
        <div>
          {resultado.reescrita && (
            <div className="border-b border-linha bg-elevada px-4 py-2.5 text-[13px]">
              <p className="text-texto-3">Pergunta reescrita pela IA (confira se não acrescentou nada):</p>
              <p className="mt-0.5 text-texto">{resultado.reescrita.consulta}</p>
              {resultado.reescrita.termos.length > 0 && <p className="dado mt-0.5 text-[12px] text-texto-2">{resultado.reescrita.termos.join(' · ')}</p>}
            </div>
          )}
          <p className="border-b border-linha px-4 py-2 text-[12.5px] text-texto-3">
            Busca por <strong className="text-texto-2">{resultado.modo}</strong>
            {resultado.reordenado ? ' · reordenada pela IA' : ' · sem reordenação'}
            {resultado.trechos_sem_vetor ? ` · ${resultado.trechos_sem_vetor} trechos sem vetor entram só por palavras` : ''}
          </p>
          {resultado.resultados.length === 0 && <p className="px-4 py-4 text-[14px] text-texto-3">Nenhum trecho parecido.</p>}
          <ol>
            {resultado.resultados.map((r, i) => (
              <li key={r.trecho.id} className="border-b border-linha px-4 py-3">
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <button type="button" onClick={() => onAbrir(r.documento.id)} className="min-w-0 truncate text-left text-[13px] font-semibold text-texto hover:underline">
                    <span className="dado text-texto-3">{i + 1}.</span> {r.documento.titulo}
                  </button>
                  <span className="dado shrink-0 text-[15px] font-medium text-texto" title="Nota final">{nota(r.nota)}</span>
                </div>
                {r.trecho.secao && <p className="truncate text-[12.5px] text-texto-3">{r.trecho.secao}{r.trecho.pagina ? ` · pág. ${r.trecho.pagina}` : ''}</p>}
                <p className="mt-1 line-clamp-4 whitespace-pre-line text-[13.5px] text-texto-2">{r.trecho.conteudo}</p>
                <p className="dado mt-1 text-[12px] text-texto-3">
                  {r.nota_ia !== null && <>IA {nota(r.nota_ia)} · </>}busca {nota(r.nota_busca)} (palavras {nota(r.nota_palavras)} · significado {nota(r.nota_significado)})
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Painel>
  );
}

function Documento({ id, pode, onVoltar }: { id: string; pode: boolean; onVoltar: () => void }) {
  const doc = useAtualizacao(useCallback(() => api<Aberto>(`/base/documentos/${id}`), [id]), 0);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [ocupado, setOcupado] = useState(false);
  const versao = useRef<HTMLInputElement>(null);
  const d = doc.dados;

  const acao = async (fazer: () => Promise<unknown>, ok: string, padrao: string) => {
    setOcupado(true);
    try { await fazer(); setAviso({ tom: 'ok', texto: ok }); doc.recarregar(); } catch (e) { setAviso({ tom: 'urgente', texto: erroDe(e, padrao) }); } finally { setOcupado(false); }
  };
  const novaVersao = (arquivo: File | undefined) => {
    if (!arquivo) return;
    const corpo = new FormData();
    corpo.append('arquivo', arquivo);
    acao(() => api(`/base/documentos/${id}/versao`, { method: 'POST', body: corpo }), 'Versão nova enviada: o texto e os trechos foram refeitos.', 'Não foi possível enviar a versão nova.');
    if (versao.current) versao.current.value = '';
  };
  const apagar = async () => {
    if (!d || !window.confirm(`Apagar “${d.titulo}” e todos os trechos? Isso não pode ser desfeito.`)) return;
    setOcupado(true);
    try { await api(`/base/documentos/${id}`, { method: 'DELETE' }); onVoltar(); } catch (e) { setAviso({ tom: 'urgente', texto: erroDe(e, 'Não foi possível apagar.') }); setOcupado(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onVoltar} className="inline-flex items-center gap-1.5 self-start text-[14px] text-texto-2 hover:text-texto">
        <ArrowLeft className="size-4" aria-hidden />Base de conhecimento
      </button>
      {doc.erro && <Aviso>{doc.erro}</Aviso>}
      {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
      {!d && !doc.erro && <Esqueleto className="h-96" />}
      {d && (
        <>
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="titulo text-[22px]">{d.titulo}</h2>
              <p className="text-[13.5px] text-texto-2">
                <span className="dado uppercase">{d.tipo}</span> · {d.nome_arquivo} · versão <span className="dado">{d.versao}</span>
                {d.fonte && <> · {d.fonte}</>}
              </p>
            </div>
            {pode && (
              <div className="flex flex-wrap gap-2">
                <input ref={versao} type="file" accept=".pdf,.docx,.txt,.md" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => novaVersao(e.target.files?.[0])} />
                <Botao tamanho="sm" icone={FileUp} disabled={ocupado} onClick={() => versao.current?.click()} title="Os trechos são refeitos; edições à mão da versão atual se perdem">Enviar versão nova</Botao>
                <Botao tamanho="sm" icone={RefreshCw} disabled={ocupado}
                  onClick={() => acao(() => api(`/base/documentos/${id}/reindexar`, { method: 'POST' }), 'Vetores refeitos para todos os trechos.', 'Não foi possível refazer os vetores.')}>
                  Refazer vetores
                </Botao>
                <Botao tamanho="sm" variante="perigo" icone={Trash2} disabled={ocupado} onClick={apagar}>Apagar</Botao>
              </div>
            )}
          </header>
          <FaixaLeitura>
            <Leitura rotulo="Trechos" valor={d.trechos} />
            <Leitura rotulo="Com vetor" valor={`${d.com_vetor}/${d.trechos}`} />
            <Leitura rotulo="Editados à mão" valor={d.editados} />
            <Leitura rotulo="Caracteres" valor={d.texto.length.toLocaleString('pt-BR')} />
            <Leitura rotulo="Enviado por" valor={d.criado_por ?? '–'} detalhe={dataHora(d.criado_em)} />
          </FaixaLeitura>
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <Painel id="t-original" titulo="Texto extraído" detalhe="como saiu do arquivo" semCorpo className="xl:sticky xl:top-4">
              <pre className="max-h-[70dvh] overflow-auto whitespace-pre-wrap px-4 py-3 font-sans text-[13.5px] leading-relaxed text-texto-2">{d.texto}</pre>
            </Painel>
            <Painel id="t-trechos" titulo="Trechos" detalhe="o que a busca enxerga" semCorpo>
              <ol>
                {d.lista_trechos.map((t, i) => (
                  <ItemTrecho key={t.id} t={t} ultimo={i === d.lista_trechos.length - 1} pode={pode} ocupado={ocupado}
                    onSalvar={(conteudo) => acao(() => api(`/base/trechos/${t.id}`, atualizar({ conteudo })), 'Trecho salvo e com vetor novo.', 'Não foi possível salvar o trecho.')}
                    onJuntar={() => acao(() => api(`/base/trechos/${t.id}/juntar`, { method: 'POST' }), 'Trechos juntados.', 'Não foi possível juntar.')}
                    onDividir={(posicao) => acao(() => api(`/base/trechos/${t.id}/dividir`, enviar({ posicao })), 'Trecho dividido em dois.', 'Não foi possível dividir.')} />
                ))}
              </ol>
            </Painel>
          </div>
        </>
      )}
    </div>
  );
}

function ItemTrecho({ t, ultimo, pode, ocupado, onSalvar, onJuntar, onDividir }: {
  t: Trecho; ultimo: boolean; pode: boolean; ocupado: boolean;
  onSalvar: (conteudo: string) => void; onJuntar: () => void; onDividir: (posicao: number) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(t.conteudo);
  const caixa = useRef<HTMLTextAreaElement>(null);
  return (
    <li className="border-b border-linha px-4 py-3">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12.5px] text-texto-3">
        <span className="dado font-medium text-texto-2">#{t.indice + 1}</span>
        {t.secao && <span className="min-w-0 truncate">{t.secao}</span>}
        {t.pagina && <span className="dado">pág. {t.pagina}</span>}
        {t.editado_manualmente && <span className="font-semibold text-texto-2">editado{t.atualizado_por ? ` por ${t.atualizado_por}` : ''}</span>}
        {!t.tem_vetor && <span className="font-semibold text-alta">sem vetor</span>}
        <span className="dado ml-auto">{t.conteudo.length} car.</span>
      </div>
      {editando ? (
        <>
          <textarea ref={caixa} value={texto} onChange={(e) => setTexto(e.target.value)} rows={Math.min(14, Math.max(4, texto.split('\n').length + 2))}
            aria-label={`Texto do trecho ${t.indice + 1}`} className={`${classeEntrada} text-[14px] leading-relaxed`} />
          <div className="mt-2 flex flex-wrap gap-2">
            <Botao tamanho="sm" variante="primario" disabled={ocupado || texto.trim() === t.conteudo} onClick={() => { onSalvar(texto); setEditando(false); }}>Salvar</Botao>
            <Botao tamanho="sm" icone={Scissors} disabled={ocupado || texto !== t.conteudo}
              title="Coloque o cursor onde o trecho deve ser cortado"
              onClick={() => { const p = caixa.current?.selectionStart ?? 0; onDividir(p); setEditando(false); }}>
              Dividir no cursor
            </Botao>
            <Botao tamanho="sm" variante="fantasma" onClick={() => { setTexto(t.conteudo); setEditando(false); }}>Cancelar</Botao>
          </div>
        </>
      ) : (
        <>
          <p className="whitespace-pre-line text-[14px] leading-relaxed text-texto">{t.conteudo}</p>
          {pode && (
            <div className="mt-2 flex flex-wrap gap-1">
              <Botao tamanho="sm" variante="fantasma" disabled={ocupado} onClick={() => { setTexto(t.conteudo); setEditando(true); }}>Editar ou dividir</Botao>
              {!ultimo && <Botao tamanho="sm" variante="fantasma" icone={Merge} disabled={ocupado} onClick={onJuntar}>Juntar com o próximo</Botao>}
            </div>
          )}
        </>
      )}
    </li>
  );
}
