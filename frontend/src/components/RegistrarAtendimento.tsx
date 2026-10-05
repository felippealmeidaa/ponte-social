import { useState, type FormEvent } from 'react';
import { ClipboardPlus } from 'lucide-react';
import { api, enviar, ErroApi } from '../api';
import { nomeCategoria } from '../vocabulario';
import { Aviso, Botao, Campo, classeEntrada, PainelLateral } from './ui';

interface Resultado {
  triagem_id: string;
  classificacao: { categoria: string; prioridade: string; is_urgente: boolean };
}

/** Registro de quem chegou ao balcão: o profissional escreve o relato e a triagem entra na fila. */
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
      setErro(err instanceof ErroApi ? err.message : 'Não foi possível registrar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <PainelLateral aberto={aberto} titulo="Registrar atendimento" onFechar={() => { limpar(); onFechar(); }} largura="max-w-lg">
      {resultado ? (
        <div className="flex flex-col gap-4">
          <Aviso tom={resultado.classificacao.is_urgente ? 'urgente' : 'ok'}>
            Registrado na fila como <strong>{nomeCategoria(resultado.classificacao.categoria).toLowerCase()}</strong>.
            {resultado.classificacao.is_urgente && ' Possível violência: o caso foi para o topo como urgente.'}
          </Aviso>
          <p className="text-sm text-texto-2">Confira a categoria na ficha e ajuste a situação se precisar.</p>
          <div className="flex gap-2">
            <Botao variante="primario" onClick={limpar}>Registrar outro</Botao>
            <Botao onClick={() => { limpar(); onFechar(); }}>Voltar à fila</Botao>
          </div>
        </div>
      ) : (
        <form onSubmit={registrar} className="flex flex-col gap-4">
          <p className="text-sm text-texto-2">Para quem chegou ao balcão. Pergunte se a pessoa autoriza o registro e não escreva CPF nem endereço.</p>
          <Campo id="relato" rotulo="O que a pessoa precisa" dica="Com as palavras da pessoa, se possível.">
            <textarea id="relato" required rows={5} value={relato} onChange={(e) => setRelato(e.target.value)} className={`${classeEntrada} resize-y`} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="bairro" rotulo="Bairro (opcional)">
              <input id="bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} className={classeEntrada} />
            </Campo>
            <Campo id="telefone" rotulo="Telefone (opcional)" dica="Para a equipe retornar.">
              <input id="telefone" inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} className={classeEntrada} placeholder="62 99999-0000" />
            </Campo>
          </div>
          <Campo id="nome" rotulo="Como chamar a pessoa (opcional)">
            <input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} className={classeEntrada} />
          </Campo>
          {erro && <Aviso>{erro}</Aviso>}
          <Botao type="submit" variante="primario" icone={ClipboardPlus} carregando={enviando} disabled={!relato.trim()}>Registrar na fila</Botao>
        </form>
      )}
    </PainelLateral>
  );
}
