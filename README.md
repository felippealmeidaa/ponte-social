# Ponte Social · Sistema Inteligente de Encaminhamento Social

> **Projeto Integrador do 3º Período de Inteligência Artificial · UniEVANGÉLICA (2026/2)**  
> **Integrantes:** Paula Tomazzelli, Guilherme Henrique Carvalhal, Felippe Almeida e João Victor Domingues  
> **Orientação:** Faculdade de Inteligência Artificial e Engenharia de Software  
> **Status:** Protótipo funcional (MVP) 100% operacional, testado com dados simulados e rede oficial do CadSUAS de Anápolis-GO.  
> **Testes:** 163 testes automatizados em 29 arquivos (100% aprovados).

---

## 📑 Documentação Oficial e Links Rápidos

Toda a documentação técnica, estratégica e visual do projeto está organizada nas pastas [`documentacao/`](documentacao/) e [`docs/`](docs/):

| Documento | Localização | Descrição |
| :--- | :--- | :--- |
| ⭐ **Documento Mestre Unificado (Oficial)** | [`documentacao/Ponte_Social_Documento_Mestre.pdf`](documentacao/Ponte_Social_Documento_Mestre.pdf) · [Versão .MD](documentacao/Ponte_Social_Documento_Mestre.md) | **Relatório completo unificado (PDF oficial de 39 páginas):** Visão de produto, ODS, Análise SWOT, 3 Personas, Requisitos (RF/RNF), Histórias de Usuário BDD, Metodologia Ágil, Product & Sprint Backlogs detalhados (Sprints 1 a 6), Arquitetura em camadas, Pipeline NLP/MLOps, Conformidade LGPD, Modelo de Negócio B2G e Roadmap detalhado. |

---

## 🎯 O que é o Ponte Social?

O **Ponte Social** resolve a barreira de descoberta na assistência social pública: quem está em vulnerabilidade frequentemente não conhece a burocracia ou o nome dos programas sociais, enquanto o CRAS recebe filas desordenadas sem triagem prévia.

O cidadão relata sua situação livremente por texto ou áudio no WhatsApp (em português ou espanhol); o sistema compreende a necessidade, orienta sobre benefícios e documentos, informa a unidade de referência com o status **"Aberto agora / Fechado"** (com cálculo de feriados) e encaminha o caso priorizado para um painel web do CRAS.

> ⚖️ **Princípio Fundamental:** O sistema **orienta e organiza**; quem **decide** a concessão do benefício e atende a pessoa é sempre o assistente social.

---

## 🚀 Como Executar no Dia a Dia (Windows)

Dê dois cliques no arquivo **`iniciar.bat`** na raiz do projeto. O script automatizado executa todas as etapas:

1. **Docker Desktop:** Inicia e sobe os contêineres de **PostgreSQL 16**, **Redis 7** e **Evolution API v2** (WhatsApp);
2. **Túnel Seguro (Cloudflare):** Abre o túnel `cloudflared` para gerar URL pública segura (necessário para que links de agendamento `.ics` sejam adicionados nativamente à agenda do celular);
3. **Serviços Locais:** Inicia o backend FastAPI na porta `8000`, o frontend React Vite na porta `5173` e abre o painel no seu navegador padrão.

```
Painel Web:      http://localhost:5173  (Login de demonstração: teste / 123)
API & Swagger:   http://localhost:8000/docs
Evolution API:   http://localhost:8080
WebSocket Chat:  ws://localhost:8000/ws/chat/{tenant_id}
```

Para encerrar todos os serviços de forma limpa: dê dois cliques em **`parar.bat`** (os dados persistidos no banco continuam salvos).

---

## 🧰 Configuração Inicial (Primeira Instalação)

### 1. Pré-requisitos
- **Python 3.12+** instalado.
- **Node.js 18+** e npm instalados.
- **Docker Desktop** (com suporte a WSL 2 no Windows).
- **Cloudflared** (opcional, para túnel público): `winget install Cloudflare.cloudflared`.

### 2. Ambiente Virtual e Dependências
Na raiz do projeto:
```bash
# Criação do ambiente virtual (na raiz ou em backend/.venv)
python -m venv .venv

# Ativação do ambiente virtual no Windows
.venv\Scripts\activate

# Instalação das dependências do backend
pip install -r backend/requirements.txt

# Instalação das dependências do frontend
cd frontend
npm install
cd ..
```

### 3. Configuração de Variáveis de Ambiente (`backend/.env`)
Copie o modelo de configuração e edite seus segredos:
```bash
cp .env.example backend/.env
```
Gere suas chaves secretas via terminal com:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

