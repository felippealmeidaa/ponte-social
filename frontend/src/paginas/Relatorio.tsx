import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, FileSpreadsheet, Printer, ShieldAlert } from 'lucide-react';
import { api, baixarArquivo, ErroApi } from '../api';
import { Aviso, Botao, Esqueleto } from '../components/ui';
import { useAtualizacao } from '../useAtualizacao';
import { corCategoria, duracao } from '../vocabulario';

// Relatório do mês para a coordenação: o mesmo conteúdo na tela, impresso/salvo em PDF e na planilha.
interface GrupoTempo { casos: number; atendidos: number; mediana_min: number | null }
interface DadosRelatorio {
  ano: number; mes: number; titulo: string; unidade: string; gerado_em: string;
  resumo: {
    casos: number; mes_anterior: number; urgentes: number; concluidos: number; em_aberto: number; sem_bairro: number;
    por_canal: Record<string, number>; por_situacao: Record<string, number>;
  };
  por_categoria: { categoria: string; nome: string; casos: number; mes_anterior: number; concluidos: number; mediana_resposta_min: number | null }[];
  por_bairro: { bairro: string; casos: number; principal: string; principal_casos: number; urgentes: number }[];
  tempo_resposta: { unidade_id: string | null; nome: string; urgentes: GrupoTempo; demais: GrupoTempo }[];
  notas: { respostas: number; media: number | null; por_nota: Record<string, number>; por_unidade: { nome: string; respostas: number; media: number }[] };
  acerto_ia: {
    casos: number; confirmadas_pela_pessoa: number; aceitas_pela_pessoa: number; corrigidas_pela_equipe: number;
    iguais_a_sugestao: number; violencia_nao_percebida: number; trocas_mais_comuns: { de: string; para: string; casos: number }[];
  };
  modelo: { nome: string; f1_macro: number; acuracia: number; recall_violencia: number } | null;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// Últimos 12 meses, do atual para trás ("2026-10")
function ultimosMeses() {
  const hoje = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    return { valor: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, rotulo: `${MESES[d.getMonth()]} de ${d.getFullYear()}` };
  });
}

const pct = (parte: number, total: number) => (total ? `${Math.round((100 * parte) / total)}%` : '–');
const num = (n: number) => n.toLocaleString('pt-BR');

function variacao(agora: number, antes: number) {
  if (!antes) return agora ? 'sem casos no mês anterior' : '';
  const v = Math.round((100 * (agora - antes)) / antes);
  return v === 0 ? 'igual ao mês anterior' : `${v > 0 ? '+' : '−'}${Math.abs(v)}% em relação ao mês anterior (${num(antes)})`;
}

