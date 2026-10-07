import { useCallback, useState, type FormEvent } from 'react';
import { 
  Clock, 
  ExternalLink, 
  MapPin, 
  Phone, 
  Plus, 
  Save 
} from 'lucide-react';
import { api, atualizar, enviar, ErroApi } from '../api';
import { Aviso, Botao, Campo, classeEntrada, Esqueleto, PainelLateral, Selo } from '../components/ui';
import { useAtualizacao } from '../useAtualizacao';
import { CATEGORIAS } from '../vocabulario';

type Tipo = 'CRAS' | 'CREAS' | 'CENTRO_POP' | 'CADUNICO' | 'RESTAURANTE_POPULAR' | 'DOCUMENTOS' | 'SINE' | 'OUTRO';

interface Unidade {
  id: string;
  nome: string;
  tipo: Tipo;
  endereco: string;
  telefone: string;
  horario: string;
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
  RESTAURANTE_POPULAR: 'Restaurante Popular', DOCUMENTOS: 'Documentos (Vapt Vupt)', SINE: 'Emprego (SINE)', OUTRO: 'Outro',
};

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
  nome: '', tipo: 'CRAS', endereco: '', telefone: '', horario: '', bairros: [], categorias: PADRAO_DO_TIPO.CRAS,
  latitude: null, longitude: null, mapa: null, fonte: '', verificado_em: null, ativo: true,
};

