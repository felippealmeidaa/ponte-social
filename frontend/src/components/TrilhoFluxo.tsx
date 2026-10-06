import { Fragment } from 'react';
import { ArrowDown, ArrowRight, Lock, ShieldAlert } from 'lucide-react';
import { COMANDOS, DESVIOS, ETAPAS, SEGURANCA, TRILHO, type Etapa, type Pulada } from '../fluxoBot';

export interface EstadoTrilho {
  selecionada: string | null;
  /** Conversas paradas em cada etapa agora. */
  contagem: Record<string, number>;
  /** Etapas que não acontecem com as opções atuais. */
  puladas: Record<string, Pulada>;
  /** Etapas com texto ou opção diferente do padrão da secretaria (só ao ver um CRAS). */
  personalizadas: Set<string>;
  onAbrir: (id: string) => void;
}

const POR_ID: Record<string, Etapa> = Object.fromEntries(ETAPAS.map((e) => [e.id, e]));

/** Trilho do fluxo: faixa de violência, caminho principal com os desvios embaixo e os comandos à parte. */
export function TrilhoFluxo(estado: EstadoTrilho) {
  return (
    <div className="flex flex-col gap-6 rounded-[6px] border border-linha bg-elevada/60 p-4 sm:p-5">
      <FaixaViolencia {...estado} />
      <ol aria-label="Caminho da conversa, na ordem" className="grid lg:grid-cols-6 lg:gap-x-3">
        {TRILHO.map((id, i) => <Estacao key={id} etapa={POR_ID[id]} indice={i} {...estado} />)}
      </ol>
      <section aria-labelledby="t-comandos" className="flex flex-col gap-2.5 border-t border-linha pt-4">
        <h3 id="t-comandos" className="text-[13.5px] font-semibold text-texto-2">Comandos e situações à parte</h3>
        <ul className="flex flex-wrap gap-2">
          {COMANDOS.map((id) => <li key={id}><ChipEtapa etapa={POR_ID[id]} {...estado} /></li>)}
        </ul>
      </section>
    </div>
  );
}

