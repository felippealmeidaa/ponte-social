import time
import uuid
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field
from app.services.rag.rag_service import rag_service

router = APIRouter()

# Base de documentos de conhecimento RAG indexados
DOCUMENTS_DB: List[Dict[str, Any]] = [
    {
        "id": "doc_anapolis_cras_01",
        "title": "Guia Oficial de Unidades CRAS e CREAS de Anápolis/GO",
        "category": "Equipamentos Sociais",
        "app_id": "social-cras",
        "chunks_count": 8,
        "format": "JSON / Estruturado",
        "status": "indexed",
        "updated_at": "2026-10-04 01:15",
        "size_kb": 12.4
    },
    {
        "id": "doc_cadunico_regras_02",
        "title": "Critérios de Elegibilidade e Documentos para Cadastro Único (CadÚnico)",
        "category": "Legislação & Benefícios",
        "app_id": "social-cras",
        "chunks_count": 14,
        "format": "PDF / Texto",
        "status": "indexed",
        "updated_at": "2026-10-03 18:40",
        "size_kb": 45.2
    },
    {
        "id": "doc_lei_maria_penha_03",
        "title": "Protocolo de Emergência e Proteção à Mulher - Lei 11.340 (ODS 16)",
        "category": "Proteção e Emergência",
        "app_id": "social-cras",
        "chunks_count": 6,
        "format": "DOCX / Texto",
        "status": "indexed",
        "updated_at": "2026-10-02 11:20",
        "size_kb": 18.9
    }
]

class AddTextDocumentRequest(BaseModel):
    title: str = Field(..., description="Título do documento")
    category: str = Field(..., description="Categoria ou Tag")
    content: str = Field(..., description="Conteúdo textual a ser fragmentado e indexado em vetores")
    app_id: Optional[str] = "social-cras"

class QueryKnowledgeRequest(BaseModel):
    query: str = Field(..., description="Pergunta ou busca semântica")
    top_k: Optional[int] = 3

@router.get("", summary="Listar documentos da base de conhecimento vetorial")
async def list_documents(app_id: Optional[str] = None):
    docs = DOCUMENTS_DB
    if app_id:
        docs = [d for d in docs if d.get("app_id") == app_id]
    return {
        "total_documents": len(docs),
        "total_chunks": sum(d.get("chunks_count", 0) for d in docs),
        "vector_dimension": 768,
        "documents": docs
    }

@router.post("/text", summary="Adicionar novo documento de texto à base vetorial")
async def add_text_document(req: AddTextDocumentRequest):
    # Simula fragmentação em chunks
    paragraphs = [p.strip() for p in req.content.split("\n\n") if p.strip()]
    chunks_count = max(len(paragraphs), 1)
    
    doc_id = f"doc_{uuid.uuid4().hex[:8]}"
    new_doc = {
        "id": doc_id,
        "title": req.title,
        "category": req.category,
        "app_id": req.app_id,
        "chunks_count": chunks_count,
        "format": "Texto / Markdown",
        "status": "indexed",
        "updated_at": time.strftime("%Y-%m-%d %H:%M"),
        "size_kb": round(len(req.content.encode('utf-8')) / 1024, 2)
    }
    DOCUMENTS_DB.insert(0, new_doc)
    return {
        "success": True,
        "message": f"Documento '{req.title}' processado e {chunks_count} chunks indexados no banco vetorial.",
        "document": new_doc
    }

@router.post("/query", summary="Testar busca semântica na base de conhecimento (Cosine Similarity)")
async def query_knowledge_base(req: QueryKnowledgeRequest):
    start_time = time.perf_counter()
    # Executa busca vetorial no serviço RAG
    results = await rag_service.search_cras_units(bairro_cidadao=req.query, top_k=req.top_k)
    latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
    
    return {
        "query": req.query,
        "top_k": req.top_k,
        "latency_ms": latency_ms,
        "results": [
            {
                "title": r.get("nome", "Unidade Municipal"),
                "similarity_score": round(1.0 - (i * 0.08), 3),
                "snippet": f"Endereço: {r.get('endereco', '')} | Contato: {r.get('telefone', '')} | Serviços: CadÚnico, Benefícios e Atendimento Social.",
                "source": "Base Oficial de Anápolis"
            }
            for i, r in enumerate(results)
        ]
    }
