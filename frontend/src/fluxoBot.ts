// Fluxo do bot (espelha backend/app/services/bot/fluxo_conversa.py), desenhado como um trilho:
// as etapas do caminho principal em sequência, os desvios pendurados embaixo de onde saem,
// a faixa de violência (vale em qualquer etapa) e os comandos à parte.
// A sequência é fixa no backend; cada CRAS liga/desliga as etapas opcionais e edita os textos.
import type { LucideIcon } from 'lucide-react';
import {
  Ban, BookOpenCheck, Hand, HeartHandshake, Inbox, ListChecks, MapPin, MessageCircleQuestion, MessageSquareText,
  Camera, MessageSquarePlus, Mic, Phone, Volume2, RotateCcw, ShieldAlert, Siren, ThumbsUp, Trash2, Undo2, UserRound,
} from 'lucide-react';

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
}

export interface Ligacao {
  de: string;
  para: string;
  rotulo?: string;
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
  perguntar_depois: boolean;
};

const TRAVA_SEGURANCA = 'Proteção da vida: vale para todos os CRAS e não pode ser desligada.';

export const ETAPAS: Etapa[] = [
  // Segurança
  {
    id: 'violencia', titulo: 'Sinal de violência', icone: ShieldAlert, tipo: 'urgente',
    quando: 'A pessoa fala de agressão, ameaça ou abuso, em qualquer momento da conversa.',
    depois: 'Interrompe tudo e vai direto para a mensagem de emergência, sem perguntas.', textos: [], travada: TRAVA_SEGURANCA,
  },
  {
    id: 'emergencia', titulo: 'Mensagem de emergência', icone: Siren, tipo: 'urgente',
    quando: 'Logo depois do sinal de violência.',
    depois: 'O caso entra na fila como urgente. Se houver CREAS cadastrado, o endereço vai junto.',
    textos: ['emergencia'], travada: 'O texto pode mudar, mas precisa ter 190, 180 e 100. A etapa não pode ser desligada.',
  },
  {
    id: 'fila_urgente', titulo: 'Fila: urgente', icone: Inbox, tipo: 'fim',
    quando: 'O caso aparece no topo da Fila do CRAS da pessoa, na fileira de violência.', textos: [],
  },

  // Caminho principal
  {
    id: 'boas_vindas', titulo: 'Boas-vindas e aceite', icone: Hand, tipo: 'normal',
    quando: 'Primeira mensagem da pessoa. O bot se apresenta, avisa que não decide direito e pede o aceite.',
    depois: 'Se aceitar, segue para o Bairro (ou direto ao Relato). Se não aceitar, a conversa termina sem gravar nada.', textos: ['boas_vindas'], estados: ['NOVA', 'AGUARDANDO_CONSENTIMENTO'],
    travada: 'LGPD: o aceite vem sempre antes de qualquer pergunta. O texto pode mudar; a etapa não.',
  },
  {
    id: 'bairro', titulo: 'Localização, CEP ou bairro', icone: MapPin, tipo: 'normal',
    quando: 'Logo depois do aceite, a pessoa escolhe se e como diz onde mora: localização do WhatsApp, CEP ou bairro (ou prefere não informar). Isso escolhe o CRAS (lista de bairros ou, sem ela, o mais perto) e ordena os lugares do Caminho: primeiro onde pedir o benefício (o CRAS da pessoa no topo), depois a ajuda imediata, como restaurante popular e Centro POP. Do CEP, ficam só o bairro e um ponto aproximado.',
    depois: 'Segue para o Relato, já com o fluxo do CRAS escolhido. CEP não encontrado: pede de novo. Bairro não encontrado ou “prefiro não informar”: padrão da secretaria.',
    textos: ['pedir_bairro', 'pedir_localizacao', 'pedir_cep', 'pedir_nome_bairro', 'cep_nao_encontrado', 'cras_indicado', 'cras_mais_perto', 'bairro_nao_encontrado'], estados: ['AGUARDANDO_BAIRRO'], editarEm: 'unidades',
    opcoes: [{ chave: 'perguntar_bairro', tipo: 'bool', soSecretaria: true, rotulo: 'Perguntar a localização, o CEP ou o bairro',
      ajuda: 'Desligado: ninguém é encaminhado a um CRAS específico e todos seguem o padrão da secretaria.' }],
  },
  {
    id: 'relato', titulo: 'Relato', icone: MessageSquareText, tipo: 'normal',
    quando: 'A pessoa conta a situação com as palavras dela. A IA lê a mensagem pelo sentido (“estou com fome” já basta) e escolhe a necessidade entre os assuntos desta tela; serviços e documentos vêm sempre das respostas cadastradas aqui.',
    depois: 'Se o sistema entender, segue para a Confirmação. Se não, vai para Não entendi.',
    textos: ['pedir_relato', 'relato_curto'], estados: ['AGUARDANDO_RELATO', 'RETORNO'],
    opcoes: [{ chave: 'pedir_detalhes_relato_curto', tipo: 'bool', rotulo: 'Pedir mais detalhes se o relato for muito curto',
      ajuda: 'Se a mensagem for curta e o sistema não entender, o bot pede para contar mais (uma vez só). Mensagem curta que deu para entender segue direto.' }],
  },
  {
    id: 'confirmacao', titulo: 'Confirmação', icone: MessageCircleQuestion, tipo: 'automatico',
    quando: 'O bot diz o que entendeu e pergunta se está certo.',
    depois: 'Se a pessoa disser que está certo, segue para o Caminho. Se não, ela escolhe no Menu de assuntos.', textos: [], estados: ['AGUARDANDO_CONFIRMACAO'],
    exemplo: 'Entendi que você perdeu seus documentos e precisa tirar a segunda via. Posso te orientar sobre *documentos (RG, CPF, certidões)*. Está certo?\n*1* - Sim\n*2* - Não',
    opcoes: [{ chave: 'confirmar_necessidade', tipo: 'bool', rotulo: 'Perguntar se o bot entendeu certo',
      ajuda: 'Desligado: o bot vai direto ao caminho com a necessidade que identificou (a pessoa não corrige).' }],
  },
  {
    id: 'caminho', titulo: 'Caminho e pedido de contato', icone: BookOpenCheck, tipo: 'normal',
    quando: 'O bot mostra o que procurar, que documentos levar e onde ir, e trata o pedido de contato do CRAS.',
    depois: 'Se responder 1, o caso entra na Fila. Se responder 2, o pedido não chega ao CRAS: o bot avisa a pessoa disso e a conversa termina.',
    textos: ['contato_confirmado', 'contato_recusado', 'fim_sem_contato'], estados: ['AGUARDANDO_CONTATO'], editarEm: 'respostas',
    opcoes: [
      { chave: 'mostrar_outras_necessidades', tipo: 'bool', rotulo: 'Mostrar outras necessidades em resumo',
        ajuda: 'Quando o relato fala de mais de um assunto, os outros vêm resumidos depois do principal.' },
      { chave: 'contato', tipo: 'contato', rotulo: 'Contato do CRAS',
        ajuda: 'Perguntar: a pessoa escolhe; quem responde 2 não chega à fila. Sempre: todo caso entra na fila. Nunca: o bot só orienta e nenhum caso chega à fila, a não ser os de violência.' },
    ],
  },
  {
    id: 'fila', titulo: 'Fila do CRAS', icone: Inbox, tipo: 'fim',
    quando: 'O caso entra na Fila do CRAS da pessoa com a necessidade, a prioridade e o bairro.', textos: [],
  },

  // Exceções do caminho
  {
    id: 'sem_aceite', titulo: 'Sem aceite', icone: Ban, tipo: 'fim',
    quando: 'A pessoa não aceitou. Nada é gravado; o bot indica o Disque Social 121 e o CRAS.', textos: ['sem_consentimento'],
  },
  {
    id: 'nao_entendi', titulo: 'Não entendi', icone: MessageCircleQuestion, tipo: 'normal',
    quando: 'O sistema não identificou a necessidade com segurança. Pede para contar de outro jeito.',
    depois: 'A pessoa conta de novo. Se o sistema não entender pela 2ª vez, oferece o Menu de assuntos.',
    textos: ['nao_entendi', 'nao_entendi_de_novo'], estados: ['RELATO_NOVAMENTE'],
    opcoes: [{ chave: 'menu_na_primeira_falha', tipo: 'bool', rotulo: 'Mostrar o menu de assuntos já na 1ª vez',
      ajuda: 'Ligado: em vez de pedir para contar de novo, o bot já oferece os assuntos por número.' }],
  },
  {
    id: 'menu', titulo: 'Menu de assuntos', icone: ListChecks, tipo: 'automatico',
    quando: 'A pessoa escolhe o assunto por número, quando o bot errou ou não entendeu.',
    depois: 'Com o assunto escolhido, segue para o Caminho. Com “Nenhum desses”, indica o Disque Social 121.', textos: [], estados: ['AGUARDANDO_CORRECAO'],
    exemplo: 'Qual destes assuntos combina mais com a sua situação? Responda com o número:\n*1* - renda e benefícios\n*2* - Cadastro Único\n…\n*9* - Nenhum desses',
  },
  {
    id: 'disque121', titulo: 'Disque Social 121', icone: Phone, tipo: 'fim',
    quando: 'Nenhum assunto serviu. O bot indica o Disque Social 121 e o CRAS, sem inventar resposta.', textos: [],
  },
  {
    id: 'encerrado', titulo: 'Encerrado', icone: HeartHandshake, tipo: 'fim',
    quando: 'A pessoa recebeu o caminho e não quis contato. Nada entra na fila, e o bot avisa que o pedido não foi enviado ao CRAS. Dias depois, o bot pergunta se ela conseguiu ir; se não, ela pode pedir contato.',
    textos: ['acompanhamento', 'acompanhamento_foi', 'acompanhamento_nao_precisa'], estados: ['AGUARDANDO_ACOMPANHAMENTO'],
    opcoes: [{ chave: 'perguntar_depois', tipo: 'bool', rotulo: 'Perguntar dias depois se a pessoa conseguiu ir ao CRAS',
      ajuda: 'Quem não quis contato recebe, 3 dias depois, “Você conseguiu ir ao CRAS?”. Se ainda não foi, pode pedir contato e o caso entra na Fila. Nunca em caso de violência.' }],
  },

  // Comandos e situações à parte
  {
    id: 'apagar', titulo: '“apagar”', icone: Trash2, tipo: 'normal',
    quando: 'A qualquer momento. O bot confirma e apaga conversa e pedidos (casos urgentes abertos ficam com a equipe).',
    textos: ['apagar_confirmar', 'apagar_feito', 'apagar_cancelado'], estados: ['CONFIRMAR_APAGAR'],
    travada: 'Direito da pessoa (LGPD): o comando vale em todos os CRAS. Os textos podem mudar.',
  },
  {
    id: 'recomecar', titulo: '“recomeçar”', icone: RotateCcw, tipo: 'automatico',
    quando: 'A qualquer momento. Volta para o Relato (ou para as boas-vindas, se ainda não aceitou).', textos: [],
    exemplo: 'Usa o mesmo texto do Relato: “Obrigado! Agora me conte…”', travada: 'Vale em todos os CRAS.',
  },
  {
    id: 'retorno', titulo: 'Volta outro dia', icone: Undo2, tipo: 'normal',
    quando: 'Quem já aceitou e escreve de novo não precisa aceitar outra vez; o bairro também fica guardado.', textos: ['retorno'],
  },
  {
    id: 'agradecimento', titulo: 'Agradece no fim', icone: ThumbsUp, tipo: 'normal',
    quando: '“Obrigado”, “valeu” depois que a conversa terminou.', textos: ['agradecimento'],
  },
  {
    id: 'audio', titulo: 'Mensagem de áudio', icone: Mic, tipo: 'normal',
    quando: 'A pessoa manda áudio: o bot transcreve, diz o que ouviu (“🎤 Ouvi seu áudio assim…”) e segue a conversa como se ela tivesse escrito; a resposta vai por escrito (áudio só se ela pedir). Se não der para entender, manda o texto abaixo.', textos: ['audio'],
  },
  {
    id: 'documentos', titulo: 'Fotos dos documentos', icone: Camera, tipo: 'normal',
    quando: 'Depois de o pedido ir para o CRAS, a pessoa escolhe mandar as fotos dos documentos por aqui (a equipe confere antes e o atendimento fica mais rápido) ou levar pessoalmente. Cada foto passa por uma conferência de tamanho, luz e nitidez; a equipe vê tudo na ficha do caso e pode pedir outra foto.',
    depois: 'Quando a pessoa escreve “pronto”, as fotos ficam anexadas ao caso. Quem decide o benefício é o profissional.',
    textos: ['oferecer_documentos', 'instrucoes_documentos', 'documento_recebido', 'documento_problema', 'documentos_recebidos',
      'documentos_nenhum', 'documentos_lembrete', 'documentos_presencial', 'documentos_limite', 'documento_refazer', 'imagem_fora_de_hora'],
    estados: ['AGUARDANDO_OPCAO_DOCUMENTOS', 'AGUARDANDO_DOCUMENTOS'],
    travada: 'Proteção de dados: as fotos ficam cifradas, não vão para a IA, só a equipe do caso vê (com registro) e são apagadas 30 dias depois de o caso ser fechado. Nunca em violência.',
  },
  {
    id: 'ajuda', titulo: '“não entendi” e áudio', icone: Volume2, tipo: 'normal',
    quando: 'A qualquer momento. Se a pessoa disser “não entendi”, o bot oferece ouvir a última resposta em áudio ou ler uma explicação mais simples, e depois volta para a etapa em que estava. Se pedir “manda em áudio”, vai direto o áudio. Fora isso, o bot não manda áudio (economiza créditos).',
    textos: ['oferecer_ajuda', 'audio_enviando', 'audio_indisponivel', 'repetir_com_calma'], estados: ['AGUARDANDO_AJUDA'],
  },
  {
    id: 'atendente', titulo: 'Atendente assumiu', icone: UserRound, tipo: 'normal',
    quando: 'Alguém da equipe assumiu a conversa em Conversas. O bot fica em silêncio até devolverem.',
    textos: ['atendente_assumiu'],
  },
];

