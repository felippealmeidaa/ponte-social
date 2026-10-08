import { useCallback, useMemo, useRef, useState } from 'react';
import { FileDown, FileUp, Pause, Play, Plus, Search, Trash2 } from 'lucide-react';
import { api, atualizar, baixarArquivo, enviar, ErroApi } from '../api';
import { Aviso, Botao, classeEntrada, Esqueleto, FaixaLeitura, Leitura, Painel, Segmentado } from '../components/ui';
import { contaAtual } from '../unidades';
import { useAtualizacao } from '../useAtualizacao';
import { dataHora, nomeCategoria } from '../vocabulario';

// Configurações › Dados de treino: as frases que ensinam o modelo local, das três origens, num lugar só.
// A equipe escreve ou importa exemplos; os casos reais vêm dos atendimentos (com consentimento); os simulados são fixos.

interface ExemploEquipe {
  id: string; texto: string; categoria: string; origem: 'manual' | 'importacao'; ativo: boolean;
  criado_em: string; criado_por: string | null; atualizado_em: string | null; atualizado_por: string | null;
}
interface Dados {
  categorias: string[];
  minimo_por_categoria: number;
  por_categoria: Record<string, number>;
  totais: { simulados: number; equipe: number; equipe_pausados: number; reais: number; no_treino: number; teste_fixo: number };
  equipe: ExemploEquipe[];
  reais: { texto: string; categoria: string; fonte: 'pessoa' | 'equipe' }[];
  simulados: { texto: string; categoria: string }[];
}
interface Importacao { criados: number; total_recusados: number; recusados: { linha: number; texto: string; motivo: string }[] }

type Origem = 'equipe' | 'reais' | 'simulados';
const ORIGENS: { valor: Origem; rotulo: string }[] = [
  { valor: 'equipe', rotulo: 'Da equipe' },
  { valor: 'reais', rotulo: 'Casos reais' },
  { valor: 'simulados', rotulo: 'Simulados' },
];

