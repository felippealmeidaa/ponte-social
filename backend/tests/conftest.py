import sys
import os
import tempfile

# Adiciona o diretório 'backend' ao PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Banco isolado para os testes (definido antes de qualquer import do app)
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///" + os.path.join(tempfile.mkdtemp(), "teste.db")
# Testes nunca chamam o Gemini de verdade, mesmo com chave no .env (a IA é simulada onde precisa)
os.environ["GEMINI_API_KEY"] = ""


def autenticar(client):
    """Faz login com o usuário de teste pré-cadastrado e deixa o token no cliente."""
    r = client.post("/api/v1/auth/login", json={"username_or_email": "teste", "password": "123"})
    assert r.status_code == 200, r.text
    client.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return client
