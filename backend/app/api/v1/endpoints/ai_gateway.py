import time
import uuid
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from app.services.ml.classifier_service import SocialClassifierService
from app.services.ml.train_evaluator import train_and_evaluate
from app.services.llm.gemini_service import gemini_service

router = APIRouter()

# In-memory logging of inferences for analytics
INFERENCE_LOGS: List[Dict[str, Any]] = []

class PredictRequest(BaseModel):
    text: str = Field(..., description="Texto do relato ou mensagem a ser classificada")
    app_id: Optional[str] = "social-cras"
    explain: Optional[bool] = False

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatCompletionRequest(BaseModel):
    messages: List[ChatMessage]
    app_id: Optional[str] = "social-cras"
    temperature: Optional[float] = 0.3
    max_tokens: Optional[int] = 800

class HybridRouteRequest(BaseModel):
    text: str
    confidence_threshold: Optional[float] = 0.85
    context: Optional[str] = None

@router.post("/predict", summary="Inferência Rápida via Modelo de Machine Learning Local (Linear SVM)")
async def predict_model(req: PredictRequest):
    start_time = time.perf_counter()
    
    result = SocialClassifierService.classify_relato(req.text)
    latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
    
    is_emergency = result.get("is_urgente", False) or result.get("categoria") == "violencia_protecao" or result.get("prioridade") == "URGENTE_VIOLENCIA"
    
    log_entry = {
        "id": str(uuid.uuid4())[:8],
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "model": "Linear SVM (TF-IDF)",
        "type": "classification",
        "input_preview": req.text[:60] + "..." if len(req.text) > 60 else req.text,
        "predicted_class": result.get("titulo_encaminhamento", result.get("categoria")),
        "confidence": result.get("confianca", 0.95),
        "is_emergency": is_emergency,
        "latency_ms": latency_ms,
        "tokens": 0,
        "cost_usd": 0.0
    }
    INFERENCE_LOGS.insert(0, log_entry)
    if len(INFERENCE_LOGS) > 100:
        INFERENCE_LOGS.pop()
        
    return {
        "success": True,
        "model": "Linear SVM (TF-IDF + Calibrated Classifier)",
        "prediction": result.get("titulo_encaminhamento", result.get("categoria")),
        "category_key": result.get("categoria"),
        "confidence": result.get("confianca", 0.95),
        "is_emergency": is_emergency,
        "metodo": result.get("metodo_decisao"),
        "servicos_recomendados": result.get("servicos_recomendados", []),
        "latency_ms": latency_ms,
        "server_status": "healthy"
    }

@router.post("/chat", summary="Geração com Google Gemini 3.5 Flash Lite")
async def chat_completion(req: ChatCompletionRequest):
    start_time = time.perf_counter()
    
    full_prompt = "\n".join([f"{m.role}: {m.content}" for m in req.messages])
    
    response_text = await gemini_service.generate_empathetic_response(
        citizen_text=full_prompt,
        cras_unit={"nome": "Hub Central de Atendimento", "endereco": "Atendimento Digital"}
    )
    
    latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
    estimated_tokens = len(full_prompt.split()) + len(response_text.split())
    
    log_entry = {
        "id": str(uuid.uuid4())[:8],
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "model": "gemini-3.5-flash-lite",
        "type": "generation",
        "input_preview": full_prompt[:60] + "...",
        "predicted_class": "LLM_RESPONSE",
        "confidence": 0.99,
        "is_emergency": False,
        "latency_ms": latency_ms,
        "tokens": estimated_tokens,
        "cost_usd": round((estimated_tokens / 1_000_000) * 0.075, 6)
    }
    INFERENCE_LOGS.insert(0, log_entry)
    if len(INFERENCE_LOGS) > 100:
        INFERENCE_LOGS.pop()
        
    return {
        "id": f"chatcmpl-{uuid.uuid4()}",
        "object": "chat.completion",
        "model": "gemini-3.5-flash-lite",
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": response_text
                },
                "finish_reason": "stop"
            }
        ],
        "usage": {
            "total_tokens": estimated_tokens,
            "latency_ms": latency_ms
        }
    }

@router.post("/route", summary="Roteamento Híbrido Inteligente (SVM Local vs Gemini 3.5 Flash Lite)")
async def hybrid_routing(req: HybridRouteRequest):
    start_time = time.perf_counter()
    
    ml_result = SocialClassifierService.classify_relato(req.text)
    confidence = ml_result.get("confianca", 0.0)
    is_emergency = ml_result.get("is_urgente", False) or ml_result.get("categoria") == "violencia_protecao" or ml_result.get("prioridade") == "URGENTE_VIOLENCIA"
    
    if is_emergency or confidence >= req.confidence_threshold:
        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
        return {
            "routed_to": "local_ml_svm",
            "reason": "High confidence local classification" if not is_emergency else "CRITICAL EMERGENCY DETECTED (ODS 16)",
            "classification": ml_result.get("titulo_encaminhamento", ml_result.get("categoria")),
            "confidence": confidence,
            "is_emergency": is_emergency,
            "cost_usd": 0.0,
            "latency_ms": latency_ms,
            "response": f"Encaminhamento imediato para {ml_result.get('titulo_encaminhamento', ml_result.get('categoria'))}"
        }
    
    # O LLM só reescreve a orientação em linguagem simples; a categoria continua vindo do classificador.
    gemini_resp = await gemini_service.humanize_triage_message(ml_result)
    latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
    
    return {
        "routed_to": "gemini_3.5_flash_lite",
        "reason": f"Ambiguous input (confidence {confidence:.2f} < threshold {req.confidence_threshold})",
        "classification": ml_result.get("titulo_encaminhamento", ml_result.get("categoria")),
        "confidence": confidence,
        "is_emergency": False,
        "cost_usd": 0.00005,
        "latency_ms": latency_ms,
        "response": gemini_resp
    }

@router.get("/logs", summary="Logs de Inferência e Telemetria em Tempo Real")
async def get_inference_logs():
    total_calls = len(INFERENCE_LOGS)
    avg_latency = round(sum(l["latency_ms"] for l in INFERENCE_LOGS) / total_calls, 1) if total_calls > 0 else 0
    total_tokens = sum(l["tokens"] for l in INFERENCE_LOGS)
    
    return {
        "summary": {
            "total_inferences": total_calls,
            "avg_latency_ms": avg_latency,
            "total_tokens_processed": total_tokens,
            "active_models": ["Linear SVM (Local)", "Multinomial Naive Bayes", "gemini-3.5-flash-lite", "Faster-Whisper"]
        },
        "logs": INFERENCE_LOGS[:50]
    }
