---
name: Ponte Social
description: Painel de turno do CRAS, um terminal de operação para receber, priorizar e atender as triagens do WhatsApp.
colors:
  fundo: "#161718"
  superficie: "#1d1e20"
  elevada: "#252628"
  realce: "#2c2d30"
  linha: "#2f3134"
  linha-forte: "#4a4c50"
  texto: "#ecebe7"
  texto-2: "#aeaca6"
  texto-3: "#8d8b85"
  acao: "#f0602a"
  acao-hover: "#ff7a45"
  sobre-acao: "#170a04"
  caneta: "#ff7a45"
  caneta-fundo: "#33221b"
  urgente: "#ff5c6c"
  urgente-fundo: "#3a1c21"
  alerta: "#b3172d"
  sobre-alerta: "#ffffff"
  ok: "#3ccf6e"
  ok-fundo: "#163020"
  alta: "#f0a24f"
  alta-fundo: "#33281c"
  info: "#7fb0f5"
  info-fundo: "#1a2638"
  marca: "#e6b84a"
  marca-fundo: "#2e2818"
  cat-renda: "#4fd08a"
  cat-cadastro: "#7fb0f5"
  cat-moradia: "#c9a27c"
  cat-documentos: "#ab9cf5"
  cat-alimentacao: "#e6c04f"
  cat-idosa: "#e08fd8"
  cat-trabalho: "#45c8bd"
  cat-violencia: "#ff5c6c"
  cat-outro: "#9b9993"
typography:
  headline:
    fontFamily: "IBM Plex Sans Variable, IBM Plex Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: "-0.012em"
    fontVariation: "'wdth' 94"
  title:
    fontFamily: "IBM Plex Sans Variable, IBM Plex Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: "-0.012em"
    fontVariation: "'wdth' 94"
  body:
    fontFamily: "IBM Plex Sans Variable, IBM Plex Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "IBM Plex Sans Variable, IBM Plex Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: 1.3
  data:
    fontFamily: "IBM Plex Mono, ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "14px"
    fontWeight: 500
    letterSpacing: "-0.01em"
    fontFeature: "'tnum' 1, 'zero' 1"
  data-reading:
    fontFamily: "IBM Plex Mono, ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "21px"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-0.01em"
    fontFeature: "'tnum' 1, 'zero' 1"
rounded:
  sm: "3px"
  md: "4px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.acao}"
    textColor: "{colors.sobre-acao}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.acao-hover}"
  button-secondary:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.texto}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "40px"
  button-secondary-hover:
    backgroundColor: "{colors.elevada}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.texto-2}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "32px"
  button-danger:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.urgente}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "40px"
  panel:
    backgroundColor: "{colors.superficie}"
    rounded: "{rounded.md}"
    padding: "16px"
  panel-header:
    typography: "{typography.title}"
    padding: "10px 16px"
    height: "46px"
  reading-strip:
    backgroundColor: "{colors.superficie}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  input:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.texto}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
    height: "40px"
  queue-row:
    typography: "{typography.body}"
    height: "40px"
    padding: "6px 12px"
  queue-row-selected:
    backgroundColor: "{colors.caneta-fundo}"
  badge-urgent:
    backgroundColor: "{colors.urgente-fundo}"
    textColor: "{colors.urgente}"
    rounded: "{rounded.md}"
    padding: "2px 6px"
  badge-ok:
    backgroundColor: "{colors.ok-fundo}"
    textColor: "{colors.ok}"
    rounded: "{rounded.md}"
    padding: "2px 6px"
  topbar:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.texto}"
    height: "56px"
    padding: "0 32px"
  nav-item-active:
    backgroundColor: "{colors.caneta-fundo}"
    textColor: "{colors.texto}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
---

# Design System: Ponte Social

## Overview

**Creative North Star: "O Painel de Turno"**

O painel é um terminal de operação da rede socioassistencial, usado o expediente inteiro. Cada tela é uma grade de painéis com traço fino e barra de título, abre com uma faixa de leitura (contagens em mono, lado a lado, como mostradores) e mostra os casos em linhas densas tipo log. A direção foi fixada pelo dono do projeto com uma imagem de referência "Industrial precision / high-tech terminal": grafite, painéis de traço fino, faixa de métricas, tabelas tipo log, dados em mono, acento laranja-vermelhão.

A densidade é alta e sem medo: linhas de 40px, colunas alinhadas, todo número em IBM Plex Mono com algarismos tabulares e zero cortado. A cor é rara e tem função: o vermelhão marca o que está ativo ou é a ação principal, o verde marca o que está em ordem, o vermelho frio marca só violência. O tema escuro é o padrão; o claro é o mesmo sistema sob luz do dia (papel acinzentado, tinta grafite), com os mesmos papéis e nomes de token.