export const LIGACOES: Ligacao[] = [
  { de: 'violencia', para: 'emergencia', rotulo: 'na hora', urgente: true },
  { de: 'emergencia', para: 'fila_urgente', urgente: true },
  { de: 'boas_vindas', para: 'bairro', rotulo: 'aceitou' },
  { de: 'boas_vindas', para: 'sem_aceite', rotulo: 'não aceitou' },
  { de: 'bairro', para: 'relato', rotulo: 'escolhe o CRAS' },
  { de: 'relato', para: 'confirmacao', rotulo: 'entendeu' },
  { de: 'relato', para: 'caminho', rotulo: 'entendeu (sem confirmação)', quando: 'sem_confirmacao' },
  { de: 'relato', para: 'nao_entendi', rotulo: 'não entendeu' },
  { de: 'nao_entendi', para: 'relato', rotulo: 'contou de novo' },
  { de: 'nao_entendi', para: 'menu', rotulo: '2ª vez' },
  { de: 'confirmacao', para: 'caminho', rotulo: 'está certo' },
  { de: 'confirmacao', para: 'menu', rotulo: 'não está certo' },
  { de: 'menu', para: 'caminho', rotulo: 'escolheu o assunto' },
  { de: 'menu', para: 'disque121', rotulo: 'nenhum desses' },
  { de: 'caminho', para: 'fila', rotulo: 'quis contato' },
  { de: 'caminho', para: 'encerrado', rotulo: 'não quis contato' },
  { de: 'fila', para: 'documentos', rotulo: 'quer adiantar' },
];

