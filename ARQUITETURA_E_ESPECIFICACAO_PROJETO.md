# Arquitetura e Especificação Técnica
## Sistema Inteligente de Encaminhamento Social

Projeto Integrador · 3º Período de Inteligência Artificial · UniEVANGÉLICA 2026/2
Integrantes: Paula Tomazzelli, Guilherme Henrique Carvalhal, Felippe Almeida, João Victor Domingues
ODS 16 (meta 16.6, principal) e ODS 10 (meta 10.2)

Este documento descreve **o que está implementado hoje** no repositório. As decisões e o cronograma estão no `Plano_Projeto_Encaminhamento_Social.pdf`; quando algo aqui divergir do plano, o motivo está indicado.

---

### 1. Resumo

O cidadão conta sua situação pelo WhatsApp. Um classificador supervisionado identifica a necessidade (8 categorias) e o sistema responde com serviços, documentos, onde procurar e próximos passos. Se a pessoa quiser, a triagem entra na fila de um painel web usado pelo CRAS.

O sistema **orienta e nunca decide** direito a benefício, não concede benefícios e não substitui o profissional (Termo de Escopo, seção 6).

### 2. Caminho principal (Fase 1 — escopo do semestre)

```
Cidadão no WhatsApp
   ↓
Evolution API v2 (Docker)            ← simulador do painel faz o mesmo papel sem celular
   ↓  webhook
FastAPI  /api/v1/webhooks/evolution
   ↓
Fluxo da conversa (services/bot/fluxo_conversa.py)
   ↓
Classificador (scikit-learn)  +  Catálogo de serviços (services/catalogo.py)
   ↓
Banco (SQLAlchemy: Postgres no Docker ou SQLite local)
   ↓
Painel do CRAS (React + Vite)
```

| Componente | Onde está | Situação |
| :--- | :--- | :--- |
| Adaptador de canal (Evolution e Meta) | `services/channels/` | Implementado; Evolution ainda não testada com número real |
| Webhook + simulador | `endpoints/whatsapp_webhooks.py` | Implementado; ignora grupos e mensagens do próprio bot, pede texto quando chega áudio |
| Fluxo da conversa | `services/bot/fluxo_conversa.py` | Implementado conforme a seção 4 do plano |
| Classificador | `services/ml/classifier_service.py`, `train_evaluator.py`, `text_rules.py` | Implementado; avaliado sem vazamento (seção 4 deste documento) |
| Catálogo de serviços e textos do bot | `services/catalogo.py` | Implementado e editável pelo painel, com fonte oficial e data de conferência por necessidade; **nenhuma fonte preenchida ainda** |
| Banco de triagens e conversas | `models.py`, `db.py`, `services/triagens.py` | Implementado |
| Painel do CRAS | `frontend/src/paginas/` | Fila, Conversas, Indicadores, Serviços e mensagens, Configurações |
| Autenticação do painel | `endpoints/auth.py`, `core/security.py`, `core/deps.py` | JWT; usuários de demonstração fixos no código |

#### Fluxo da conversa

```
NOVA → AGUARDANDO_CONSENTIMENTO → AGUARDANDO_RELATO → AGUARDANDO_CONFIRMACAO
                                                        │ sim          │ não
                                                        ▼              ▼
                              FINALIZADA ← AGUARDANDO_CONTATO ← AGUARDANDO_CORRECAO
```

- **Violência em qualquer etapa** interrompe o fluxo e mostra 190 / Ligue 180 / Disque 100 / CREAS, sem perguntas antes; a triagem entra como urgente.
- Relato muito curto: pede detalhes uma única vez. Nada identificado: pede para contar de outro jeito; na segunda vez, oferece o menu de assuntos com "Nenhum desses" (Disque Social 121 + CRAS), sem inventar resposta.
- Mais de uma necessidade: o caminho da principal vem seguido de um resumo das outras, em ordem de prioridade.
- Comandos em qualquer etapa: **apagar** (com confirmação, exclui histórico, conversa e triagens do número; casos urgentes de violência ainda abertos ficam com a equipe) e **recomeçar**. Quem já consentiu não é perguntado de novo; "obrigado" depois do fim recebe só um agradecimento.
- A triagem só vai para a fila se a pessoa pedir contato do CRAS. A correção feita pela pessoa vira exemplo rotulado (`GET /api/v1/triagem/exemplos-rotulados`).
- Opções numeradas (1/2) em vez de botões: botões interativos não são confiáveis na Evolution/Baileys.

#### Banco de dados

