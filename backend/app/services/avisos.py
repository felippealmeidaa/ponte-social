"""
Aviso de andamento: quando a equipe começa a atender ou conclui um caso, a pessoa recebe uma mensagem curta
no WhatsApp ("a equipe do CRAS recebeu seu pedido"). Responde à maior angústia de quem pede ajuda: saber se
alguém viu.

Nunca avisa em caso de violência: o celular pode estar com quem agride, e uma mensagem do CRAS pode pôr a
pessoa em risco. O técnico decide caso a caso (o painel manda avisar=False para não enviar).
"""
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Conversa, Mensagem, Triagem, UnidadeAtendimento
from app.services import catalogo
from app.services.channels.envio import enviar_pelo_canal
from app.services.ml.train_evaluator import VIOLENCIA

TEXTO_POR_STATUS = {"EM_ATENDIMENTO": "aviso_em_atendimento", "CONCLUIDO": "aviso_concluido"}
NOME_ASSUNTO = {
    "renda_beneficio": "renda e benefícios", "cadastro_atualizacao": "Cadastro Único", "moradia": "moradia",
    "documentacao": "documentos", "alimentacao": "alimentação", "pessoa_idosa_pcd": "pessoa idosa ou com deficiência",
    "trabalho_renda": "trabalho e cursos", "nao_identificado": "assistência social",
}


def motivo_sem_aviso(triagem: Triagem) -> Optional[str]:
    """Por que este caso não recebe aviso (None = pode receber)."""
    if triagem.categoria == VIOLENCIA or triagem.prioridade == "URGENTE_VIOLENCIA":
        return "violencia"
    if triagem.canal != "whatsapp" or not triagem.conversa_id:
        return "sem_whatsapp"
    return None


async def avisar_andamento(session: AsyncSession, triagem: Triagem, status: str) -> dict:
    """Envia o aviso do novo status. Devolve {"enviado": bool, "motivo": str | None}."""
    chave = TEXTO_POR_STATUS.get(status)
    if not chave:
        return {"enviado": False, "motivo": "sem_aviso_para_status"}
    motivo = motivo_sem_aviso(triagem)
    if motivo:
        return {"enviado": False, "motivo": motivo}
    conversa = await session.get(Conversa, triagem.conversa_id)
    if conversa is None:  # a pessoa apagou os dados
        return {"enviado": False, "motivo": "conversa_apagada"}
    unidade = await session.get(UnidadeAtendimento, triagem.unidade_id) if triagem.unidade_id else None
    texto = (catalogo.texto(chave, triagem.unidade_id)
             .replace("{cras}", unidade.nome if unidade else "CRAS")
             .replace("{assunto}", NOME_ASSUNTO.get(triagem.categoria, "seu pedido")))
    if not await enviar_pelo_canal(conversa, texto):
        return {"enviado": False, "motivo": "falha_no_envio"}
    session.add(Mensagem(conversa_id=conversa.telefone_hash, autor="bot", texto=texto))
    await session.commit()
    return {"enviado": True, "motivo": None}
