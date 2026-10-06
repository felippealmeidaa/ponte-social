// Cliente da API do painel: injeta o token e devolve o usuário ao login quando a sessão expira.
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

const CHAVE_TOKEN = 'cras_token';
const CHAVE_USUARIO = 'cras_usuario';

export interface Usuario {
  id: string;
  login?: string;
  /** CRAS da conta; null = coordenação geral (vê todas as unidades). */
  unidade_id?: string | null;
  name: string;
  email: string;
  role: string;
}

export class ErroApi extends Error {
  status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.status = status;
  }
}

function lerArmazenado(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

export function sessaoSalva(): Usuario | null {
  const bruto = lerArmazenado(CHAVE_USUARIO);
  if (!bruto || !lerArmazenado(CHAVE_TOKEN)) return null;
  try {
    return JSON.parse(bruto) as Usuario;
  } catch {
    return null;
  }
}

export function salvarSessao(usuario: Usuario, token: string) {
  try {
    localStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
    localStorage.setItem(CHAVE_TOKEN, token);
  } catch {
    /* sem armazenamento: a sessão dura até recarregar a página */
  }
  tokenEmMemoria = token;
}

export function encerrarSessao() {
  try {
    localStorage.removeItem(CHAVE_USUARIO);
    localStorage.removeItem(CHAVE_TOKEN);
  } catch {
    /* ignora */
  }
  tokenEmMemoria = null;
}

let tokenEmMemoria: string | null = lerArmazenado(CHAVE_TOKEN);

export async function api<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const cabecalhos = new Headers(opcoes.headers);
  // FormData (áudio) leva o próprio Content-Type com o boundary
  if (opcoes.body && !(opcoes.body instanceof FormData) && !cabecalhos.has('Content-Type')) cabecalhos.set('Content-Type', 'application/json');
  if (tokenEmMemoria) cabecalhos.set('Authorization', `Bearer ${tokenEmMemoria}`);

  let resposta: Response;
  try {
    resposta = await fetch(`${API_URL}${caminho}`, { ...opcoes, headers: cabecalhos });
  } catch {
    throw new ErroApi(0, 'Sem conexão com o servidor. Verifique se o backend está rodando.');
  }

  if (resposta.status === 401 && !caminho.startsWith('/auth/')) {
    encerrarSessao();
    window.dispatchEvent(new Event('sessao-expirada'));
  }
  if (!resposta.ok) {
    let detalhe = `Erro ${resposta.status}`;
    try {
      const corpo = await resposta.json();
      if (typeof corpo.detail === 'string') detalhe = corpo.detail;
    } catch {
      /* corpo vazio */
    }
    throw new ErroApi(resposta.status, detalhe);
  }
  return resposta.json() as Promise<T>;
}

/** Arquivo protegido (foto de documento): baixa com o login e devolve um endereço local para mostrar na tela. */
export async function arquivoProtegido(caminho: string): Promise<string> {
  const cabecalhos = new Headers();
  if (tokenEmMemoria) cabecalhos.set('Authorization', `Bearer ${tokenEmMemoria}`);
  const resposta = await fetch(`${API_URL}${caminho}`, { headers: cabecalhos });
  if (!resposta.ok) throw new ErroApi(resposta.status, 'Não foi possível abrir o documento.');
  return URL.createObjectURL(await resposta.blob());
}

export const enviar = (corpo: unknown) => ({ method: 'POST', body: JSON.stringify(corpo) });
export const atualizar = (corpo: unknown, metodo = 'PATCH') => ({ method: metodo, body: JSON.stringify(corpo) });
