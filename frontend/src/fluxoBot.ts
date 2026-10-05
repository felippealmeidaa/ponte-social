// Mapa do fluxo do bot (espelha backend/app/services/bot/fluxo_conversa.py).
// A lógica é fixa no backend; aqui só se desenha o caminho e se diz quais textos cada etapa usa.
import type { LucideIcon } from 'lucide-react';
import {
  Ban, BookOpenCheck, Hand, HeartHandshake, Inbox, ListChecks, MapPin, MessageCircleQuestion, MessageSquareText,
  Mic, RotateCcw, ShieldAlert, Siren, ThumbsUp, Trash2, UserRound, Undo2, Phone,
} from 'lucide-react';

export type Faixa = 'seguranca' | 'principal' | 'comandos';
export type TipoEtapa = 'normal' | 'urgente' | 'fim' | 'automatico';

export interface Etapa {
  id: string;
  titulo: string;
  icone: LucideIcon;
  faixa: Faixa;
  tipo: TipoEtapa;
  /** Quando a pessoa chega nesta etapa, em linguagem de quem atende. */
  quando: string;
  /** Para onde a conversa vai depois (usado na lista do celular e no painel). */
  depois?: string;
  /** Chaves de textos editáveis (catalogo.TEXTOS_PADRAO). */
  textos: string[];
  /** Estados do backend que contam como "parado aqui agora". */
  estados?: string[];
  /** Etapa que se edita em outra aba. */
  editarEm?: 'respostas' | 'unidades';
  /** Exemplo de texto montado pelo sistema (etapas sem texto editável). */
  exemplo?: string;
  x: number;
  y: number;
}

export interface Ligacao {
  de: string;
  para: string;
  rotulo?: string;
  saida?: 'd' | 'b' | 't-out';
  entrada?: 'e' | 't' | 'b-in';
  urgente?: boolean;
}

export const FAIXAS: { id: Faixa; titulo: string; y: number; altura: number }[] = [
  { id: 'seguranca', titulo: 'Em qualquer etapa · segurança', y: 0, altura: 200 },
  { id: 'principal', titulo: 'Caminho da conversa', y: 220, altura: 570 },
  { id: 'comandos', titulo: 'Comandos e situações à parte', y: 810, altura: 200 },
];

export const LARGURA_ETAPA = 190;
export const LARGURA_MAPA = 1570;

