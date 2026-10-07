"""Configurações › Base de conhecimento: documentos, trechos e teste de busca.
Ler e testar a busca: qualquer pessoa da equipe. Enviar, editar e apagar: só a coordenação."""
import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import apenas_coordenacao, usuario_logado
from app.db import get_session
from app.models import DocumentoBase, TrechoDocumento
from app.services.rag import documentos as base

router = APIRouter(dependencies=[Depends(usuario_logado)])


def _autor(usuario: Dict[str, Any]) -> str:
    return usuario.get("nome") or usuario.get("sub", "")


def _tags(texto: Optional[str]) -> List[str]:
    return [t.strip().lstrip("#")[:40] for t in (texto or "").split(",") if t.strip()][:12]


async def _documento(session: AsyncSession, doc_id: str) -> DocumentoBase:
    doc = await session.get(DocumentoBase, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado.")
    return doc


async def _trecho(session: AsyncSession, trecho_id: str) -> TrechoDocumento:
    t = await session.get(TrechoDocumento, trecho_id)
    if not t:
        raise HTTPException(status_code=404, detail="Trecho não encontrado.")
    return t


@router.get("/documentos")
async def listar(session: AsyncSession = Depends(get_session)):
    docs = list((await session.execute(select(DocumentoBase).order_by(DocumentoBase.criado_em.desc()))).scalars())
    trechos = list((await session.execute(select(TrechoDocumento))).scalars())
    por_doc: Dict[str, list] = {}
    for t in trechos:
        por_doc.setdefault(t.documento_id, []).append(t)
    return {
        "vetores_disponiveis": bool(settings.GEMINI_API_KEY),
        "modelo_vetores": settings.GEMINI_EMBED_MODEL,
        "totais": {"documentos": len(docs), "trechos": len(trechos), "com_vetor": sum(1 for t in trechos if t.embedding),
                   "editados": sum(1 for t in trechos if t.editado_manualmente)},
        "documentos": [base.doc_dict(d, por_doc.get(d.id, [])) for d in docs],
    }


@router.post("/documentos", status_code=201)
async def enviar(arquivo: UploadFile = File(...), titulo: str = Form(""), fonte: str = Form(""), tags: str = Form(""),
                 usuario: Dict[str, Any] = Depends(apenas_coordenacao), session: AsyncSession = Depends(get_session)):
    try:
        doc = await base.criar(session, await arquivo.read(), arquivo.filename or "documento.txt", titulo, fonte, _tags(tags), _autor(usuario))
    except base.DocumentoInvalido as erro:
        raise HTTPException(status_code=422, detail=str(erro))
    return base.doc_dict(doc, await base.trechos_de(session, doc.id))


@router.get("/documentos/{doc_id}")
async def abrir(doc_id: str, session: AsyncSession = Depends(get_session)):
    doc = await _documento(session, doc_id)
    trechos = await base.trechos_de(session, doc_id)
    return {**base.doc_dict(doc, trechos), "texto": doc.texto, "lista_trechos": [base.para_dict(t) for t in trechos]}


class DadosDocumento(BaseModel):
    titulo: Optional[str] = Field(default=None, max_length=200)
    fonte: Optional[str] = Field(default=None, max_length=1000)
    tags: Optional[str] = Field(default=None, max_length=500)


@router.patch("/documentos/{doc_id}")
async def editar_documento(doc_id: str, payload: DadosDocumento, usuario: Dict[str, Any] = Depends(apenas_coordenacao),
                           session: AsyncSession = Depends(get_session)):
    from datetime import datetime, timezone
    doc = await _documento(session, doc_id)
    if payload.titulo is not None and payload.titulo.strip():
        doc.titulo = payload.titulo.strip()
    if payload.fonte is not None:
        doc.fonte = payload.fonte.strip()
    if payload.tags is not None:
        doc.tags = _tags(payload.tags)
    doc.atualizado_em, doc.atualizado_por = datetime.now(timezone.utc), _autor(usuario)
    await session.commit()
    return base.doc_dict(doc, await base.trechos_de(session, doc_id))


@router.post("/documentos/{doc_id}/versao")
async def nova_versao(doc_id: str, arquivo: UploadFile = File(...), usuario: Dict[str, Any] = Depends(apenas_coordenacao),
                      session: AsyncSession = Depends(get_session)):
    doc = await _documento(session, doc_id)
    try:
        doc = await base.nova_versao(session, doc, await arquivo.read(), arquivo.filename or doc.nome_arquivo, _autor(usuario))
    except base.DocumentoInvalido as erro:
        raise HTTPException(status_code=422, detail=str(erro))
    return base.doc_dict(doc, await base.trechos_de(session, doc_id))


@router.post("/documentos/{doc_id}/reindexar")
async def reindexar(doc_id: str, usuario: Dict[str, Any] = Depends(apenas_coordenacao), session: AsyncSession = Depends(get_session)):
    """Refaz os vetores de todos os trechos (ex.: depois de ligar a chave do Gemini ou trocar o modelo)."""
    await _documento(session, doc_id)
    trechos = await base.trechos_de(session, doc_id)
    ok = await base.vetorizar_trechos(trechos)
    await session.commit()
    if not ok:
        raise HTTPException(status_code=503, detail="Não foi possível gerar os vetores agora (sem chave do Gemini ou sem rede). A busca continua por palavras.")
    return {"trechos": len(trechos), "com_vetor": len(trechos)}


@router.delete("/documentos/{doc_id}")
async def apagar(doc_id: str, usuario: Dict[str, Any] = Depends(apenas_coordenacao), session: AsyncSession = Depends(get_session)):
    doc = await _documento(session, doc_id)
    await session.execute(delete(TrechoDocumento).where(TrechoDocumento.documento_id == doc_id))
    await session.delete(doc)
    await session.commit()
    return {"removido": doc_id}


class TextoTrecho(BaseModel):
    conteudo: str = Field(min_length=1, max_length=8000)


class PontoDivisao(BaseModel):
    posicao: int = Field(ge=1)


@router.patch("/trechos/{trecho_id}")
async def editar_trecho(trecho_id: str, payload: TextoTrecho, usuario: Dict[str, Any] = Depends(apenas_coordenacao),
                        session: AsyncSession = Depends(get_session)):
    try:
        t = await base.editar_trecho(session, await _trecho(session, trecho_id), payload.conteudo, _autor(usuario))
    except base.DocumentoInvalido as erro:
        raise HTTPException(status_code=422, detail=str(erro))
    return base.para_dict(t)


@router.post("/trechos/{trecho_id}/juntar")
async def juntar(trecho_id: str, usuario: Dict[str, Any] = Depends(apenas_coordenacao), session: AsyncSession = Depends(get_session)):
    try:
        t = await base.juntar_com_proximo(session, await _trecho(session, trecho_id), _autor(usuario))
    except base.DocumentoInvalido as erro:
        raise HTTPException(status_code=422, detail=str(erro))
    return base.para_dict(t)


@router.post("/trechos/{trecho_id}/dividir")
async def dividir(trecho_id: str, payload: PontoDivisao, usuario: Dict[str, Any] = Depends(apenas_coordenacao),
                  session: AsyncSession = Depends(get_session)):
    try:
        partes = await base.dividir(session, await _trecho(session, trecho_id), payload.posicao, _autor(usuario))
    except base.DocumentoInvalido as erro:
        raise HTTPException(status_code=422, detail=str(erro))
    return [base.para_dict(t) for t in partes]


class Pergunta(BaseModel):
    pergunta: str = Field(min_length=3, max_length=500)
    reescrever: bool = True
    reordenar: bool = True


@router.post("/buscar")
async def buscar(payload: Pergunta, session: AsyncSession = Depends(get_session)):
    """Teste de busca: quais trechos responderiam a esta pergunta e com que nota."""
    return await base.buscar(session, payload.pergunta, k=5, usar_reescrita=payload.reescrever, usar_reordenacao=payload.reordenar)