export function DadosTreino() {
  const { dados, erro, recarregar } = useAtualizacao(useCallback(() => api<Dados>('/ml/exemplos'), []), 60000);
  const pode = contaAtual().coordenacao;
  const [origem, setOrigem] = useState<Origem>('equipe');
  const [busca, setBusca] = useState('');
  const [filtroCat, setFiltroCat] = useState('');
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'urgente'; texto: string } | null>(null);
  const [importacao, setImportacao] = useState<Importacao | null>(null);

  const linhas = useMemo(() => {
    if (!dados) return [];
    const termo = busca.trim().toLowerCase();
    const base = origem === 'equipe' ? dados.equipe : origem === 'reais' ? dados.reais : dados.simulados;
    return (base as { texto: string; categoria: string }[]).filter((l) =>
      (!filtroCat || l.categoria === filtroCat) && (!termo || l.texto.toLowerCase().includes(termo)));
  }, [dados, origem, busca, filtroCat]);

  const falhou = (e: unknown, padrao: string) => setAviso({ tom: 'urgente', texto: e instanceof ErroApi ? e.message : padrao });

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[78ch] text-[14.5px] text-texto-2">
        As frases que ensinam o modelo local qual é a necessidade de cada relato. O que a equipe escreve aqui entra no próximo
        retreino (em <a href="#/configuracoes/modelo" className="text-caneta underline underline-offset-2">Modelo de IA</a>), que só troca o modelo se ele não piorar.
        Frases iguais às do teste fixo são recusadas, e CPF, telefone e e-mail são apagados antes de gravar.
      </p>

      {erro && <Aviso>{erro}</Aviso>}
      {aviso && <Aviso tom={aviso.tom === 'ok' ? 'ok' : 'urgente'}>{aviso.texto}</Aviso>}
      {!dados && !erro && <div className="flex flex-col gap-3" aria-busy="true"><Esqueleto className="h-[70px]" /><Esqueleto className="h-80" /></div>}

      {dados && (
        <>
          <FaixaLeitura>
            <Leitura rotulo="No próximo treino" valor={dados.totais.no_treino} detalhe="frases no total" />
            <Leitura rotulo="Simulados" valor={dados.totais.simulados} detalhe="frases-modelo fixas" />
            <Leitura rotulo="Da equipe" valor={dados.totais.equipe} detalhe={dados.totais.equipe_pausados ? `${dados.totais.equipe_pausados} pausados` : 'escritos ou importados'} />
            <Leitura rotulo="Casos reais" valor={dados.totais.reais} detalhe="confirmados ou corrigidos" />
            <Leitura rotulo="Teste fixo" valor={dados.totais.teste_fixo} detalhe="nunca entra no treino" />
          </FaixaLeitura>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex min-w-0 flex-col gap-4">
              {pode && <NovoExemplo categorias={dados.categorias} onCriado={() => { setAviso({ tom: 'ok', texto: 'Exemplo adicionado. Ele entra no próximo retreino.' }); recarregar(); }} onErro={falhou} />}

              <Painel id="t-exemplos" titulo="Exemplos" detalhe={`${linhas.length} mostrando`} semCorpo
                acao={
                  <div className="flex items-center gap-2">
                    {pode && <Importar onResultado={(r) => { setImportacao(r); setAviso(null); recarregar(); }} onErro={falhou} />}
                    <Botao tamanho="sm" icone={FileDown} onClick={() => baixarArquivo(`/ml/exemplos.csv?origem=${origem}`, `dados-de-treino-${origem}.csv`).catch((e) => falhou(e, 'Não foi possível baixar.'))}>
                      Exportar CSV
                    </Botao>
                  </div>
                }>
                {importacao && <ResultadoImportacao r={importacao} onFechar={() => setImportacao(null)} />}
                <div className="flex flex-wrap items-center gap-2 border-b border-linha px-4 py-3">
                  <span id="r-origem" className="sr-only">Origem dos exemplos</span>
                  <Segmentado rotuloId="r-origem" valor={origem} opcoes={ORIGENS.map((o) => ({ ...o, rotulo: `${o.rotulo} ${o.valor === 'equipe' ? dados.equipe.length : o.valor === 'reais' ? dados.reais.length : dados.simulados.length}` }))} onMudar={setOrigem} />
                  <label className="relative min-w-[200px] flex-1">
                    <span className="sr-only">Buscar frase</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-3" aria-hidden />
                    <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar frase" className={`${classeEntrada} h-9 py-1 pl-9 text-[14px]`} />
                  </label>
                  <label>
                    <span className="sr-only">Necessidade</span>
                    <select value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)} className={`${classeEntrada} h-9 w-auto py-1 text-[14px]`}>
                      <option value="">Todas as necessidades</option>
                      {dados.categorias.map((c) => <option key={c} value={c}>{nomeCategoria(c)}</option>)}
                    </select>
                  </label>
                </div>
                <TabelaExemplos origem={origem} linhas={linhas} categorias={dados.categorias} pode={pode}
                  onMudou={(texto) => { setAviso({ tom: 'ok', texto }); recarregar(); }} onErro={falhou} />
              </Painel>
            </div>

            <Painel id="t-por-cat" titulo="Por necessidade" detalhe="no próximo treino" semCorpo>
              <ul className="divide-y divide-linha">
                {dados.categorias.map((c) => {
                  const n = dados.por_categoria[c] ?? 0;
                  const poucos = n < dados.minimo_por_categoria;
                  return (
                    <li key={c}>
                      <button type="button" onClick={() => setFiltroCat(filtroCat === c ? '' : c)} aria-pressed={filtroCat === c}
                        className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-[14px] hover:bg-elevada ${filtroCat === c ? 'bg-caneta-fundo' : ''}`}>
                        <span className="min-w-0 truncate">{nomeCategoria(c)}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          {poucos && <span className="text-[12px] font-semibold text-alta">poucos</span>}
                          <span className="dado text-texto">{n}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="border-t border-linha px-4 py-3 text-[12.5px] text-texto-3">
                Com menos de {dados.minimo_por_categoria} frases, o modelo costuma errar mais aquela necessidade. Clique para filtrar.
              </p>
            </Painel>
          </div>
        </>
      )}
    </div>
  );
}

function NovoExemplo({ categorias, onCriado, onErro }: { categorias: string[]; onCriado: () => void; onErro: (e: unknown, p: string) => void }) {
  const [texto, setTexto] = useState('');
  const [categoria, setCategoria] = useState('');
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    setSalvando(true);
    try {
      await api('/ml/exemplos', enviar({ texto, categoria }));
      setTexto('');
      onCriado();
    } catch (e) {
      onErro(e, 'Não foi possível adicionar o exemplo.');
    } finally {
      setSalvando(false);
    }
  };
  return (
    <Painel id="t-novo" titulo="Novo exemplo">
      <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_230px_auto] md:items-end" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-texto-2">Frase, como a pessoa escreveria</span>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={600} placeholder="ex.: a chuva levou o telhado e to sem onde ficar com as crianca" className={classeEntrada} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-texto-2">Necessidade certa</span>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={classeEntrada} required>
            <option value="" disabled>Escolha…</option>
            {categorias.map((c) => <option key={c} value={c}>{nomeCategoria(c)}</option>)}
          </select>
        </label>
        <Botao type="submit" variante="primario" icone={Plus} carregando={salvando} disabled={texto.trim().split(/\s+/).length < 3 || !categoria}>Adicionar</Botao>
      </form>
    </Painel>
  );
}

function Importar({ onResultado, onErro }: { onResultado: (r: Importacao) => void; onErro: (e: unknown, p: string) => void }) {
  const campo = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const aoEscolher = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setEnviando(true);
    const corpo = new FormData();
    corpo.append('arquivo', arquivo);
    try {
      onResultado(await api<Importacao>('/ml/exemplos/importar', { method: 'POST', body: corpo }));
    } catch (e) {
      onErro(e, 'Não foi possível importar o arquivo.');
    } finally {
      setEnviando(false);
      if (campo.current) campo.current.value = '';
    }
  };
  return (
    <>
      <input ref={campo} type="file" accept=".xlsx,.csv,.json,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" tabIndex={-1} aria-hidden
        onChange={(e) => aoEscolher(e.target.files?.[0])} />
      <Botao tamanho="sm" icone={FileUp} carregando={enviando} onClick={() => campo.current?.click()} title="Planilha modelo (.xlsx), CSV com as colunas texto e categoria, ou JSON">
        Importar
      </Botao>
    </>
  );
}

function ResultadoImportacao({ r, onFechar }: { r: Importacao; onFechar: () => void }) {
  return (
    <div className="border-b border-linha bg-elevada px-4 py-3 text-[14px]">
      <div className="flex items-start justify-between gap-3">
        <p>
          <strong className="dado">{r.criados}</strong> exemplo{r.criados === 1 ? '' : 's'} importado{r.criados === 1 ? '' : 's'}
          {r.total_recusados > 0 && <>; <strong className="dado">{r.total_recusados}</strong> linha{r.total_recusados === 1 ? '' : 's'} recusada{r.total_recusados === 1 ? '' : 's'}:</>}
        </p>
        <button type="button" onClick={onFechar} className="text-[13px] text-texto-2 hover:text-texto">Fechar</button>
      </div>
      {r.recusados.length > 0 && (
        <ul className="mt-2 max-h-40 overflow-y-auto text-[13px] text-texto-2">
          {r.recusados.map((x) => <li key={x.linha}><span className="dado text-texto-3">linha {x.linha}</span> · {x.motivo} <span className="text-texto-3">“{x.texto}”</span></li>)}
        </ul>
      )}
    </div>
  );
}

function TabelaExemplos({ origem, linhas, categorias, pode, onMudou, onErro }: {
  origem: Origem; linhas: { texto: string; categoria: string }[]; categorias: string[]; pode: boolean;
  onMudou: (texto: string) => void; onErro: (e: unknown, p: string) => void;
}) {
  if (linhas.length === 0) {
    const vazio = origem === 'equipe'
      ? 'Nenhum exemplo da equipe ainda. Escreva um acima ou importe a planilha modelo (docs/modelo_relatos_treino.xlsx).'
      : origem === 'reais'
        ? 'Nenhum caso real ainda: eles entram quando a pessoa confirma a necessidade no WhatsApp ou a equipe corrige na ficha (só com consentimento).'
        : 'Nenhuma frase com esse filtro.';
    return <p className="px-4 py-6 text-[14px] text-texto-3">{vazio}</p>;
  }
  return (
    <div className="max-h-[560px] overflow-y-auto">
      <table className="w-full table-fixed border-collapse text-left text-[14px]">
        <thead className="sticky top-0 z-10 bg-superficie">
          <tr className="border-b border-linha text-[12.5px] text-texto-3">
            <th scope="col" className="px-4 py-2 font-medium">Frase</th>
            <th scope="col" className="w-[210px] px-3 py-2 font-medium">Necessidade</th>
            <th scope="col" className={`${origem === 'equipe' ? 'w-[200px]' : 'w-[150px]'} px-4 py-2 font-medium`}>{origem === 'equipe' ? 'Quem e quando' : 'Origem'}</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => origem === 'equipe'
            ? <LinhaEquipe key={(l as ExemploEquipe).id} e={l as ExemploEquipe} categorias={categorias} pode={pode} onMudou={onMudou} onErro={onErro} />
            : (
              <tr key={i} className="border-b border-linha">
                <td className="px-4 py-2 text-texto">{l.texto}</td>
                <td className="px-3 py-2 text-texto-2">{nomeCategoria(l.categoria)}</td>
                <td className="px-4 py-2 text-[13px] text-texto-3">
                  {origem === 'reais' ? ((l as Dados['reais'][number]).fonte === 'pessoa' ? 'confirmado pela pessoa' : 'corrigido pela equipe') : 'simulado'}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function LinhaEquipe({ e, categorias, pode, onMudou, onErro }: {
  e: ExemploEquipe; categorias: string[]; pode: boolean; onMudou: (texto: string) => void; onErro: (e: unknown, p: string) => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const mudar = async (corpo: Partial<Pick<ExemploEquipe, 'categoria' | 'ativo'>>, ok: string) => {
    setOcupado(true);
    try { await api(`/ml/exemplos/${e.id}`, atualizar(corpo)); onMudou(ok); } catch (x) { onErro(x, 'Não foi possível salvar.'); } finally { setOcupado(false); }
  };
  const remover = async () => {
    setOcupado(true);
    try { await api(`/ml/exemplos/${e.id}`, { method: 'DELETE' }); onMudou('Exemplo removido.'); } catch (x) { onErro(x, 'Não foi possível remover.'); } finally { setOcupado(false); }
  };
  return (
    <tr className={`border-b border-linha align-top ${e.ativo ? '' : 'text-texto-3'}`}>
      <td className="px-4 py-2">
        <span className={e.ativo ? 'text-texto' : 'line-through decoration-texto-3/60'}>{e.texto}</span>
        {!e.ativo && <span className="ml-2 text-[12px] font-semibold text-texto-2">pausado</span>}
      </td>
      <td className="px-3 py-1.5">
        {pode ? (
          <select value={e.categoria} disabled={ocupado} aria-label="Necessidade do exemplo"
            onChange={(x) => mudar({ categoria: x.target.value }, 'Necessidade do exemplo trocada.')}
            className="h-8 w-full rounded-[3px] border border-linha-forte bg-superficie px-2 text-[13.5px] text-texto hover:border-texto-3 focus:border-caneta focus:outline-none">
            {categorias.map((c) => <option key={c} value={c}>{nomeCategoria(c)}</option>)}
          </select>
        ) : <span className="text-texto-2">{nomeCategoria(e.categoria)}</span>}
      </td>
      <td className="px-4 py-2">
        <span className="block truncate text-[13px] text-texto-2">{e.criado_por ?? '—'}{e.origem === 'importacao' ? ' (importado)' : ''}</span>
        <span className="dado block text-[12px] text-texto-3">{dataHora(e.atualizado_em ?? e.criado_em)}</span>
        {pode && (
          <span className="mt-1 flex gap-1">
            <Botao tamanho="sm" variante="fantasma" icone={e.ativo ? Pause : Play} disabled={ocupado}
              onClick={() => mudar({ ativo: !e.ativo }, e.ativo ? 'Exemplo pausado: fica fora do próximo treino.' : 'Exemplo de volta ao treino.')}>
              {e.ativo ? 'Pausar' : 'Ativar'}
            </Botao>
            <Botao tamanho="sm" variante="fantasma" icone={Trash2} disabled={ocupado} onClick={remover} aria-label="Remover exemplo">Remover</Botao>
          </span>
        )}
      </td>
    </tr>
  );
}
