# Ponte Social

Sistema Inteligente de Encaminhamento Social, desenvolvido no **Projeto Integrador do 3º Período de Inteligência Artificial da UniEVANGÉLICA (2026/2)**. A pessoa conta a situação pelo WhatsApp; o sistema indica serviços, documentos e onde ir, e a equipe da assistência social recebe o caso organizado num painel web. O sistema orienta; quem decide é sempre o profissional.

- **Roteiro da apresentação:** [`docs/roteiro_apresentacao.md`](docs/roteiro_apresentacao.md)
- **Arquitetura:** [`ARQUITETURA_E_ESPECIFICACAO_PROJETO.md`](ARQUITETURA_E_ESPECIFICACAO_PROJETO.md) · **Visual do painel:** [`DESIGN.md`](DESIGN.md)
- **Rotular relatos:** [`docs/guia_rotulagem.md`](docs/guia_rotulagem.md) · **Consentimento:** [`docs/termo_coleta_e_consentimento.md`](docs/termo_coleta_e_consentimento.md)

---

## ▶️ Ligar tudo (dia a dia, Windows)

Dê dois cliques em **`iniciar.bat`**, na raiz do projeto. Ele:

1. abre o Docker Desktop, se estiver fechado, e sobe Postgres, Redis e Evolution API (WhatsApp);
2. abre um túnel público (cloudflared) e grava o endereço em `PUBLICO_URL` no `backend/.env` (é o que faz o link da agenda do iPhone funcionar);
3. reinicia backend e painel numa janela própria e abre o painel no navegador.

Para desligar: **`parar.bat`** (os dados ficam guardados).

| O quê | Endereço |
| :--- | :--- |
| Painel | http://localhost:5173 (em desenvolvimento, conta `teste` / `123`) |
| API (Swagger) | http://localhost:8000/docs |
| Evolution API | http://localhost:8080 |

> O recarregamento automático do backend não funciona em todas as máquinas: depois de mudar código Python ou o `.env`, rode o `iniciar.bat` de novo.
> O endereço do túnel muda a cada `iniciar.bat`; links de agenda já enviados com o endereço antigo param de abrir.

---

## 🧰 Primeira vez numa máquina nova

### 1. Dependências
```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r backend/requirements.txt   # Linux/Mac: .venv/bin/python
cd frontend && npm install && cd ..
```
Para o WhatsApp e o túnel: **Docker Desktop** (com WSL 2 no Windows: `wsl --install` como administrador e reiniciar) e **cloudflared** (`winget install Cloudflare.cloudflared`).

### 2. `backend/.env`
Copie `.env.example` para `backend/.env` e preencha. Ele está no `.gitignore` e **nunca** vai para o git. Gere cada segredo com `python -c "import secrets; print(secrets.token_urlsafe(32))"`.

| Variável | Para quê |
| :--- | :--- |
| `SECRET_KEY`, `ENCRYPTION_SECRET_KEY` | login e criptografia (telefone, fotos de documentos). Sem elas, em desenvolvimento, valem chaves temporárias que mudam a cada reinício |
| `GEMINI_API_KEY` | IA que entende o relato, áudio, base de conhecimento. Sem ela, o modelo local classifica e a busca é só por palavras |
| `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_TOKEN` | contêineres do WhatsApp (Docker) |
| `PUBLICO_URL` | preenchido sozinho pelo `iniciar.bat` |

Sem `DATABASE_URL`, o backend usa um SQLite local (`backend/triagens_dev.db`); o Postgres do Docker é só da Evolution.

### 3. Carregar os dados (o banco não vai para o git)
```bash
.venv/Scripts/python scripts/carregar_base_conhecimento.py   # 20 documentos oficiais na Base de conhecimento
.venv/Scripts/python scripts/preencher_funcionamento.py      # horários de funcionamento ("aberto agora")
```
A carga da base gera os vetores no ritmo do Gemini gratuito (50 trechos por minuto). Se o limite do dia acabar, rode de novo no dia seguinte: continua de onde parou.

