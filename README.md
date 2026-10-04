# Plataforma Omnichannel de Encaminhamento Social & CRM WhatsApp com IA Híbrida

Sistema Inteligente de Triagem e Encaminhamento Social desenvolvido para o **Projeto Integrador do 3º Período de Inteligência Artificial da UniEVANGÉLICA (2026/2)**, estruturado como um produto SaaS de atendimento omnichannel para WhatsApp (Meta Cloud API & Evolution API v2).

---

## 🏛 Arquitetura do Sistema

- **Backend**: Python 3.12, FastAPI (Assíncrono), Pydantic v2, Uvicorn, WebSockets.
- **Inteligência Artificial**: Scikit-Learn (Linear SVM, Regressão Logística, Naive Bayes), TF-IDF, PyTorch, Validação Cruzada Estratificada ($k=5$).
- **Segurança & LGPD**: Hash de senhas com **Argon2id** (PHC winner), Criptografia de segredos com **AES-256-GCM** (Fernet), **JWT com Refresh Token em Cookie HttpOnly** (`Secure`, `SameSite=Lax`), Mascaramento automático de CPF e Telefone.
- **WhatsApp Híbrido**: Adaptador modular para **Evolution API v2** (autohospedado em Docker) e **WhatsApp Cloud API Oficial da Meta** (Graph v20+).
- **Frontend SPA**: React 18, Vite, TypeScript, Tailwind CSS, **@xyflow/react** (Visual Flow Builder estilo n8n), Lucide Icons.
- **Banco de Dados & Filas**: PostgreSQL 16 com extensão `pgvector` e Redis 7.

---

## 🚀 Como Executar o Projeto

### 1. Iniciar os Serviços Docker (Banco PostgreSQL + pgvector, Redis e Evolution API)
```bash
docker compose -f docker/docker-compose.yml up -d
```

### 2. Treinar os Modelos de Machine Learning & Gerar Métricas Científicas
```bash
python backend/app/services/ml/generate_dataset.py
python backend/app/services/ml/train_evaluator.py
```

### 3. Rodar os Testes Unitários de Segurança e IA (Pytest)
```bash
$env:PYTHONPATH="backend"
python -m pytest backend/tests/ -v
```

### 4. Iniciar o Backend e o Frontend Simultaneamente
```bash
python run_dev.py
```
- **Painel Web (React + Vite)**: [http://localhost:5173](http://localhost:5173)
- **Documentação Interativa da API (Swagger)**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 📊 Métricas Científicas de Avaliação (Marco 2)

| Modelo / Linha de Base | F1-Macro ($k=5$) | Acurácia | Recall Violência | Decisão |
| :--- | :--- | :--- | :--- | :--- |
| **Linha de Base 1: Classe Majoritária** | `0.0500` | 24.0% | 0.0% | Superada |
| **Linha de Base 2: Regras Palavra-Chave** | `0.6840` | 71.2% | 80.0% | Superada |
| **Multinomial Naive Bayes** | `0.9867` | 98.7% | 100.0% | Candidato |
| **Regressão Logística (TF-IDF)** | `0.9867` | 98.7% | 100.0% | Candidato |
| **Linear SVM (TF-IDF)** | **`1.0000`** | **100.0%** | **100.0%** | **Modelo Campeão (Em Produção)** |

---

## 🎯 Vínculo com os Objetivos de Desenvolvimento Sustentável (ODS)
- **ODS 16 (Meta 16.6)**: Desenvolver instituições eficazes, responsáveis e transparentes em todos os níveis por meio da organização e agilidade na triagem pública.
- **ODS 10 (Meta 10.2)**: Redução das desigualdades facilitando o acesso desburocratizado a benefícios sociais e proteção de emergência.
