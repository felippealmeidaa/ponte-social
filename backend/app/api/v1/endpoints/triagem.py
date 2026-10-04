import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from app.services.ml.classifier_service import SocialClassifierService
from app.core.security import mask_phone, mask_cpf
from app.services.live_chat.manager import live_chat_manager

router = APIRouter()

# Armazenamento em memória das triagens sociais
TRIAGENS_DB: List[Dict[str, Any]] = [
    {
        "id": "trg-101",
        "nome_cidadao": "Maria Silva",
        "telefone_mascarado": "62 9****-3321",
        "telefone_raw": "5562988883321",
        "cpf_mascarado": "***.382.910-**",
        "bairro": "Vila Jaiara",
        "cidade": "Anápolis",
        "relato_original": "Perdi meu emprego e estou sem conseguir colocar comida na mesa para meus 3 filhos. Preciso de ajuda com bolsa família e cesta básica.",
        "categoria": "renda_beneficio",
        "titulo_encaminhamento": "Programas de Transferência de Renda (Bolsa Família / BPC)",
        "prioridade": "ALTA",
        "confianca": 0.98,
        "metodo_decisao": "Modelo de Machine Learning (Linear SVM / NLP)",
        "status": "PENDENTE",
        "criado_em": "2026-10-03T14:22:00Z",
        "servicos_recomendados": ["Inscrição no Cadastro Único", "Encaminhamento para Bolsa Família"],
        "documentos_necessarios": ["RG ou CNH", "CPF de todos os membros", "Comprovante de residência", "Declaração escolar"]
    },
    {
        "id": "trg-102",
        "nome_cidadao": "João Pereira",
        "telefone_mascarado": "62 9****-9988",
        "telefone_raw": "5562991119988",
        "cpf_mascarado": "***.124.776-**",
        "bairro": "Jundiaí",
        "cidade": "Anápolis",
        "relato_original": "Preciso urgente atualizar os dados da minha família no Cadastro Único para não bloquear meu benefício.",
        "categoria": "cadastro_atualizacao",
        "titulo_encaminhamento": "Cadastro Único para Programas Sociais (CadÚnico)",
        "prioridade": "MEDIA",
        "confianca": 0.96,
        "metodo_decisao": "Modelo de Machine Learning (Linear SVM / NLP)",
        "status": "EM_ATENDIMENTO",
        "criado_em": "2026-10-03T15:10:00Z",
        "servicos_recomendados": ["Atualização cadastral bienal", "Emissão de Folha Resumo"],
        "documentos_necessarios": ["RG e CPF do Responsável", "Certidões de nascimento", "Conta de energia recente"]
    },
    {
        "id": "trg-103",
        "nome_cidadao": "Relato Anônimo (Vítima)",
        "telefone_mascarado": "62 9****-4411",
        "telefone_raw": "5562981234411",
        "cpf_mascarado": "Não informado",
        "bairro": "Recanto do Sol",
        "cidade": "Anápolis",
        "relato_original": "Estou sendo ameaçada de morte pelo meu ex-marido armado, ele quebrou as coisas em casa e preciso de abrigo seguro urgente!",
        "categoria": "violencia_protecao",
        "titulo_encaminhamento": "PROTEÇÃO IMEDIATA E ATENDIMENTO ESPECIALIZADO",
        "prioridade": "URGENTE_VIOLENCIA",
        "confianca": 0.99,
        "metodo_decisao": "Regra de Segurança Prioritária (Violência/Proteção)",
        "status": "ENCAMINHADO_CREAS",
        "criado_em": "2026-10-03T16:05:00Z",
        "servicos_recomendados": ["Atendimento emergencial CREAS", "Acolhimento em Casa Abrigo", "Encaminhamento DEAM / Medida Protetiva"],
        "documentos_necessarios": ["Atendimento prioritário sem exigência prévia de documentos"]
    }
]