export const ETAPAS: Etapa[] = [
  // Segurança
  {
    id: 'violencia', titulo: 'Sinal de violência', icone: ShieldAlert, faixa: 'seguranca', tipo: 'urgente', x: 40, y: 52,
    quando: 'A pessoa fala de agressão, ameaça ou abuso, em qualquer momento da conversa.',
    depois: 'Interrompe tudo e vai direto para a mensagem de emergência, sem perguntas.', textos: [],
  },
  {
    id: 'emergencia', titulo: 'Mensagem de emergência', icone: Siren, faixa: 'seguranca', tipo: 'urgente', x: 300, y: 52,
    quando: 'Logo depois do sinal de violência.',
    depois: 'O caso entra na fila como urgente. Se houver CREAS cadastrado, o endereço vai junto.',
    textos: ['emergencia'],
  },
  {
    id: 'fila_urgente', titulo: 'Fila: urgente', icone: Inbox, faixa: 'seguranca', tipo: 'fim', x: 560, y: 52,
    quando: 'O caso aparece no topo da Fila, na fileira de violência.', textos: [],
  },

  // Caminho principal
  {
    id: 'boas_vindas', titulo: 'Boas-vindas e aceite', icone: Hand, faixa: 'principal', tipo: 'normal', x: 40, y: 272,
    quando: 'Primeira mensagem da pessoa. O bot se apresenta, avisa que não decide direito e pede o aceite.',
    depois: 'Aceitou → Relato. Não aceitou → Sem aceite.', textos: ['boas_vindas'], estados: ['NOVA', 'AGUARDANDO_CONSENTIMENTO'],
  },
  {
    id: 'relato', titulo: 'Relato', icone: MessageSquareText, faixa: 'principal', tipo: 'normal', x: 300, y: 272,
    quando: 'A pessoa conta a situação com as palavras dela. Relato muito curto: o bot pede mais detalhes uma vez.',
    depois: 'Entendeu → Confirmação. Não entendeu → Não entendi.',
    textos: ['pedir_relato', 'relato_curto'], estados: ['AGUARDANDO_RELATO', 'RETORNO'],
  },
  {
    id: 'confirmacao', titulo: 'Confirmação', icone: MessageCircleQuestion, faixa: 'principal', tipo: 'automatico', x: 560, y: 272,
    quando: 'O bot diz o que entendeu e pergunta se está certo.',
    depois: 'Sim → Bairro (ou direto ao Caminho). Não → Menu de assuntos.', textos: [], estados: ['AGUARDANDO_CONFIRMACAO'],
    exemplo: 'Entendi que você precisa de ajuda com *documentos (RG, CPF, certidões)*. Está certo?\n*1* - Sim\n*2* - Não',
  },
  {
    id: 'bairro', titulo: 'Bairro', icone: MapPin, faixa: 'principal', tipo: 'normal', x: 820, y: 272,
    quando: 'Só quando há CRAS cadastrado: o bot pergunta o bairro para indicar a unidade. Lembra o bairro nas próximas vezes.',
    depois: 'Segue para o Caminho, com o CRAS do bairro.',
    textos: ['pedir_bairro', 'bairro_nao_encontrado'], estados: ['AGUARDANDO_BAIRRO'], editarEm: 'unidades',
  },
  {
    // Uma etapa só: o bot manda o caminho e a pergunta de contato na mesma mensagem
    id: 'caminho', titulo: 'Caminho e pedido de contato', icone: BookOpenCheck, faixa: 'principal', tipo: 'normal', x: 1080, y: 272,
    quando: 'O bot mostra o que procurar, que documentos levar e onde ir (outras necessidades em resumo) e pergunta se a pessoa quer contato do CRAS.',
    depois: 'Quis contato → Fila do CRAS. Não quis → Encerrado.',
    textos: ['contato_confirmado', 'contato_recusado'], estados: ['AGUARDANDO_CONTATO'], editarEm: 'respostas',
  },
  {
    id: 'fila', titulo: 'Fila do CRAS', icone: Inbox, faixa: 'principal', tipo: 'fim', x: 1340, y: 272,
    quando: 'O caso entra na Fila com a necessidade confirmada, prioridade e bairro.', textos: [],
  },

  // Exceções do caminho
  {
    id: 'sem_aceite', titulo: 'Sem aceite', icone: Ban, faixa: 'principal', tipo: 'fim', x: 40, y: 470,
    quando: 'A pessoa não aceitou. Nada é gravado; o bot indica o Disque Social 121 e o CRAS.', textos: ['sem_consentimento'],
  },
  {
    id: 'nao_entendi', titulo: 'Não entendi', icone: MessageCircleQuestion, faixa: 'principal', tipo: 'normal', x: 300, y: 470,
    quando: 'O sistema não identificou a necessidade com segurança. Pede para contar de outro jeito.',
    depois: 'Contou de novo → Relato. Não entendeu pela 2ª vez → Menu de assuntos.',
    textos: ['nao_entendi', 'nao_entendi_de_novo'], estados: ['RELATO_NOVAMENTE'],
  },
  {
    id: 'menu', titulo: 'Menu de assuntos', icone: ListChecks, faixa: 'principal', tipo: 'automatico', x: 560, y: 470,
    quando: 'A pessoa escolhe o assunto por número, quando o bot errou ou não entendeu.',
    depois: 'Escolheu → Bairro / Caminho. “Nenhum desses” → Disque Social 121.', textos: [], estados: ['AGUARDANDO_CORRECAO'],
    exemplo: 'Qual destes assuntos combina mais com a sua situação? Responda com o número:\n*1* - renda e benefícios\n*2* - Cadastro Único\n…\n*9* - Nenhum desses',
  },
  {
    id: 'disque121', titulo: 'Disque Social 121', icone: Phone, faixa: 'principal', tipo: 'fim', x: 560, y: 650,
    quando: 'Nenhum assunto serviu. O bot indica o Disque Social 121 e o CRAS, sem inventar resposta.', textos: [],
  },
  {
    id: 'encerrado', titulo: 'Encerrado', icone: HeartHandshake, faixa: 'principal', tipo: 'fim', x: 1080, y: 470,
    quando: 'A pessoa recebeu o caminho e não quis contato. Nada entra na fila.', textos: [],
  },

  // Comandos e situações à parte
  {
    id: 'apagar', titulo: '“apagar”', icone: Trash2, faixa: 'comandos', tipo: 'normal', x: 40, y: 860,
    quando: 'A qualquer momento. O bot confirma e apaga conversa e pedidos (casos urgentes abertos ficam com a equipe).',
    textos: ['apagar_confirmar', 'apagar_feito', 'apagar_cancelado'], estados: ['CONFIRMAR_APAGAR'],
  },
  {
    id: 'recomecar', titulo: '“recomeçar”', icone: RotateCcw, faixa: 'comandos', tipo: 'automatico', x: 300, y: 860,
    quando: 'A qualquer momento. Volta para o Relato (ou para as boas-vindas, se ainda não aceitou).', textos: [],
    exemplo: 'Usa o mesmo texto do Relato: “Obrigado! Agora me conte…”',
  },
  {
    id: 'retorno', titulo: 'Volta outro dia', icone: Undo2, faixa: 'comandos', tipo: 'normal', x: 560, y: 860,
    quando: 'Quem já aceitou e escreve de novo não precisa aceitar outra vez.', textos: ['retorno'],
  },
  {
    id: 'agradecimento', titulo: 'Agradece no fim', icone: ThumbsUp, faixa: 'comandos', tipo: 'normal', x: 820, y: 860,
    quando: '“Obrigado”, “valeu” depois que a conversa terminou.', textos: ['agradecimento'],
  },
  {
    id: 'audio', titulo: 'Mensagem de áudio', icone: Mic, faixa: 'comandos', tipo: 'normal', x: 1080, y: 860,
    quando: 'Por enquanto o bot só lê texto e pede para a pessoa escrever.', textos: ['audio'],
  },
  {
    id: 'atendente', titulo: 'Atendente assumiu', icone: UserRound, faixa: 'comandos', tipo: 'normal', x: 1340, y: 860,
    quando: 'Alguém da equipe assumiu a conversa em Conversas. O bot fica em silêncio até devolverem.',
    textos: ['atendente_assumiu'],
  },
];