| Tabela | Conteúdo |
| :--- | :--- |
| `triagens` | Categoria, prioridade, status, relato **anonimizado**, telefone mascarado + criptografado |
| `conversas` | Estado do fluxo, canal (evolution/meta/simulador), atendimento humano; identificada por hash do telefone |
| `mensagens` | Histórico de cada conversa |
| `servicos_categoria` | Serviços, documentos, local, **fonte oficial e data de conferência** por categoria (editável no painel) |
| `textos_bot` | Mensagens do bot (editáveis no painel) |

### 3. Segurança e LGPD

- Relato gravado sem CPF, telefone ou e-mail (`services/anonimizacao.py`); telefone mascarado na tela e criptografado (Fernet) no banco.
- Prazo de retenção (`RETENCAO_DIAS`): triagens antigas são apagadas ao iniciar a API.
- Senhas com Argon2id; JWT para o painel. Rotas do painel exigem login; webhooks não.
- Nenhum segredo tem valor padrão no código: tudo vem do `.env` (fora do git). Fora de `development`, a API não inicia sem `SECRET_KEY` e `ENCRYPTION_SECRET_KEY`.
- **Pendente:** validar o consentimento e a base legal com o orientador (`docs/termo_coleta_e_consentimento.md`), regra de preservação dos casos urgentes ao apagar, usuários reais em vez dos de demonstração, HTTPS e limite de requisições na publicação (Ciclo 3).

### 4. Modelo e avaliação

- **Dados de treino:** 84 relatos únicos (80 frases-modelo), simulados. O arquivo tem 240 linhas porque cada frase foi repetida com números diferentes.
- **Validação:** StratifiedGroupKFold (k=5) agrupando as variações de cada frase-modelo + GridSearch de hiperparâmetros. A avaliação antiga (k=5 nas 240 linhas) dava F1 = 1,0 por vazamento; com a mesma técnica agrupada, o mesmo SVM fica em torno de 0,34 no CV.
- **Teste:** 80 relatos informais (`data/relatos_teste_informais.json`), escritos à parte e nunca usados para treinar nem escolher modelo.
- **Decisão no sistema:** regra de violência → modelo (se confiante) → palavras-chave → "não identificado".

| Abordagem | F1 macro (teste) | IC 95% | Recall violência |
| :--- | :--- | :--- | :--- |
| Classe majoritária | 0,028 | — | 0% |
| Palavras-chave | 0,613 | — | 0% |
| Regressão Logística | 0,717 | 0,614–0,801 | 60% |
| Naive Bayes | 0,697 | 0,585–0,783 | 30% |
| Linear SVM (escolhido pela validação cruzada) | 0,692 | 0,582–0,774 | 60% |
| **Sistema completo** | **0,678** | 0,552–0,763 | **70%** |

Diferença entre os modelos não significativa (McNemar p = 0,63). **O recall de violência ainda não atinge um piso aceitável**; o piso será definido com um profissional e os números refeitos com relatos reais. Reprodução passo a passo: `notebooks/analise_e_avaliacao_modelos.ipynb`.

### 5. Protótipos da Fase 2 (desligados por padrão)

Ficaram do protótipo inicial e representam a visão de produto (Fase 2 do plano). Guardam dados só em memória e não fazem parte da avaliação do semestre. Só sobem com `HABILITAR_FASE2=true`, e exigem login.

| Protótipo | Rota | Observação |
| :--- | :--- | :--- |
| Flow Builder | `/flows` | Executa grafos de nós; sem tela no painel atual |
| AI Gateway | `/models` | Roteador entre o classificador e o Gemini (LLM) |
| API Keys | `/api-keys` | Chaves para consumo externo; guarda só hash |
| Base RAG | `/knowledge` | Busca TF-IDF sobre unidades CRAS/CREAS; **endereços a conferir** |
| Workspaces | `/apps` | Vários nichos no mesmo servidor |

Também existem, sem uso no caminho principal: `services/llm/gemini_service.py` (o plano permite LLM só para reescrever respostas, nunca para decidir), `services/audio/whisper_service.py` (o plano deixa transcrição de áudio como evolução) e `services/ml/clustering_service.py`.

### 6. Pendências técnicas

1. Relatos reais do CRAS parceiro seguindo `docs/guia_rotulagem.md` e `docs/termo_coleta_e_consentimento.md`; refazer a avaliação com um teste real.
2. Definir com um profissional o piso de recall de violência.
3. Preencher, no painel, a fonte oficial e a data de conferência de cada necessidade (o painel marca as que estão "a conferir" ou com mais de 6 meses); obter a lista oficial de CRAS/CREAS de Anápolis.
4. Subir a Evolution numa VPS com número dedicado e testar com celular real.
5. Testar com o Postgres do Docker (os testes usam SQLite).