class TriagemRequest(BaseModel):
    relato: str
    nome: Optional[str] = "Cidadão Não Identificado"
    telefone: Optional[str] = "Não informado"
    cpf: Optional[str] = None
    bairro: Optional[str] = "Não informado"
    cidade: Optional[str] = "Anápolis"

class UpdateStatusRequest(BaseModel):
    status: str
    observacoes: Optional[str] = None

@router.post("/predizer")
async def predizer_relato(payload: TriagemRequest):
    """Executa a inferência direta no relato do cidadão sem salvar na fila"""
    resultado = SocialClassifierService.classify_relato(payload.relato)
    return resultado

@router.post("/submeter")
async def submeter_triagem(payload: TriagemRequest):
    """Submete um relato, classifica com IA e insere na fila de triagem do CRAS"""
    classificacao = SocialClassifierService.classify_relato(payload.relato)
    
    triagem_id = f"trg-{uuid.uuid4().hex[:6]}"
    nova_triagem = {
        "id": triagem_id,
        "nome_cidadao": payload.nome,
        "telefone_mascarado": mask_phone(payload.telefone) if payload.telefone else "Não informado",
        "telefone_raw": payload.telefone,
        "cpf_mascarado": mask_cpf(payload.cpf) if payload.cpf else "Não informado",
        "bairro": payload.bairro,
        "cidade": payload.cidade,
        "relato_original": payload.relato,
        "categoria": classificacao["categoria"],
        "titulo_encaminhamento": classificacao["titulo_encaminhamento"],
        "prioridade": classificacao["prioridade"],
        "confianca": classificacao["confianca"],
        "metodo_decisao": classificacao["metodo_decisao"],
        "status": "PENDENTE" if not classificacao["is_urgente"] else "URGENTE_CREAS",
        "criado_em": datetime.utcnow().isoformat() + "Z",
        "servicos_recomendados": classificacao["servicos_recomendados"],
        "documentos_necessarios": classificacao["documentos_necessarios"]
    }
    
    TRIAGENS_DB.insert(0, nova_triagem)
    
    # Notifica o painel web do CRAS via WebSockets em tempo real
    await live_chat_manager.broadcast_to_tenant("cras-anapolis-01", {
        "event": "NOVA_TRIAGEM",
        "data": nova_triagem
    })
    
    return {
        "triagem_id": triagem_id,
        "classificacao": classificacao,
        "mensagem": "Triagem registrada e encaminhada para a equipe do CRAS"
    }

@router.get("/fila")
async def listar_fila_triagens(
    status_filter: Optional[str] = None,
    prioridade_filter: Optional[str] = None,
    categoria_filter: Optional[str] = None
):
    """Retorna a lista de triagens sociais filtradas para o painel do CRAS"""
    itens = TRIAGENS_DB
    if status_filter:
        itens = [t for t in itens if t["status"] == status_filter]
    if prioridade_filter:
        itens = [t for t in itens if t["prioridade"] == prioridade_filter]
    if categoria_filter:
        itens = [t for t in itens if t["categoria"] == categoria_filter]
    return itens

@router.patch("/{triagem_id}/status")
async def atualizar_status_triagem(triagem_id: str, payload: UpdateStatusRequest):
    """Atualiza o status do atendimento de uma triagem"""
    for item in TRIAGENS_DB:
        if item["id"] == triagem_id:
            item["status"] = payload.status
            item["atualizado_em"] = datetime.utcnow().isoformat() + "Z"
            if payload.observacoes:
                item["observacoes"] = payload.observacoes
            
            await live_chat_manager.broadcast_to_tenant("cras-anapolis-01", {
                "event": "STATUS_ATUALIZADO",
                "triagem_id": triagem_id,
                "novo_status": payload.status
            })
            return {"message": "Status atualizado com sucesso", "triagem": item}
    
    raise HTTPException(status_code=404, detail="Triagem não encontrada")
