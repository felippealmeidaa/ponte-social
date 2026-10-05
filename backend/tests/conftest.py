import sys
import os
import tempfile

# Adiciona o diretório 'backend' ao PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Banco isolado para os testes (definido antes de qualquer import do app)
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///" + os.path.join(tempfile.mkdtemp(), "teste.db")
