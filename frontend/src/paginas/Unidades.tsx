import { useCallback, useState, type ClipboardEvent, type FormEvent } from 'react';
import { Building2, CircleAlert, ExternalLink, LocateFixed, MapPin, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { api, atualizar, enviar, ErroApi } from '../api';
import { Aviso, Botao, Campo, classeEntrada, Esqueleto, PainelLateral, Selo, Vazio } from '../components/ui';
import { useAtualizacao } from '../useAtualizacao';
import { CATEGORIAS } from '../vocabulario';

// Faixa de funcionamento ("aberto agora"); dias: 0 = segunda ... 6 = domingo
interface Faixa { dias: number[]; abre: string; fecha: string }
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const DIAS_LONGOS = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

type Tipo = 'CRAS' | 'CREAS' | 'CENTRO_POP' | 'CADUNICO' | 'RESTAURANTE_POPULAR' | 'DOCUMENTOS' | 'SINE' | 'OUTRO';

interface Unidade {
  id: string;
  nome: string;
  tipo: Tipo;
  endereco: string;
  telefone: string;
  horario: string;
  funcionamento: Faixa[];
  situacao: { aberto: boolean; texto: string } | null;
  bairros: string[];
  categorias: string[];
  latitude: number | null;
  longitude: number | null;
  mapa: string | null;
  fonte: string;
  verificado_em: string | null;
  ativo: boolean;
}

const TIPOS: Record<Tipo, string> = {
  CRAS: 'CRAS', CREAS: 'CREAS', CENTRO_POP: 'Centro POP', CADUNICO: 'Cadastro Único',
  RESTAURANTE_POPULAR: 'Restaurante popular', DOCUMENTOS: 'Documentos (Vapt Vupt)', SINE: 'Emprego (SINE)', OUTRO: 'Outro',
};
// Mesmo padrão do backend (unidades.CATEGORIAS_POR_TIPO): o que cada tipo de lugar atende
const ASSUNTOS = Object.keys(CATEGORIAS).filter((c) => c !== 'nao_identificado');
const PADRAO_DO_TIPO: Record<Tipo, string[]> = {
  CRAS: ASSUNTOS.filter((c) => c !== 'violencia_protecao'),
  CREAS: ['violencia_protecao'],
  CENTRO_POP: ['moradia', 'alimentacao', 'documentacao'],
  CADUNICO: ['cadastro_atualizacao', 'renda_beneficio'],
  RESTAURANTE_POPULAR: ['alimentacao'],
  DOCUMENTOS: ['documentacao'],
  SINE: ['trabalho_renda'],
  OUTRO: [],
};
const VAZIA: Omit<Unidade, 'id'> = {
  nome: '', tipo: 'CRAS', endereco: '', telefone: '', horario: '', funcionamento: [], situacao: null, bairros: [], categorias: PADRAO_DO_TIPO.CRAS,
  latitude: null, longitude: null, mapa: null, fonte: '', verificado_em: null, ativo: true,
};
const ORDEM_TIPOS = Object.keys(TIPOS) as Tipo[];
const linkMapa = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lng}`;

export function Unidades() {
  const { dados, erro, recarregar } = useAtualizacao(useCallback(() => api<Unidade[]>('/configuracao/unidades'), []), 0);
  const [editando, setEditando] = useState<Unidade | 'nova' | null>(null);
  const fechar = useCallback(() => setEditando(null), []);

  if (erro) return <Aviso>{erro}</Aviso>;
  if (!dados) return <Esqueleto className="h-64" />;

  const temCras = dados.some((u) => u.tipo === 'CRAS' && u.ativo);
  const semMapa = dados.filter((u) => u.ativo && u.latitude === null).length;
  const aConferir = dados.filter((u) => u.ativo && (!u.fonte || !u.verificado_em)).length;
  const grupos = ORDEM_TIPOS.map((tipo) => ({ tipo, lista: dados.filter((u) => u.tipo === tipo) })).filter((g) => g.lista.length);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-[70ch] text-sm text-texto-2">
          {temCras
            ? 'O bot pergunta se a pessoa quer informar a localização, o CEP ou o bairro e indica primeiro onde pedir o benefício (o CRAS dela no topo) e depois os lugares de ajuda imediata, como restaurante popular e Centro POP, com endereço, horário e link do mapa.'
            : 'Enquanto não houver CRAS cadastrado, o bot não pergunta a localização e usa o texto “Onde ir” de cada necessidade.'}
          {' '}Use a lista oficial da prefeitura e registre a fonte.
        </p>
        <Botao variante="primario" icone={Plus} onClick={() => setEditando('nova')}>Novo lugar</Botao>
      </div>

      {aConferir > 0 && (
        <Aviso tom="info">
          {aConferir === 1 ? '1 lugar ativo ainda não foi conferido' : `${aConferir} lugares ativos ainda não foram conferidos`} com a prefeitura.
          Confira endereço, telefone e horário, registre a fonte e preencha “Conferido em”.
        </Aviso>
      )}
      {semMapa > 0 && (
        <Aviso>
          {semMapa === 1 ? '1 lugar ativo está sem ponto no mapa' : `${semMapa} lugares ativos estão sem ponto no mapa`}: o bot não consegue medir a distância até {semMapa === 1 ? 'ele' : 'eles'}.
        </Aviso>
      )}

      {dados.length === 0 ? (
        <Vazio icone={Building2} titulo="Nenhum lugar cadastrado">
          Cadastre os CRAS, o CREAS e os outros lugares da rede, com endereço e ponto no mapa.
        </Vazio>
      ) : (
        grupos.map(({ tipo, lista }) => (
          <section key={tipo} aria-labelledby={`grupo-${tipo}`} className="flex flex-col gap-2">
            <h3 id={`grupo-${tipo}`} className="text-[13.5px] font-semibold text-texto-2">{TIPOS[tipo]} ({lista.length})</h3>
            <ul className="grid gap-3 md:grid-cols-2">
              {lista.map((u) => (
                <li key={u.id}>
                  <button onClick={() => setEditando(u)}
                    className="flex h-full w-full flex-col gap-2 rounded-[4px] border border-linha bg-superficie p-4 text-left hover:border-linha-forte">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={`font-medium ${u.ativo ? '' : 'text-texto-3 line-through'}`}>{u.nome}</span>
                      {u.tipo === 'CREAS' && <Selo tom="urgente" semIcone>Violência</Selo>}
                      {(!u.fonte || !u.verificado_em) && <span className="text-[12px] text-caneta">a conferir</span>}
                      {u.latitude === null && <span className="text-[12px] text-urgente">sem ponto no mapa</span>}
                    </span>
                    {u.endereco && <span className="flex items-start gap-1.5 text-[13px] text-texto-2"><MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />{u.endereco}</span>}
                    {u.situacao ? (
                      <span className={`flex items-center gap-1.5 text-[13px] font-medium ${u.situacao.aberto ? 'text-ok' : 'text-texto-2'}`}>
                        <span aria-hidden className={`size-2 shrink-0 rounded-full ${u.situacao.aberto ? 'bg-ok' : 'bg-texto-3'}`} />{u.situacao.texto}
                      </span>
                    ) : u.ativo && <span className="text-[12px] text-texto-3">sem horário de funcionamento: o bot não diz se está aberto</span>}
                    <span className="text-[13px] text-texto-3">
                      Atende: {u.categorias.map((c) => CATEGORIAS[c] ?? c).join(', ') || 'nada marcado'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {temCras && <TestarBairro />}

      <PainelLateral aberto={editando !== null} titulo={editando === 'nova' ? 'Novo lugar' : 'Editar lugar'} onFechar={fechar}>
        {editando && (
          <FormUnidade key={editando === 'nova' ? 'nova' : editando.id} unidade={editando === 'nova' ? null : editando}
            onPronto={() => { fechar(); recarregar(); }} />
        )}
      </PainelLateral>
    </div>
  );
}

interface ResultadoBairro { bairro: string; unidade: Unidade | null; como: 'lista' | 'distancia' | null; km: number | null }

function TestarBairro() {
  const [bairro, setBairro] = useState('');
  const [resultado, setResultado] = useState<ResultadoBairro | null>(null);
  const [buscando, setBuscando] = useState(false);

  const buscar = async (e: FormEvent) => {
    e.preventDefault();
    if (!bairro.trim()) return;
    setBuscando(true);
    try {
      setResultado(await api(`/configuracao/unidades/buscar?bairro=${encodeURIComponent(bairro)}`));
    } finally {
      setBuscando(false);
    }
  };

  return (
    <section aria-labelledby="t-testar-bairro" className="rounded-[4px] border border-linha bg-superficie p-4">
      <h3 id="t-testar-bairro" className="font-medium">Testar um bairro</h3>
      <p className="mt-1 text-[13px] text-texto-2">
        Veja qual CRAS o bot indicaria. Primeiro vale a lista de bairros de cada CRAS; sem ela, o CRAS mais perto do bairro no mapa.
      </p>
      <form onSubmit={buscar} className="mt-3 flex flex-wrap gap-2">
        <label htmlFor="testar-bairro" className="sr-only">Bairro</label>
        <input id="testar-bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Ex.: Vila Jaiara" className={`${classeEntrada} max-w-xs`} />
        <Botao type="submit" icone={Search} carregando={buscando}>Testar</Botao>
      </form>
      {resultado && (
        <p role="status" className="mt-3 text-sm">
          {resultado.unidade && resultado.como === 'lista' && (
            <>“{resultado.bairro}” está na lista do <strong className="font-semibold">{resultado.unidade.nome}</strong>.</>
          )}
          {resultado.unidade && resultado.como === 'distancia' && (
            <>“{resultado.bairro}” não está em nenhuma lista. O CRAS mais perto no mapa é o <strong className="font-semibold">{resultado.unidade.nome}</strong>, a {String(resultado.km).replace('.', ',')} km em linha reta.</>
          )}
          {!resultado.unidade && <span className="text-texto-2">Não achei “{resultado.bairro}” na lista nem no mapa. O bot vai sugerir mandar a localização ou ligar no Disque Social 121.</span>}
        </p>
      )}
    </section>
  );
}

function FormUnidade({ unidade, onPronto }: { unidade: Unidade | null; onPronto: () => void }) {
  const base = unidade ?? { ...VAZIA, id: '' };
  const [nome, setNome] = useState(base.nome);
  const [tipo, setTipo] = useState<Tipo>(base.tipo);
  const [categorias, setCategorias] = useState<string[]>(base.categorias);
  const [endereco, setEndereco] = useState(base.endereco);
  const [latitude, setLatitude] = useState(base.latitude === null ? '' : String(base.latitude));
  const [longitude, setLongitude] = useState(base.longitude === null ? '' : String(base.longitude));
  const [telefone, setTelefone] = useState(base.telefone);
  const [horario, setHorario] = useState(base.horario);
  const [faixas, setFaixas] = useState<Faixa[]>(base.funcionamento);
  const [bairros, setBairros] = useState(base.bairros.join('\n'));
  const [fonte, setFonte] = useState(base.fonte);
  const [verificadoEm, setVerificadoEm] = useState(base.verificado_em ?? '');
  const [ativo, setAtivo] = useState(base.ativo);
  const [salvando, setSalvando] = useState(false);
  const [localizando, setLocalizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [avisoMapa, setAvisoMapa] = useState<string | null>(null);
  const [hoje] = useState(() => new Date().toLocaleDateString('sv-SE'));

  const lat = latitude.trim() === '' ? null : Number(latitude.replace(',', '.'));
  const lng = longitude.trim() === '' ? null : Number(longitude.replace(',', '.'));
  const pontoValido = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);

  const mudarTipo = (novo: Tipo) => {
    setTipo(novo);
    setCategorias(PADRAO_DO_TIPO[novo]);
  };

  const alternar = (c: string) => setCategorias((atual) => (atual.includes(c) ? atual.filter((x) => x !== c) : [...atual, c]));

  const acharNoMapa = async () => {
    if (!endereco.trim()) return;
    setLocalizando(true);
    setAvisoMapa(null);
    try {
      const r = await api<{ latitude: number; longitude: number }>(`/configuracao/unidades/localizar?endereco=${encodeURIComponent(endereco)}`);
      setLatitude(String(r.latitude));
      setLongitude(String(r.longitude));
      setAvisoMapa('Ponto achado pelo endereço. Abra o mapa e confira se caiu no lugar certo.');
    } catch (err) {
      setAvisoMapa(err instanceof ErroApi ? err.message : 'Não foi possível consultar o mapa.');
    } finally {
      setLocalizando(false);
    }
  };

  // Colar "-16.32, -48.95" (copiado do Google Maps) no campo de latitude preenche os dois
  const colarCoordenadas = (e: ClipboardEvent<HTMLInputElement>) => {
    const partes = e.clipboardData.getData('text').split(/[,;\s]+/).filter(Boolean);
    if (partes.length === 2 && partes.every((p) => Number.isFinite(Number(p)))) {
      e.preventDefault();
      setLatitude(partes[0]);
      setLongitude(partes[1]);
    }
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    const corpo = {
      nome, tipo, endereco, telefone, horario, fonte, ativo, categorias, funcionamento: faixas,
      latitude: pontoValido ? lat : null, longitude: pontoValido ? lng : null,
      bairros: bairros.split('\n').map((b) => b.trim()).filter(Boolean),
      verificado_em: verificadoEm || null,
    };
    try {
      await api(unidade ? `/configuracao/unidades/${unidade.id}` : '/configuracao/unidades',
        unidade ? atualizar(corpo, 'PUT') : enviar(corpo));
      onPronto();
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'Não foi possível salvar.');
      setSalvando(false);
    }
  };

  const remover = async () => {
    if (!unidade || !window.confirm(`Remover ${unidade.nome}? O bot deixa de indicá-lo.`)) return;
    try {
      await api(`/configuracao/unidades/${unidade.id}`, { method: 'DELETE' });
      onPronto();
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'Não foi possível remover.');
    }
  };

  return (
    <form onSubmit={salvar} className="flex flex-col gap-4">
      <Campo id="un-nome" rotulo="Nome">
        <input id="un-nome" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="CRAS Norte" className={classeEntrada} />
      </Campo>
      <Campo id="un-tipo" rotulo="Tipo">
        <select id="un-tipo" value={tipo} onChange={(e) => mudarTipo(e.target.value as Tipo)} className={classeEntrada}>
          {ORDEM_TIPOS.map((id) => <option key={id} value={id}>{TIPOS[id]}</option>)}
        </select>
      </Campo>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-[13.5px] font-semibold text-texto-2">Necessidades que este lugar atende</legend>
        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
          {ASSUNTOS.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={categorias.includes(c)} onChange={() => alternar(c)} className="size-4 accent-[var(--color-caneta)]" />
              {CATEGORIAS[c]}
            </label>
          ))}
        </div>
        <p className="text-xs text-texto-3">O bot só indica este lugar para as necessidades marcadas.</p>
      </fieldset>

      <Campo id="un-endereco" rotulo="Endereço">
        <div className="flex flex-wrap gap-2">
          <input id="un-endereco" value={endereco} onChange={(e) => setEndereco(e.target.value)} className={`${classeEntrada} min-w-0 flex-1`} />
          <Botao type="button" icone={LocateFixed} carregando={localizando} onClick={acharNoMapa} disabled={!endereco.trim()}>Achar no mapa</Botao>
        </div>
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="un-lat" rotulo="Latitude" dica="Dá para colar “latitude, longitude” do Google Maps aqui.">
          <input id="un-lat" inputMode="decimal" value={latitude} onChange={(e) => setLatitude(e.target.value)} onPaste={colarCoordenadas} placeholder="-16.3267" className={classeEntrada} />
        </Campo>
        <Campo id="un-lng" rotulo="Longitude">
          <input id="un-lng" inputMode="decimal" value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="-48.9528" className={classeEntrada} />
        </Campo>
      </div>
      {pontoValido ? (
        <a href={linkMapa(lat, lng)} target="_blank" rel="noreferrer" className="flex w-fit items-center gap-1.5 text-sm font-medium text-caneta underline-offset-2 hover:underline">
          <ExternalLink className="size-4" aria-hidden />Ver este ponto no Google Maps
        </a>
      ) : (
        <p className="flex items-center gap-2 text-[13px] text-texto-2">
          <CircleAlert className="size-4 shrink-0 text-urgente" aria-hidden />
          Sem ponto no mapa, o bot não mede a distância até este lugar. Ao salvar, ele tenta achar pelo endereço.
        </p>
      )}
      {avisoMapa && <p role="status" className="text-[13px] text-texto-2">{avisoMapa}</p>}

      <Campo id="un-telefone" rotulo="Telefone">
        <input id="un-telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} className={classeEntrada} />
      </Campo>
      <EditorFaixas faixas={faixas} onMudar={setFaixas} />
      <Campo id="un-horario" rotulo={faixas.length ? 'Observação do horário' : 'Horário (texto)'}
        dica={faixas.length
          ? 'Opcional, o que não cabe nas faixas: “Almoço a R$ 2”, “fecha na última sexta do mês”. Dia e hora o bot já tira das faixas.'
          : 'Sem faixas, o bot mostra este texto como está e não diz se o lugar está aberto.'}>
        <input id="un-horario" value={horario} onChange={(e) => setHorario(e.target.value)}
          placeholder={faixas.length ? 'Almoço a R$ 2' : 'Seg. a sex., 8h às 17h'} className={classeEntrada} />
      </Campo>
      <Campo id="un-bairros" rotulo="Bairros atendidos"
        dica={tipo === 'CRAS'
          ? 'Um por linha. Se a prefeitura tiver a lista oficial, ela vale primeiro; sem lista, o bot usa o CRAS mais perto da pessoa.'
          : 'Um por linha (opcional).'}>
        <textarea id="un-bairros" rows={4} value={bairros} onChange={(e) => setBairros(e.target.value)} className={`${classeEntrada} resize-y`} />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-[1fr_170px]">
        <Campo id="un-fonte" rotulo="Fonte oficial" dica="Link ou documento da prefeitura.">
          <input id="un-fonte" value={fonte} onChange={(e) => setFonte(e.target.value)} placeholder="https://…" className={classeEntrada} />
        </Campo>
        <Campo id="un-verificado" rotulo="Conferido em">
          <input id="un-verificado" type="date" max={hoje} value={verificadoEm} onChange={(e) => setVerificadoEm(e.target.value)} className={classeEntrada} />
        </Campo>
      </div>
      {(!fonte.trim() || !verificadoEm) && (
        <p className="flex items-center gap-2 text-[13px] text-texto-2">
          <CircleAlert className="size-4 shrink-0 text-caneta" aria-hidden />
          Sem fonte e data, ninguém sabe se esse endereço está certo.
        </p>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="size-4 accent-[var(--color-caneta)]" />
        Lugar ativo (o bot só indica lugares ativos)
      </label>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex flex-wrap gap-3">
        <Botao type="submit" variante="primario" icone={Save} carregando={salvando}>Salvar lugar</Botao>
        {unidade && <Botao type="button" variante="perigo" icone={Trash2} onClick={remover}>Remover</Botao>}
      </div>
    </form>
  );
}

/** Faixas de funcionamento: dias da semana + abre/fecha. Mais de uma faixa para almoço ou sábado. */
function EditorFaixas({ faixas, onMudar }: { faixas: Faixa[]; onMudar: (f: Faixa[]) => void }) {
  const mudar = (i: number, nova: Partial<Faixa>) => onMudar(faixas.map((f, j) => (j === i ? { ...f, ...nova } : f)));
  const alternarDia = (i: number, dia: number) => {
    const dias = faixas[i].dias.includes(dia) ? faixas[i].dias.filter((d) => d !== dia) : [...faixas[i].dias, dia].sort();
    mudar(i, { dias });
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-[13.5px] font-semibold text-texto-2">Horário de funcionamento</legend>
      {faixas.map((f, i) => {
        const invalida = !f.dias.length || !f.abre || !f.fecha || f.abre >= f.fecha;
        return (
          <div key={i} className={`flex flex-col gap-2 rounded-[4px] border bg-elevada p-2.5 ${invalida ? 'border-urgente/60' : 'border-linha'}`}>
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label={`Dias da faixa ${i + 1}`}>
              {DIAS.map((d, dia) => (
                <button key={d} type="button" aria-pressed={f.dias.includes(dia)} aria-label={DIAS_LONGOS[dia]} onClick={() => alternarDia(i, dia)}
                  className={`h-8 min-w-11 rounded-[3px] border px-1.5 text-[13px] font-semibold transition-colors duration-150 ${f.dias.includes(dia) ? 'border-acao bg-acao text-sobre-acao' : 'border-linha-forte text-texto-2 hover:text-texto'}`}>
                  {d}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[14px] text-texto-2">
              <label htmlFor={`faixa-${i}-abre`}>Abre</label>
              <span className="w-28"><input id={`faixa-${i}-abre`} type="time" value={f.abre} onChange={(e) => mudar(i, { abre: e.target.value })} className={`${classeEntrada} tabular`} /></span>
              <label htmlFor={`faixa-${i}-fecha`}>fecha</label>
              <span className="w-28"><input id={`faixa-${i}-fecha`} type="time" value={f.fecha} onChange={(e) => mudar(i, { fecha: e.target.value })} className={`${classeEntrada} tabular`} /></span>
              <button type="button" onClick={() => onMudar(faixas.filter((_, j) => j !== i))} aria-label={`Remover faixa ${i + 1}`}
                className="ml-auto rounded-[3px] p-1.5 text-texto-3 hover:bg-realce hover:text-urgente"><X className="size-4" aria-hidden /></button>
            </div>
            {invalida && <p className="text-[12.5px] text-urgente-forte">Marque pelo menos um dia e um horário de abrir antes do de fechar.</p>}
          </div>
        );
      })}
      <Botao type="button" tamanho="sm" icone={Plus}
        onClick={() => onMudar([...faixas, faixas.length ? { dias: [5], abre: '08:00', fecha: '12:00' } : { dias: [0, 1, 2, 3, 4], abre: '08:00', fecha: '17:00' }])}>
        {faixas.length ? 'Outra faixa (ex.: sábado ou almoço)' : 'Adicionar horário'}
      </Botao>
      <p className="text-xs text-texto-3">
        Com o horário aqui, o bot diz “aberto agora, fecha às 17h” ou “fechado, abre amanhã às 8h”. Feriado não entra na conta.
      </p>
    </fieldset>
  );
}
