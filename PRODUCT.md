# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Profissionais de um CRAS (Centro de Referência de Assistência Social) de Anápolis-GO, no computador do serviço, durante o expediente inteiro:

- **Técnicos (assistentes sociais):** atendem os casos da fila, ligam ou respondem as pessoas pelo WhatsApp, registram observações e mudam o status.
- **Recepção / triagem:** registram atendimentos presenciais e mantêm a fila organizada.
- **Coordenação:** acompanha os indicadores e edita a base de serviços e os textos do bot.

Público indireto: cidadãos em vulnerabilidade social que falam com o bot pelo WhatsApp. Eles nunca veem o painel.

## Product Purpose

Sistema Inteligente de Encaminhamento Social (Projeto Integrador, IA 3º período, UniEVANGÉLICA 2026/2). O cidadão conta a situação dele no WhatsApp; um classificador identifica a necessidade e devolve serviços, documentos, local e próximos passos. Quem pede contato entra na fila do CRAS. O painel é onde a instituição recebe, prioriza e atende essas triagens.

Sucesso: nenhum caso de violência fica esperando; o profissional sabe em segundos o que a pessoa precisa e o que ela deve levar; menos retorno por falta de documento.

## Positioning

Parte do relato livre da pessoa (não exige que ela saiba o nome do programa) e entrega ao CRAS a triagem já organizada por prioridade, com o caminho sugerido. O sistema orienta e nunca decide direito a benefício.

## Operating Context

- Fluxo: WhatsApp (Evolution API) → API FastAPI → classificador scikit-learn → banco → painel.
- A fila é a tela principal; urgência por violência vem sempre primeiro.
- O atendente pode assumir uma conversa do WhatsApp (o bot fica em silêncio) e devolvê-la ao bot.
- Atendimentos presenciais também entram na fila, registrados pelo profissional.
- A coordenação edita, sem código, o que o bot responde em cada categoria e os textos da conversa.
- Uso em computador de mesa ou notebook, muitas vezes monitor simples; celular só para consulta rápida.

## Capabilities and Constraints

- 8 categorias de necessidade + "não identificado" (encaminha ao Disque Social 121).
- Status de triagem: PENDENTE, EM_ATENDIMENTO, URGENTE_CREAS, ENCAMINHADO_CREAS, CONCLUIDO, ARQUIVADO.
- LGPD: relatos gravados anonimizados; telefone mascarado e criptografado, revelado só sob demanda e com registro de quem consultou; prazo de retenção.
- Login obrigatório para todas as telas do painel.
- Os dados de treino e teste do modelo ainda são simulados; as métricas devem aparecer com essa ressalva.
- Fora do escopo do semestre: agendamento, encaminhamento entre CRAS/CREAS/Centro POP, multi-instituição.

## Brand Commitments

Nenhuma identidade obrigatória (projeto acadêmico). Linguagem simples, direta, em português do Brasil, sem jargão técnico de IA na interface do profissional.

## Evidence on Hand

- Plano do projeto: `Plano_Projeto_Encaminhamento_Social.pdf`; deck do Marco 1; descrição do problema.
- Base real do MDS: `usuarios_assistencia_social (1).csv` (agregada por município).
- Relatório do modelo: `backend/app/services/ml/mlops_evaluation_report.json`.
- Não existem depoimentos, parceria fechada com CRAS nem dados reais de atendimento; não inventar.

## Product Principles

1. Urgência primeiro: violência nunca pode ficar escondida ou atrás de cliques.
2. Uma tela, uma tarefa: o profissional resolve o caso sem caçar informação.
3. Orientação, não decisão: a interface nunca sugere que o sistema concede ou nega direito.
4. Proteger a pessoa: dado sensível aparece só quando necessário e deixa rastro.
5. Honestidade sobre a IA: mostrar a confiança e as limitações do modelo, sem exagero.

## Accessibility & Inclusion

Uso prolongado em monitores simples: contraste alto (WCAG AA no mínimo), texto legível sem zoom, navegação por teclado, estados de urgência que não dependam só de cor.
