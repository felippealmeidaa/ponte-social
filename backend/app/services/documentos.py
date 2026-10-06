"""
Fotos de documentos pelo WhatsApp: depois de pedir contato do CRAS, a pessoa pode mandar as fotos dos
documentos da lista para a equipe analisar antes do atendimento (ou escolher levar pessoalmente).
Quem decide o benefício é sempre o profissional: o sistema só entrega as fotos organizadas no caso.

Cuidados (dados pessoais sensíveis, LGPD):
- só recebe fotos depois de a pessoa escolher mandá-las (a mensagem explica para que servem e por quanto tempo ficam);
- o arquivo fica cifrado no banco e nunca vai para a IA; a checagem de qualidade é local (tamanho, luz, nitidez);
- só a equipe que vê o caso abre as fotos, e cada abertura fica registrada nas observações;
- apagadas DOCUMENTOS_RETENCAO_DIAS depois de o caso ser concluído ou arquivado, e no "apagar" da pessoa;
- nunca em caso de violência.
"""
import io
import logging
import uuid
from datetime import timedelta
from typing import List, Optional, Tuple

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import get_fernet_cipher
from app.models import DocumentoAnexo, Triagem, agora, iso

log = logging.getLogger(__name__)

TIPOS_ACEITOS = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"}
LADO_MINIMO = 600          # px: menos que isso não dá para ler um documento
NITIDEZ_MINIMA = 25.0      # variância do Laplaciano: abaixo disso a foto está tremida ou desfocada
BRILHO_MINIMO = 45         # média de 0 a 255: abaixo disso está escura demais


def verificar(conteudo: bytes, mime: str) -> Tuple[Optional[str], Optional[int], Optional[int]]:
    """Devolve (problema, largura, altura). problema None = foto aceitável. Tudo local, nada sai do servidor."""
    mime = (mime or "").split(";")[0].strip().lower()
    if mime not in TIPOS_ACEITOS:
        return "tipo", None, None
    if len(conteudo) > settings.DOCUMENTO_MAX_MB * 1024 * 1024:
        return "grande", None, None
    if mime == "application/pdf" or mime in ("image/heic", "image/heif"):
        return None, None, None  # sem como medir aqui: a equipe confere
    try:
        import numpy as np
        from PIL import Image, ImageOps
        imagem = ImageOps.exif_transpose(Image.open(io.BytesIO(conteudo)))
        largura, altura = imagem.size
        if min(largura, altura) < LADO_MINIMO:
            return "pequena", largura, altura
        cinza = np.asarray(imagem.convert("L").resize((800, max(1, int(800 * altura / largura)))), dtype=np.float32)
        if cinza.mean() < BRILHO_MINIMO:
            return "escura", largura, altura
        laplaciano = cinza[1:-1, 1:-1] * -4 + cinza[:-2, 1:-1] + cinza[2:, 1:-1] + cinza[1:-1, :-2] + cinza[1:-1, 2:]
        if laplaciano.var() < NITIDEZ_MINIMA:
            return "tremida", largura, altura
        return None, largura, altura
    except Exception as e:
        log.warning("Não deu para abrir a imagem: %s", e)
        return "ilegivel", None, None


async def quantos(session: AsyncSession, triagem_id: str) -> int:
    return (await session.execute(select(func.count()).select_from(DocumentoAnexo)
                                  .where(DocumentoAnexo.triagem_id == triagem_id))).scalar_one()


async def guardar(session: AsyncSession, triagem: Triagem, conteudo: bytes, mime: str,
                  largura: Optional[int], altura: Optional[int]) -> int:
    """Guarda cifrado e devolve quantos documentos o pedido tem agora."""
    total = await quantos(session, triagem.id) + 1  # conta antes de adicionar (o autoflush incluiria o novo)
    session.add(DocumentoAnexo(
        id=f"doc-{uuid.uuid4().hex[:8]}", triagem_id=triagem.id, conversa_id=triagem.conversa_id,
        mime=(mime or "").split(";")[0].strip().lower(), tamanho=len(conteudo), largura=largura, altura=altura,
        conteudo_cifrado=get_fernet_cipher().encrypt(conteudo),
    ))
    triagem.documentos_enviados = total
    return total


def para_dict(d: DocumentoAnexo) -> dict:
    return {"id": d.id, "criado_em": iso(d.criado_em), "mime": d.mime, "tamanho": d.tamanho,
            "largura": d.largura, "altura": d.altura, "situacao": d.situacao, "motivo": d.motivo,
            "revisado_por": d.revisado_por}


async def listar(session: AsyncSession, triagem_id: str) -> List[DocumentoAnexo]:
    return list((await session.execute(select(DocumentoAnexo).where(DocumentoAnexo.triagem_id == triagem_id)
                                       .order_by(DocumentoAnexo.criado_em))).scalars())


def abrir(d: DocumentoAnexo) -> bytes:
    return get_fernet_cipher().decrypt(d.conteudo_cifrado)


async def apagar_da_conversa(session: AsyncSession, conversa_id: str, manter_triagens: List[str]) -> None:
    """"Apagar" da pessoa: some com as fotos, menos as de casos que a equipe precisa manter."""
    consulta = delete(DocumentoAnexo).where(DocumentoAnexo.conversa_id == conversa_id)
    if manter_triagens:
        consulta = consulta.where(DocumentoAnexo.triagem_id.not_in(manter_triagens))
    await session.execute(consulta)


async def aplicar_retencao(session: AsyncSession) -> int:
    """Apaga as fotos de casos fechados há mais de DOCUMENTOS_RETENCAO_DIAS (e de casos que já não existem)."""
    limite = agora() - timedelta(days=settings.DOCUMENTOS_RETENCAO_DIAS)
    fechados = select(Triagem.id).where(Triagem.status.in_(["CONCLUIDO", "ARQUIVADO"]), Triagem.atualizado_em < limite)
    existentes = select(Triagem.id)
    r1 = await session.execute(delete(DocumentoAnexo).where(DocumentoAnexo.triagem_id.in_(fechados)))
    r2 = await session.execute(delete(DocumentoAnexo).where(DocumentoAnexo.triagem_id.not_in(existentes)))
    await session.commit()
    return (r1.rowcount or 0) + (r2.rowcount or 0)