Rejeições confirmadas: a pilha de cartões grandes, o painel de boas-vindas com métricas decorativas e o painel "só preto e branco" (rejeitado pelo dono em favor de uma cor por necessidade nas séries de dados).

**Key Characteristics:**
- Grafite neutro (não azulado), painéis com traço de 1px e cantos de 3 a 4px.
- Faixa de leitura no topo de cada tela; tabelas densas tipo log.
- IBM Plex Sans na interface, IBM Plex Mono em todo dado (guia, tempo, contagem, data).
- Um acento (vermelhão) para o ativo e a ação principal; vermelho frio só para violência.
- Escuro por padrão; claro como o mesmo sistema sob luz do dia.

## Colors

Grafite em quatro degraus com traço fino, um acento vermelhão e uma família de sinais (verde, âmbar, azul, vermelho frio) com fundos próprios; os valores do frontmatter são os do tema escuro (padrão), e o tema claro redefine os mesmos tokens.

### Primary
- **Vermelhão de Turno** (acao; hover e caneta no tom mais claro): botão principal, item atual do menu (traço de 3px à esquerda), linha selecionada da fila (traço interno de 3px à esquerda e fundo caneta-fundo), foco (contorno de 2px), cursor de texto, segmento escolhido, série única dos gráficos de Indicadores. No claro vira #c4461a com texto branco.
- **Brasa Apagada** (caneta-fundo): fundo do que está selecionado ou ativo; nunca fundo decorativo.

### Secondary
- **Verde de Ordem** (ok, ok-fundo): "Em atendimento" e "Concluído"; tudo que está em ordem.
- **Vermelho Frio** (urgente, urgente-fundo; alerta para a faixa cheia do topo): só violência e urgência, sempre acompanhado do escudo e de um rótulo escrito.

### Tertiary
- **Âmbar de Prioridade** (alta, alta-fundo): prioridade alta.
- **Azul de Encaminhamento** (info, info-fundo): "Encaminhado ao CREAS" e marcas informativas como "traduzido".
- **Ouro de Chegada** (marca, marca-fundo): caso que chegou e ainda não foi aberto.
- **Cores por necessidade** (cat-renda, cat-cadastro, cat-moradia, cat-documentos, cat-alimentacao, cat-idosa, cat-trabalho, cat-violencia, cat-outro): uma cor por necessidade, decisão do dono. Ficam só nas séries de dados (barras "Por necessidade" de Indicadores, filtros e pontos do mapa) e no ícone da violência.

### Neutral
- **Grafite de Fundo** (fundo): a mesa, atrás de todos os painéis.
- **Grafite de Painel** (superficie): painéis, barra do topo, gaveta, ficha, campos.
- **Grafite Elevado** (elevada) e **Realce** (realce): faixa de grupo na tabela, hover de linha e de item, trilho do segmentado, esqueleto de carregamento.
- **Traço** (linha) e **Traço Forte** (linha-forte): bordas de 1px de painéis e divisões; o forte em campos, botões secundários e barra de rolagem.
- **Tinta** (texto, texto-2, texto-3): texto principal, secundário e de apoio (cabeçalhos de coluna, detalhes). Todos com contraste AA sobre superficie.

### Named Rules
**The Vermelhão Reservado Rule.** O vermelhão só aparece no que está ativo agora ou na ação principal da tela: item atual, linha aberta, foco, botão primário, série do gráfico. Nunca como decoração, título ou borda de enfeite.

**The Escudo e Rótulo Rule.** O vermelho frio é exclusivo de violência e urgência e nunca aparece sozinho: sempre com o ícone de escudo e um rótulo ("Violência ou ameaça", "Urgente", "Atender primeiro").

**The Cor Por Necessidade Rule.** As cores das necessidades vivem nas séries de dados (barras, filtros, pontos do mapa). Na tabela da Fila o ícone de necessidade é neutro (fundo elevada, tinta texto-2); só a violência ganha a sua cor.

## Typography

**Display Font:** IBM Plex Sans Variable (com IBM Plex Sans, Segoe UI, system-ui)
**Body Font:** IBM Plex Sans Variable
**Label/Mono Font:** IBM Plex Mono 400/500/600 (com ui-monospace, Cascadia Mono, Consolas)

**Character:** Plex Sans semi-negrito levemente condensado (largura 94%) dá títulos de painel firmes e contidos; Plex Mono com algarismos tabulares e zero cortado deixa toda coluna de número alinhada, como num log.

### Hierarchy
- **Headline** (600, 26 a 28px, 1.12, condensado 94%): título da tela, à esquerda, com as ações à direita.
- **Title** (600, 16px; 18px na cabeça da ficha; 21px em títulos de fileira): barra de título dos painéis.
- **Body** (400, 15px, 1.55): texto corrido; tabela da fila a 14px; descrições até 68 a 75ch.
- **Label** (500, 12.5px): cabeçalhos de coluna, rótulos da faixa de leitura, detalhes do painel, faixas de grupo da tabela (600).
- **Data** (Plex Mono 500, 14px na guia, 13.5px na espera; 21px no valor da faixa de leitura): todo número, tempo, código e contagem.

