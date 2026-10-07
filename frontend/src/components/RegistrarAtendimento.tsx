import { useState, type FormEvent } from 'react';
import { CheckCircle2, ClipboardPlus, ShieldCheck } from 'lucide-react';
import { api, enviar, ErroApi } from '../api';
import { nomeCategoria } from '../vocabulario';
import { Aviso, Botao, Campo, classeEntrada, PainelLateral } from './ui';

interface Resultado {
  triagem_id: string;
  classificacao: { categoria: string; prioridade: string; is_urgente: boolean };
}

export function RegistrarAtendimento({ aberto, onFechar, onRegistrado }: { aberto: boolean; onFechar: () => void; onRegistrado: (id: string) => void }) {
  const [relato, setRelato] = useState('');
  const [bairro, setBairro] = useState('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const limpar = () => {
    setRelato(''); setBairro(''); setNome(''); setTelefone(''); setErro(null); setResultado(null);
  };

  const registrar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const r = await api<Resultado>('/triagem/submeter', enviar({
        relato, canal: 'presencial', bairro: bairro || undefined, nome: nome || 'Atendimento presencial', telefone: telefone || undefined,
      }));
      setResultado(r);
      onRegistrado(r.triagem_id);
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'Falha ao registrar triagem.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <PainelLateral aberto={aberto} titulo="Novo Atendimento Presencial" onFechar={() => { limpar(); onFechar(); }} largura="max-w-xl">
      {resultado ? (
        <div className="flex flex-col gap-5 text-texto">
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 shadow-sm">
            <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400 mb-2">
              <CheckCircle2 className="size-6" />
              <h3 className="titulo text-[17px] text-texto">Triagem Registrada com Sucesso</h3>
            </div>
            <p className="text-[14.5px] leading-relaxed text-texto-2">
              Classificada automaticamente como <strong className="text-marca font-bold">{nomeCategoria(resultado.classificacao.categoria)}</strong>.
              {resultado.classificacao.is_urgente && ' Sinalizada com alta urgência (CREAS) no topo da fila.'}
            </p>
          </div>
          
          <div className="flex gap-3 mt-2">
            <Botao variante="primario" onClick={limpar}>Registrar Outro</Botao>
            <Botao onClick={() => { limpar(); onFechar(); }}>Ver na Fila</Botao>
          </div>
        </div>
      ) : (
        <form onSubmit={registrar} className="flex flex-col gap-4.5 text-texto">
          <div className="rounded-xl border border-linha bg-superficie p-3.5 text-[13px] text-texto-3 flex items-start gap-2.5">
            <ShieldCheck className="size-4 text-marca shrink-0 mt-0.5" />
            <span>Registro direto no balcão do CRAS. O relato será classificado em tempo real pelo motor de IA supervisionado.</span>
          </div>

          <Campo id="relato" rotulo="Relato da Demanda / Necessidade" dica="Descreva em linguagem natural o que a pessoa precisa.">
            <textarea 
              id="relato" 
              required 
              rows={4} 
              value={relato} 
              onChange={(e) => setRelato(e.target.value)} 
              placeholder="Ex.: Moradora veio ao balcão sem renda, precisa atualizar o CadÚnico e solicitar cesta de alimentos..."
              className={`${classeEntrada} resize-y`} 
            />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="bairro" rotulo="Bairro em Anápolis (opcional)">
              <input id="bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Ex.: Jundiaí, Recanto do Sol..." className={classeEntrada} />
            </Campo>
            <Campo id="telefone" rotulo="Telefone / WhatsApp (opcional)" dica="Para acompanhamento.">
              <input id="telefone" inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} className={classeEntrada} placeholder="(62) 99999-0000" />
            </Campo>
          </div>

          <Campo id="nome" rotulo="Nome do Cidadão (opcional)">
            <input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como chamar a pessoa" className={classeEntrada} />
          </Campo>

          {erro && <Aviso>{erro}</Aviso>}

          <div className="pt-2">
            <Botao type="submit" variante="primario" icone={ClipboardPlus} carregando={enviando} disabled={!relato.trim()} className="w-full">
              Processar e Incluir na Fila
            </Botao>
          </div>
        </form>
      )}
    </PainelLateral>
  );
}
