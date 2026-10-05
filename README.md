# Plataforma Omnichannel de Encaminhamento Social & CRM WhatsApp com IA Híbrida

Sistema Inteligente de Triagem e Encaminhamento Social desenvolvido para o **Projeto Integrador do 3º Período de Inteligência Artificial da UniEVANGÉLICA (2026/2)**, estruturado como um produto SaaS de atendimento omnichannel para WhatsApp (Meta Cloud API & Evolution API v2).

---

## 🏛 Arquitetura do Sistema

Detalhes do que está implementado e do que ficou para a fase 2: [`ARQUITETURA_E_ESPECIFICACAO_PROJETO.md`](ARQUITETURA_E_ESPECIFICACAO_PROJETO.md).

- **Backend**: Python 3.12, FastAPI (assíncrono), Pydantic v2, SQLAlchemy, WebSockets.
- **Inteligência Artificial**: scikit-learn (Regressão Logística, Naive Bayes, SVM linear) com TF-IDF; validação cruzada agrupada (StratifiedGroupKFold, $k=5$), bootstrap e McNemar.
- **Segurança & LGPD**: senhas com **Argon2id**, telefone criptografado com **Fernet** (AES-128-CBC + HMAC), JWT com refresh token em cookie HttpOnly (`SameSite=Lax`; `Secure` a ativar quando houver HTTPS), relato anonimizado e prazo de retenção.
- **WhatsApp**: adaptador de canal para **Evolution API v2** (autohospedada em Docker) e para a **WhatsApp Cloud API** da Meta.
- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS, Lucide Icons.
- **Banco de Dados**: PostgreSQL 16 no Docker (imagem com `pgvector`, ainda não usado) ou SQLite local; Redis 7 só para a Evolution API.

---

## 🚀 Como Executar o Projeto

### 1. Ambiente Python (uma vez)
```bash
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements.txt   # Linux/Mac: backend/.venv/bin/python
cd frontend && npm install && cd ..
```
Opcional: copie `.env.example` para `backend/.env`. **Sem `.env` o projeto roda com um SQLite local** (`backend/triagens_dev.db`); com ele, usa o Postgres do Docker.

O `.env` está no `.gitignore` e **nunca** deve ir para o git. Nenhum segredo tem valor padrão no código: gere com `python -c "import secrets; print(secrets.token_urlsafe(32))"`. Em `ENVIRONMENT=development`, sem `SECRET_KEY`/`ENCRYPTION_SECRET_KEY`, o backend usa chaves temporárias (os logins deixam de valer ao reiniciar); em qualquer outro ambiente elas são obrigatórias.

