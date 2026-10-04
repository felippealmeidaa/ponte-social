import asyncio
from typing import Dict, Any, List, Optional
from app.services.llm.gemini_service import gemini_service
from app.services.ml.classifier_service import SocialClassifierService
from app.services.rag.rag_service import social_rag_service

class FlowExecutionEngine:
    """
    Motor de Execução Dinâmica de Grafos de IA e Fluxos Conversacionais (Flow Engine).
    Executa os nós e arestas configurados visualmente no Frontend React Flow,
    integrando Gemini 3.5 Flash Lite, Classificadores de Machine Learning,
    Agentic RAG e Roteamento Condicional em tempo real.
    """

    @classmethod
    async def execute_graph(cls, graph_data: Dict[str, Any], input_text: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        nodes = graph_data.get("nodes", [])
        edges = graph_data.get("edges", [])
        
        if not nodes:
            return {
                "status": "error",
                "message": "Grafo vazio. Adicione nós ao fluxo."
            }

        execution_logs: List[Dict[str, Any]] = []
        state_variables: Dict[str, Any] = {
            "input_text": input_text,
            "context": context or {},
            "categoria_ml": None,
            "is_urgente": False,
            "rag_results": None,
            "gemini_response": None,
            "final_message": None
        }

        # 1. Encontra o Nó de Entrada (Gatilho)
        start_node = next((n for n in nodes if n.get("data", {}).get("type") == "trigger"), nodes[0])
        current_node_id = start_node.get("id")

        visited_nodes = set()
        max_steps = 15  # Previne loops infinitos

        while current_node_id and len(visited_nodes) < max_steps:
            visited_nodes.add(current_node_id)
            node = next((n for n in nodes if n.get("id") == current_node_id), None)
            if not node:
                break

            node_data = node.get("data", {})
            node_type = node_data.get("type", "standard")
            node_label = node_data.get("label", "Nó")
            node_config = node_data.get("config", {})

            log_entry = {
                "node_id": current_node_id,
                "node_label": node_label,
                "node_type": node_type,
                "output": None
            }

            # Execução de acordo com o Tipo do Nó
            if node_type == "trigger":
                log_entry["output"] = f"Mensagem recebida: '{input_text}'"

            elif node_type == "ml_classifier":
                # Executa o classificador de Machine Learning supervisionado (Linear SVM)
                ml_res = SocialClassifierService.classify_relato(state_variables["input_text"])
                state_variables["categoria_ml"] = ml_res["categoria"]
                state_variables["is_urgente"] = ml_res["is_urgente"]
                state_variables["ml_details"] = ml_res
                log_entry["output"] = {
                    "categoria": ml_res["categoria"],
                    "confianca": ml_res["confianca"],
                    "prioridade": ml_res["prioridade"],
                    "metodo": ml_res["metodo_decisao"]
                }

            elif node_type == "llm_gemini":
                # Executa o Google Gemini 3.5 Flash Lite
                system_prompt = node_config.get("prompt") or (
                    "Você é um assistente social empático e profissional de Anápolis. "
                    "Analise o relato e elabore uma orientação clara e acolhedora em linguagem simples."
                )
                user_msg = f"Relato do cidadão: {state_variables['input_text']}"
                if state_variables.get("ml_details"):
                    user_msg += f"\nClassificação: {state_variables['ml_details']['titulo_encaminhamento']}"

                gemini_res = await gemini_service.generate_response(system_prompt, user_msg)
                state_variables["gemini_response"] = gemini_res.get("content", "")
                log_entry["output"] = {
                    "model": gemini_res.get("model", "gemini-3.5-flash-lite"),
                    "response": state_variables["gemini_response"]
                }

            elif node_type == "rag_pgvector":
                # Executa a busca vetorial / semântica RAG
                rag_res = social_rag_service.search_relevant_unit(state_variables["input_text"])
                state_variables["rag_results"] = rag_res
                log_entry["output"] = {
                    "unidade_recomendada": rag_res["unidade"]["nome"],
                    "endereco": rag_res["unidade"]["endereco"],
                    "telefone": rag_res["unidade"]["telefone"]
                }

            elif node_type == "urgency_alert":
                state_variables["final_message"] = (
                    "🚨 *ATENDIMENTO EMERGENCIAL DE PROTEÇÃO SOCIAL*\n\n"
                    "Canais imediatos: Ligue 190 (Polícia) | Ligue 180 (Violência contra Mulher) | Disque 100."
                )
                log_entry["output"] = "Protocolo de Emergência Violência Acionado"

            elif node_type == "handover":
                log_entry["output"] = "Bot pausado para transbordo para atendente humano"

            else:
                if state_variables.get("gemini_response"):
                    state_variables["final_message"] = state_variables["gemini_response"]
                elif state_variables.get("ml_details"):
                    state_variables["final_message"] = (
                        f"Identificamos sua demanda: {state_variables['ml_details']['titulo_encaminhamento']}. "
                        f"Local: {state_variables['ml_details']['local_atendimento']}."
                    )
                else:
                    state_variables["final_message"] = f"Recebemos sua mensagem: {state_variables['input_text']}"
                log_entry["output"] = state_variables["final_message"]

            execution_logs.append(log_entry)

            # Roteamento de Próximo Nó via Arestas (Edges)
            outgoing_edges = [e for e in edges if e.get("source") == current_node_id]

            if not outgoing_edges:
                break

            if node_type == "condition":
                is_urgent = state_variables.get("is_urgente", False) or state_variables.get("categoria_ml") == "violencia_protecao"
                target_handle = "sim" if is_urgent else "nao"
                
                selected_edge = next((e for e in outgoing_edges if e.get("sourceHandle") == target_handle or (target_handle == "sim" and "sim" in (e.get("label", "").lower()))), outgoing_edges[0])
                current_node_id = selected_edge.get("target")
            else:
                current_node_id = outgoing_edges[0].get("target")

        return {
            "status": "success",
            "total_nodes_executed": len(execution_logs),
            "final_message": state_variables["final_message"] or state_variables.get("gemini_response"),
            "state_variables": state_variables,
            "execution_logs": execution_logs
        }

flow_execution_engine = FlowExecutionEngine()