export function Relatorio() {
  const meses = ultimosMeses();
  const [mes, setMes] = useState(meses[0].valor);
  const [baixando, setBaixando] = useState(false);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const { dados, erro } = useAtualizacao(useCallback(() => api<DadosRelatorio>(`/triagem/relatorio?mes=${mes}`), [mes]), 120000);

  // O papel é sempre claro: no modo escuro, troca o tema só durante a impressão (botão ou Ctrl+P)
  useEffect(() => {
    let anterior: string | undefined;
    const antes = () => { anterior = document.documentElement.dataset.tema; document.documentElement.dataset.tema = 'claro'; };
    const depois = () => { if (anterior) document.documentElement.dataset.tema = anterior; };
    window.addEventListener('beforeprint', antes);
    window.addEventListener('afterprint', depois);
    return () => { window.removeEventListener('beforeprint', antes); window.removeEventListener('afterprint', depois); };
  }, []);

  async function planilha() {
    setBaixando(true);
    setErroArquivo(null);
    try {
      await baixarArquivo(`/triagem/relatorio.xlsx?mes=${mes}`, `relatorio-${mes}.xlsx`);
    } catch (e) {
      setErroArquivo(e instanceof ErroApi ? e.message : 'Não foi possível baixar a planilha.');
    } finally {
      setBaixando(false);
    }
  }

  return (
    <article className="relatorio">
      <div className="nao-imprimir mb-6 flex flex-wrap items-center justify-between gap-3">
        <a href="#/indicadores" className="inline-flex items-center gap-1.5 text-[14px] text-texto-2 hover:text-texto">
          <ArrowLeft className="size-4" aria-hidden />Indicadores
        </a>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="mes-relatorio">Mês do relatório</label>
          <select id="mes-relatorio" value={mes} onChange={(e) => setMes(e.target.value)}
            className="h-10 rounded-[5px] border border-linha-forte bg-superficie px-2.5 text-[14.5px]">
            {meses.map((m) => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
          </select>
          <Botao icone={FileSpreadsheet} onClick={planilha} carregando={baixando} disabled={!dados}>Baixar planilha</Botao>
          <Botao variante="primario" icone={Printer} onClick={() => window.print()} disabled={!dados}>Imprimir ou salvar em PDF</Botao>
        </div>
      </div>

      {(erro || erroArquivo) && <div className="nao-imprimir mb-4"><Aviso>{erro ?? erroArquivo}</Aviso></div>}
      {!dados && !erro && <div className="flex flex-col gap-6" aria-busy="true"><Esqueleto className="h-20" /><Esqueleto className="h-72" /></div>}
      {dados && <Conteudo d={dados} />}
    </article>
  );
}

function Conteudo({ d }: { d: DadosRelatorio }) {
  const r = d.resumo;
  const gerado = new Date(d.gerado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const ia = d.acerto_ia;

  return (
    <>
      <header className="mb-8 border-b-2 border-texto pb-4">
        <p className="text-[13px] text-texto-2">Ponte Social · {d.unidade}</p>
        <h1 className="titulo mt-1 text-[35px] leading-[1.05]">Relatório de {d.titulo}</h1>
        <p className="mt-2 text-[13px] text-texto-3">Gerado em {gerado}. Conta os casos que chegaram no mês (horário de Brasília); os exemplos de demonstração não entram.</p>
      </header>

      {r.casos === 0 ? (
        <p className="text-[17px] text-texto-2">Nenhum caso chegou em {d.titulo}{r.mes_anterior ? ` (no mês anterior foram ${num(r.mes_anterior)})` : ''}.</p>
      ) : (
        <div className="flex flex-col gap-9">
          <section aria-label="Resumo do mês">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              <Numero rotulo="Casos no mês" valor={num(r.casos)} nota={variacao(r.casos, r.mes_anterior)} />
              <Numero rotulo="Com sinal de violência" valor={num(r.urgentes)} nota={pct(r.urgentes, r.casos) + ' dos casos'} urgente={r.urgentes > 0} />
              <Numero rotulo="Concluídos" valor={num(r.concluidos)} nota={pct(r.concluidos, r.casos) + ' dos casos'} />
              <Numero rotulo="Ainda em aberto" valor={num(r.em_aberto)} nota="aguardando ou em atendimento hoje" />
            </dl>
            <p className="mt-4 text-[14px] text-texto-2">
              Entrada: {Object.entries(r.por_canal).map(([k, v]) => `${k} ${num(v)}`).join(' · ')}.
              {r.sem_bairro > 0 && ` ${num(r.sem_bairro)} caso${r.sem_bairro > 1 ? 's' : ''} sem bairro informado.`}
            </p>
          </section>

          <Secao titulo="Necessidades">
            <Tabela cabecalho={['Necessidade', 'Casos', 'Mês anterior', 'Concluídos', 'Primeira resposta (mediana)']} direita={[1, 2, 3, 4]}
              linhas={d.por_categoria.map((c) => [
                <span key="n" className="inline-flex items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: corCategoria(c.categoria) }} aria-hidden />
                  {c.categoria === 'violencia_protecao' && <ShieldAlert className="size-4 text-urgente" aria-hidden />}{c.nome}
                </span>,
                `${num(c.casos)} (${pct(c.casos, r.casos)})`, num(c.mes_anterior), num(c.concluidos),
                c.mediana_resposta_min === null ? 'sem resposta ainda' : duracao(c.mediana_resposta_min),
              ])} />
          </Secao>

          {d.por_bairro.length > 0 && (
            <Secao titulo="Bairros">
              <Tabela cabecalho={['Bairro', 'Casos', 'Necessidade mais pedida', 'Com violência']} direita={[1, 3]}
                linhas={d.por_bairro.map((b) => [b.bairro, num(b.casos), `${b.principal} (${num(b.principal_casos)})`, b.urgentes ? num(b.urgentes) : '–'])} />
            </Secao>
          )}

          {d.tempo_resposta.length > 0 && (
            <Secao titulo="Tempo até a primeira resposta" descricao="Da chegada do caso até a equipe assumir ou marcar “Em atendimento”. Mediana: metade dos casos foi respondida mais rápido que isso.">
              <Tabela cabecalho={['Unidade', 'Violência', 'Demais casos']}
                linhas={d.tempo_resposta.map((t) => [t.nome, tempo(t.urgentes), tempo(t.demais)])} />
            </Secao>
          )}

          <Secao titulo="Nota das pessoas atendidas">
            {d.notas.media === null ? (
              <p className="text-[14.5px] text-texto-2">Nenhuma nota recebida no mês. A pergunta vai pelo WhatsApp quando o caso é concluído.</p>
            ) : (
              <>
                <p className="mb-3 text-[15px] text-texto-2">
                  Média <strong className="titulo text-[24px] text-texto tabular">{d.notas.media.toLocaleString('pt-BR')}</strong> de 5,
                  em {num(d.notas.respostas)} resposta{d.notas.respostas > 1 ? 's' : ''}
                  {' '}({Object.entries(d.notas.por_nota).filter(([, n]) => n).map(([k, n]) => `nota ${k}: ${num(n)}`).join(', ')}).
                </p>
                {d.notas.por_unidade.length > 1 && (
                  <Tabela cabecalho={['Unidade', 'Respostas', 'Média']} direita={[1, 2]}
                    linhas={d.notas.por_unidade.map((u) => [u.nome, num(u.respostas), u.media.toLocaleString('pt-BR')])} />
                )}
              </>
            )}
          </Secao>

          <Secao titulo="Acerto da IA" descricao="Como a necessidade sugerida pela IA se saiu nos casos reais do mês. A IA só sugere; quem decide é a equipe.">
            <ul className="flex flex-col gap-1.5 text-[14.5px] text-texto-2">
              <li>Em <strong className="text-texto tabular">{num(ia.iguais_a_sugestao)}</strong> de {num(ia.casos)} casos ({pct(ia.iguais_a_sugestao, ia.casos)}) a necessidade final é a que a IA sugeriu.</li>
              {ia.confirmadas_pela_pessoa > 0 && (
                <li>Das {num(ia.confirmadas_pela_pessoa)} pessoas que responderam “está certo?”, <strong className="text-texto tabular">{num(ia.aceitas_pela_pessoa)}</strong> aceitaram a sugestão ({pct(ia.aceitas_pela_pessoa, ia.confirmadas_pela_pessoa)}).</li>
              )}
              <li>A equipe corrigiu <strong className="text-texto tabular">{num(ia.corrigidas_pela_equipe)}</strong> caso{ia.corrigidas_pela_equipe === 1 ? '' : 's'}; as correções viram exemplos para treinar o modelo.</li>
              {ia.violencia_nao_percebida > 0 && (
                <li className="text-urgente"><ShieldAlert className="mr-1 inline size-4 align-[-3px]" aria-hidden />
                  <strong className="tabular">{num(ia.violencia_nao_percebida)}</strong> caso{ia.violencia_nao_percebida > 1 ? 's' : ''} de violência não {ia.violencia_nao_percebida > 1 ? 'foram percebidos' : 'foi percebido'} pela IA e {ia.violencia_nao_percebida > 1 ? 'foram corrigidos' : 'foi corrigido'} pela equipe.</li>
              )}
            </ul>
            {ia.trocas_mais_comuns.length > 0 && (
              <div className="mt-4">
                <Tabela cabecalho={['Correção mais comum (IA → equipe)', 'Casos']} direita={[1]}
                  linhas={ia.trocas_mais_comuns.map((t) => [`${t.de} → ${t.para}`, num(t.casos)])} />
              </div>
            )}
            {d.modelo && (
              <p className="mt-4 text-[13px] text-texto-3">
                Modelo em uso ({d.modelo.nome}) no teste fixo: F1 macro {d.modelo.f1_macro.toLocaleString('pt-BR')}, acurácia {d.modelo.acuracia.toLocaleString('pt-BR')},
                recall de violência {d.modelo.recall_violencia.toLocaleString('pt-BR')}. Detalhes na aba Modelo de IA.
              </p>
            )}
          </Secao>
        </div>
      )}
    </>
  );
}

function tempo(g: GrupoTempo) {
  if (!g.casos) return <span className="text-texto-3">sem casos</span>;
  if (g.mediana_min === null) return `${num(g.casos)} sem resposta ainda`;
  return <>{duracao(g.mediana_min)} <span className="text-[12.5px] text-texto-3">({num(g.atendidos)} de {num(g.casos)} respondidos)</span></>;
}

function Numero({ rotulo, valor, nota, urgente }: { rotulo: string; valor: string; nota: string; urgente?: boolean }) {
  return (
    <div className="border-l-2 border-linha-forte pl-3">
      <dt className="text-[13px] text-texto-2">{rotulo}</dt>
      <dd className={`titulo text-[30px] leading-tight tabular ${urgente ? 'text-urgente' : ''}`}>{valor}</dd>
      {nota && <dd className="text-[12.5px] text-texto-3">{nota}</dd>}
    </div>
  );
}

function Secao({ titulo, descricao, children }: { titulo: string; descricao?: string; children: ReactNode }) {
  return (
    <section className="relatorio-secao">
      <h2 className="titulo mb-1.5 text-[22px] leading-[1.05]">{titulo}</h2>
      {descricao && <p className="mb-3 max-w-[75ch] text-[14px] text-texto-2">{descricao}</p>}
      {!descricao && <div className="mb-3" />}
      {children}
    </section>
  );
}

function Tabela({ cabecalho, linhas, direita = [] }: { cabecalho: string[]; linhas: ReactNode[][]; direita?: number[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse text-left text-[14.5px]">
        <thead>
          <tr className="border-b-2 border-texto text-[13px] text-texto-2">
            {cabecalho.map((c, i) => <th key={c} scope="col" className={`px-3 py-2 font-semibold ${direita.includes(i) ? 'text-right' : ''}`}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-b border-linha">
              {l.map((v, j) => j === 0
                ? <th key={j} scope="row" className="px-3 py-2 font-semibold">{v}</th>
                : <td key={j} className={`px-3 py-2 tabular ${direita.includes(j) ? 'text-right' : ''}`}>{v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
