"""Anonimização de relatos antes de gravar (LGPD). Remove o que dá para detectar com segurança
por padrão: CPF, telefone e e-mail. Nomes próprios não são detectados — por isso o bot pede
para a pessoa não escrever nome nem documento no relato."""
import hashlib
import re

from app.core.config import settings

_CPF = re.compile(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b")
_TELEFONE = re.compile(r"(?:\+?55\s?)?\(?\b\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b")
_EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.]+\b")


def anonimizar_texto(texto: str) -> str:
    texto = _EMAIL.sub("[email]", texto)
    texto = _CPF.sub("[cpf]", texto)
    texto = _TELEFONE.sub("[telefone]", texto)
    return texto


def hash_telefone(telefone: str) -> str:
    """Identifica a conversa sem guardar o número. Usa a SECRET_KEY como sal."""
    digitos = "".join(c for c in telefone if c.isdigit())
    return hashlib.sha256((settings.SECRET_KEY + digitos).encode()).hexdigest()