export const LIGACOES: Ligacao[] = [
  { de: 'violencia', para: 'emergencia', rotulo: 'na hora', urgente: true },
  { de: 'emergencia', para: 'fila_urgente', urgente: true },
  { de: 'boas_vindas', para: 'relato', rotulo: 'aceitou' },
  { de: 'boas_vindas', para: 'sem_aceite', rotulo: 'não aceitou', saida: 'b', entrada: 't' },
  { de: 'relato', para: 'confirmacao', rotulo: 'entendeu' },
  { de: 'relato', para: 'nao_entendi', rotulo: 'não entendeu', saida: 'b', entrada: 't' },
  { de: 'nao_entendi', para: 'relato', rotulo: 'contou de novo', saida: 't-out', entrada: 'b-in' },
  { de: 'nao_entendi', para: 'menu', rotulo: '2ª vez' },
  { de: 'confirmacao', para: 'bairro', rotulo: 'está certo' },
  { de: 'confirmacao', para: 'menu', rotulo: 'não', saida: 'b', entrada: 't' },
  { de: 'menu', para: 'bairro', rotulo: 'escolheu', saida: 'd', entrada: 'b-in' },
  { de: 'menu', para: 'disque121', rotulo: 'nenhum desses', saida: 'b', entrada: 't' },
  { de: 'bairro', para: 'caminho' },
  { de: 'caminho', para: 'fila', rotulo: 'quis contato' },
  { de: 'caminho', para: 'encerrado', rotulo: 'não quis', saida: 'b', entrada: 't' },
];

/** Contagem "parado aqui agora" por etapa, a partir de /configuracao/fluxo/agora. */
export function contagemPorEtapa(porEstado: Record<string, number>, comAtendente: number): Record<string, number> {
  const saida: Record<string, number> = { atendente: comAtendente };
  for (const etapa of ETAPAS) {
    const total = (etapa.estados ?? []).reduce((soma, e) => soma + (porEstado[e] ?? 0), 0);
    if (total) saida[etapa.id] = total;
  }
  return saida;
}
