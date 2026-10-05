# Guia de rotulagem de relatos

Sistema Inteligente de Encaminhamento Social · Projeto Integrador IA · UniEVANGÉLICA 2026/2
Versão 0.1 (rascunho para revisar com o profissional do CRAS parceiro)

## 1. Para que serve

O classificador aprende com relatos **rotulados**: cada relato recebe a necessidade que um profissional reconheceria nele. Este guia garante que duas pessoas diferentes deem o **mesmo rótulo** ao mesmo relato. Sem isso, o modelo aprende ruído e as métricas não valem nada.

Quem rotula: integrantes do grupo e, para validar, pelo menos um profissional da assistência social (plano, seção 5, passos 2 a 4).

## 2. Antes de rotular: anonimizar

Nenhum relato entra na planilha com dado que identifique alguém. **Antes** de rotular, substitua:

| O que aparece | Substitua por |
| :--- | :--- |
| Nome de pessoa | `[NOME]` |
| CPF, RG, NIS, número de documento | `[DOCUMENTO]` |
| Telefone | `[TELEFONE]` |
| Endereço, rua, número da casa | `[ENDERECO]` |
| E-mail | `[EMAIL]` |
| Nome de escola, empresa ou local que identifique a pessoa | `[LOCAL]` |

Bairro e cidade podem ficar (ajudam a indicar o CRAS de referência), **exceto** em relatos de violência: nesses, troque também o bairro por `[BAIRRO]`.

Mantenha erros de digitação, gírias e falta de acento. É assim que as pessoas escrevem, e é isso que o modelo precisa aprender.

## 3. O que é um rótulo

Cada relato recebe:

- **uma categoria principal** (obrigatória): a necessidade que deve guiar o primeiro encaminhamento;
- **categorias secundárias** (opcional): outras necessidades presentes no relato.

Pergunta-guia para a principal: *"Se essa pessoa só pudesse ir a um lugar amanhã, qual atendimento resolveria o mais importante?"*

## 4. As categorias

Os nomes entre parênteses são os códigos usados nos arquivos e no sistema.

### Violência ou ameaça (`violencia_protecao`) ⚠️ prioridade máxima
**É:** qualquer sinal de violência física, sexual, psicológica, patrimonial ou negligência grave, contra a própria pessoa ou contra outra (criança, idoso, pessoa com deficiência, vizinho). Inclui ameaça, perseguição, medo do agressor, descumprimento de medida protetiva, exploração e abuso.
**Exemplos:**
- "to com medo de voltar pra casa, ele quebrou meu celular e falou que da proxima vez sou eu"
- "a cuidadora deixa minha vó trancada sem comida o dia todo"
- "uma menina da rua chega na escola com marca roxa toda semana e fala que o tio bate"
**Não é:** briga de vizinho por barulho sem ameaça; conflito familiar sem violência ("minha irmã não fala comigo").

### Renda e benefícios (`renda_beneficio`)
**É:** falta de dinheiro para o básico, pedido de benefício em dinheiro (Bolsa Família, BPC, auxílio, tarifa social de energia, auxílio gás), dúvida sobre ter direito a um benefício.
**Exemplos:**
- "fiquei sem renda nenhuma depois que ele foi embora, como faço pra receber alguma ajuda?"
- "meu bolsa família não caiu esse mês"
**Não é:** pedido de emprego (vai em *Trabalho e cursos*); benefício bloqueado **por cadastro desatualizado** (vai em *Cadastro Único*).

### Cadastro Único (`cadastro_atualizacao`)
**É:** inscrever, atualizar, incluir ou excluir pessoa, consultar NIS, folha resumo, recadastramento, benefício bloqueado por cadastro.
**Exemplos:**
- "a moça do posto disse que meu NIS ta com pendencia, o que eu faço?"
- "nasceu meu filho, como coloco ele no cadunico?"
**Não é:** só perguntar se tem direito ao Bolsa Família, sem falar do cadastro (vai em *Renda e benefícios*).

### Moradia (`moradia`)
**É:** despejo, falta de onde morar, situação de rua, casa em risco (rachadura, alagamento), aluguel social, programa habitacional, abrigo.
**Exemplos:**
- "o dono pediu a casa e eu tenho até sexta pra sair"
- "a chuva levou o telhado e estamos dormindo na casa da vizinha"
**Não é:** fugir de casa por violência (vai em *Violência*, com *Moradia* como secundária).

### Documentos (`documentacao`)
**É:** tirar ou refazer documento (RG/CIN, CPF, certidão, carteira de trabalho), gratuidade de segunda via, registro de nascimento.
**Exemplos:**
- "molhou tudo na enchente, perdi a certidão das crianças"
- "nunca tirei identidade e preciso pra matricular na escola"
**Não é:** levar documento para outro serviço ("quais documentos levo no CRAS?"): rotule pela necessidade principal.

### Alimentação (`alimentacao`)
**É:** fome, falta de comida em casa, cesta básica, leite ou fórmula para bebê, restaurante popular, banco de alimentos.
**Exemplos:**
- "hoje só teve arroz e amanhã não tem mais nada"
- "onde pego leite pro meu neném, o meu secou"
**Não é:** falta de dinheiro em geral sem mencionar comida (vai em *Renda e benefícios*).