### 4. Conectar o WhatsApp
Painel › **Bot do WhatsApp › Conexão do WhatsApp** › *Gerar QR Code* e escaneie com o celular do chip do bot (WhatsApp › Aparelhos conectados). Use um chip dedicado, não um número pessoal. Sem WhatsApp, **Bot do WhatsApp › Testar o bot** conversa com o bot pelo mesmo fluxo e banco.

---

## 🧭 O que tem no painel

O menu ☰ tem seis tópicos:

| Tópico | Telas | Para quê |
| :--- | :--- | :--- |
| **Atendimento** | Fila de casos, Conversas | casos por prioridade (violência primeiro), ficha do caso, agendar atendimento, fotos de documentos, conversar com a pessoa |
| **Indicadores** | Painel de indicadores, Temas dos relatos, Relatório do mês | números do período, mapa por bairro, relatos parecidos agrupados sozinhos, relatório mensal (PDF/Excel) |
| **Bot do WhatsApp** | Fluxo da conversa, Respostas por necessidade, Testar o bot, Conexão | o que a pessoa recebe, editável com travas; simulador; QR Code |
| **Classificação** | Modelo de IA, Dados de treino | comparação IA × modelo local, correções da equipe, retreino; importar relatos (planilha) |
| **Laboratório de IA** | Base de conhecimento, Agentes de IA, Fluxos | documentos oficiais e busca; agentes e fluxos que **só rodam no painel**, nunca no WhatsApp |
| **Gestão** | Unidades, Equipe e acesso, Alertas, Demonstração | lugares da rede com horário e feriados; contas; avisos e mensagens automáticas; modo demonstração |

Na barra do topo: etiqueta vermelha para **violência sem atendimento**, âmbar para **fila parada** e laranja quando o **modo demonstração** está ligado.

---

## 💬 O que o bot faz no WhatsApp

`WhatsApp → Evolution API → /webhooks/evolution → fluxo da conversa → IA / modelo local → banco → fila do painel`

1. Pede o aceite (LGPD) e onde a pessoa está: localização, CEP ou bairro, para indicar o CRAS dela.
2. A pessoa conta a situação com as próprias palavras (texto ou áudio, em português ou espanhol).
3. "Entendi que você precisa de X. Está certo?" → serviços, documentos e **onde ir**: primeiro onde pedir o benefício, depois ajuda imediata (restaurante popular, Centro POP), com endereço, mapa e **"aberto agora / fechado, abre amanhã às 8h"** (considera feriados).
4. "Quer que o CRAS entre em contato?" → o caso entra na fila. Quem não quer contato recebe, dias depois, "conseguiu ir ao CRAS?".
5. A qualquer momento: **"meu pedido"** (situação do caso), **"quando cai meu bolsa família?"** (data oficial pelo final do NIS), **"não entendi"** (explicação mais simples ou áudio), **"apagar meus dados"**, **"recomeçar"**.

**Violência é travada:** qualquer sinal interrompe tudo e mostra 190 / 180 / 100 / CREAS; o caso vira urgente na fila; nenhuma mensagem automática vai para essa pessoa depois (o celular pode estar com quem agride). Nada identificado → Disque Social 121, sem inventar resposta.

**LGPD:** relato gravado sem CPF/telefone/e-mail, telefone criptografado, conversa identificada por hash, prazo de retenção (`RETENCAO_DIAS`), fotos de documentos cifradas e apagadas 30 dias depois do caso fechado.

---

## 📚 Dados