| Variável | Finalidade |
| :--- | :--- |
| `SECRET_KEY`, `ENCRYPTION_SECRET_KEY` | Chave de assinatura dos tokens JWT e chave Fernet para criptografia reversível de telefones e documentos. |
| `GEMINI_API_KEY` | Chave da Google Gemini API para compreensão avançada do relato, transcrição de áudio e busca semântica vetorial (RAG). Se ausente, o sistema entra em modo fallback com o modelo supervisionado local. |
| `POSTGRES_PASSWORD`, `REDIS_PASSWORD` | Senhas dos contêineres do banco e cache utilizados pela Evolution API. |
| `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_TOKEN` | Chaves de autenticação da instância e dos webhooks da Evolution API. |
| `DATABASE_URL` | String de conexão com o banco. Se omitida, a aplicação utiliza SQLite local (`backend/triagens_dev.db`), ideal para desenvolvimento e testes. |

### 4. Carga da Base de Conhecimento e Unidades
Com o ambiente virtual ativo, execute os scripts de inicialização de dados:
```bash
python scripts/carregar_base_conhecimento.py   # Popula 20 documentos oficiais e calcula embeddings vetoriais
python scripts/preencher_funcionamento.py      # Configura os horários de funcionamento e regras de feriados
```

### 5. Conectar o WhatsApp
1. Acesse o painel web em `http://localhost:5173`;
2. Navegue em **Bot do WhatsApp › Conexão do WhatsApp** e clique em **Gerar QR Code**;
3. No WhatsApp do celular com o chip dedicado, vá em *Aparelhos conectados › Conectar um aparelho* e escaneie o código.
> 💡 *Dica:* Caso não queira conectar um celular físico, a tela **Bot do WhatsApp › Testar o bot** permite simular conversas completas consumindo o mesmo banco de dados e o mesmo pipeline de NLP do WhatsApp real.

---

## 🧭 Módulos do Painel do CRAS

O painel foi desenhado especificamente para o ritmo de trabalho das equipes de assistência social, estruturado em 6 áreas temáticas:

```
├── 1. Atendimento
│   ├── Fila de Casos (Triagens ordenadas por prioridade; urgência/violência no topo)
│   └── Conversas (Live Chat em tempo real via WebSocket; assumir e devolver o atendimento)
├── 2. Indicadores
│   ├── Painel de Indicadores (Gráficos por necessidade, bairro, tempos médios e satisfação)
│   ├── Temas dos Relatos (Clusterização não-supervisionada K-means de relatos parecidos)
│   └── Relatório do Mês (Exportação oficial do demonstrativo mensal em PDF e Excel .xlsx)
├── 3. Bot do WhatsApp
│   ├── Fluxo da Conversa (Visualização interativa das etapas e nós do diálogo)
│   ├── Respostas por Necessidade (Editor No-Code das orientações devolvidas pelo bot)
│   ├── Testar o Bot (Simulador interativo idêntico ao aplicativo)
│   └── Conexão do WhatsApp (Gerenciamento de instâncias e pareamento QR Code)
├── 4. Classificação & MLOps
│   ├── Modelo de IA (Comparativo de desempenho: Gemini vs. Modelo Local Supervisionado)
│   └── Dados de Treino (Gestão do dataset de treino, importação de planilhas e feedback humano)
├── 5. Laboratório de IA (Isolado no painel; não atinge o WhatsApp diretamente)
│   ├── Base de Conhecimento (20 normas oficiais com busca híbrida: vetorial e textual)
│   ├── Agentes de IA (Sandbox de agentes autônomos multi-tarefa)
│   ├── Fluxos (Flow Engine visual para simulação de árvores de decisão)
│   └── Copiloto IA (Assistente inteligente para apoio na criação de fluxos e respostas)
└── 6. Gestão
    ├── Unidades de Atendimento (Gestão dos 4 CRAS, 2 CREAS, Centro POP e CadÚnico de Anápolis)
    ├── Equipe e Acesso (Controle de usuários, papéis técnicos e restrições por unidade)
    ├── Alertas (Configuração de alertas de fila parada, limites de tempo e avisos)
    └── Demonstração (Injeção de casos sintéticos controlados para apresentações)
```

---

## 💬 Fluxo da Conversa no WhatsApp & Trava de Segurança

O fluxo conversacional segue uma esteira rigorosa de proteção, acolhimento e inteligência:

