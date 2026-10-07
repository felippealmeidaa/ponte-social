---
version: 1
slug: "frontend-src-app-tsx"
primary_target: "frontend/src/App.tsx"
related_targets: ["frontend/src/components"]
---

# Painel do CRAS (frontend/src)

Scope: whole authenticated app (Fila, Conversas, Indicadores, Serviços e mensagens, Configurações). Mode: Operate.
Audience/job: técnicos, recepção e coordenação do CRAS, no computador do serviço, o expediente inteiro. Achar o caso mais urgente, entender em segundos, agir (status, ligar, responder no WhatsApp).
Constraints: direção visual fixada pelo usuário com imagem de referência ("Industrial precision / high-tech terminal"); navegação pelo botão ☰ com gaveta (decisão do usuário, 2026-10-07): tópicos principais, subdivisões abrem embaixo do tópico (mouse abre, clique fixa); Fila em tabela densa com a ficha ao lado (decisão do usuário). Contraste AA; urgência nunca só por cor; dado sensível sob demanda. Sem fotos de pessoas.

## Direction contract

THESIS: O painel é um terminal de operação do turno: telas montadas como grades de painéis com barra de título, dados densos em linhas tipo log e uma faixa de leitura no topo de cada tela. Recusa a pilha de cartões grandes e o painel de boas-vindas com métricas decorativas.

OWN-WORLD: Grafite #161718 com painéis #1d1e20 e traço #2f3134 de 1px, cantos de 3–4px, sem sombra macia. Texto #ecebe7/#aeaca6. Vermelhão #f0602a só no que está ativo ou é a ação principal (item atual, linha selecionada, botão, série do gráfico); verde #3ccf6e para em ordem; vermelho frio #ff5c6c só para violência, sempre com escudo e rótulo. IBM Plex Sans na interface, IBM Plex Mono em todo dado (guia, tempo, contagem, data). Tema claro é o mesmo sistema sob luz do dia.

STORY: Ao abrir, o profissional lê a faixa de contagens (urgentes, aguardando, em atendimento, chegaram hoje), vê a tabela da fila com violência no topo, clica numa linha e age na ficha ao lado sem perder a lista.

FIRST VIEWPORT: Barra fina no topo (☰, marca PS, trilha "Atendimento › Fila de casos", campos da conta à direita). Abaixo, cabeçalho da tela com título à esquerda e ações à direita; faixa de leitura em células com valores em mono; painel "Fila" com tabela densa: Guia, Espera, Necessidade, Relato, Bairro, Canal, Situação. Violência em grupo próprio no topo, com escudo. Linha selecionada com traço vermelhão à esquerda; ficha em painel lateral.

FORM: Direção fixada pelo usuário com imagem de referência (vence o sorteio); seed 1e295d3b, posição 4 sorteada não construída por causa da fixação. Raise do mapa de orientação: o acento fica reservado ao trecho ativo, nunca decoração. Raise do campo de dados (datamatics): densidade numérica em mono sem medo, colunas alinhadas.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
