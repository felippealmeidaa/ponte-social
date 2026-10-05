---
version: 1
slug: "frontend-src-app-tsx"
primary_target: "frontend/src/App.tsx"
related_targets: ["frontend/src/components"]
---

# Painel do CRAS (frontend/src)

Scope: whole authenticated app (Fila, Conversas, Indicadores, Serviços e mensagens, Configurações). Mode: Operate.
Audience/job: técnicos, recepção e coordenação do CRAS, no computador do serviço, o expediente inteiro. Achar o caso mais urgente, entender em segundos, agir (status, ligar, responder no WhatsApp).
Constraints: tema escuro escolhido pelo usuário; contraste AA; urgência não pode depender só de cor; dado sensível revelado sob demanda. Sem imagens de pessoas: casos sociais não são vitrine, então a "arte" do cartão é tipográfica (categoria, trecho do relato), nunca foto.

## Direction contract

THESIS: A fila como parede de fileiras: cada prioridade é uma fileira horizontal de cartões; o cartão em foco cresce e mostra o essencial enquanto o resto recua. Recusa a tabela cinza com barra lateral e cartões de métricas que todo sistema de gestão entrega.

OWN-WORLD: Fundo quase preto azulado (#0B0E13), superfícies #151922 e #1F2430, texto #E6E6E8/#A4A9B3; um único acento âmbar (#FFC857) só para foco e ação primária; vermelho de urgência reservado à fileira de violência, sempre com ícone e rótulo. Títulos de fileira em condensada caixa-alta (Bebas Neue), todo o resto em Inter. Cartões de proporção fixa, borda âmbar no foco, sem sombras coloridas.

STORY: O profissional abre e vê primeiro a fileira de urgência; percorre com teclado ou mouse; o cartão em foco revela categoria, tempo de espera e trecho do relato; Enter abre a ficha em painel lateral para agir (status, observação, ver telefone, abrir conversa).

FIRST VIEWPORT: Barra lateral estreita à esquerda (navegação + contadores de status, como a lista de status da referência). À direita, no topo, uma faixa compacta com o caso mais urgente em destaque e o botão "Registrar atendimento"; abaixo, fileiras "Urgente — violência", "Prioridade alta", "Média e baixa", "Em atendimento". Cada fileira rola na horizontal com setas.

FORM: Parede de streaming (pop-culture-shelf-streaming-title-card-wall), challenger adotado pelo usuário; seed b862a661. Raises mantidos: caso novo fica aceso até ser aberto (do painel de embarque); só o caso mais urgente ganha fundo invertido; um único vocabulário de estados em todas as telas.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