```
[Mensagem WhatsApp]
       │
       ▼
[Evolution API / Meta Cloud API]
       │
       ▼
[/webhooks/evolution]
       │
       ▼
[Triagem de Emergência] ─────────► [Detectou Violência?]
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       ▼ SIM                                       ▼ NÃO
             [🚨 TRAVA DE VIOLÊNCIA]                      [Aceite LGPD & Localização]
             • Mensagem imediata com 190, 180, 100, CREAS • Bairro mapeia para CRAS de ref.
             • Prioridade URGENTE no painel               • Relato livre (Texto ou Áudio)
             • SUPRESSÃO TOTAL de mensagens automáticas                    │
                                                                           ▼
                                                              [Extração de Necessidade]
                                                              • Gemini 1.5 Flash (Principal)
                                                              • SVM/Regressão Logística (Fallback)
                                                                           │
                                                                           ▼
                                                              [Confirmação com Cidadão]
                                                              "Entendi que precisa de X. Certo?"
                                                                           │
                                                                           ▼
                                                              [Caminho Completo]
                                                              • Serviço correto + Documentos
                                                              • Onde ir (Endereço e Mapa)
                                                              • Status "Aberto agora / Fechado"
                                                              • Pedido de contato do CRAS
```

### Comandos Disponíveis em Qualquer Etapa:
- **`meu pedido`**: Consulta o status atual da triagem na fila do CRAS.
- **`quando cai meu bolsa família?`**: Consulta o dia exato do pagamento de acordo com o final do NIS (base oficial MDS 2026).
- **`não entendi`**: Fornece explicação simplificada ou resumo por áudio.
- **`apagar meus dados`**: Exclusão e expurgo imediato de conversas e registros do banco (em conformidade com a LGPD).
- **`recomeçar`**: Reinicia a conversa do zero.

---

## 📊 Avaliação Científica do Modelo Local (MLOps)

O sistema possui redundância crítica: a IA externa (Google Gemini) é a primeira linha para compreensão do relato informal e transcrição de áudios. Caso a API externa sofra indisponibilidade ou esgote cotas, o pipeline de Machine Learning local assume automaticamente.

### Metodologia de Avaliação Rigorosa (`backend/app/services/ml/train_evaluator.py`):
- **Base de Treino:** 84 relatos únicos divididos em 8 classes de necessidade social.
- **Validação Cruzada:** `StratifiedGroupKFold (k=5)` agrupando variações semânticas da mesma frase para **eliminar vazamento de dados** (data leakage).
- **Base de Teste Independente:** 80 relatos informais inéditos escritos simulando a linguagem real de WhatsApp (`data/relatos_teste_informais.json`).
- **Análise Estatística:** Intervalo de confiança de 95% via Bootstrap e teste de significância de McNemar.

| Abordagem | F1 Macro (CV) | F1 Macro (Teste) | IC 95% (Teste) | Recall Violência (Teste) |
| :--- | :---: | :---: | :---: | :---: |
| Linha de Base 1: Classe Majoritária | 0,036 | 0,028 | — | 0% |
| Linha de Base 2: Palavras-chave | 0,873* | 0,613 | — | 0% |
| Regressão Logística (TF-IDF) | 0,570 ± 0,120 | 0,717 | 0,614 – 0,801 | 60% |
| Naive Bayes Multinomial | 0,473 ± 0,129 | 0,697 | 0,585 – 0,783 | 30% |
| Linear SVM (Melhor na Validação Cruzada) | 0,581 ± 0,125 | 0,692 | 0,582 – 0,774 | 60% |
| **Sistema Completo (Regra Violência + SVM + Léxico)** | — | **0,678** | **0,552 – 0,763** | **70%** |

*\* As palavras-chave obtiveram desempenho inflado no CV por terem sido derivadas das frases do treino, caindo substancialmente no teste cego.*

> 🎓 **Transparência Acadêmica para a Banca:** O recall de violência do modelo local (70%) demonstra por que a IA não pode atuar isolada em situações de risco à vida. Por essa razão, implementamos a **trava determinística de violência**, que atua antes do modelo de IA e direciona a vítima imediatamente às redes de socorro.

---

## 🧪 Suíte de Testes Automatizados

O repositório possui uma bateria completa de testes de integração e unidade:
```bash
# Executar todos os testes
pytest backend/tests -q
```
**Resultado atual:** **163 testes passando em 29 arquivos**, cobrindo:
- Pipeline ponta a ponta do WhatsApp;
- Criptografia e anonimização LGPD;
- Validação de feriados e cálculo de funcionamento ("aberto agora");
- Regras de violência e supressão de mensagens;
- WebSocket e Live Chat de atendimento humano;
- MLOps, aprendizado contínuo e métricas estatísticas;
- Relatório mensal em PDF e Excel.

---