| Onde | O quê | Fonte |
| :--- | :--- | :--- |
| `data/base_conhecimento/` | 20 documentos: leis (Bolsa Família, CadÚnico, LOAS, BPC, Tarifa Social, Auxílio Gás, Maria da Penha, Estatuto da Pessoa Idosa, ECA, autismo/CIPTEA, gratuidade de certidão), Tipificação do SUAS, perguntas frequentes do MDS, calendário do Bolsa Família, Ligue 180, Disque 100, CVV | Planalto (texto compilado, **sem os trechos revogados**), MDS, gov.br; lista em `fontes.json` |
| `data/unidades_anapolis_cadsuas.json` | CRAS, CREAS, Centro POP e Posto do CadÚnico de Anápolis, com horário quando informado | CadSUAS (consulta pública) |
| `data/calendario_bolsa_familia_2026.json` | dia de pagamento por final do NIS | página de pagamentos do MDS |
| `data/estatisticas_anapolis_mds.json` | famílias no CadÚnico e no Bolsa Família, BPC, Auxílio Gás | API MI Social do MDS, com o mês de cada número |
| `docs/modelo_relatos_treino.xlsx` | planilha para o grupo escrever relatos de treino (meta: 40 por necessidade) | importar em Classificação › Dados de treino |

Para atualizar:

| Script | Faz |
| :--- | :--- |
| `scripts/baixar_unidades_cadsuas.py` | consulta o CadSUAS de novo (não guarda nomes de servidores) |
| `scripts/converter_lei_planalto.py` / `scripts/converter_pagina_govbr.py` | converte uma lei ou página oficial para a base |
| `scripts/carregar_base_conhecimento.py` | carrega o que estiver em `fontes.json` e completa os vetores |
| `scripts/preencher_funcionamento.py` | preenche horários das unidades que ainda não têm |
| `scripts/gerar_modelo_relatos.py` | refaz a planilha de relatos |

**Relatos de pessoas reais** só entram no treino com o termo de consentimento e a aprovação do Comitê de Ética. O **modo demonstração** (Gestão › Demonstração) cria casos fictícios para apresentar o sistema; desligado, o painel mostra só os casos reais, e exemplo nunca recebe WhatsApp nem entra no treino.

---

## 🧪 Testes
```bash
.venv/Scripts/python -m pytest backend/tests -q
```
Os testes usam um banco temporário e não chamam o Gemini, o mapa nem o WhatsApp de verdade; segredos do `backend/.env` não valem dentro deles.

Treinar e avaliar o modelo local de novo:
```bash
$env:PYTHONPATH="backend"   # Linux/Mac: export PYTHONPATH=backend
.venv/Scripts/python backend/app/services/ml/train_evaluator.py
```

---

## 📊 Avaliação do Modelo (honesta)

Com chave do Gemini, a IA lê o relato primeiro e o modelo local é a reserva; a comparação entre os dois no mesmo teste fixo está em **Classificação › Modelo de IA**. Os números abaixo são do **modelo local**.

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

## 🏛 Tecnologias

- **Backend**: Python 3.12, FastAPI (assíncrono), Pydantic v2, SQLAlchemy.
- **IA**: Gemini (entendimento do relato, áudio, vetores da base, agentes), scikit-learn (TF-IDF + Regressão Logística / Naive Bayes / SVM; K-means nos temas).
- **Segurança & LGPD**: senhas com **Argon2id**, telefone e fotos criptografados com **Fernet**, JWT, webhooks autenticados, relato anonimizado e prazo de retenção.
- **WhatsApp**: **Evolution API v2** (Docker) ou **WhatsApp Cloud API** da Meta.
- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS, Lucide, Leaflet (mapa).
- **Banco**: SQLite local ou PostgreSQL 16; Redis 7 só para a Evolution API.

---

## 🎯 Vínculo com os Objetivos de Desenvolvimento Sustentável (ODS)
- **ODS 16 (Meta 16.6)**: Desenvolver instituições eficazes, responsáveis e transparentes em todos os níveis por meio da organização e agilidade na triagem pública.
- **ODS 10 (Meta 10.2)**: Redução das desigualdades facilitando o acesso desburocratizado a benefícios sociais e proteção de emergência.