function FaixaViolencia(estado: EstadoTrilho) {
  return (
    <section aria-labelledby="t-seguranca"
      className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-[5px] border border-urgente/30 bg-urgente-fundo px-3.5 py-3">
      <h3 id="t-seguranca" className="flex items-center gap-2 text-[14px] font-semibold text-urgente-forte">
        <ShieldAlert className="size-4 shrink-0" aria-hidden />
        Violência, em qualquer etapa e em todos os CRAS
      </h3>
      <ol className="flex flex-wrap items-center gap-2">
        {SEGURANCA.map((id, i) => (
          <li key={id} className="flex items-center gap-2">
            {i > 0 && <ArrowRight className="size-3.5 shrink-0 text-urgente" aria-label="depois" />}
            <ChipEtapa etapa={POR_ID[id]} {...estado} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function Estacao({ etapa, indice, ...estado }: EstadoTrilho & { etapa: Etapa; indice: number }) {
  const { selecionada, puladas, onAbrir } = estado;
  const primeira = indice === 0;
  const ultima = indice === TRILHO.length - 1;
  const ativa = selecionada === etapa.id;
  const pulada = puladas[etapa.id];
  const Icone = etapa.icone;
  const cadeias = DESVIOS[etapa.id] ?? [];

  const circulo = ativa
    ? 'border-texto bg-texto text-sobre ring-4 ring-caneta/20'
    : pulada
      ? 'border-dashed border-linha-forte bg-elevada text-texto-3'
      : 'border-texto bg-superficie text-texto group-hover:bg-realce';

  return (
    <li className="relative flex flex-col pb-7 last:pb-0 lg:items-center lg:pb-0">
      {/* A linha do trilho: vertical no celular, horizontal na tela larga, passando por trás dos círculos */}
      <span aria-hidden className={[
        'absolute bg-linha-forte max-lg:left-[19px] max-lg:w-0.5 lg:top-[19px] lg:h-0.5',
        primeira ? 'max-lg:top-5 lg:left-1/2' : 'max-lg:top-0 lg:-left-1.5',
        ultima ? 'max-lg:h-5 lg:right-1/2' : 'max-lg:bottom-0 lg:-right-1.5',
      ].join(' ')} />

      <button type="button" onClick={() => onAbrir(etapa.id)} aria-pressed={ativa}
        className="group relative flex items-start gap-3.5 rounded-[6px] text-left focus-visible:outline-none lg:flex-col lg:items-center lg:gap-2 lg:text-center">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-full border-2 transition-[background-color,border-color,box-shadow] duration-150 group-focus-visible:ring-2 group-focus-visible:ring-caneta group-focus-visible:ring-offset-2 ${circulo}`}>
          {etapa.tipo === 'fim'
            ? <Icone className="size-[18px]" aria-hidden />
            : <span className="titulo text-[17px] leading-none tabular">{indice + 1}</span>}
        </span>
        <span className="flex min-w-0 flex-col gap-1 pt-2 lg:pt-0">
          <span className={`text-[15px] font-semibold leading-tight ${pulada && !ativa ? 'text-texto-2' : 'text-texto'} ${ativa ? '' : 'group-hover:underline group-hover:decoration-linha-forte group-hover:underline-offset-4'}`}>
            {etapa.titulo}
          </span>
          <Situacao etapa={etapa} {...estado} />
        </span>
      </button>

      {cadeias.map((cadeia, c) => (
        <div key={c} className="mt-3 flex w-full flex-col gap-1.5 max-lg:pl-[54px] lg:max-w-[210px]">
          {cadeia.map((passo) => (
            <Fragment key={passo.etapa}>
              <span className="flex items-center gap-1 text-[12.5px] text-texto-3 lg:justify-center">
                <ArrowDown className="size-3 shrink-0" aria-hidden />
                {passo.rotulo}
              </span>
              <ChipEtapa etapa={POR_ID[passo.etapa]} cheio {...estado} />
            </Fragment>
          ))}
        </div>
      ))}
    </li>
  );
}

/** Linha curta embaixo do nome: desligada, travada, conversas agora, personalizada. */
export function Situacao({ etapa, contagem, puladas, personalizadas }: EstadoTrilho & { etapa: Etapa }) {
  const n = contagem[etapa.id] ?? 0;
  const partes = [
    puladas[etapa.id] && <span key="p" className="text-texto-3">{puladas[etapa.id].curto}</span>,
    etapa.travada && <span key="t" className="inline-flex items-center gap-1 text-texto-3"><Lock className="size-3" aria-hidden />travada</span>,
    n > 0 && <span key="n" className="rounded-full bg-info-fundo px-1.5 font-medium tabular text-info">{n} agora</span>,
    personalizadas.has(etapa.id) && <span key="c" className="text-caneta">personalizada</span>,
  ].filter(Boolean);
  if (!partes.length) return null;
  return <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] lg:justify-center">{partes}</span>;
}

function ChipEtapa({ etapa, cheio, selecionada, contagem, puladas, personalizadas, onAbrir }: EstadoTrilho & { etapa: Etapa; cheio?: boolean }) {
  const ativa = selecionada === etapa.id;
  const pulada = puladas[etapa.id];
  const n = contagem[etapa.id] ?? 0;
  const Icone = etapa.icone;
  const urgente = etapa.tipo === 'urgente' || etapa.id === 'fila_urgente';
  const estilo = ativa
    ? 'border-caneta bg-caneta-fundo font-semibold text-texto'
    : urgente
      ? 'border-urgente/40 bg-superficie text-urgente-forte hover:border-urgente'
      : pulada
        ? 'border-dashed border-linha-forte bg-transparent text-texto-3 hover:border-texto-3'
        : 'border-linha-forte bg-superficie text-texto hover:border-texto-3';
  return (
    <button type="button" onClick={() => onAbrir(etapa.id)} aria-pressed={ativa}
      title={pulada?.motivo}
      className={`flex items-center gap-2 rounded-[5px] border px-2.5 py-1.5 text-left text-[13.5px] leading-tight transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-caneta ${cheio ? 'w-full' : ''} ${estilo}`}>
      <Icone className={`size-[15px] shrink-0 ${urgente && !ativa ? 'text-urgente' : ativa ? 'text-caneta' : 'text-texto-2'}`} aria-hidden />
      <span className="min-w-0 flex-1">{etapa.titulo}</span>
      {etapa.travada && <Lock className="size-3 shrink-0 text-texto-3" aria-label="travada" />}
      {personalizadas.has(etapa.id) && <span className="size-1.5 shrink-0 rounded-full bg-caneta" aria-label="personalizada" />}
      {n > 0 && <span className="shrink-0 rounded-full bg-info-fundo px-1.5 text-[12px] font-medium tabular text-info" aria-label={`${n} conversa(s) aqui agora`}>{n}</span>}
    </button>
  );
}
