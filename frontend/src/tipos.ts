export interface Triagem {
  id: string;
  criado_em: string;
  atualizado_em: string | null;
  canal: string;
  nome_cidadao: string;
  telefone_mascarado: string;
  bairro: string;
  cidade: string;
  relato_original: string;
  categoria: string;
  categoria_modelo: string;
  categoria_confirmada_pelo_cidadao: boolean;
  necessidades_secundarias: string[];
  titulo_encaminhamento: string;
  prioridade: string;
  confianca: number;
  metodo_decisao: string;
  status: string;
  observacoes: string | null;
  conversa_id: string | null;
  tem_contato: boolean;
  servicos_recomendados: string[];
  documentos_necessarios: string[];
  /** "es" quando a pessoa escreveu em espanhol: relato_original é o que ela escreveu, relato_traducao é para a equipe. */
  idioma?: string | null;
  relato_traducao?: string | null;
  responsavel?: string | null;
  responsavel_nome?: string | null;
  atendido_em?: string | null;
  avaliacao?: number | null;
  /** Fotos de documentos que a pessoa mandou pelo WhatsApp. */
  documentos_enviados?: number;
  /** Quem da equipe corrigiu a necessidade (vira exemplo de treino). */
  corrigida_por?: string | null;
  corrigida_em?: string | null;
}

export interface ResumoConversa {
  id: string;
  telefone_mascarado: string;
  canal: string;
  estado: string;
  atendimento_humano: boolean;
  atendente: string | null;
  nao_lidas: number;
  atualizado_em: string;
  ultima_mensagem: { autor: string; texto: string } | null;
  triagem: { id: string; categoria: string; prioridade: string; status: string; titulo: string } | null;
}

export interface Mensagem {
  id: number;
  autor: 'cidadao' | 'bot' | 'atendente';
  texto: string;
  /** Em conversa em espanhol: o texto em português. */
  traducao?: string | null;
  criado_em: string;
}
