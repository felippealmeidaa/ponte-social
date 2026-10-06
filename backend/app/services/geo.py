"""
Mapa: distância até os lugares da rede, busca de coordenadas e link para abrir o lugar no Google Maps.

As buscas usam o Nominatim (OpenStreetMap), gratuito e sem chave. A política de uso pede no máximo
1 consulta por segundo e um User-Agent identificado; o resultado fica em cache na memória. O CEP é
consultado no ViaCEP (gratuito, sem chave). Sem rede ou com GEOCODIFICAR=false, as funções devolvem
None e o bot segue com a lista de bairros de cada unidade.
"""
import logging
import math
import re
from typing import Dict, Optional, Tuple
from urllib.parse import quote

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)

Ponto = Tuple[float, float]
NOMINATIM = "https://nominatim.openstreetmap.org"
VIACEP = "https://viacep.com.br/ws"
AGENTE = {"User-Agent": "PonteSocial/1.0 (projeto academico UniEVANGELICA; triagem social)"}
_cache_busca: Dict[str, Optional[Ponto]] = {}
_cache_bairro: Dict[Ponto, Optional[str]] = {}

# "-16.32, -48.95" digitado (útil no simulador e para quem copia do mapa)
_COORDENADAS = re.compile(r"^\s*(-?\d{1,2}[.,]\d+)\s*[,;\s]\s*(-?\d{1,3}[.,]\d+)\s*$")
# "75000-000", "75000000" ou "75.000-000" como mensagem inteira
_CEP = re.compile(r"^\s*(?:cep\s*:?\s*)?(\d{2})\.?(\d{3})-?(\d{3})\s*$", re.IGNORECASE)


def arredondar(lat: float, lng: float) -> Ponto:
    """~100 m: basta para achar o lugar mais perto e não guarda a casa da pessoa."""
    return round(lat, 3), round(lng, 3)


def coordenadas_no_texto(texto: str) -> Optional[Ponto]:
    m = _COORDENADAS.match(texto or "")
    if not m:
        return None
    lat, lng = (float(v.replace(",", ".")) for v in m.groups())
    return (lat, lng) if -90 <= lat <= 90 and -180 <= lng <= 180 else None


def cep_no_texto(texto: str) -> Optional[str]:
    m = _CEP.match(texto or "")
    return "".join(m.groups()) if m else None


def distancia_km(a: Ponto, b: Ponto) -> float:
    """Em linha reta (fórmula de haversine)."""
    lat1, lng1, lat2, lng2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def texto_distancia(km: float) -> str:
    if km < 0.1:
        return "menos de 100 m"
    return f"{round(km * 1000, -2):.0f} m" if km < 1 else f"{km:.1f} km".replace(".", ",")


def link_mapa(lat: Optional[float], lng: Optional[float], endereco: str = "") -> str:
    if lat is not None and lng is not None:
        return f"https://www.google.com/maps/search/?api=1&query={lat}%2C{lng}"
    return "https://www.google.com/maps/search/?api=1&query=" + quote(f"{endereco}, {settings.CIDADE}, {settings.UF}")


async def buscar(texto: str) -> Optional[Ponto]:
    """Ponto no mapa de um bairro ou endereço do município."""
    if not settings.GEOCODIFICAR or not (texto or "").strip():
        return None
    consulta = f"{texto.strip()}, {settings.CIDADE}, {settings.UF}"
    if consulta.lower() in _cache_busca:
        return _cache_busca[consulta.lower()]
    ponto = None
    try:
        async with httpx.AsyncClient(timeout=6.0, headers=AGENTE) as client:
            r = await client.get(f"{NOMINATIM}/search", params={"q": consulta, "format": "jsonv2", "limit": 1, "countrycodes": "br"})
        achados = r.json() if r.status_code == 200 else []
        # Só aceita o que fica no município (o Nominatim às vezes devolve um bairro homônimo de outra cidade)
        if achados and settings.CIDADE.lower() in achados[0].get("display_name", "").lower():
            ponto = (round(float(achados[0]["lat"]), 5), round(float(achados[0]["lon"]), 5))
    except Exception as e:
        log.warning("Falha ao consultar o mapa: %s", e)
        return None  # falha de rede não vai para o cache
    _cache_busca[consulta.lower()] = ponto
    return ponto


async def bairro_do_ponto(ponto: Ponto) -> Optional[str]:
    """Nome do bairro de um ponto (para o painel mostrar de onde é o caso)."""
    if not settings.GEOCODIFICAR:
        return None
    if ponto in _cache_bairro:
        return _cache_bairro[ponto]
    try:
        async with httpx.AsyncClient(timeout=6.0, headers=AGENTE) as client:
            r = await client.get(f"{NOMINATIM}/reverse", params={"lat": ponto[0], "lon": ponto[1], "format": "jsonv2", "zoom": 16})
        end = r.json().get("address", {}) if r.status_code == 200 else {}
    except Exception as e:
        log.warning("Falha ao consultar o mapa: %s", e)
        return None
    bairro = end.get("suburb") or end.get("neighbourhood") or end.get("quarter") or end.get("city_district")
    _cache_bairro[ponto] = bairro[:80] if bairro else None
    return _cache_bairro[ponto]


async def buscar_cep(cep: str) -> Optional[Dict[str, str]]:
    """Bairro, rua e cidade de um CEP (só os 8 dígitos). None se não existir ou sem rede."""
    if not settings.GEOCODIFICAR:
        return None
    try:
        async with httpx.AsyncClient(timeout=6.0, headers=AGENTE) as client:
            r = await client.get(f"{VIACEP}/{cep}/json/")
        dados = r.json() if r.status_code == 200 else {}
    except Exception as e:
        log.warning("Falha ao consultar o CEP: %s", e)
        return None
    if not dados or dados.get("erro"):
        return None
    return {"bairro": (dados.get("bairro") or "").strip()[:80], "logradouro": (dados.get("logradouro") or "").strip(),
            "localidade": (dados.get("localidade") or "").strip()}