### 2. (Opcional) Serviços Docker — Postgres, Redis e Evolution API
Exige `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `EVOLUTION_API_KEY` e `EVOLUTION_WEBHOOK_TOKEN` preenchidos no `backend/.env` (o token vai na URL do webhook e o backend recusa chamadas sem ele fora de `development`). As portas ficam acessíveis só em `127.0.0.1`.
```bash
docker compose --env-file backend/.env -f docker/docker-compose.yml up -d
```

### 3. Treinar e avaliar o modelo
```bash
$env:PYTHONPATH="backend"   # Linux/Mac: export PYTHONPATH=backend
backend/.venv/Scripts/python backend/app/services/ml/train_evaluator.py
```
Gera `model_social_classifier.joblib` e `mlops_evaluation_report.json` (lido pela aba **MLOps** do painel).

### 4. Testes
```bash
backend/.venv/Scripts/python -m pytest backend/tests -q
```

### 5. Backend + frontend juntos
```bash
backend/.venv/Scripts/python run_dev.py
```
- **Painel (React + Vite)**: http://localhost:5173 — usuário de teste definido em `backend/app/api/v1/endpoints/auth.py`
- **API (Swagger)**: http://localhost:8000/docs
- **Sem WhatsApp conectado**: a aba *Canais WhatsApp* tem um simulador que conversa com o bot pelo mesmo fluxo e banco (`POST /api/v1/webhooks/simular`).

---

## 🔁 Caminho principal (Fase 1)

`WhatsApp → Evolution API → /webhooks/evolution → fluxo da conversa → classificador → banco → fila do painel`

Fluxo da conversa (`backend/app/services/bot/fluxo_conversa.py`), conforme a seção 4 do plano:
consentimento → relato → "Entendi que você precisa de X. Está certo?" → caminho completo (serviços, documentos, onde ir) → "Quer que o CRAS entre em contato?" → fila.
Sinal de violência em qualquer etapa interrompe tudo e mostra 190 / 180 / 100 / CREAS. Nada identificado → Disque Social 121, sem inventar resposta.

LGPD: relato gravado sem CPF/telefone/e-mail, telefone mascarado + criptografado, conversa identificada por hash, prazo de retenção (`RETENCAO_DIAS`).

### Protótipos da Fase 2 (desligados)
Flow Builder (`/flows`), AI Gateway (`/models`), API Keys (`/api-keys`), Base RAG (`/knowledge`) e Workspaces (`/apps`) são protótipos da visão de produto: guardam dados só em memória e não fazem parte do escopo do semestre. Ficam fora da API por padrão; para demonstrar, defina `HABILITAR_FASE2=true` no `backend/.env` — mesmo assim exigem login.

---

## 📊 Avaliação do Modelo (honesta)

**Metodologia** (`backend/app/services/ml/train_evaluator.py`):
- Treino: 84 relatos **únicos** (o arquivo tinha 240 linhas, mas eram 80 frases-modelo repetidas — a versão anterior relatava F1 = 1,0 porque as cópias caíam no treino e no teste ao mesmo tempo).
- Validação cruzada **StratifiedGroupKFold (k=5)** agrupando variações da mesma frase; hiperparâmetros por GridSearch; modelo escolhido pela validação cruzada.
- Teste: 80 relatos informais (`data/relatos_teste_informais.json`), escritos à parte em linguagem de WhatsApp e nunca usados para treinar ou escolher modelo.
- IC 95% por bootstrap e teste de McNemar entre os dois melhores.

| Abordagem | F1 macro (CV) | F1 macro (teste) | IC 95% (teste) | Recall violência (teste) |
| :--- | :--- | :--- | :--- | :--- |
| Linha de base 1: classe majoritária | 0,036 | 0,028 | — | 0% |
| Linha de base 2: palavras-chave | 0,873* | 0,613 | — | 0% |
| Regressão Logística (TF-IDF) | 0,570 ± 0,120 | 0,717 | 0,614–0,801 | 60% |
| Naive Bayes Multinomial | 0,473 ± 0,129 | 0,697 | 0,585–0,783 | 30% |
| Linear SVM (escolhido pela CV) | 0,581 ± 0,125 | 0,692 | 0,582–0,774 | 60% |
| **Sistema em produção** (regra de violência + SVM + palavras-chave) | — | **0,678** | 0,552–0,763 | **70%** |

\* As palavras-chave foram escritas olhando as próprias frases de treino, por isso vão tão bem no CV e caem no teste.

**Leitura para a banca:** os modelos superam com folga a classe majoritária e superam as palavras-chave no teste, mas a diferença entre eles não é significativa (McNemar p = 0,63) e **a revocação de violência (70%) ainda não atinge um piso aceitável**. A causa principal é a falta de relatos reais: com 84 exemplos simulados o modelo não aprende a variedade da fala. Próximo passo: relatos anonimizados do CRAS parceiro + definir o piso de revocação com um profissional. Os números acima se referem a dados simulados e devem ser refeitos com dados reais.

> O notebook `notebooks/analise_e_avaliacao_modelos.ipynb` reproduz esta avaliação passo a passo (com a demonstração do vazamento, matriz de confusão, análise de erros e palavras de maior peso). Para executá-lo: `pip install jupyter` no mesmo ambiente e abra a partir da pasta `notebooks/`.

---

## 🎯 Vínculo com os Objetivos de Desenvolvimento Sustentável (ODS)
- **ODS 16 (Meta 16.6)**: Desenvolver instituições eficazes, responsáveis e transparentes em todos os níveis por meio da organização e agilidade na triagem pública.
- **ODS 10 (Meta 10.2)**: Redução das desigualdades facilitando o acesso desburocratizado a benefícios sociais e proteção de emergência.
