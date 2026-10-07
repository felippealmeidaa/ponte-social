"""Mapa de demandas: um ponto por bairro (média dos pontos das conversas), nunca um ponto por pessoa."""
import uuid

from fastapi.testclient import TestClient

from app.db import abrir_sessao
from app.main import app
from app.models import Conversa, Triagem
from conftest import autenticar


def _caso(bairro, categoria, ponto=None, canal="whatsapp"):
    conversa_id = uuid.uuid4().hex if ponto else None
    triagem = Triagem(id=uuid.uuid4().hex[:16], canal=canal, bairro=bairro, relato_anonimizado="relato", categoria=categoria,
                      categoria_modelo=categoria, titulo_encaminhamento="t", prioridade="MEDIA", metodo_decisao="teste",
                      conversa_id=conversa_id)
    conversa = Conversa(telefone_hash=conversa_id, estado="FIM", latitude=ponto[0], longitude=ponto[1]) if ponto else None
    return triagem, conversa


def test_mapa_agrupa_por_bairro_com_ponto_medio():
    bairro = f"Bairro Mapa {uuid.uuid4().hex[:6]}"
    casos = [_caso(bairro, "alimentacao", (-16.300, -48.950)), _caso(bairro, "alimentacao", (-16.302, -48.952)),
             _caso(bairro, "moradia"), _caso("Bairro Sem Ponto X", "moradia"), _caso("Não informado", "moradia"),
             _caso(bairro, "moradia", (-16.0, -48.0), canal="demo")]

    async def gravar():
        async with abrir_sessao() as session:
            for triagem, conversa in casos:
                session.add(triagem)
                if conversa:
                    session.add(conversa)
            await session.commit()

    with TestClient(app) as client:
        autenticar(client)
        client.portal.call(gravar)
        dados = client.get("/api/v1/triagem/indicadores/mapa?dias=7").json()

    linha = next(b for b in dados["bairros"] if b["bairro"] == bairro)
    # o exemplo de demonstração não entra; o caso sem ponto conta no total do bairro
    assert linha["total"] == 3 and linha["por_categoria"] == {"alimentacao": 2, "moradia": 1}
    assert (linha["lat"], linha["lng"]) == (-16.301, -48.951) and linha["origem"] == "conversas"
    # sem rede (GEOCODIFICAR=false) o bairro sem nenhum ponto fica fora do mapa, mas listado
    assert any(b["bairro"] == "Bairro Sem Ponto X" for b in dados["sem_ponto"])
    assert dados["sem_bairro"] >= 1
