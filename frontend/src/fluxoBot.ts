// Mapa do fluxo do bot (espelha backend/app/services/bot/fluxo_conversa.py).
// A sequência é fixa no backend; cada CRAS liga/desliga as etapas opcionais e edita os textos.
import type { LucideIcon } from 'lucide-react';
import {
  Ban, BookOpenCheck, Hand, HeartHandshake, Inbox, ListChecks, MapPin, MessageCircleQuestion, MessageSquareText,
  Mic, Phone, RotateCcw, ShieldAlert, Siren, ThumbsUp, Trash2, Undo2, UserRound,
} from 'lucide-react';

export type Faixa = 'seguranca' | 'principal' | 'comandos';
export type TipoEtapa = 'normal' | 'urgente' | 'fim' | 'automatico';

export interface OpcaoEtapa {
  chave: string;
  tipo: 'bool' | 'contato';
  rotulo: string;
  ajuda: string;
  /** Só a secretaria muda (ex.: perguntar o bairro, que é o que escolhe o CRAS). */
  soSecretaria?: boolean;
}

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
  /** Motivo de a etapa não poder ser desligada nem pulada por nenhum CRAS. */
  travada?: string;
  /** Opções do fluxo que esta etapa controla. */
  opcoes?: OpcaoEtapa[];
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
  /** Só aparece quando a condição vale para a unidade (ex.: confirmação desligada). */
  quando?: 'sem_confirmacao';
}

export type OpcoesFluxo = {
  perguntar_bairro: boolean;
  confirmar_necessidade: boolean;
  pedir_detalhes_relato_curto: boolean;
  menu_na_primeira_falha: boolean;
  mostrar_outras_necessidades: boolean;
  contato: 'perguntar' | 'sempre' | 'nunca';
};

export const FAIXAS: { id: Faixa; titulo: string; y: number; altura: number }[] = [
  { id: 'seguranca', titulo: 'Em qualquer etapa · segurança', y: 0, altura: 200 },
  { id: 'principal', titulo: 'Caminho da conversa', y: 220, altura: 570 },
  { id: 'comandos', titulo: 'Comandos e situações à parte', y: 810, altura: 200 },
];

export const LARGURA_ETAPA = 190;
export const LARGURA_MAPA = 1570;

const TRAVA_SEGURANCA = 'Proteção da vida: vale para todos os CRAS e não pode ser desligada.';

