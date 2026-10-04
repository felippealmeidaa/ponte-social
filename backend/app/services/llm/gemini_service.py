import os
import httpx
from typing import Dict, Any, Optional, List
from app.core.config import settings

class GeminiService:
    """
    Serviço oficial de integração com a API do Google Gemini (Modelo 3.5 Flash Lite).
    Responsável por:
    1. Reescrita e desambiguação de consultas coloquiais (Intent & Query Rewriting)
    2. Simplificação de linguagem para cidadãos em vulnerabilidade (linguagem acolhedora e acessível)
    3. Copiloto de IA para criação e sugestão de nós de fluxo no Visual Flow Builder
    """
    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY", "")
        self.model = model or os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
        self.base_url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"

    async def generate_response(self, system_prompt: str, user_message: str) -> Dict[str, Any]:
        """Chama a API do Gemini 3.5 Flash Lite com prompt de sistema e mensagem do usuário"""
        if not self.api_key:
            # Fallback seguro caso a chave ainda não tenha sido configurada no .env
            return {
                "status": "fallback",
                "content": f"[Simulação Gemini 3.5 Flash Lite]: Compreendi seu relato. Encaminhamento baseado nas diretrizes oficiais da assistência social.",
                "model": self.model
            }

        headers = {
            "Content-Type": "application/json"
        }
        params = {
            "key": self.api_key
        }
        payload = {
            "system_instruction": {
                "parts": [{"text": system_prompt}]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": user_message}]
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 800,
                "topP": 0.95
            }
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    self.base_url,
                    params=params,
                    json=payload,
                    headers=headers
                )
                if response.status_code == 200:
                    data = response.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        text_content = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        return {
                            "status": "success",
                            "content": text_content.strip(),
                            "model": self.model
                        }
                return {
                    "status": "error",
                    "content": f"Erro na API do Gemini: status {response.status_code}",
                    "details": response.text
                }
        except Exception as e:
            return {
                "status": "error",
                "content": f"Falha de conexão com a API do Gemini: {str(e)}",
                "model": self.model
            }

    async def rewrite_query_for_rag(self, relato_cidadao: str) -> str:
        """Reescreve o relato com gírias/erros em uma consulta objetiva para busca RAG"""
        system_prompt = (
            "Você é um reescritor de consultas de assistência social. "
            "Converta o relato do cidadão em termos-chave de busca para identificar "
            "serviços públicos como CRAS, CREAS, CadÚnico, Bolsa Família, BPC e aluguel social. "
            "Retorne apenas os termos de busca concisos."
        )
        res = await self.generate_response(system_prompt, relato_cidadao)
        return res.get("content", relato_cidadao)

    async def humanize_triage_message(self, dados_triagem: Dict[str, Any]) -> str:
        """Gera uma mensagem em linguagem simples, empática e acessível para o WhatsApp"""
        system_prompt = (
            "Você é a assistente virtual de assistência social de Anápolis. "
            "Escreva uma mensagem acolhedora, em linguagem muito simples e direta para o WhatsApp. "
            "Explique onde a pessoa deve ir e quais documentos deve levar sem termos jurídicos complexos."
        )
        prompt_user = (
            f"Demanda: {dados_triagem.get('titulo_encaminhamento')}\n"
            f"Local: {dados_triagem.get('local_atendimento')}\n"
            f"Documentos: {', '.join(dados_triagem.get('documentos_necessarios', []))}"
        )
        res = await self.generate_response(system_prompt, prompt_user)
        return res.get("content", "")

gemini_service = GeminiService()
