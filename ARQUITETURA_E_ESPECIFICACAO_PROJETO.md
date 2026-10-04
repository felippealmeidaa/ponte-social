# DOCUMENTO DE ESPECIFICAÇÃO ARQUITETURAL, TÉCNICA E PLANO INTEGRAL DE PROJETO
## Sistema Inteligente de Encaminhamento Social & Plataforma Omnichannel de Atendimento Inteligente com IA Híbrida (ML, PyTorch, Google Gemini Flash Lite, LangGraph, Whisper e Visual Flow Builder)

---

### 1. Resumo Executivo e Alinhamento Estratégico

Este projeto integra dois objetivos sinérgicos em uma única solução tecnológica de ponta a ponta:

1. **Requisitos Acadêmicos (Projeto Integrador - UniEVANGÉLICA 2026/2 - Inteligência Artificial - 3º Período)**:
   - **Problema Real**: Dificuldade do cidadão em vulnerabilidade social em descobrir o serviço público correto (CRAS, CREAS, Cadastro Único, Bolsa Família, BPC, Tarifa Social, etc.), documentos exigidos, requisitos e locais de atendimento, evitando filas e retrabalho de servidores públicos.
   - **Ciência de Dados & Machine Learning Rigoroso**:
     - Modelos Supervisionados Clássicos: Regressão Logística com TF-IDF, Naive Bayes Multinomial e SVM Linear (Modelo Campeão com $F_1\text{-Macro} = 1.0000$).
     - **LLM Oficial Adotada**: **Google Gemini (Modelo Flash Lite)** para reescrita semântica de intenções (*Query Rewriter*), humanização empática e acolhedora de respostas no WhatsApp e copiloto de criação de fluxos.
     - Modelos Não-Supervisionados: **HDBSCAN** e **K-Means** com **UMAP/PCA** para clusterização de relatos não mapeados e descoberta de novos padrões de demanda.
     - **Processamento de Áudio**: Transcrição inteligente de mensagens de voz via **Whisper (Faster-Whisper)** para garantir acessibilidade a cidadãos analfabetos ou com baixa escolaridade.
     - **Tratamento da Base A Real do MDS**: Limpeza de 133.704 registros municipais para 116.991 linhas úteis com derivação de UF e diagnóstico oficial de Anápolis-GO.
     - Avaliação Científica: Linha de base da classe majoritária ($F_1 = 0.05$) + Linha de base heurística por palavras-chave ($F_1 = 0.68$); Métrica principal **F1-Macro**; Piso de **Revocação (Recall = 100%) crítico para situações de violência/proteção**; Validação Cruzada Estratificada ($k=5$).
   - **Impacto Social & ODS**: ODS 16 (Meta 16.6 - Instituições eficazes, transparentes e acessíveis) e ODS 10 (Meta 10.2 - Redução das desigualdades sociais).
   - **Legislação & Ética**: Conformidade total com a **LGPD** (tratamento de dados sensíveis de renda, menores e violência com consentimento e anonimização prévia).

2. **Visão Comercial de Produto (SaaS Omnichannel CRM com IA para WhatsApp)**:
   - **Conectividade Híbrida com WhatsApp**: Suporte nativo tanto a APIs autohospedadas/não-oficiais (**Evolution API v2** via Docker, Z-API) para custo zero de validação, quanto à **API Oficial da Meta (WhatsApp Cloud API Graph v20+)** para contratos B2G (prefeituras) e B2B enterprise.
   - **Live Chat / Inbox Web em Tempo Real**: Atendimento humano centralizado via WebSockets com histórico unificado de conversas, atribuição de atendentes e gestão de filas (essencial ao usar a API oficial da Meta, que desativa o app do celular).
   - **Mecanismo de Transbordo Humano (*Human Hand-off*)**: Pausa automática imediata dos nós de IA quando um atendente assume o ticket ou envia uma mensagem.
   - **Visual Flow Builder No-Code/Low-Code**: Editor visual interativo baseado em nós (estilo n8n / LangGraph Studio) construído com `@xyflow/react`, permitindo desenhar árvores de decisão, nós de ML, agentes LangGraph, nós de **Google Gemini Flash Lite**, RAGs e transbordo humano.
   - **Experiência Visual & UI/UX de Alta Fidelidade**: Design System moderno com Dark Mode nativo, Glassmorphism, Micro-animações com **Framer Motion**, componentes **shadcn/ui**, efeitos **Magic UI / Aceternity** e dashboards com **Tremor / Recharts**.
   - **Arquitetura Multi-Tenant**: Isolamento completo de dados, instâncias de WhatsApp, credenciais criptografadas com AES-256-GCM, usuários e fluxos por organização/cliente.

---

### 2. Especificação do Módulo Google Gemini (Flash Lite)

O serviço em [gemini_service.py](file:///c:/Users/felip/OneDrive/Documentos/projeto/backend/app/services/llm/gemini_service.py) é configurado com:
- **Modelo**: `gemini-2.0-flash-lite` (ou `gemini-1.5-flash-8b` / `gemini-3.5-flash-lite`).
- **Função 1 (Query Rewriting)**: Converte relatos com linguagem informal, gírias e regionalismos em consultas precisas para a busca semântica RAG.
- **Função 2 (Humanização Empática)**: Gera mensagens de acolhimento social claras, sem termos burocráticos ou jargões jurídicos para o WhatsApp.
- **Função 3 (AI Flow Copilot)**: Auxilia gestores e administradores na criação no-code de novos nós e regras de atendimento.
