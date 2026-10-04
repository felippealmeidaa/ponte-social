import uuid
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.flow_engine.engine import flow_execution_engine

router = APIRouter()

# Fluxo padrão pré-configurado com nós de Assistência Social e IA
DEFAULT_FLOW_GRAPH = {
    "nodes": [
        {
            "id": "node-1",
            "type": "customNode",
            "data": {
                "label": "Gatilho: WhatsApp Mensagem",
                "sublabel": "Recebe texto ou áudio de voz do cidadão",
                "type": "trigger"
            },
            "position": {"x": 50, "y": 180}
        },
        {
            "id": "node-2",
            "type": "customNode",
            "data": {
                "label": "Classificador NLP Social",
                "sublabel": "Linear SVM + TF-IDF (8 Classes Sociais)",
                "type": "ml_classifier"
            },
            "position": {"x": 400, "y": 180}
        },
        {
            "id": "node-3",
            "type": "customNode",
            "data": {
                "label": "Condição: Risco de Violência?",
                "sublabel": "Recall 100% para acionamento imediato",
                "type": "condition"
            },
            "position": {"x": 750, "y": 80}
        },
        {
            "id": "node-4",
            "type": "customNode",
            "data": {
                "label": "Alerta Urgente CREAS / 190",
                "sublabel": "Ligue 180 / 190 / Disque 100 + Acolhimento",
                "type": "urgency_alert"
            },
            "position": {"x": 1100, "y": 20}
        },
        {
            "id": "node-5",
            "type": "customNode",
            "data": {
                "label": "Google Gemini 3.5 Flash Lite",
                "sublabel": "Reescrita empática e desambiguação",
                "type": "llm_gemini",
                "config": {"model": "gemini-3.5-flash-lite", "temperature": 0.2}
            },
            "position": {"x": 750, "y": 320}
        },
        {
            "id": "node-6",
            "type": "customNode",
            "data": {
                "label": "Agentic RAG pgvector",
                "sublabel": "Busca Unidades CRAS & Documentos (Anápolis)",
                "type": "rag_pgvector",
                "config": {"topK": 3}
            },
            "position": {"x": 1100, "y": 320}
        },
        {
            "id": "node-7",
            "type": "customNode",
            "data": {
                "label": "Resposta WhatsApp + Botões",
                "sublabel": "Envia orientação e confirmação na fila",
                "type": "standard"
            },
            "position": {"x": 1450, "y": 320}
        }
    ],
    "edges": [
        {"id": "e1-2", "source": "node-1", "target": "node-2", "animated": True, "style": {"stroke": "#38bdf8", "strokeWidth": 2}},
        {"id": "e2-3", "source": "node-2", "target": "node-3", "animated": True, "style": {"stroke": "#4ade80", "strokeWidth": 2}},
        {"id": "e3-4", "source": "node-3", "sourceHandle": "sim", "target": "node-4", "label": "Sim (Urgente)", "animated": True, "style": {"stroke": "#ef4444", "strokeWidth": 2}},
        {"id": "e2-5", "source": "node-2", "target": "node-5", "animated": True, "style": {"stroke": "#a855f7", "strokeWidth": 2}},
        {"id": "e5-6", "source": "node-5", "target": "node-6", "animated": True, "style": {"stroke": "#3b82f6", "strokeWidth": 2}},
        {"id": "e6-7", "source": "node-6", "target": "node-7", "animated": True, "style": {"stroke": "#10b981", "strokeWidth": 2}}
    ]
}

FLOWS_DB = [
    {
        "id": "flow-social-01",
        "name": "Fluxo Principal - Triagem Social e CRAS",
        "description": "Fluxo inteligente de triagem de vulnerabilidade, benefício e proteção de emergência.",
        "is_active": True,
        "version": "1.3.0",
        "graph_data": DEFAULT_FLOW_GRAPH
    }
]

class FlowSaveRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    is_active: Optional[bool] = True
    graph_data: Dict[str, Any]

class FlowExecuteRequest(BaseModel):
    graph_data: Dict[str, Any]
    input_text: str
    context: Optional[Dict[str, Any]] = None

@router.get("/")
async def list_flows():
    """Retorna a lista de fluxos configurados"""
    return FLOWS_DB

@router.get("/{flow_id}")
async def get_flow(flow_id: str):
    """Retorna os dados detalhados de nós e arestas de um fluxo"""
    flow = next((f for f in FLOWS_DB if f["id"] == flow_id), None)
    if not flow:
        raise HTTPException(status_code=404, detail="Fluxo não encontrado")
    return flow

@router.post("/")
async def create_flow(payload: FlowSaveRequest):
    """Cria um novo fluxo de atendimento personalizado"""
    new_flow = {
        "id": f"flow-{uuid.uuid4().hex[:6]}",
        "name": payload.name,
        "description": payload.description,
        "is_active": payload.is_active,
        "version": "1.0.0",
        "graph_data": payload.graph_data
    }
    FLOWS_DB.append(new_flow)
    return new_flow

@router.put("/{flow_id}")
async def update_flow(flow_id: str, payload: FlowSaveRequest):
    """Atualiza a estrutura de nós e arestas de um fluxo existente"""
    for f in FLOWS_DB:
        if f["id"] == flow_id:
            f["name"] = payload.name
            f["description"] = payload.description
            f["is_active"] = payload.is_active
            f["graph_data"] = payload.graph_data
            return f
    raise HTTPException(status_code=404, detail="Fluxo não encontrado")

@router.post("/execute")
async def execute_flow(payload: FlowExecuteRequest):
    """Executa o grafo visual dinamicamente nó a nó com Gemini 3.5 Flash Lite, ML e RAG"""
    result = await flow_execution_engine.execute_graph(
        graph_data=payload.graph_data,
        input_text=payload.input_text,
        context=payload.context
    )
    return result