/** Caminho principal, na ordem da conversa. */
export const TRILHO = ['boas_vindas', 'bairro', 'relato', 'confirmacao', 'caminho', 'fila'];

/** Desvios pendurados embaixo da etapa de onde saem: cada passo é a condição e a etapa a que ela leva. */
export const DESVIOS: Record<string, { rotulo: string; etapa: string }[][]> = {
  boas_vindas: [[{ rotulo: 'não aceitou', etapa: 'sem_aceite' }]],
  relato: [[
    { rotulo: 'não entendeu', etapa: 'nao_entendi' },
    { rotulo: 'não entendeu de novo', etapa: 'menu' },
    { rotulo: 'nenhum desses', etapa: 'disque121' },
  ]],
  confirmacao: [[{ rotulo: 'não está certo', etapa: 'menu' }]],
  caminho: [[{ rotulo: 'não quis contato', etapa: 'encerrado' }]],
  fila: [[{ rotulo: 'quer adiantar', etapa: 'documentos' }]],
};

/** Vale em qualquer etapa, para todos os CRAS. */
export const SEGURANCA = ['violencia', 'emergencia', 'fila_urgente'];

export const COMANDOS = ['apagar', 'recomecar', 'ajuda', 'retorno', 'agradecimento', 'audio', 'atendente'];

