import os
import json
from fastapi import APIRouter, HTTPException, BackgroundTasks
from app.services.ml.train_evaluator import train_and_evaluate, DATASET_PATH, MODEL_OUTPUT, REPORT_OUTPUT

router = APIRouter()

@router.get("/metrics")
async def get_ml_metrics():
    """Retorna o relatório completo de métricas científicas de IA e MLOps"""
    if not os.path.exists(REPORT_OUTPUT):
        raise HTTPException(status_code=404, detail="Relatório de métricas ainda não foi gerado.")
    
    with open(REPORT_OUTPUT, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data

@router.post("/retrain")
async def retrain_model(background_tasks: BackgroundTasks):
    """Dispara o retreinamento do modelo em background com os dados atualizados"""
    background_tasks.add_task(train_and_evaluate, DATASET_PATH, MODEL_OUTPUT, REPORT_OUTPUT)
    return {
        "status": "training_started",
        "message": "Retreinamento dos modelos supervisionados iniciado com validação cruzada k=5."
    }