### Pessoa idosa ou com deficiência (`pessoa_idosa_pcd`)
**É:** necessidade ligada à idade ou deficiência: BPC por idade/deficiência, cadeira de rodas, fralda, passe livre, centro de convivência, cuidado de idoso ou pessoa com deficiência, carteira do autista.
**Exemplos:**
- "meu pai teve AVC e não anda mais, preciso de uma cadeira"
- "minha mãe tem 70 anos e fica sozinha o dia todo, tem algum lugar pra ela passar o dia?"
**Não é:** violência contra idoso ou pessoa com deficiência (vai em *Violência*).

### Trabalho e cursos (`trabalho_renda`)
**É:** procurar emprego, currículo, curso profissionalizante, jovem aprendiz, MEI, vender artesanato, feira.
**Exemplos:**
- "sei costurar, tem algum curso ou lugar que ajude a montar um negócio?"
- "faço salgado em casa, queria saber como vira MEI pra vender pra fora"
**Não é:** pedir benefício porque está desempregado (vai em *Renda e benefícios*, com *Trabalho* como secundária).

### Não identificado (`nao_identificado`)
**É:** relato sem necessidade de assistência social reconhecível, fora do escopo (saúde, justiça, assunto pessoal) ou impossível de entender.
**Exemplos:**
- "oi tudo bem"
- "qual o horário do posto de saúde?"
**Use com moderação:** se um profissional consegue dizer o que a pessoa precisa, rotule a categoria.

## 5. Regras para casos difíceis

1. **Violência vence tudo.** Qualquer sinal de violência torna `violencia_protecao` a principal, mesmo que o relato fale mais de outra coisa. Na dúvida, marque violência e anote a dúvida na coluna `observacao`.
2. **Mais de uma necessidade:** a principal é a mais urgente para a pessoa (comida hoje > documento) ou a que ela pede explicitamente. As outras vão em `secundarias`.
3. **Pedido explícito vence contexto.** "Estou desempregada e quero um curso" → *Trabalho e cursos*, mesmo com a menção à falta de renda.
4. **Não deduza além do texto.** Não imagine situações que a pessoa não contou.
5. **Dúvida real entre duas categorias:** escolha uma, ponha a outra em `secundarias` e escreva a dúvida em `observacao`. Esses casos são discutidos na reunião semanal e viram exemplo neste guia.

## 6. Formato do arquivo

Uma linha por relato (planilha ou JSON). Campos:

| Campo | Obrigatório | Exemplo |
| :--- | :--- | :--- |
| `id` | sim | `cras-0001` |
| `texto` | sim | relato **já anonimizado** |
| `categoria` | sim | `moradia` |
| `secundarias` | não | `["renda_beneficio"]` |
| `origem` | sim | `cras_real` · `profissional_descaracterizado` · `simulado` |
| `rotulador` | sim | iniciais ou código, nunca o nome completo |
| `observacao` | não | dúvida ou justificativa |

O sistema já gera exemplos rotulados a partir das correções feitas pelos cidadãos no WhatsApp (`GET /api/v1/triagem/exemplos-rotulados`); eles entram com `origem = correcao_cidadao` e também precisam ser revisados por uma pessoa.

## 7. Concordância entre rotuladores

1. Separe uma amostra de pelo menos 50 relatos (ou 20% do total, o que for maior), com casos de todas as categorias.
2. Duas pessoas rotulam a amostra **sem ver o rótulo da outra**; uma delas deve ser o profissional do CRAS.
3. Calcule a concordância pela **kappa de Cohen** (`sklearn.metrics.cohen_kappa_score`) na categoria principal.
   - Kappa abaixo de 0,6: o guia está ambíguo. Discutam as divergências, ajustem as definições e repitam com relatos novos.
   - Kappa de 0,6 a 0,8: bom; resolvam as divergências por consenso.
   - Kappa acima de 0,8: ótimo.
4. Registre o resultado, que entra na documentação do Marco 2.

## 8. Teste separado (não pule)

- Antes de treinar, separe **pelo menos 20%** dos relatos reais como **conjunto de teste**, estratificado por categoria e garantindo casos de violência.
- O teste é guardado e **ninguém olha** enquanto ajusta o modelo, as palavras-chave ou os limiares. Quem escreve palavras-chave não pode ter visto o teste.
- Variações do mesmo relato (mesma pessoa, mesmo caso) ficam **todas no mesmo lado** (treino ou teste), nunca dividido.
- O conjunto de teste simulado atual (`data/relatos_teste_informais.json`) já foi visto pela equipe. Ele continua servindo de comparação, mas o número oficial do Marco 2 deve vir do teste real.

## 9. Piso de recall de violência

O recall de violência mede quantos casos de violência o sistema reconhece. Hoje, nos dados simulados, ele está em 70%. O valor mínimo aceitável deve ser **definido com o profissional** (plano, seção 6), respondendo:

- Quantos casos de violência por mês chegariam pelo WhatsApp?
- Quantos alarmes falsos (casos comuns marcados como urgentes) a equipe consegue absorver?

A decisão e o número escolhido devem ficar registrados aqui.

| Data | Piso definido | Quem definiu | Justificativa |
| :--- | :--- | :--- | :--- |
| a definir | | | |
