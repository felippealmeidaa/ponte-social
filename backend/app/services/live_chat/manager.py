import json
from typing import Dict, List, Set, Any
from fastapi import WebSocket

class LiveChatManager:
    """Notificações em tempo real para o painel. O estado do atendimento humano fica no banco (Conversa)."""
    def __init__(self):
        # Mapeamento de conexões ativas por tenant: tenant_id -> Set[WebSocket]
        self.active_connections: Dict[str, Set[WebSocket]] = {}

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

live_chat_manager = LiveChatManager()