/** Coluna do trilho a que uma etapa pertence (a principal ou a de onde sai o desvio), para a orelha do editor. */
export function colunaDaEtapa(id: string): number | null {
  const direta = TRILHO.indexOf(id);
  if (direta >= 0) return direta;
  for (const [origem, cadeias] of Object.entries(DESVIOS)) {
    if (cadeias.some((c) => c.some((passo) => passo.etapa === id))) return TRILHO.indexOf(origem);
  }
  return null;
}

/** Contagem "parado aqui agora" por etapa, a partir de /configuracao/fluxo/agora. */
export function contagemPorEtapa(porEstado: Record<string, number>, comAtendente: number): Record<string, number> {
  const saida: Record<string, number> = { atendente: comAtendente };
  for (const etapa of ETAPAS) {
    const total = (etapa.estados ?? []).reduce((soma, e) => soma + (porEstado[e] ?? 0), 0);
    if (total) saida[etapa.id] = total;
  }
  return saida;
}

export interface Pulada { curto: string; motivo: string }

/** Etapas que não acontecem com as opções atuais: rótulo curto (trilho) e motivo (editor). */
export function etapasPuladas(opcoes: OpcoesFluxo | null, temCras: boolean, vendoUnidade: boolean): Record<string, Pulada> {
  const saida: Record<string, Pulada> = {};
  if (!vendoUnidade && !temCras) saida.bairro = { curto: 'pulada agora', motivo: 'Pulada agora: nenhum CRAS cadastrado em Unidades de atendimento.' };
  if (!opcoes) return saida;
  if (!vendoUnidade && !opcoes.perguntar_bairro) saida.bairro = { curto: 'desligada', motivo: 'Desligada: ninguém é encaminhado a um CRAS; vale o padrão da secretaria.' };
  if (vendoUnidade) saida.bairro = { curto: 'pela secretaria', motivo: 'Definida pela secretaria. Quem chega aqui já é deste CRAS (pela localização ou pelo bairro).' };
  if (!opcoes.confirmar_necessidade) saida.confirmacao = { curto: 'desligada', motivo: 'Desligada: o bot vai direto ao caminho.' };
  if (opcoes.menu_na_primeira_falha) saida.nao_entendi = { curto: 'pulada', motivo: 'Pulada: o menu de assuntos aparece já na 1ª vez.' };
  if (opcoes.contato === 'nunca') saida.fila = { curto: 'ninguém entra', motivo: 'Contato “nunca”: o bot só orienta; nada entra na fila (a não ser violência).' };
  if (opcoes.contato === 'sempre') saida.encerrado = { curto: 'não acontece', motivo: 'Contato “sempre”: todo caso entra na fila, sem perguntar.' };
  return saida;
}

export interface Ponto { x: number; y: number }
/** Mensagem a mais que o CRAS pôs no fluxo; o bot envia logo antes da etapa antes_de. */
export interface MensagemExtra { id: string; antes_de: string; titulo: string; texto: string }

/** Uma mensagem extra vira um quadradinho como os outros. */
export function etapaDaExtra(e: MensagemExtra): Etapa {
  const antes = ETAPAS.find((x) => x.id === e.antes_de)?.titulo ?? e.antes_de;
  return {
    id: e.id, titulo: e.titulo || 'Mensagem extra', icone: MessageSquarePlus, tipo: 'normal', textos: [],
    quando: `Mensagem a mais, enviada logo antes de “${antes}”.`,
  };
}
