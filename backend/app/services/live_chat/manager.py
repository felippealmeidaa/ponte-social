import asyncio
import json
from typing import Dict, List, Set, Any
from fastapi import WebSocket

class LiveChatManager:
    def __init__(self):
        # Mapeamento de conexões ativas por tenant: tenant_id -> Set[WebSocket]
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # Estado de conversas em atendimento humano: contact_phone -> bool (is_human_paused)
        self.human_attendance_sessions: Dict[str, Dict[str, Any]] = {}

    async def connect(self, websocket: WebSocket, tenant_id: str):
        await websocket.accept()
        if tenant_id not in self.active_connections:
            self.active_connections[tenant_id] = set()
        self.active_connections[tenant_id].add(websocket)

    def disconnect(self, websocket: WebSocket, tenant_id: str):
        if tenant_id in self.active_connections:
            self.active_connections[tenant_id].discard(websocket)

    async def broadcast_to_tenant(self, tenant_id: str, message: Dict[str, Any]):
        """Envia mensagem em tempo real para todos os atendentes do tenant conectado"""
        if tenant_id in self.active_connections:
            for connection in list(self.active_connections[tenant_id]):
                try:
                    await connection.send_text(json.dumps(message, ensure_ascii=False))
                except Exception:
                    self.active_connections[tenant_id].discard(connection)

    def pause_bot_for_contact(self, phone: str, agent_id: str):
        """Pausa o bot automatizado para transbordo humano"""
        self.human_attendance_sessions[phone] = {
            "is_human": True,
            "agent_id": agent_id,
            "paused_at": asyncio.get_event_loop().time()
        }

    def resume_bot_for_contact(self, phone: str):
        """Retoma o bot automatizado após o encerramento do atendimento"""
        if phone in self.human_attendance_sessions:
            del self.human_attendance_sessions[phone]

    def is_bot_paused(self, phone: str) -> bool:
        return phone in self.human_attendance_sessions

live_chat_manager = LiveChatManager()
