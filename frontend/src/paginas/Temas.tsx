import { useCallback, useState } from 'react';
import { Layers, Shuffle } from 'lucide-react';
import { api } from '../api';
import { AvisoDemoDesligado } from '../components/AvisoDemo';
import { Aviso, Esqueleto, Vazio } from '../components/ui';
import { useAtualizacao } from '../useAtualizacao';
import { corCategoria, nomeCategoria } from '../vocabulario';

// Indicadores › Temas dos relatos: relatos parecidos agrupados sozinhos (sem rótulo). Uma pista para a equipe ver
// assuntos que se repetem; não é classificação. Violência não entra.

interface Tema {
  palavras: string[];
  casos: number;
  ultimos_7_dias: number;
  relatos_diferentes: number;
  necessidades: { categoria: string; casos: number }[];
  necessidade_principal: string;
  parcela_principal: number;
  varias_necessidades: boolean;
  variado: boolean;
  exemplos: string[];
}
interface RespostaTemas { periodo_dias: number; casos_analisados: number; minimo: number; suficiente: boolean; temas: Tema[]; exemplos_fora: number }

const PERIODOS = [30, 90, 180];

export function Temas() {
  const [dias, setDias] = useState(30);
  const { dados, erro, recarregar } = useAtualizacao(useCallback(() => api<RespostaTemas>(`/triagem/indicadores/temas?dias=${dias}`), [dias]), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="max-w-[75ch] text-[14.5px] text-texto-2">
          Relatos parecidos agrupados sozinhos, pelas palavras que as pessoas usam. Serve para ver assuntos que se
          repetem, inclusive os que não cabem numa necessidade só. É uma pista para a equipe olhar, não uma classificação.
          Violência não entra.
        </p>
        <div role="group" aria-label="Período" className="flex rounded-[3px] border border-linha-forte p-1">
          {PERIODOS.map((p) => (
            <button key={p} aria-pressed={dias === p} onClick={() => setDias(p)}
              className={`h-8 rounded-[3px] px-3 text-[13px] ${dias === p ? 'bg-caneta-fundo font-semibold text-caneta' : 'text-texto-2 hover:text-texto'}`}>
              {p} dias
            </button>
          ))}
        </div>
      </div>

      {dados && <AvisoDemoDesligado quantos={dados.exemplos_fora} onLigado={recarregar} />}
      {erro && <Aviso>{erro}</Aviso>}
      {!dados && !erro && <Esqueleto className="h-72" />}
      {dados && !dados.suficiente && (
        <Vazio icone={Layers} titulo="Poucos relatos para agrupar">
          No período há {dados.casos_analisados} {dados.casos_analisados === 1 ? 'relato' : 'relatos'} (sem violência). Os temas
          aparecem a partir de {dados.minimo}. Aumente o período ou espere chegarem mais casos.
        </Vazio>
      )}
      {dados?.suficiente && (
        <>
          <p className="text-[13.5px] text-texto-3">
            {dados.casos_analisados} relatos analisados em {dados.temas.length} temas. Temas com menos de 3 casos não aparecem.
          </p>
          <ul className="grid gap-4 lg:grid-cols-2">
            {dados.temas.map((t, i) => <CartaoTema key={i} tema={t} />)}
          </ul>
        </>
      )}
    </div>
  );
}

function CartaoTema({ tema: t }: { tema: Tema }) {
  return (
    <li className={`flex flex-col gap-3 rounded-[4px] border bg-superficie p-4 ${t.variado ? 'border-dashed border-linha' : 'border-linha'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {t.variado ? (
          <h3 className="flex items-center gap-1.5 text-[15px] font-semibold text-texto-2">
            <Shuffle className="size-4" aria-hidden />Relatos variados
          </h3>
        ) : (
          <h3 className="text-[16px] font-semibold leading-tight">{t.palavras.join(' · ')}</h3>
        )}
        <span className="text-[13.5px] text-texto-2">
          <strong className="dado font-semibold text-texto">{t.casos}</strong> casos
          {t.ultimos_7_dias > 0 && <> · <span className="dado">{t.ultimos_7_dias}</span> nos últimos 7 dias</>}
        </span>
      </div>
      {t.variado && <p className="text-[13px] text-texto-3">Relatos pouco parecidos entre si, que não formaram um tema ({t.palavras.join(', ')}).</p>}

      {/* Necessidades que o sistema deu aos casos do tema */}
      <div className="flex flex-col gap-1.5">
        <div className="flex h-2.5 overflow-hidden rounded-full bg-realce" aria-hidden>
          {t.necessidades.map((n) => (
            <span key={n.categoria} style={{ width: `${(n.casos / t.casos) * 100}%`, background: corCategoria(n.categoria) }} />
          ))}
        </div>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-texto-2">
          {t.necessidades.map((n) => (
            <span key={n.categoria} className="flex items-center gap-1">
              <span aria-hidden className="size-2 rounded-full" style={{ background: corCategoria(n.categoria) }} />
              {nomeCategoria(n.categoria)} <span className="dado">{n.casos}</span>
            </span>
          ))}
          {t.varias_necessidades && !t.variado && (
            <span className="rounded-[3px] border border-linha-forte px-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-texto-2">várias necessidades</span>
          )}
        </p>
      </div>

      {t.exemplos.length > 0 && (
        <ul className="flex flex-col gap-1.5 border-l-2 border-linha pl-3">
          {t.exemplos.map((e, i) => <li key={i} className="text-[13.5px] italic leading-snug text-texto-2">“{e}”</li>)}
        </ul>
      )}
    </li>
  );
}