const linkMapa = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lng}`;

export function Unidades() {
  const { dados, erro, recarregar } = useAtualizacao(useCallback(() => api<Unidade[]>('/configuracao/unidades'), []), 0);
  const [editando, setEditando] = useState<Unidade | 'nova' | null>(null);
  const fechar = useCallback(() => setEditando(null), []);

  if (erro) return <Aviso>{erro}</Aviso>;
  if (!dados) return <Esqueleto className="h-64" />;

  const temCras = dados.some((u) => u.tipo === 'CRAS' && u.ativo);
  const semMapa = dados.filter((u) => u.ativo && u.latitude === null).length;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-linha pb-6">
        <div>
          <h2 className="titulo text-[22px] text-texto">Rede de Unidades Socioassistenciais</h2>
          <p className="mt-1 text-[14px] text-texto-2">
            Locais físicos indicados pelo bot com base na geolocalização ou no bairro do morador.
          </p>
        </div>

        <Botao variante="primario" icone={Plus} onClick={() => setEditando('nova')}>
          Adicionar Unidade
        </Botao>
      </div>

      {!temCras && (
        <Aviso tom="urgente">
          Nenhuma unidade CRAS ativa na base. O bot precisa de ao menos uma para indicar onde o morador deve ir.
        </Aviso>
      )}

      {semMapa > 0 && (
        <Aviso tom="info">
          {semMapa === 1 ? '1 unidade ativa' : `${semMapa} unidades ativas`} sem coordenadas de mapa. O bot usa o cálculo de raio por GPS quando as coordenadas estão preenchidas.
        </Aviso>
      )}

      {/* Grid de Unidades */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {dados.map((u) => (
          <div 
            key={u.id} 
            className={`flex flex-col justify-between rounded-2xl border p-5 glass-card transition-all duration-150 hover:border-linha-forte hover:bg-elevada ${
              u.ativo ? 'border-linha' : 'border-linha/50 opacity-60'
            }`}
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="mono text-[10.5px] font-bold text-marca uppercase tracking-wider">
                    {TIPOS[u.tipo] ?? u.tipo}
                  </span>
                  <h3 className="titulo text-[17px] text-texto mt-0.5">{u.nome}</h3>
                </div>
                {!u.ativo && <Selo tom="neutro">Inativa</Selo>}
              </div>

              <p className="flex items-start gap-2 text-[13px] text-texto-2">
                <MapPin className="size-4 text-texto-3 shrink-0 mt-0.5" />
                <span>{u.endereco || 'Endereço não informado'}</span>
              </p>

              {u.telefone && (
                <p className="flex items-center gap-2 text-[12.5px] text-texto-2">
                  <Phone className="size-3.5 text-texto-3" />
                  <span className="mono">{u.telefone}</span>
                </p>
              )}

              {u.horario && (
                <p className="flex items-center gap-2 text-[12.5px] text-texto-3">
                  <Clock className="size-3.5" />
                  <span>{u.horario}</span>
                </p>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-linha pt-3 mt-4">
              {u.latitude !== null && u.longitude !== null ? (
                <a 
                  href={linkMapa(u.latitude, u.longitude)} 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[12px] text-marca hover:underline font-medium"
                >
                  <ExternalLink className="size-3" /> Ver no Maps
                </a>
              ) : (
                <span className="text-[11.5px] text-texto-3">Sem GPS</span>
              )}

              <Botao tamanho="sm" variante="fantasma" onClick={() => setEditando(u)}>
                Editar
              </Botao>
            </div>
          </div>
        ))}
      </div>

      {editando && (
        <EditorUnidade 
          unidade={editando === 'nova' ? null : editando} 
          onFechar={fechar} 
          onSalvo={() => { fechar(); recarregar(); }} 
        />
      )}
    </div>
  );
}

function EditorUnidade({ unidade, onFechar, onSalvo }: { unidade: Unidade | null; onFechar: () => void; onSalvo: () => void }) {
  const [form, setForm] = useState<Omit<Unidade, 'id'>>(unidade ? { ...unidade } : { ...VAZIA });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      if (unidade) {
        await api(`/configuracao/unidades/${unidade.id}`, atualizar(form));
      } else {
        await api('/configuracao/unidades', enviar(form));
      }
      onSalvo();
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'Falha ao salvar unidade.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <PainelLateral aberto titulo={unidade ? `Editar: ${unidade.nome}` : 'Nova Unidade'} onFechar={onFechar} largura="max-w-xl">
      <form onSubmit={salvar} className="flex flex-col gap-4 text-texto">
        <Campo id="nome" rotulo="Nome da Unidade">
          <input id="nome" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={classeEntrada} placeholder="Ex.: CRAS Recanto do Sol" />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="tipo" rotulo="Tipo de Equipamento">
            <select id="tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as Tipo })} className={`${classeEntrada} h-10`}>
              {Object.entries(TIPOS).map(([k, v]) => (
                <option key={k} value={k} className="bg-superficie text-texto">{v}</option>
              ))}
            </select>
          </Campo>

          <Campo id="telefone" rotulo="Telefone / Contato">
            <input id="telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className={classeEntrada} placeholder="(62) 3902-0000" />
          </Campo>
        </div>

        <Campo id="endereco" rotulo="Endereço Completo">
          <input id="endereco" required value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} className={classeEntrada} placeholder="Rua, Número, Bairro, Anápolis-GO" />
        </Campo>

        <Campo id="horario" rotulo="Horário de Funcionamento">
          <input id="horario" value={form.horario} onChange={(e) => setForm({ ...form, horario: e.target.value })} className={classeEntrada} placeholder="Seg a Sex das 08h às 17h" />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="latitude" rotulo="Latitude (GPS)">
            <input id="latitude" type="number" step="any" value={form.latitude ?? ''} onChange={(e) => setForm({ ...form, latitude: e.target.value ? parseFloat(e.target.value) : null })} className={classeEntrada} placeholder="-16.3267" />
          </Campo>

          <Campo id="longitude" rotulo="Longitude (GPS)">
            <input id="longitude" type="number" step="any" value={form.longitude ?? ''} onChange={(e) => setForm({ ...form, longitude: e.target.value ? parseFloat(e.target.value) : null })} className={classeEntrada} placeholder="-48.9528" />
          </Campo>
        </div>

        {erro && <Aviso>{erro}</Aviso>}

        <div className="flex gap-3 pt-2">
          <Botao type="submit" variante="primario" icone={Save} carregando={salvando}>
            Salvar Unidade
          </Botao>
          <Botao variante="fantasma" onClick={onFechar}>
            Cancelar
          </Botao>
        </div>
      </form>
    </PainelLateral>
  );
}