## 📂 Estrutura do Repositório

```
projeto/
├── documentacao/                     # Documentação mestre oficial do sistema
│   ├── Ponte_Social_Documento_Mestre.docx # Relatório técnico oficial formatado nas normas ABNT
│   ├── Ponte_Social_Documento_Mestre.pdf  # Versão compilada em PDF (39 páginas)
│   ├── Ponte_Social_Documento_Mestre.md   # Fonte integral da documentação em Markdown
│   └── Ponte_Social_Documento_Mestre.html # Versão HTML diagramada para visualização web
├── docs/                             # Apresentação visual e artefatos de dados
│   ├── apresentacao_arquitetura.html # Apresentação interativa da arquitetura e IA
│   └── modelo_relatos_treino.xlsx    # Planilha modelo para importação de relatos
├── backend/                          # Backend FastAPI assíncrono
│   ├── app/
│   │   ├── api/v1/endpoints/         # 13 módulos de endpoints REST
│   │   ├── core/                     # Configurações, segurança (Argon2id, JWT) e dependências
│   │   ├── services/                 # Regras de negócio, bot, live chat, RAG, MLOps e unidades
│   │   ├── db.py                     # Sessão do SQLAlchemy e inicialização
│   │   ├── models.py                 # Esquema relacional das tabelas do banco
│   │   └── main.py                   # Inicialização do FastAPI, CORS, rotas e WebSockets
│   ├── tests/                        # 29 suítes de testes automatizados (163 testes)
│   └── requirements.txt              # Dependências Python
├── frontend/                         # Painel web React 19 + TypeScript + Vite + Tailwind CSS
│   ├── src/
│   │   ├── paginas/                  # 17 telas do painel do CRAS
│   │   ├── components/               # Componentes reutilizáveis (gráficos, mapas, modais)
│   │   ├── fluxoBot.ts               # Diagrama e definições visuais das etapas do bot
│   │   ├── menu.ts                   # Estrutura de navegação dos 6 módulos
│   │   └── api.ts                    # Cliente HTTP integrado com o backend
│   └── package.json                  # Dependências e scripts do frontend
├── data/                             # Dados públicos e bases de conhecimento oficiais
│   ├── base_conhecimento/            # 20 legislações e cartilhas oficiais compiladas
│   ├── unidades_anapolis_cadsuas.json # Unidades de Anápolis importadas do CadSUAS
│   ├── calendario_bolsa_familia_2026.json # Calendário oficial do Bolsa Família
│   └── estatisticas_anapolis_mds.json # Indicadores sociais do MDS (MI Social)
├── docker/                           # Definições de contêineres (PostgreSQL, Redis, Evolution API)
├── scripts/                          # Scripts utilitários de dados e automação
├── iniciar.bat                       # Script Windows para subir todo o ambiente com 1 clique
└── parar.bat                         # Script Windows para encerrar com segurança
```

---

## 🏛 Tecnologias Empregadas

- **Backend:** Python 3.12, FastAPI (Async), SQLAlchemy 2.0, Pydantic v2, Uvicorn.
- **Inteligência Artificial & NLP:** Google Gemini 1.5 Flash (LLM & Embeddings), Scikit-Learn (TF-IDF, Regressão Logística, Multinomial Naive Bayes, Linear Support Vector Machine), K-Means Clustering.
- **Segurança & Privacidade:** Criptografia simétrica Fernet (telefones e arquivos), Argon2id (hashing de senhas), JWT (JSON Web Tokens), Mascaramento de dados e rotinas de expurgo programado (LGPD).
- **Frontend Web:** React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, Leaflet & Heatmap (mapas de demanda territorial).
- **Canais & Mensageria:** Evolution API v2 (WhatsApp Web/Baileys), WhatsApp Cloud API (Meta Graph API) via adaptador desacoplado, WebSockets em tempo real.
- **Armazenamento & Cache:** SQLite 3 (modo dev/testes) ou PostgreSQL 16 (produção), Redis 7.

---

## 🎯 Vínculo com os Objetivos de Desenvolvimento Sustentável (ODS)

- **ODS 16 (Paz, Justiça e Instituições Eficazes) · Meta 16.6:** *Desenvolver instituições eficazes, responsáveis e transparentes em todos os níveis*, reduzindo filas desorganizadas, automatizando a triagem primária e assegurando atendimento ágil com registro auditável.
- **ODS 10 (Redução das Desigualdades) · Meta 10.2:** *Empoderar e promover a inclusão social, econômica e política de todos*, garantindo que populações vulneráveis consigam descobrir seus direitos sem necessitar de letramento burocrático prévio.