### Named Rules
**The Dado em Mono Rule.** Todo número que a equipe compara (guia, espera, contagem, data, porcentagem) sai em Plex Mono tabular com zero cortado. Texto de interface nunca sai em mono.

**The Caixa Normal Rule.** Rótulos e cabeçalhos ficam em caixa normal, sem letras espaçadas em maiúsculas.

## Layout

Coluna de conteúdo de até 1440px, com 32px de margem lateral a partir de 768px (16px no celular). Barra do topo de 56px, separada do conteúdo só por um traço. Cada tela abre com cabeçalho (título à esquerda, ações à direita, 16 a 28px abaixo), faixa de leitura (2 colunas no celular, 3 a partir de 640px, 5 a partir de 1024px) e então a grade de painéis com 16px de vão.

Fila: tabela de largura fixa a partir de 768px com colunas Guia (104px), Espera (84px), Necessidade, Relato (elástica), Bairro, Canal e Situação; casos agrupados em faixas ("Atender primeiro", "Prioridade alta", "Média e baixa", "Em atendimento"), concluídos num painel recolhível. A partir de 1280px a ficha encaixa à direita (grade de 1fr e no mínimo 400px ou 34%), fixa no rolar e com a lista ainda usável; abaixo disso a ficha é uma folha lateral sobre véu. No celular a tabela vira lista de duas linhas por caso. O aviso de violência parada além do tempo limite é uma etiqueta pequena na barra do topo (com o título da aba e som opcional); não há faixa grande nem notificação do sistema (decisão do dono).

Indicadores: grade de painéis (1.4fr e 1fr a partir de 1024px), mapa de demandas em painel próprio. Ritmo de espaço em 4, 8, 12, 16 e 24px.

## Elevation & Depth

O sistema é plano: a profundidade vem dos degraus de grafite (fundo, superficie, elevada, realce) e do traço de 1px, não de sombra. Painéis, tabela, faixa e ficha encaixada não têm sombra. Sombras pequenas aparecem só em peças que flutuam ou se movem sobre outra: a gaveta do menu sobre o véu, o pino da chave, o segmento escolhido e as bolinhas do mapa. A linha selecionada usa um traço interno de 3px, não uma elevação.

### Shadow Vocabulary
- **Gaveta** (`box-shadow: 20px 0 40px -20px rgb(27 39 51 / 0.45)`): só a gaveta do menu, aberta sobre o véu.
- **Pino** (`box-shadow: 0 1px 2px rgb(27 39 51 / 0.35)`): o pino da chave liga/desliga.
- **Segmento** (`box-shadow: 0 1px 2px rgb(27 39 51 / 0.18)`): a opção escolhida no segmentado.
- **Ponto do mapa** (`box-shadow: 0 2px 6px -2px rgb(15 25 35 / 0.5)`): bolinha de bairro sobre o mapa.
- **Traço de seleção** (`box-shadow: inset 3px 0 0 var(--color-acao)`): borda esquerda da linha aberta na fila.

### Named Rules
**The Traço Não Sombra Rule.** Blocos de trabalho se separam por traço de 1px e degrau de grafite. Sombra macia só em camada que flutua sobre véu ou em peça que desliza.

## Shapes

Quase reto: 3px em botões, campos, itens de menu, ícones de necessidade e marca PS; 4px em painéis, faixa de leitura, selos e segmentado. Redondo completo só onde a forma é o sinal: chave liga/desliga, contagens do menu e pontos do mapa. O marcador de CRAS no mapa é um losango (quadrado girado 45°). Todo contorno é 1px; o item ativo ganha uma barra de 3px à esquerda.

## Components

### Buttons
Contidos e diretos; uma ação principal por tela.
- **Shape:** quase reto (3px); 40px de altura (32px no tamanho pequeno), ícone de 16px à esquerda.
- **Primary:** vermelhão cheio com tinta escura (no claro, tinta branca), semi-negrito 14.5px, padding horizontal de 16px.
- **Hover / Focus:** troca de cor em 150ms; foco com contorno vermelhão de 2px e afastamento de 2px.
- **Secondary:** grafite de painel com traço forte; no hover, borda texto-3 e fundo elevado.
- **Ghost:** sem fundo, tinta texto-2; no hover, tinta texto e fundo elevado.
- **Danger:** grafite de painel com tinta e traço vermelho frio; no hover, fundo urgente-fundo.

