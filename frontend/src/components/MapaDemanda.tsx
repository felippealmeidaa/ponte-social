import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Map as IconeMapa, Table2 } from 'lucide-react';
import { api } from '../api';
import { useAtualizacao } from '../useAtualizacao';
import { Painel } from './ui';
import { corCategoria, nomeCategoria } from '../vocabulario';

// Mapa de demandas: um ponto por bairro (média dos pontos aproximados das conversas ou centro do bairro), nunca por pessoa.
interface Bairro { bairro: string; total: number; urgentes: number; por_categoria: Record<string, number>; lat: number; lng: number; origem: 'conversas' | 'bairro' }
interface SemPonto { bairro: string; total: number; por_categoria: Record<string, number> }
interface Mapa { periodo_dias: number; bairros: Bairro[]; sem_ponto: SemPonto[]; sem_bairro: number; unidades: { nome: string; lat: number; lng: number }[] }

const TODAS = 'todas';
// Centro de Anápolis, para quando ainda não há nenhum bairro no mapa
const CENTRO: L.LatLngTuple = [-16.3281, -48.9534];

// O leaflet.heat é um plugin antigo que procura o Leaflet no window
let heat: Promise<unknown> | null = null;
function carregarCalor() {
  (window as unknown as { L: typeof L }).L = L;
  return (heat ??= import('leaflet.heat'));
}

// O canvas do calor não entende var(--...): lê a cor já resolvida do tema atual
function corResolvida(css: string) {
  const nome = css.match(/var\((--[^)]+)\)/)?.[1];
  return nome ? getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || '#0e6b67' : css;
}

function useTemaAtual() {
  const [tema, setTema] = useState(document.documentElement.dataset.tema);
  useEffect(() => {
    const obs = new MutationObserver(() => setTema(document.documentElement.dataset.tema));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });
    return () => obs.disconnect();
  }, []);
  return tema;
}

const contagem = (b: { total: number; por_categoria: Record<string, number> }, categoria: string) =>
  categoria === TODAS ? b.total : (b.por_categoria[categoria] ?? 0);

