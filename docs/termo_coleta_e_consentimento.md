# Coleta de relatos com o CRAS e consentimento

Sistema Inteligente de Encaminhamento Social · Projeto Integrador IA · UniEVANGÉLICA 2026/2

> **Rascunho para revisão.** Antes de usar, o texto precisa ser validado pelo professor orientador e pela coordenação do CRAS. Pontos marcados com **[validar]** dependem de uma decisão que não cabe ao grupo tomar sozinho.

## 1. Caminho recomendado: relatos descaracterizados escritos por profissionais

A forma mais segura de conseguir dados realistas é pedir que **profissionais do CRAS escrevam relatos inspirados em casos reais, já descaracterizados** (plano, seção 5, passo 3). Assim:

- nenhum dado pessoal de cidadão sai do CRAS;
- o relato mantém o jeito real de falar (palavras, erros, situações);
- o profissional já indica a categoria, o que adianta a rotulagem.

Coletar mensagens reais de cidadãos só deve acontecer depois que o bot estiver no ar, com o consentimento da seção 4, e mesmo assim só o texto anonimizado.

**[validar]** Pesquisas que envolvem seres humanos podem exigir aprovação de um Comitê de Ética em Pesquisa (CEP), conforme as resoluções do Conselho Nacional de Saúde (nº 466/2012 e nº 510/2016). Perguntar ao professor se o projeto integrador, no formato do item 1 (sem dado pessoal de cidadãos), precisa passar pelo CEP da UniEVANGÉLICA.

## 2. Roteiro do primeiro contato com o CRAS

1. Apresentar o projeto em 5 minutos: problema, o que o sistema faz e **o que ele não faz** (não decide direito, não substitui o profissional).
2. Mostrar o painel e o simulador de conversa.
3. Explicar o pedido: de 100 a 300 relatos descaracterizados, distribuídos pelas 8 categorias, com atenção especial a casos de violência, e uma pessoa para validar uma amostra dos rótulos (guia de rotulagem, seção 7).
4. Pedir ajuda para definir o **piso de recall de violência** (guia, seção 9).
5. Pedir a **lista oficial** de CRAS/CREAS de Anápolis (endereço, telefone, horário, bairros atendidos) e as fontes dos serviços (para preencher "Fonte oficial" no painel).
6. Combinar como os relatos serão entregues (planilha no modelo do guia, seção 6) e quem do grupo é o contato.

## 3. Termo de colaboração (modelo)

> **Termo de colaboração para fornecimento de relatos descaracterizados**
>
> O(A) CRAS ________________________, representado(a) por ________________________ (cargo: ____________), colabora com o Projeto Integrador "Sistema Inteligente de Encaminhamento Social", desenvolvido pelos estudantes Paula Tomazzelli, Guilherme Henrique Carvalhal, Felippe Almeida e João Victor Domingues, do curso de Inteligência Artificial da UniEVANGÉLICA, sob orientação de ________________________.
>
> **Objetivo.** Treinar e avaliar um sistema que sugere ao cidadão possíveis serviços, documentos e locais da assistência social a partir de um relato em linguagem natural. O sistema **não decide** direito a benefício e **não substitui** a avaliação profissional.
>
> **O que o CRAS fornece.** Relatos escritos por profissionais, inspirados em situações atendidas e **descaracterizados**: sem nome, CPF, NIS, telefone, endereço, data exata ou qualquer detalhe que permita identificar uma pessoa ou família. O CRAS não fornece prontuários, cadastros nem mensagens originais de cidadãos.
>
> **Compromissos dos estudantes.**
> 1. Usar os relatos exclusivamente neste projeto acadêmico.
> 2. Não tentar identificar pessoas a partir dos relatos.
> 3. Revisar cada relato e remover qualquer dado identificável que tenha passado.
> 4. Guardar os arquivos em repositório privado, com acesso restrito aos integrantes e ao orientador.
> 5. Divulgar apenas resultados agregados (métricas, gráficos) e exemplos que o CRAS autorizar.
> 6. Excluir os relatos ao final do projeto, em ____ / ____ / ______, salvo nova autorização por escrito.
>
> **Validação.** O(A) profissional ________________________ revisará uma amostra dos rótulos e participará da definição do nível mínimo de detecção de situações de violência.
>
> Anápolis, ____ de ______________ de 2026.
>
> ______________________________ (responsável pelo CRAS)
> ______________________________ (orientador)
> ______________________________ (representante dos estudantes)

**[validar]** Confirmar com o orientador se a universidade tem um modelo próprio de termo de parceria e quem deve assinar pela instituição.

## 4. Consentimento do cidadão no WhatsApp

O bot já pede consentimento antes de qualquer pergunta (texto `boas_vindas`, editável em *Serviços e mensagens → Textos da conversa*). O texto atual:

> Olá! Sou o assistente de orientação da Assistência Social de Anápolis. 👋
> Eu ajudo a descobrir *qual serviço procurar, quais documentos levar e onde ir*. Sou só uma orientação: *não decido quem tem direito a benefício* — isso é feito pelos profissionais do CRAS.
> Vou usar o que você me contar para te orientar e, *sem identificar você*, para melhorar este serviço. Não escreva nome, CPF ou endereço.
> Você concorda? *1* - Sim, concordo *2* - Não

O que já atende ao plano (seção 10): explica a finalidade, avisa que não decide direito, pede para não enviar dado pessoal e permite recusar (quem recusa recebe o Disque Social 121 e o CRAS).

O que falta definir **[validar]**:

1. **Base legal.** Relatos podem conter dados sensíveis (saúde, violência), tratados conforme o art. 11 da LGPD. O fluxo usa o consentimento; nos casos de violência, a mensagem de emergência é enviada antes de qualquer pergunta, com base na proteção da vida (art. 11, II, "e"). Confirmar essa leitura com o orientador.
2. **Prazo de retenção.** O sistema apaga triagens após `RETENCAO_DIAS` (hoje 180). Definir o prazo com o CRAS e informá-lo ao cidadão.
3. **Direitos do titular.** O bot aceita o comando *apagar* em qualquer etapa (com confirmação) e as boas-vindas avisam disso. Casos urgentes de violência ainda abertos **não** são apagados, para a equipe poder agir; validar essa exceção.
4. **Responsável.** Informar quem responde pelos dados (o grupo, durante o projeto; o município, numa fase 2).
5. **Uso para treinar o modelo.** O texto fala em "melhorar este serviço". Se as mensagens forem usadas para treino, deixar isso explícito ("usar sua mensagem, sem identificar você, para ensinar o sistema").

## 5. Checklist antes de usar qualquer relato

- [ ] Origem registrada (`cras_real`, `profissional_descaracterizado`, `simulado`, `correcao_cidadao`).
- [ ] Sem nome, documento, telefone, endereço, e-mail ou local identificável (guia de rotulagem, seção 2).
- [ ] Em relato de violência, bairro também removido.
- [ ] Rotulado conforme o guia e, na amostra de validação, conferido pelo profissional.
- [ ] Arquivo guardado só no repositório privado; nunca em grupo de WhatsApp, e-mail pessoal ou nuvem aberta.
- [ ] Conjunto de teste separado **antes** de qualquer ajuste do modelo (guia, seção 8).