### Chips
- **Selos de estado:** 12.5px semi-negrito, 4px de canto, fundo do tom com tinta do tom e traço do tom a 25 a 35%, ícone de 14px. Tons: urgente (escudo), alta (triângulo), caneta, info, ok, neutro; "Aguardando" é só texto, sem caixa.
- **Contagem do menu:** pílula de 20px de altura; vermelho frio com tinta branca quando há urgência, senão elevada com texto-2.

### Cards / Containers
- **Corner Style:** 4px.
- **Background:** superficie sobre fundo.
- **Shadow Strategy:** nenhuma (ver Elevation & Depth).
- **Border:** 1px linha.
- **Internal Padding:** barra de título com no mínimo 46px de altura e 10px 16px, separada por traço; corpo com 16px. Título em 16px semi-negrito, detalhe em 12.5px texto-3, ação opcional à direita.

### Inputs / Fields
- **Style:** grafite de painel, traço forte de 1px, 3px de canto, 15px (busca da fila em 14.5px com lupa à esquerda); rótulo em 13.5px semi-negrito texto-2 acima; dica em 12.5px texto-3 abaixo.
- **Focus:** borda vermelhão e anel vermelhão a 15%; cursor de texto vermelhão.
- **Disabled:** opacidade 50%.

### Navigation
- **Barra do topo:** 56px, grafite de painel com traço inferior. Botão ☰ (36px, traço forte, hover em vermelhão) com ponto vermelho frio quando há urgentes; marca PS em mono sobre bloco claro; trilha "Atendimento › Fila de casos" em 13.5px; à direita, unidade, conta e "Na fila" (a partir de 1280px), avisos, tema e sair.
- **Gaveta ☰:** decisão do dono, no lugar de barra lateral fixa. Folha de até 20rem que entra pela esquerda em 200ms sobre véu. Mostra só os tópicos (ícone, título 15.5px, resumo 12.5px, contagem de alerta); as subcategorias abrem embaixo do tópico, recuadas com traço à esquerda. Só o clique abre e fecha um tópico (decisão do dono: passar o mouse não abre nada); vários tópicos podem ficar abertos ao mesmo tempo, no computador e no toque. Item atual com fundo caneta-fundo e barra vermelhão de 3px. Esc ou escolher uma tela fecha.

### Faixa de Leitura
Assinatura de cada tela: células lado a lado num bloco de 4px de canto e traço fino, separadas por traço. Rótulo em 12.5px texto-2, valor em Plex Mono 21px, detalhe em mono 12px texto-3. A célula de violência leva escudo e valor em vermelho frio. Com endereço, a célula filtra a fila (hover elevado).

### Tabela da Fila
Decisão do dono: tabela densa com a ficha ao lado. Linhas de 40px em 14px, traço inferior de 1px; cabeçalhos 12.5px texto-3; faixas de grupo em fundo elevado, 12.5px semi-negrito. Guia em mono 14px, espera em mono 13.5px. Ícone de necessidade em quadrado de 24px neutro; violência com o ícone na sua cor, nome em vermelho frio semi-negrito e fundo urgente-fundo a 50% enquanto espera. Linha aberta: fundo caneta-fundo, traço vermelhão de 3px à esquerda e guia em vermelhão. Setas navegam, Enter abre.

### Ficha encaixada
Painel com cabeça fixa (título 18px, botão Fechar fantasma), corpo de 20px por 16px, fixo a 16px do topo com altura máxima da janela. Abaixo de 1280px vira folha lateral sobre véu, entrando pela direita em 220ms; Esc fecha.

## Do's and Don'ts

### Do:
- **Do** montar cada tela como cabeçalho, faixa de leitura e grade de painéis com barra de título, traço de 1px e canto de 4px.
- **Do** escrever todo número, tempo, guia e contagem em Plex Mono tabular com zero cortado.
- **Do** reservar o vermelhão ao item ativo, à linha aberta, ao foco e à única ação principal da tela.
- **Do** mostrar violência sempre com escudo, rótulo escrito e vermelho frio, no topo da fila.
- **Do** usar a cor de cada necessidade só nas séries de dados (barras, filtros, mapa) e no ícone da violência.
- **Do** definir cada cor nos dois temas, escuro (padrão) e claro, com o mesmo nome de token.

### Don't:
- **Don't** empilhar cartões grandes nem fazer painel de boas-vindas com métricas decorativas.
- **Don't** fazer o painel só em preto e branco: as necessidades têm cor nas séries de dados.
- **Don't** colorir os ícones de necessidade na tabela da Fila (exceto violência).
- **Don't** usar o vermelho frio para outra coisa que não violência e urgência, nem sem escudo e rótulo.
- **Don't** pôr sombra macia em painéis, tabelas ou ficha encaixada; separe por traço e degrau de grafite.
- **Don't** trocar a gaveta ☰ por barra lateral fixa.