export function MapaDemanda({ dias }: { dias: number }) {
  const { dados } = useAtualizacao(useCallback(() => api<Mapa>(`/triagem/indicadores/mapa?dias=${dias}`), [dias]), 60000);
  const [categoria, setCategoria] = useState(TODAS);
  const [tabela, setTabela] = useState(false);
  const tema = useTemaAtual();

  const categorias = useMemo(() => {
    const soma: Record<string, number> = {};
    for (const b of [...(dados?.bairros ?? []), ...(dados?.sem_ponto ?? [])])
      for (const [c, n] of Object.entries(b.por_categoria)) soma[c] = (soma[c] ?? 0) + n;
    return Object.entries(soma).sort((a, b) => b[1] - a[1]);
  }, [dados]);

  const linhas = useMemo(() => [...(dados?.bairros ?? []), ...(dados?.sem_ponto ?? [])]
    .map((b) => ({ ...b, n: contagem(b, categoria), noMapa: 'lat' in b }))
    .filter((b) => b.n > 0)
    .sort((a, b) => b.n - a.n), [dados, categoria]);

  if (!dados || dados.bairros.length + dados.sem_ponto.length === 0) return null;
  const cor = categoria === TODAS ? 'var(--color-acao)' : corCategoria(categoria);

  return (
    <Painel id="t-mapa" titulo="Onde está a demanda"
      acao={
        <button onClick={() => setTabela((t) => !t)} className="inline-flex items-center gap-1.5 text-[13px] text-texto-2 hover:text-texto">
          {tabela ? <IconeMapa className="size-4" aria-hidden /> : <Table2 className="size-4" aria-hidden />}
          {tabela ? 'Ver mapa' : 'Ver como tabela'}
        </button>
      }>
      <p className="mb-4 max-w-[75ch] text-[14px] text-texto-2">
        Casos do período por bairro. Cada bairro é um ponto só (a média dos pontos aproximados que as pessoas informaram, ou o centro do bairro): nenhuma casa aparece no mapa.
      </p>

      <div role="group" aria-label="Necessidade mostrada" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
        {[[TODAS, dados.bairros.reduce((s, b) => s + b.total, 0) + dados.sem_ponto.reduce((s, b) => s + b.total, 0)] as [string, number], ...categorias].map(([c, n]) => (
          <button key={c} aria-pressed={categoria === c} onClick={() => setCategoria(c)}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[3px] border px-3 text-[13px] ${categoria === c ? 'border-caneta bg-caneta-fundo text-caneta font-semibold' : 'border-linha-forte text-texto-2 hover:text-texto'}`}>
            {c !== TODAS && <span className="size-2.5 rounded-full" style={{ background: corCategoria(c) }} aria-hidden />}
            {c === TODAS ? 'Todas as necessidades' : nomeCategoria(c)}
            <span className="tabular text-[12px] opacity-75">{n}</span>
          </button>
        ))}
      </div>

      {tabela ? (
        <div className="max-h-96 overflow-y-auto rounded-[4px] border border-linha">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-superficie text-left text-texto-2">
              <tr><th className="px-4 py-2 font-medium">Bairro</th><th className="px-4 py-2 font-medium">Mais pedido</th><th className="px-4 py-2 text-right font-medium">Casos</th></tr>
            </thead>
            <tbody>
              {linhas.map((b) => (
                <tr key={b.bairro} className="border-t border-linha">
                  <td className="px-4 py-1.5">{b.bairro}{!b.noMapa && <span className="ml-1.5 text-[12px] text-texto-3">(sem ponto no mapa)</span>}</td>
                  <td className="px-4 py-1.5 text-texto-2">{nomeCategoria(Object.keys(b.por_categoria)[0])}</td>
                  <td className="px-4 py-1.5 text-right tabular">{b.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <MapaLeaflet bairros={dados.bairros} unidades={dados.unidades} categoria={categoria} cor={cor} tema={tema} />
      )}

      {(dados.sem_ponto.length > 0 || dados.sem_bairro > 0) && (
        <p className="mt-3 text-[13px] text-texto-3">
          {dados.sem_ponto.length > 0 && <>Fora do mapa por não ter ponto conhecido: {dados.sem_ponto.map((b) => `${b.bairro} (${b.total})`).join(', ')}. </>}
          {dados.sem_bairro > 0 && <>{dados.sem_bairro} caso{dados.sem_bairro > 1 ? 's' : ''} sem bairro informado.</>}
        </p>
      )}
    </Painel>
  );
}

function MapaLeaflet({ bairros, unidades, categoria, cor, tema }: {
  bairros: Bairro[]; unidades: Mapa['unidades']; categoria: string; cor: string; tema: string | undefined;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const camadas = useRef<L.LayerGroup | null>(null);
  const enquadrado = useRef(false);

  useEffect(() => {
    if (!caixa.current) return;
    const m = L.map(caixa.current, { scrollWheelZoom: false, attributionControl: true }).setView(CENTRO, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 17, attribution: '&copy; colaboradores do <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    mapa.current = m;
    camadas.current = L.layerGroup().addTo(m);
    return () => { m.remove(); mapa.current = null; enquadrado.current = false; };
  }, []);

  useEffect(() => {
    const m = mapa.current, grupo = camadas.current;
    if (!m || !grupo) return;
    let cancelado = false;
    grupo.clearLayers();
    const visiveis = bairros.map((b) => ({ ...b, n: contagem(b, categoria) })).filter((b) => b.n > 0);
    const maximo = Math.max(...visiveis.map((b) => b.n), 1);
    const corFinal = corResolvida(cor);

    carregarCalor().then(() => {
      if (cancelado || !visiveis.length) return;
      const calor = (L as unknown as { heatLayer: (p: [number, number, number][], o: object) => L.Layer }).heatLayer(
        visiveis.map((b) => [b.lat, b.lng, b.n / maximo]),
        { radius: 46, blur: 34, maxZoom: 14, max: 1, minOpacity: 0.4, gradient: { 0.1: `${corFinal}55`, 0.5: `${corFinal}aa`, 1: `${corFinal}ee` } },
      );
      grupo.addLayer(calor);
      // O calor fica embaixo das bolinhas com o número
      grupo.eachLayer((c) => { if (c !== calor && 'bringToFront' in c) (c as L.CircleMarker).bringToFront(); });
    });

    for (const u of unidades) {
      L.marker([u.lat, u.lng], {
        icon: L.divIcon({ className: '', html: '<span class="mapa-cras" aria-hidden="true"></span>', iconSize: [14, 14], iconAnchor: [7, 7] }),
        title: u.nome, keyboard: false, zIndexOffset: -1000,
      }).bindTooltip(u.nome, { direction: 'top', offset: [0, -6] }).addTo(grupo);
    }

    for (const b of visiveis) {
      const tamanho = 22 + Math.round(16 * Math.sqrt(b.n / maximo));
      const detalhes = Object.entries(b.por_categoria).map(([c, n]) => `<li><span style="background:${corCategoria(c)}"></span>${nomeCategoria(c)}<b>${n}</b></li>`).join('');
      L.marker([b.lat, b.lng], {
        icon: L.divIcon({ className: '', html: `<span class="mapa-bairro" style="--tam:${tamanho}px;--cor:${cor}">${b.n}</span>`, iconSize: [tamanho, tamanho], iconAnchor: [tamanho / 2, tamanho / 2] }),
        title: `${b.bairro}: ${b.n} caso${b.n > 1 ? 's' : ''}`, alt: `${b.bairro}: ${b.n} casos`,
      }).bindPopup(
        `<div class="mapa-popup"><strong>${b.bairro.replace(/</g, '&lt;')}</strong><span>${b.total} caso${b.total > 1 ? 's' : ''} no período${b.urgentes ? `, ${b.urgentes} com sinal de violência` : ''}</span><ul>${detalhes}</ul>${b.origem === 'bairro' ? '<em>Ponto no centro do bairro</em>' : ''}</div>`,
      ).addTo(grupo);
    }

    if (!enquadrado.current && visiveis.length) {
      enquadrado.current = true;
      const limites = L.latLngBounds([...visiveis.map((b) => [b.lat, b.lng] as L.LatLngTuple), ...unidades.map((u) => [u.lat, u.lng] as L.LatLngTuple)]);
      m.fitBounds(limites, { padding: [36, 36], maxZoom: 14 });
    }
    return () => { cancelado = true; };
  }, [bairros, unidades, categoria, cor, tema]);

  return (
    <div>
      <div ref={caixa} className="mapa-demanda relative isolate h-[340px] w-full sm:h-[420px] overflow-hidden rounded-[4px] border border-linha" role="region"
        aria-label='Mapa de casos por bairro. Use "Ver como tabela" para os valores.' />
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-texto-3">
        <span className="inline-flex items-center gap-1.5"><span className="mapa-bairro mapa-legenda" style={{ ['--cor' as string]: cor }} aria-hidden />número de casos no bairro (clique para ver as necessidades)</span>
        <span className="inline-flex items-center gap-1.5"><span className="mapa-cras" aria-hidden />CRAS</span>
        <span>Use + e − para aproximar.</span>
      </p>
    </div>
  );
}