export const ETAPAS: Etapa[] = [
  // Segurança
  {
    id: 'violencia', titulo: 'Sinal de violência', icone: ShieldAlert, faixa: 'seguranca', tipo: 'urgente', x: 40, y: 52,
    quando: 'A pessoa fala de agressão, ameaça ou abuso, em qualquer momento da conversa.',
    depois: 'Interrompe tudo e vai direto para a mensagem de emergência, sem perguntas.', textos: [], travada: TRAVA_SEGURANCA,
  },
  {
    id: 'emergencia', titulo: 'Mensagem de emergência', icone: Siren, faixa: 'seguranca', tipo: 'urgente', x: 300, y: 52,
    quando: 'Logo depois do sinal de violência.',
    depois: 'O caso entra na fila como urgente. Se houver CREAS cadastrado, o endereço vai junto.',
    textos: ['emergencia'], travada: 'O texto pode mudar, mas precisa ter 190, 180 e 100. A etapa não pode ser desligada.',
  },
  {
    id: 'fila_urgente', titulo: 'Fila: urgente', icone: Inbox, faixa: 'seguranca', tipo: 'fim', x: 560, y: 52,
    quando: 'O caso aparece no topo da Fila do CRAS da pessoa, na fileira de violência.', textos: [],
  },

  // Caminho principal
  {
    id: 'boas_vindas', titulo: 'Boas-vindas e aceite', icone: Hand, faixa: 'principal', tipo: 'normal', x: 40, y: 272,
    quando: 'Primeira mensagem da pessoa. O bot se apresenta, avisa que não decide direito e pede o aceite.',
    depois: 'Aceitou → Bairro (ou Relato). Não aceitou → Sem aceite.', textos: ['boas_vindas'], estados: ['NOVA', 'AGUARDANDO_CONSENTIMENTO'],
    travada: 'LGPD: o aceite vem sempre antes de qualquer pergunta. O texto pode mudar; a etapa não.',
  },
  {
    id: 'bairro', titulo: 'Bairro', icone: MapPin, faixa: 'principal', tipo: 'normal', x: 300, y: 272,
    quando: 'Logo depois do aceite, o bot pergunta o bairro. É o bairro que escolhe o CRAS: daqui em diante valem os textos e as opções daquele CRAS.',
    depois: 'Segue para o Relato, já com o fluxo do CRAS do bairro. Bairro de fora ou “não sei”: padrão da secretaria.',
    textos: ['pedir_bairro', 'cras_indicado', 'bairro_nao_encontrado'], estados: ['AGUARDANDO_BAIRRO'], editarEm: 'unidades',
    opcoes: [{ chave: 'perguntar_bairro', tipo: 'bool', soSecretaria: true, rotulo: 'Perguntar o bairro',
      ajuda: 'Desligado: ninguém é encaminhado a um CRAS específico e todos seguem o padrão da secretaria.' }],
  },
  {
    id: 'relato', titulo: 'Relato', icone: MessageSquareText, faixa: 'principal', tipo: 'normal', x: 560, y: 272,
    quando: 'A pessoa conta a situação com as palavras dela.',
    depois: 'Entendeu → Confirmação. Não entendeu → Não entendi.',
    textos: ['pedir_relato', 'relato_curto'], estados: ['AGUARDANDO_RELATO', 'RETORNO'],
    opcoes: [{ chave: 'pedir_detalhes_relato_curto', tipo: 'bool', rotulo: 'Pedir mais detalhes se o relato for muito curto',
      ajuda: 'Com menos de 4 palavras, o bot pede para contar mais (uma vez só).' }],
  },
  {
    id: 'confirmacao', titulo: 'Confirmação', icone: MessageCircleQuestion, faixa: 'principal', tipo: 'automatico', x: 820, y: 272,
    quando: 'O bot diz o que entendeu e pergunta se está certo.',
    depois: 'Sim → Caminho. Não → Menu de assuntos.', textos: [], estados: ['AGUARDANDO_CONFIRMACAO'],
    exemplo: 'Entendi que você precisa de ajuda com *documentos (RG, CPF, certidões)*. Está certo?\n*1* - Sim\n*2* - Não',
    opcoes: [{ chave: 'confirmar_necessidade', tipo: 'bool', rotulo: 'Perguntar se o bot entendeu certo',
      ajuda: 'Desligado: o bot vai direto ao caminho com a necessidade que identificou (a pessoa não corrige).' }],
  },
  {
    id: 'caminho', titulo: 'Caminho e pedido de contato', icone: BookOpenCheck, faixa: 'principal', tipo: 'normal', x: 1080, y: 272,
    quando: 'O bot mostra o que procurar, que documentos levar e onde ir, e trata o pedido de contato do CRAS.',
    depois: 'Quis contato → Fila do CRAS. Não quis → Encerrado.',
    textos: ['contato_confirmado', 'contato_recusado', 'fim_sem_contato'], estados: ['AGUARDANDO_CONTATO'], editarEm: 'respostas',
    opcoes: [
      { chave: 'mostrar_outras_necessidades', tipo: 'bool', rotulo: 'Mostrar outras necessidades em resumo',
        ajuda: 'Quando o relato fala de mais de um assunto, os outros vêm resumidos depois do principal.' },
      { chave: 'contato', tipo: 'contato', rotulo: 'Contato do CRAS',
        ajuda: 'Perguntar: a pessoa escolhe. Sempre: todo caso entra na fila. Nunca: o bot só orienta e encerra.' },
    ],
  },
  {
    id: 'fila', titulo: 'Fila do CRAS', icone: Inbox, faixa: 'principal', tipo: 'fim', x: 1340, y: 272,
    quando: 'O caso entra na Fila do CRAS da pessoa com a necessidade, a prioridade e o bairro.', textos: [],
  },

  // Exceções do caminho
  {
    id: 'sem_aceite', titulo: 'Sem aceite', icone: Ban, faixa: 'principal', tipo: 'fim', x: 40, y: 470,
    quando: 'A pessoa não aceitou. Nada é gravado; o bot indica o Disque Social 121 e o CRAS.', textos: ['sem_consentimento'],
  },
  {
    id: 'nao_entendi', titulo: 'Não entendi', icone: MessageCircleQuestion, faixa: 'principal', tipo: 'normal', x: 560, y: 470,
    quando: 'O sistema não identificou a necessidade com segurança. Pede para contar de outro jeito.',
    depois: 'Contou de novo → Relato. Não entendeu pela 2ª vez → Menu de assuntos.',
    textos: ['nao_entendi', 'nao_entendi_de_novo'], estados: ['RELATO_NOVAMENTE'],
    opcoes: [{ chave: 'menu_na_primeira_falha', tipo: 'bool', rotulo: 'Mostrar o menu de assuntos já na 1ª vez',
      ajuda: 'Ligado: em vez de pedir para contar de novo, o bot já oferece os assuntos por número.' }],
  },
  {
    id: 'menu', titulo: 'Menu de assuntos', icone: ListChecks, faixa: 'principal', tipo: 'automatico', x: 820, y: 470,
    quando: 'A pessoa escolhe o assunto por número, quando o bot errou ou não entendeu.',
    depois: 'Escolheu → Caminho. “Nenhum desses” → Disque Social 121.', textos: [], estados: ['AGUARDANDO_CORRECAO'],
    exemplo: 'Qual destes assuntos combina mais com a sua situação? Responda com o número:\n*1* - renda e benefícios\n*2* - Cadastro Único\n…\n*9* - Nenhum desses',
  },
  {
    id: 'disque121', titulo: 'Disque Social 121', icone: Phone, faixa: 'principal', tipo: 'fim', x: 820, y: 650,
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
    travada: 'Direito da pessoa (LGPD): o comando vale em todos os CRAS. Os textos podem mudar.',
  },
  {
    id: 'recomecar', titulo: '“recomeçar”', icone: RotateCcw, faixa: 'comandos', tipo: 'automatico', x: 300, y: 860,
    quando: 'A qualquer momento. Volta para o Relato (ou para as boas-vindas, se ainda não aceitou).', textos: [],
    exemplo: 'Usa o mesmo texto do Relato: “Obrigado! Agora me conte…”', travada: 'Vale em todos os CRAS.',
  },
  {
    id: 'retorno', titulo: 'Volta outro dia', icone: Undo2, faixa: 'comandos', tipo: 'normal', x: 560, y: 860,
    quando: 'Quem já aceitou e escreve de novo não precisa aceitar outra vez; o bairro também fica guardado.', textos: ['retorno'],
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
  { de: 'boas_vindas', para: 'bairro', rotulo: 'aceitou' },
  { de: 'boas_vindas', para: 'sem_aceite', rotulo: 'não aceitou', saida: 'b', entrada: 't' },
  { de: 'bairro', para: 'relato', rotulo: 'escolhe o CRAS' },
  { de: 'relato', para: 'confirmacao', rotulo: 'entendeu' },
  { de: 'relato', para: 'caminho', rotulo: 'sem confirmação', saida: 't-out', entrada: 't', quando: 'sem_confirmacao' },
  { de: 'relato', para: 'nao_entendi', rotulo: 'não entendeu', saida: 'b', entrada: 't' },
  { de: 'nao_entendi', para: 'relato', rotulo: 'contou de novo', saida: 't-out', entrada: 'b-in' },
  { de: 'nao_entendi', para: 'menu', rotulo: '2ª vez' },
  { de: 'confirmacao', para: 'caminho', rotulo: 'está certo' },
  { de: 'confirmacao', para: 'menu', rotulo: 'não', saida: 'b', entrada: 't' },
  { de: 'menu', para: 'caminho', rotulo: 'escolheu', saida: 'd', entrada: 'b-in' },
  { de: 'menu', para: 'disque121', rotulo: 'nenhum desses', saida: 'b', entrada: 't' },
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

/** Etapas que não acontecem com as opções atuais, com o motivo (o mapa as mostra apagadas). */
export function etapasPuladas(opcoes: OpcoesFluxo | null, temCras: boolean, vendoUnidade: boolean): Record<string, string> {
  const saida: Record<string, string> = {};
  if (!vendoUnidade && !temCras) saida.bairro = 'Pulada agora: nenhum CRAS cadastrado em Unidades de atendimento.';
  if (!opcoes) return saida;
  if (!vendoUnidade && !opcoes.perguntar_bairro) saida.bairro = 'Desligada: ninguém é encaminhado a um CRAS; vale o padrão da secretaria.';
  if (vendoUnidade) saida.bairro = 'Definida pela secretaria. Quem chega aqui já é deste CRAS (pelo bairro).';
  if (!opcoes.confirmar_necessidade) saida.confirmacao = 'Desligada: o bot vai direto ao caminho.';
  if (opcoes.menu_na_primeira_falha) saida.nao_entendi = 'Pulada: o menu de assuntos aparece já na 1ª vez.';
  if (opcoes.contato === 'nunca') saida.fila = 'Contato “nunca”: o bot só orienta; nada entra na fila.';
  if (opcoes.contato === 'sempre') saida.encerrado = 'Contato “sempre”: todo caso entra na fila, sem perguntar.';
  return saida;
}
