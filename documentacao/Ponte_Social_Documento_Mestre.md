# Ponte Social - Sistema Inteligente de Encaminhamento Social
## Documento Mestre de Engenharia, Produto, Inteligência Artificial e Gestão Ágil

---

**Instituição:** Centro Universitário de Anápolis - UniEVANGÉLICA  
**Curso:** Bacharelado em Inteligência Artificial / Engenharia de Software  
**Disciplina:** Projeto Integrador (2026/2 · 3º Período)  
**Equipe:** Paula Tomazzelli, Guilherme Henrique Carvalhal, Felippe Almeida e João Victor Domingues  
**Status do Projeto:** MVP Funcional 100% Operacional (163 testes automatizados aprovados)  
**Data:** Outubro de 2026  
**Versão:** 2.0 (Documentação Unificada Oficial)

---

## Sumário

1. [Parte 1: Visão de Produto, Contexto e Estratégia](#parte-1-visão-de-produto-contexto-e-estratégia)
   - 1.1 Contexto e Delimitação do Problema
   - 1.2 Dimensão da Demanda Social em Anápolis-GO
   - 1.3 Proposta de Valor e Posicionamento
   - 1.4 Alinhamento aos Objetivos de Desenvolvimento Sustentável (ODS)
   - 1.5 Análise SWOT (FOFA: Forças, Oportunidades, Fraquezas e Ameaças)
   - 1.6 Canvas de Proposta de Valor e Análise de Alternativas
2. [Parte 2: Engenharia de Requisitos e Personas](#parte-2-engenharia-de-requisitos-e-personas)
   - 2.1 Personas Detalhadas e Mapas de Empatia
   - 2.2 Requisitos Funcionais (RF) com Rastreabilidade
   - 2.3 Requisitos Não-Funcionais (RNF) e Critérios de Aceitação
   - 2.4 Histórias de Usuário (User Stories) em Padrão BDD/Gherkin
3. [Parte 3: Metodologia Ágil e Histórico de Sprints](#parte-3-metodologia-ágil-e-histórico-de-sprints)
   - 3.1 Modelo de Gestão e Definição de Pronto (DoD)
   - 3.2 Histórico das Sprints Concluídas (Sprints 1 a 4)
   - 3.3 Planejamento das Sprints Futuras e Gates de Transição (Sprints 5 e 6)
4. [Parte 4: Arquitetura e Engenharia de Software](#parte-4-arquitetura-e-engenharia-de-software)
   - 4.1 Visão Geral da Arquitetura em Camadas
   - 4.2 Pipeline do Bot de WhatsApp e Trava de Violência
   - 4.3 Painel Web do CRAS: Detalhamento dos 6 Módulos
   - 4.4 Modelagem de Dados e Dicionário de Tabelas
   - 4.5 APIs REST, WebSockets e Mensageria
5. [Parte 5: Inteligência Artificial, NLP e MLOps](#parte-5-inteligência-artificial-nlp-e-mlops)
   - 5.1 Arquitetura Híbrida: Gemini 3.5 Flash e Scikit-Learn Local
   - 5.2 Avaliação Científica Rigorosa e Prevenção de Vazamento
   - 5.3 Laboratório de IA: RAG com Normas Oficiais, Agentes e Fluxos
   - 5.4 MLOps: Aprendizado Ativo com Feedback das Equipes
6. [Parte 6: Segurança, Privacidade e Conformidade LGPD](#parte-6-segurança-privacidade-e-conformidade-lgpd)
   - 6.1 Matriz de Riscos Técnicos e Éticos
   - 6.2 Minimização e Mecanismos Criptográficos (Fernet e Argon2id)
   - 6.3 Políticas de Retenção e Expurgo Programado
7. [Parte 7: Modelo de Negócio B2G, Custos e Roadmap](#parte-7-modelo-de-negócio-b2g-custos-e-roadmap)
   - 7.1 Modelo de Parceria e Venda Governamental (B2G)
   - 7.2 Dimensionamento da Demanda Operacional em Anápolis-GO
   - 7.3 Estimativa Orçamentária Anual de Operação
   - 7.4 Protocolo de Execução do Piloto Supervisionado
8. [Parte 8: Conclusão e Considerações Finais](#parte-8-conclusão-e-considerações-finais)

---

# Parte 1: Visão de Produto, Contexto e Estratégia

### 1.1 Contexto e Delimitação do Problema
O acesso a benefícios e serviços da assistência social pública no Brasil enfrenta um gargalo histórico que não reside na ausência de programas governamentais, mas sim na **barreira de descoberta e no atrito burocrático de entrada**.

O cidadão em situação de vulnerabilidade comumente desconhece:
1. Qual serviço público atende à sua necessidade emergencial ou contínua;
2. Quais documentos comprobatórios deve reunir antes de comparecer presencialmente;
3. Qual unidade física (CRAS, CREAS, Centro POP ou Posto do Cadastro Único) é a referência geográfica para o seu endereço;
4. Se o local está com atendimento aberto no momento do deslocamento.

Como consequência direta, as unidades de atendimento básico da assistência social (especialmente os Centros de Referência de Assistência Social — CRAS) recebem filas desordenadas de cidadãos. Os profissionais técnicos dividem seu tempo escasso entre orientações básicas de triagem e o atendimento especializado, resultando em sobrecarga das equipes e múltiplas viagens frustradas do cidadão por falta de documentação.

### 1.2 Dimensão da Demanda Social em Anápolis-GO
Para ancorar o projeto em uma realidade concreta e auditável, o município de **Anápolis-GO** foi adotado como território piloto. Os dados oficiais consolidados junto ao Ministério do Desenvolvimento e Assistência Social, Família e Combate à Fome (MDS / SAGI / MI Social, referência setembro/2026) demonstram a envergadura do público-alvo:

| Indicador Social em Anápolis-GO | Métrica Oficial | Fonte |
| :--- | :--- | :--- |
| **População Residente** | 398.817 habitantes | IBGE (Censo 2022) |
| **Famílias no Cadastro Único (CadÚnico)** | 65.518 famílias (156.626 pessoas) | MDS / MI Social (set/2026) |
| **Famílias em Faixa de Baixa Renda no CadÚnico** | 20.869 famílias | MDS / MI Social (set/2026) |
| **Famílias Beneficiárias do Bolsa Família** | 9.669 famílias (30.345 pessoas) | MDS / MI Social (set/2026) |
| **Valor Médio do Benefício Bolsa Família** | R$ 655,99 por família/mês | MDS / MI Social (set/2026) |
| **Beneficiários do BPC (Idosos / PCD)** | 6.661 idosos e 5.641 pessoas com deficiência | MDS (ago/2026) |
| **Rede de Proteção Básica e Especial** | 4 CRAS, 2 CREAS, 1 Centro POP, 1 Posto Central CadÚnico | CadSUAS (Consulta Pública) |

### 1.3 Proposta de Valor e Posicionamento
O **Ponte Social** é uma plataforma que atua na interseção entre o cidadão e a rede socioassistencial:
- **Para o Cidadão:** Oferece um canal acolhedor, gratuito e sem atritos no WhatsApp (o aplicativo já instalado no cotidiano da população). O usuário relata sua situação em linguagem natural (texto ou áudio, em português ou espanhol), recebe orientação clara sobre os benefícios cabíveis, lista de documentos exigidos, endereço e rota da unidade de referência com indicação em tempo real de **"Aberto agora / Fechado"** (com validação de feriados locais).
- **Para a Equipe do CRAS:** Disponibiliza um painel web intuitivo onde os casos chegam pré-triados e ordenados por urgência. Situações graves têm prioridade absoluta no topo da fila, os relatos são descaracterizados e os técnicos contam com ferramentas de agendamento, Live Chat em tempo real via WebSocket e geração automática de relatórios mensais oficiais.

> ⚖️ **Princípio Reitor:** O sistema **orienta e organiza a triagem**; quem **avalia, concede ou indefere** benefícios é exclusivamente o profissional assistente social. O software jamais automatiza juízos de direito.

### 1.4 Alinhamento aos Objetivos de Desenvolvimento Sustentável (ODS)
O projeto está estritamente vinculado à Agenda 2030 da Organização das Nações Unidas:
- **ODS 16 (Paz, Justiça e Instituições Eficazes) · Meta 16.6:** *Desenvolver instituições eficazes, responsáveis e transparentes em todos os níveis*. O Ponte Social confere transparência, rastreabilidade e auditabilidade à porta de entrada da assistência social, eliminando filas invisíveis e tempos mortos de espera.
- **ODS 10 (Redução das Desigualdades) · Meta 10.2:** *Empoderar e promover a inclusão social, econômica e política de todos*. A solução viabiliza o acesso facilitado a direitos sociais a indivíduos sem letramento burocrático e sem fluência digital avançada.

### 1.5 Análise SWOT (Matriz FOFA)

| Dimensão | Fatores Positivos (Alavancas) | Fatores Negativos (Desafios) |
| :---: | :--- | :--- |
| **Ambiente Interno** | **FORÇAS (Strengths)**<br>• Zero barreira de instalação: roda diretamente no WhatsApp.<br>• Trava determinística e imediata de violência (190, 180, 100, CREAS).<br>• Arquitetura híbrida com modelo local de fallback para resiliência.<br>• Conformidade estrita com LGPD (Fernet, Argon2id, expurgo automático).<br>• 163 testes automatizados garantindo estabilidade ponta a ponta. | **FRAQUEZAS (Weaknesses)**<br>• Modelo supervisionado treinado com dados simulados (84 relatos).<br>• Recall de violência do classificador local em 70% (mitigado pela trava prévia).<br>• Uso da Evolution API com chip não-verificado na fase inicial.<br>• Falta de validação em campo com usuários e técnicos reais. |
| **Ambiente Externo** | **OPORTUNIDADES (Opportunities)**<br>• Centralização e digitalização da demanda socioassistencial em Anápolis-GO, integrando os 4 CRAS e 2 CREAS.<br>• Exigências do MDS por digitalização e metas de busca ativa municipal.<br>• Parceria inicial com a rede de assistência social de Anápolis-GO para obtenção de dados reais.<br>• Extensão direta para a API oficial da Meta (WhatsApp Business Cloud API). | **AMEAÇAS (Threats)**<br>• Risco de bloqueio do chip de WhatsApp pelo algoritmo anti-spam da Meta.<br>• Resistência de equipes de assistência habituadas ao papel e formulários legados.<br>• Ciclos de contratação pública municipais lentos e burocráticos.<br>• Mudanças intempestivas na legislação de benefícios sociais. |

### 1.6 Canvas de Proposta de Valor e Análise de Alternativas

| Critério de Comparação | Atendimento Presencial CRAS | Disque Social 121 (MDS) | Meu CadÚnico / Aplicativo Gov.br | **Ponte Social** |
| :--- | :---: | :---: | :---: | :---: |
| **Canal de Acesso** | Fila física na unidade | Ligação telefônica | Aplicativo móvel dedicado | **WhatsApp (texto e voz)** |
| **Exigência de Letramento** | Média a Alta | Média | Alta (login Gov.br e navegação) | **Nenhuma (linguagem natural livre)** |
| **Necessidade de Nome do Programa** | Exigida no guichê | Exigida no menu de voz | Exigida na busca do app | **Não exigida (IA extrai a dor)** |
| **Indicação da Unidade Correta** | Não (o cidadão já foi ao local) | Genérica nacional | Apenas endereço estático | **Mapeamento dinâmico + Aberto Agora** |
| **Impacto na Fila do Técnico** | Sobrecarga presencial | Nulo | Nulo | **Casos pré-triados e priorizados** |
| **Cuidado em Violência Doméstica** | Depende da recepção | Direciona discagem | Inexistente | **Trava imediata e supressão de mensagens** |

---

# Parte 2: Engenharia de Requisitos e Personas

### 2.1 Personas Detalhadas e Mapas de Empatia

#### Persona 1: Dona Maria da Silva (Cidadã em Vulnerabilidade)
- **Perfil Demográfico:** 34 anos, mãe solo de três filhos (2, 6 e 11 anos), residente na Vila Jaiara em Anápolis-GO. Ensino fundamental incompleto. Desempregada há três meses após trabalhar como diarista informal.
- **Dores e Frustrações:** Já gastou passagens de ônibus indo até o centro da cidade apenas para descobrir que o serviço era prestado no CRAS Norte e que faltavam certidões de nascimento dos filhos. Sente vergonha e ansiedade ao tentar explicar sua situação nos balcões públicos.
- **Objetivos:** Conseguir alimentação emergencial para os filhos, regularizar a inscrição no Cadastro Único para restabelecer o Bolsa Família e saber onde fica o posto de atendimento mais próximo antes de sair de casa.
- **Comportamento Digital:** Utiliza um smartphone simples com tela trincada. Não tem espaço na memória para baixar novos aplicativos. Utiliza o WhatsApp diariamente para mensagens de texto e áudio por ser a única aplicação inclusa no pacote pré-pago.

#### Persona 2: Carlos Eduardo Santos (Assistente Social do CRAS)
- **Perfil Demográfico:** 41 anos, graduado em Serviço Social, técnico concursado atuando no CRAS Sul de Anápolis há 7 anos.
- **Dores e Frustrações:** Atende em média 35 pessoas por dia em um computador antigo com monitor de baixa resolução. Perde mais da metade da jornada respondendo a dúvidas repetitivas sobre documentos e benefícios, restando pouco tempo para atendimentos aprofundados a famílias em risco extremo.
- **Objetivos:** Ter uma fila de acolhimento organizada, onde casos urgentes (como violação de direitos e desabrigo) fiquem em evidência no topo da lista. Precisa acessar o resumo prévio da situação da família antes que ela entre na sala de atendimento.
- **Comportamento Digital:** Utiliza sistemas governamentais legados (CadÚnico e prontuários eletrônicos municipais). Valoriza interfaces limpas, rápidas, de alto contraste e que não exijam dezenas de cliques para alterar o status de um caso.

#### Persona 3: Dra. Helena Vasconcelos (Coordenadora de Vigilância Socioassistencial)
- **Perfil Demográfico:** 50 anos, assistente social com especialização em Gestão Pública, responsável pela coordenação técnica da rede de assistência do município.
- **Dores e Frustrações:** Dificuldade crônica em extrair métricas territoriais consolidadas. Os relatórios mensais demoram semanas para serem compilados a partir de planilhas manuais enviadas pelos quatro CRAS e dois CREAS da cidade. Falta de visibilidade em tempo real sobre bairros desassistidos.
- **Objetivos:** Monitorar indicadores de demanda territorial, tempo médio de espera para primeiro atendimento, taxas de resolutividade e dispor de relatórios automatizados (PDF e Excel) para prestação de contas à Secretaria Municipal e ao Ministério Público.

---

### 2.2 Requisitos Funcionais (RF) com Rastreabilidade

| Código | Requisito Funcional | Descrição Detalhada | Prioridade (MoSCoW) | Módulo do Sistema |
| :---: | :--- | :--- | :---: | :--- |
| **RF-01** | **Acolhimento Conversacional no WhatsApp** | O sistema deve processar relatos em linguagem natural livre enviados via WhatsApp por texto ou áudio (com transcrição via IA), em português e espanhol. | Must Have | Bot / Webhooks |
| **RF-02** | **Trava de Emergência para Violência** | Detectando sinais de agressão ou perigo iminente, o sistema deve interromper imediatamente o fluxo, fornecer contatos de emergência (190, 180, 100, CREAS), marcar o caso como URGENTE no painel e suprimir mensagens automáticas subsequentes. | Must Have | Triagens / Bot |
| **RF-03** | **Classificação de Necessidades** | O sistema deve classificar o relato do usuário em uma das 8 categorias socioassistenciais padronizadas (ou encaminhar para o 121 caso não haja aderência). | Must Have | Pipeline LLM / ML |
| **RF-04** | **Identificação da Unidade e Horário** | A partir do bairro, CEP ou localização enviada, o sistema deve mapear a unidade física de referência (CRAS) e calcular o status "Aberto agora / Fechado" com consideração de feriados. | Must Have | Unidades / Geo |
| **RF-05** | **Fila Priorizada no Painel Web** | O painel deve disponibilizar a fila de triagens organizadas por criticidade (casos urgentes no topo), permitindo filtragem por status, período e unidade. | Must Have | Painel (Fila) |
| **RF-06** | **Live Chat e Atendimento Humano** | O assistente social deve poder assumir a conversa do WhatsApp em tempo real via WebSocket, pausando as respostas automáticas do bot e liberando o fluxo ao concluir. | Must Have | Live Chat / WS |
| **RF-07** | **Agendamento com Link Móvel** | O técnico deve poder marcar a data/hora do atendimento presencial, gerando confirmação automática no WhatsApp com link `.ics` nativo para adição à agenda do celular. | Should Have | Triagens / Agenda |
| **RF-08** | **Upload e Cifragem de Documentos** | O cidadão pode enviar fotos de documentos comprobatórios via WhatsApp, as quais devem ser armazenadas de forma criptografada e visualizadas apenas por técnicos autenticados. | Should Have | Documentos / Cripto |
| **RF-09** | **Consulta do Calendário Bolsa Família** | O usuário deve poder consultar o dia exato do pagamento do benefício informando o último dígito do seu NIS (com base no calendário oficial MDS 2026). | Should Have | Bot / Calendário |
| **RF-10** | **Consulta de Status pelo Cidadão** | O comando "meu pedido" deve informar ao cidadão no WhatsApp em qual etapa de análise sua solicitação se encontra. | Should Have | Bot / Triagens |
| **RF-11** | **Exportação de Relatórios Oficiais** | O painel deve permitir a geração e download do Relatório Mensal consolidado da unidade em formato PDF e planilha Excel (`.xlsx`). | Must Have | Relatórios / MLOps |
| **RF-12** | **Agrupamento Semântico de Temas** | O sistema deve executar clusterização não-supervisionada (K-means) sobre os relatos recebidos para indicar carências territoriais emergentes. | Could Have | MLOps / Temas |
| **RF-13** | **Customização No-Code de Mensagens** | A coordenação deve poder editar os textos de orientação devolvidos pelo bot e as opções de fluxo específicas para cada CRAS através de interface web. | Should Have | Configurações |
| **RF-14** | **Base de Conhecimento RAG** | O sistema deve indexar normas e cartilhas oficiais, permitindo busca semântica por significado (embeddings) com fallback por palavras-chave. | Should Have | RAG / Laboratório |
| **RF-15** | **Modo de Demonstração Isolado** | O sistema deve fornecer um ambiente controlado capaz de injetar até 60 casos fictícios para apresentações e testes sem misturar com registros de produção. | Could Have | Gestão / Demo |

---

### 2.3 Requisitos Não-Funcionais (RNF)

| Código | Requisito Não-Funcional | Categoria | Métrica e Critério de Aceitação |
| :---: | :--- | :--- | :--- |
| **RNF-01** | **Criptografia em Repouso (LGPD)** | Segurança | Telefones de contato e arquivos de documentos devem ser armazenados com cifragem simétrica Fernet (AES-128-CBC com HMAC). Chave armazenada em variável de ambiente restrita. |
| **RNF-02** | **Hashing de Senhas Administrativas** | Segurança | Todas as credenciais de acesso ao painel devem ser derivadas com o algoritmo Argon2id (salt aleatório, 8+ caracteres). |
| **RNF-03** | **Anonimização de Relatos** | Privacidade | O pipeline deve higienizar o relato livre antes de persistir, expurgando CPFs, e-mails e padrões explícitos de números de telefone. |
| **RNF-04** | **Tempo de Resposta em Fallback** | Desempenho | O modelo de Machine Learning local deve classificar o relato em no máximo 500 ms na ausência de resposta da API do Gemini. |
| **RNF-05** | **Resiliência e Continuidade Operacional** | Confiabilidade | Em caso de timeout ou indisponibilidade da IA em nuvem (Gemini), o fluxo deve degradar graciosamente para o modelo local sem travamentos. |
| **RNF-06** | **Acessibilidade e Usabilidade Web** | Usabilidade | A interface web do painel deve respeitar contraste mínimo WCAG AA e viabilizar navegação completa por teclado. |
| **RNF-07** | **Controle de Acesso Baseado em Papéis** | Segurança | O sistema deve restringir telas e ações a quatro perfis formais: `tecnico`, `recepcao`, `coordenacao` e `admin`, com isolamento de dados por unidade. |
| **RNF-08** | **Expurgo Programado de Dados** | Privacidade | Rotina assíncrona executada na inicialização deve expurgar triagens após `RETENCAO_DIAS` e fotos de documentos após 30 dias do caso arquivado. |
| **RNF-09** | **Comunicação Segura em Tempo Real** | Arquitetura | Notificações de novos casos e mensagens do Live Chat devem trafegar via WebSocket assíncrono com reconexão automática. |
| **RNF-10** | **Isolamento de Testes** | Qualidade | Toda a suíte de 163 testes automatizados deve executar isolada de variáveis do `.env`, rodando em banco SQLite in-memory com mocks de rede. |

---

### 2.4 Histórias de Usuário (User Stories) em Padrão BDD/Gherkin

#### US-01: Acolhimento e Orientação Primária no WhatsApp
- **Como** cidadão em situação de vulnerabilidade,  
- **Quero** relatar minha necessidade com minhas próprias palavras no WhatsApp,  
- **Para que** eu saiba exatamente quais documentos levar e em qual CRAS comparecer, sem perder viagens.  
```gherkin
Cenário: Cidadão relata perda de emprego e desabastecimento
  Dado que o cidadão aceitou os termos de LGPD
  E informou o bairro "Vila Jaiara"
  Quando ele envia o relato:
    "perdi o emprego e não tenho comida em casa"
  Então o sistema deve reconhecer as necessidades:
    "alimentação" e "trabalho e cursos"
  E deve solicitar confirmação do diagnóstico
  E após a confirmação "1", fornece o endereço do CRAS Norte
  E informa status do plantão: "🟢 Aberto agora"
  E indica pontos de alimentação emergencial
  E lista documentos necessários (RG, CPF e Comprovante).
```

#### US-02: Trava de Proteção Imediata para Situações de Violência
- **Como** pessoa em situação de violência doméstica ou risco iminente,  
- **Quero** receber orientação direta e confidencial de socorro imediato,  
- **Para que** minha integridade física seja preservada e nenhuma mensagem automática coloque minha segurança em risco.  
```gherkin
Cenário: Cidadão relata agressão doméstica
  Dado que o cidadão está interagindo com o bot
  Quando envia mensagem relatando violência iminente
  Então o sistema interrompe a triagem comum
  E aciona a Trava de Proteção Emergencial
  E responde orientando canais de socorro (190, 180 e 100)
  E direciona ao CREAS municipal de Anápolis
  E marca caso na fila com status "URGENTE_CREAS"
  E bloqueia mensagens automáticas adicionais ao número.
```

#### US-03: Fila de Casos Priorizada e Atendimento Humanizado
- **Como** assistente social do CRAS,  
- **Quero** visualizar a fila de casos recebidos ordenados por criticidade e poder assumir a conversa no chat,  
- **Para que** eu atenda com máxima rapidez quem mais precisa e dialogue diretamente com a família.  
```gherkin
Cenário: Técnico assume o atendimento de um caso urgente
  Dado que existem 10 casos na fila do painel
  E 1 caso possui status "URGENTE_CREAS"
  Quando o assistente social acessa a "Fila de Casos"
  Então o caso urgente surge fixado no topo da listagem
  E ao clicar em "Assumir Atendimento":
    • O bot de WhatsApp é silenciado para o cidadão
    • O técnico inicia diálogo via chat web em tempo real.
```

#### US-04: Consulta Descomplicada de Pagamento do Bolsa Família
- **Como** beneficiário do Programa Bolsa Família,  
- **Quero** consultar a data exata do crédito do meu benefício informando meu NIS no WhatsApp,  
- **Para que** eu não precise me deslocar até a agência bancária ou ao CRAS apenas para obter essa informação.  
```gherkin
Cenário: Cidadão consulta calendário do benefício
  Dado que o munícipe está em atendimento no WhatsApp
  Quando pergunta: "quando cai meu bolsa família? final 7"
  Então o sistema extrai o dígito final de NIS "7"
  E consulta a tabela oficial de pagamentos do MDS 2026
  E informa a data exata de liberação do mês corrente.
```

#### US-05: Geração de Relatório Oficial da Unidade
- **Como** coordenadora da assistência social municipal,  
- **Quero** exportar o consolidado estatístico da minha unidade em PDF e Excel com um clique,  
- **Para que** eu possa instruir auditorias e cumprir as obrigações mensais de prestação de contas ao MDS.  
```gherkin
Cenário: Coordenadora emite o relatório mensal
  Dado que a gestora tem perfil "coordenacao"
  Quando acessa "Indicadores › Relatório do Mês"
  E clica na opção "Exportar Excel (.xlsx)"
  Então o sistema consolida o período e gera planilha ABNT
  E inclui total de triagens e tempo médio de espera
  E insere cabeçalho formal da Prefeitura de Anápolis-GO.
```

---

# Parte 3: Metodologia Ágil e Histórico de Sprints

### 3.1 Modelo de Gestão e Definição de Pronto (DoD)
O desenvolvimento seguiu uma adaptação pragmática do framework **Scrum**, com iterações regulares de quatro semanas. 

**Definição de Pronto (Definition of Done - DoD):**  
Nenhum item de backlog foi considerado concluído sem satisfazer cumulativamente:
1. Funcionalidade desenvolvida e executável sem exceções de runtime;
2. Cobertura por testes automatizados (pytest no backend, typecheck no frontend);
3. Documentação técnica atualizada no repositório;
4. Revisão por pelo menos outro integrante do grupo.

### 3.2 Histórico das Sprints Concluídas

```text
┌─────────────────────────────────────────────────────────┐
│ FLUXO DO CRONOGRAMA SEMESTRAL DE DESENVOLVIMENTO        │
├─────────────────────────────────────────────────────────┤
│ [Sprint 1: Sem. 1-4]   ──► Marco 1: Descoberta & Pesquisa│
│          │                                              │
│          ▼                                              │
│ [Sprint 2: Sem. 5-8]   ──► Bot WhatsApp & NLP Local     │
│          │                                              │
│          ▼                                              │
│ [Sprint 3: Sem. 9-13]  ──► Marco 2: Painel CRAS & LGPD  │
│          │                                              │
│          ▼                                              │
│ [Sprint 4: Sem. 14-16] ──► MLOps, Testes & MVP Operante │
└─────────────────────────────────────────────────────────┘
```

#### Sprint 1 (Semanas 1 a 4 · Marco 1): Descoberta e Arquitetura Conceitual
- **Objetivo da Sprint:** Delimitar o problema da assistência social em Anápolis, extrair dados públicos e validar a viabilidade técnica da solução.
- **Entregáveis Concluídos:**
  - Extração e análise exploratória da base do Ministério do Desenvolvimento Social (MDS / MI Social) de Anápolis;
  - Levantamento cadastral dos 4 CRAS, 2 CREAS e Centro POP via CadSUAS;
  - Especificação do modelo relacional inicial de dados em SQLite;
  - Construção do primeiro protótipo de bot em linha de comando;
  - Apresentação e defesa aprovada do Marco 1.

#### Sprint 2 (Semanas 5 a 8): Motor de WhatsApp e Diálogo Guiado
- **Objetivo da Sprint:** Viabilizar a recepção e o processamento de mensagens reais de WhatsApp via contêiner autohospedado.
- **Entregáveis Concluídos:**
  - Configuração da infraestrutura Docker com PostgreSQL 16, Redis 7 e Evolution API v2;
  - Criação do adaptador desacoplado de mensageria para permitir alternância futura com a Meta Cloud API;
  - Implementação da máquina de estados conversacional do bot (aceite LGPD, identificação territorial por bairro, relato e confirmação);
  - Desenvolvimento do primeiro pipeline supervisionado de NLP com scikit-learn (8 classes de necessidade);
  - Implementação inicial da Trava de Violência determinística.

#### Sprint 3 (Semanas 9 a 13 · Marco 2): Painel Operacional do CRAS e Segurança
- **Objetivo da Sprint:** Construir a interface web de gestão para os assistentes sociais e implementar salvaguardas rigorosas de privacidade.
- **Entregáveis Concluídos:**
  - Criação da aplicação web em React 19, TypeScript, Vite e Tailwind CSS;
  - Implementação da Fila de Casos com priorização cromática e ordenação de urgência no topo;
  - Desenvolvimento do sistema de autenticação com tokens JWT e senhas derivadas com Argon2id;
  - Cifragem reversível Fernet para telefones de munícipes e arquivos de documentos anexados;
  - Implementação do mapa geográfico e mapa de calor por bairro em Leaflet;
  - Exportação inicial de relatórios estatísticos mensais.

#### Sprint 4 (Semanas 14 a 16 · Sprint Atual): MLOps, Resiliência e Automação
- **Objetivo da Sprint:** Elevar o nível de qualidade e robustez técnica do sistema com validação científica e testes automatizados.
- **Entregáveis Concluídos:**
  - Implementação de canal WebSocket (`/ws/chat/{tenant_id}`) para Live Chat bidirecional em tempo real;
  - Integração do motor de calendário de pagamentos do Bolsa Família 2026 com base no final do NIS;
  - Algoritmo de cálculo dinâmico "Aberto agora / Fechado" com consideração do calendário de feriados de Anápolis;
  - Avaliação científica do modelo de Machine Learning com StratifiedGroupKFold, bootstrap e teste de McNemar;
  - Ampliação da cobertura de testes para **163 testes automatizados em 29 arquivos (100% passando)**;
  - Automação da inicialização no Windows via `iniciar.bat` com túnel Cloudflare integrado para links móveis.

---

### 3.3 Planejamento das Sprints Futuras e Gates de Transição

```text
┌─────────────────────────────────────────────────────────┐
│ GATES DE TRANSIÇÃO E CRONOGRAMA DE IMPLANTAÇÃO          │
├─────────────────────────────────────────────────────────┤
│ [Sprint 4: Atual]       MVP Operacional & 163 Testes    │
│          │                                              │
│          ▼                                              │
│ [Sprint 5: Sem. 17-19]  Hardening VPS & Banca Final     │
│          │                                              │
│          ▼                                              │
│ ═══╡ GATE 1: Parecer Ético, HTTPS e Convênio CRAS ╞═══  │
│          │                                              │
│          ▼                                              │
│ [Sprint 6: Piloto 0-3m] Operação em 1 CRAS de Anápolis  │
│          │                                              │
│          ▼                                              │
│ ═══╡ GATE 2: Validação Empírica & Aprovação Equipe ╞══  │
│          │                                              │
│          ▼                                              │
│ [Expansão: 3-12 Meses]  Escalar nos 4 CRAS de Anápolis  │
└─────────────────────────────────────────────────────────┘
```

#### Sprint 5 (Semanas 17 a 19 · Fechamento do Semestre e Banca Final):
- **Objetivo:** Preparar a aplicação para publicação segura em VPS, ensaio cronometrado da apresentação e encerramento do semestre letivo.
- **Backlog Prioritário:**
  - Instalação e teste da Evolution API e da aplicação em VPS com certificado SSL/HTTPS e chip dedicado;
  - Implementação de middleware de limitação de taxa de requisições (rate limiting) para proteção contra ataques de negação de serviço (DoS);
  - Ensaio cronometrado de 12 minutos do roteiro de apresentação com teste do Plano B;
  - Fechamento da documentação e geração do PDF final consolidado.

#### 🚪 GATE 1: Critérios de Liberação do Piloto em Unidade Real
O início do piloto prático com famílias reais está condicionado ao cumprimento irrestrito de três premissas obrigatórias:
1. **Publicação com HTTPS ativo e proteção de webhook:** Nenhum dado trafega sem criptografia em trânsito.
2. **Parecer Ético e Aprovação do Orientador:** Validação do Termo de Consentimento Livre e Esclarecido e confirmação sobre a necessidade de submissão ao Comitê de Ética em Pesquisa (CEP/UniEVANGÉLICA).
3. **Termo de Parceria com 1 CRAS de Anápolis:** Acordo formal de colaboração com a coordenação de uma unidade pública.

#### Sprint 6 (Pós-Semestre · 0 a 3 Meses): Piloto Supervisionado em 1 CRAS
- **Objetivo:** Rodar a plataforma em ambiente assistido, coletando relatos reais para elevar a acurácia do modelo de IA.
- **Backlog Prioritário:**
  - Acompanhamento semanal presencial da equipe do CRAS parceiro operando o painel;
  - Coleta e rotulagem de 100 a 300 relatos reais anonimizados junto aos assistentes sociais;
  - Definição do piso aceitável de recall de violência em conjunto com a equipe técnica do serviço social;
  - Retreino do classificador local e reavaliação com Intervalo de Confiança de 95%;
  - Medição de indicadores de impacto (redução de viagens perdidas por falta de documentos e tempo até o primeiro atendimento).

#### 🚪 GATE 2: Critérios de Liberação para Expansão
A expansão para as demais unidades socioassistenciais depende da comprovação empírica de valor no piloto:
- Zero incidentes de falha na Trava de Violência durante todo o período do piloto;
- Avaliação positiva de usabilidade por mais de 80% dos assistentes sociais participantes.

---

### 3.4 Product Backlog Geral Priorizado

A tabela a seguir consolida o **Product Backlog Oficial do Ponte Social**, ordenado pela prioridade técnica e de negócio, com a estimativa de esforço relativo em Story Points (escala de Fibonacci) e a alocação em cada ciclo:

| ID | Item do Backlog / Entrega | Épico Associado | Prioridade | Story Points | Sprint Alocada | Status |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: |
| **PB-01** | Extração e estruturação de indicadores de Anápolis (MDS / CadÚnico) | Descoberta & Dados | Must | 5 | Sprint 1 | Concluído |
| **PB-02** | Mapeamento cadastral da rede de proteção do CadSUAS | Descoberta & Dados | Must | 3 | Sprint 1 | Concluído |
| **PB-03** | Modelagem relacional do banco de dados (SQLAlchemy assíncrono) | Engenharia de Dados | Must | 8 | Sprint 1 | Concluído |
| **PB-04** | Subida dos contêineres Docker (PostgreSQL 16, Redis 7 e Evolution API) | Infraestrutura | Must | 8 | Sprint 2 | Concluído |
| **PB-05** | Adaptador de mensageria agnóstico de canal (Evolution / Meta) | Infraestrutura | Should | 5 | Sprint 2 | Concluído |
| **PB-06** | Máquina de estados do diálogo guiado de acolhimento no WhatsApp | Bot WhatsApp | Must | 13 | Sprint 2 | Concluído |
| **PB-07** | Pipeline de classificação supervisionada inicial (scikit-learn 8 classes) | Inteligência Artificial | Must | 8 | Sprint 2 | Concluído |
| **PB-08** | Implementação da Trava Determinística de Segurança para Violência | Segurança & Proteção | Must | 13 | Sprint 2 | Concluído |
| **PB-09** | Interface web do CRAS em React 19 + TypeScript + Tailwind CSS | Painel do CRAS | Must | 13 | Sprint 3 | Concluído |
| **PB-10** | Fila de casos operacional com priorização cromática de urgência | Painel do CRAS | Must | 8 | Sprint 3 | Concluído |
| **PB-11** | Autenticação JWT com derivação de senhas Argon2id e controle por perfil | Segurança & Proteção | Must | 8 | Sprint 3 | Concluído |
| **PB-12** | Criptografia simétrica Fernet de telefones e documentos anexados | LGPD & Privacidade | Must | 8 | Sprint 3 | Concluído |
| **PB-13** | Visualização geográfica e mapas de calor territoriais via Leaflet | Indicadores | Should | 5 | Sprint 3 | Concluído |
| **PB-14** | Live Chat bidirecional em tempo real via WebSocket (`/ws/chat/{tenant_id}`) | Atendimento Humano | Must | 13 | Sprint 4 | Concluído |
| **PB-15** | Motor de consulta do calendário oficial do Bolsa Família 2026 por NIS | Bot WhatsApp | Should | 5 | Sprint 4 | Concluído |
| **PB-16** | Algoritmo dinâmico de status "Aberto agora / Fechado" com feriados | Regras de Negócio | Should | 5 | Sprint 4 | Concluído |
| **PB-17** | MLOps: Avaliação com StratifiedGroupKFold, bootstrap e McNemar | Inteligência Artificial | Must | 8 | Sprint 4 | Concluído |
| **PB-18** | Expansão da suíte de testes unitários e de integração para 163 testes | Qualidade de Software | Must | 8 | Sprint 4 | Concluído |
| **PB-19** | Automação de inicialização via `iniciar.bat` e túnel seguro Cloudflare | DevOps Local | Should | 5 | Sprint 4 | Concluído |
| **PB-20** | Publicação segura em VPS com certificado SSL/HTTPS e chip dedicado | Plataforma & Deploy | Must | 8 | Sprint 5 | Em Andamento |
| **PB-21** | Middleware de Rate Limiting para proteção contra abusos de API | Segurança de Rede | Should | 5 | Sprint 5 | Em Andamento |
| **PB-22** | Ensaio cronometrado de demonstração e validação do Plano B | Gestão & Apresentação | Must | 5 | Sprint 5 | Em Andamento |
| **PB-23** | Piloto assistido em 1 unidade de CRAS de Anápolis | Operação em Campo | Must | 21 | Sprint 6 (Piloto) | Backlog Futuro |
| **PB-24** | Coleta e rotulagem de 100 a 300 relatos reais anonimizados com CRAS | Dados & IA | Must | 13 | Sprint 6 (Piloto) | Backlog Futuro |
| **PB-25** | Retreino com relatos reais e definição de piso de recall com profissional | Inteligência Artificial | Must | 13 | Sprint 6 (Piloto) | Backlog Futuro |
| **PB-26** | Expansão para os 4 CRAS de Anápolis e encaminhamento interinstitucional | Escala & Produto | Could | 21 | Fase 2 | Backlog Futuro |
| **PB-27** | Migração do conector de mensageria para a WhatsApp Cloud API da Meta | Infraestrutura Cloud | Could | 13 | Fase 2 | Backlog Futuro |

---

### 3.5 Sprint Backlogs Detalhados (Mapeamento de Execução)

#### Sprint 1 Backlog: Fundação e Descoberta (Semanas 1 a 4) — Total: 16 Story Points
- [x] **PB-01:** Mineração e tratamento estatístico dos dados da SAGI/MDS de Anápolis (5 SP)
- [x] **PB-02:** Levantamento das coordenadas e bairros dos CRAS/CREAS no CadSUAS (3 SP)
- [x] **PB-03:** Esquema inicial de banco relacional e modelos SQLAlchemy (8 SP)

#### Sprint 2 Backlog: Recepção WhatsApp e Triagem com NLP (Semanas 5 a 8) — Total: 39 Story Points
- [x] **PB-04:** Configuração da stack de contêineres Docker da Evolution API (8 SP)
- [x] **PB-05:** Criação do adaptador de canal de entrada de webhooks (5 SP)
- [x] **PB-06:** Fluxo guiado conversacional em máquina de estados finitos (13 SP)
- [x] **PB-08:** Trava determinística de corte e socorro em violência doméstica (13 SP)

#### Sprint 3 Backlog: Painel do CRAS e Criptografia LGPD (Semanas 9 a 13) — Total: 42 Story Points
- [x] **PB-09:** SPA em React 19 + TypeScript com Vite e Tailwind CSS (13 SP)
- [x] **PB-10:** Fila operacional priorizada com alertas de casos graves (8 SP)
- [x] **PB-11:** Controle de acessos por papéis com tokens JWT e senhas Argon2id (8 SP)
- [x] **PB-12:** Criptografia Fernet em repouso de dados pessoais sensíveis (8 SP)
- [x] **PB-13:** Mapa interativo de demanda territorial com Leaflet (5 SP)

#### Sprint 4 Backlog: Live Chat, Resiliência MLOps e Testes (Semanas 14 a 16) — Total: 49 Story Points
- [x] **PB-14:** Live Chat em tempo real via WebSockets para assumir atendimentos (13 SP)
- [x] **PB-15:** Consulta dinâmica de pagamento do Bolsa Família por dígito do NIS (5 SP)
- [x] **PB-16:** Motor dinâmico de horário de funcionamento considerando feriados municipais (5 SP)
- [x] **PB-17:** Avaliação estatística sem vazamento com StratifiedGroupKFold e bootstrap (8 SP)
- [x] **PB-18:** Construção de 163 testes automatizados cobrindo toda a aplicação (8 SP)
- [x] **PB-19:** Script Windows `iniciar.bat` com túnel Cloudflare integrado (5 SP)

#### Sprint 5 Backlog: Publicação Segura e Preparação da Banca (Semanas 17 a 19) — Total: 18 Story Points
- [ ] **PB-20:** Publicação em VPS remota com domínio e certificado SSL/HTTPS (8 SP)
- [ ] **PB-21:** Rate Limiter em middleware para evitar sobrecarga de chamadas (5 SP)
- [ ] **PB-22:** Ensaio cronometrado e validação de contingência para a banca (5 SP)

#### Sprint 6 Backlog: Piloto Supervisionado no CRAS (Pós-Semestre · 0 a 3 meses) — Total: 47 Story Points
- [ ] **PB-23:** Implantação piloto assistida com 1 equipe técnica de CRAS (21 SP)
- [ ] **PB-24:** Coleta de 100 a 300 relatos reais anonimizados com consentimento (13 SP)
- [ ] **PB-25:** Retreino e recalibração dos modelos com dados de linguagem real (13 SP)

---

# Parte 4: Arquitetura e Engenharia de Software

### 4.1 Visão Geral da Arquitetura em Camadas
A arquitetura do Ponte Social foi desenhada segundo os princípios da separação de responsabilidades e desacoplamento de dependências externas:

```text
┌─────────────────────────┐     ┌─────────────────────────┐
│  Usuário: WhatsApp Bot  │     │ Assistente: Painel Web  │
└────────────┬────────────┘     └────────────┬────────────┘
             │ (Webhook)                     │ (REST/WebSocket)
             ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│  Evolution API / Docker │     │ React 19 + TypeScript   │
└────────────┬────────────┘     └────────────┬────────────┘
             │                               │
             └───────────────┬───────────────┘
                             ▼
┌─────────────────────────────────────────────────────────┐
│              Camada de API (FastAPI v1)                 │
│   • Autenticação & JWT          • Endpoints de Triagem  │
│   • Middleware CORS             • WebSockets Live Chat  │
└────────────────────────────┬────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────┐
│              Camada de Serviços de Negócio              │
│   • Trava de Violência          • Regras de Plantão     │
│   • Máquina de Estados          • Criptografia Fernet   │
│   • Agendamento & ICS           • Expurgo Programado    │
└──────────────┬───────────────────────────┬──────────────┘
               ▼                           ▼
┌─────────────────────────────┐  ┌────────────────────────┐
│  Inteligência Artificial    │  │ Persistência de Dados  │
│  • Gemini LLM (Nuvem RAG)   │  │ • SQLAlchemy ORM      │
│  • Scikit-Learn Local (NLP) │  │ • SQLite / PG 16       │
└─────────────────────────────┘  └────────────────────────┘
```

### 4.2 Pipeline do Bot de WhatsApp e Trava de Violência
Toda mensagem originada no WhatsApp passa por um funil estrito de decisão assíncrono:
1. **Recepção e Autenticação de Webhook:** A mensagem é recebida no endpoint `/api/v1/webhooks/evolution`, onde o token de segurança da URL é validado.
2. **Checagem Imediata de Violência:** O relato é submetido à análise de expressões de risco e termos agressivos antes de qualquer processamento semântico.
   - *Se positivo:* O fluxo é interrompido imediatamente. A resposta de emergência com 190, 180, 100 e CREAS é expedida; o status da conversa é fixado como urgente e o envio de qualquer mensagem automática de acompanhamento posterior é desativado.
3. **Fluxo de Estados Guiado:** Se não houver violência:
   - `NOVA`: Solicita o consentimento prévio nos termos da LGPD.
   - `AGUARDANDO_LOCAL`: Identifica o bairro por geolocalização, CEP ou digitação livre.
   - `AGUARDANDO_RELATO`: Recebe o relato em linguagem livre (texto ou áudio transcrito).
   - `AGUARDANDO_CONFIRMACAO`: Devolve a síntese compreendida pela IA ("Entendi que você precisa de X. Está certo?").
   - `AGUARDANDO_CONTATO`: Oferece o envio do caso para a fila do CRAS.
   - `FINALIZADA`: Apresenta o roteiro completo com serviços, documentos, endereço da unidade, mapa e o status "Aberto agora / Fechado" com consideração de feriados.

### 4.3 Painel Web do CRAS: Detalhamento dos 6 Módulos

```text
Painel Web do CRAS (Estrutura de 6 Módulos):
├── 1. Atendimento: Fila Priorizada e Live Chat
├── 2. Indicadores: Métricas, Temas e Relatório Mensal
├── 3. Bot WhatsApp: Fluxo Visual, Editor e QR Code
├── 4. Classificação: Comparativo IA e Gestão de Treino
├── 5. Laboratório IA: RAG Oficial, Agentes e Copiloto
└── 6. Gestão: Unidades CadSUAS, Equipe e Alertas
```

1. **Módulo Atendimento:**
   - *Fila de Casos:* Listagem paginada e ordenada por prioridade (casos urgentes destacados no topo). Cada linha exibe o bairro, a necessidade identificada, a data de entrada e o status. A ficha do caso permite revelação de telefone auditada com justificativa de acesso, download de fotos de documentos anexados e agendamento presencial.
   - *Conversas (Live Chat):* Ambiente de mensageria em tempo real conectado via WebSocket à rota `/ws/chat/{tenant_id}`. Permite ao técnico enviar mensagens de texto livres diretamente para o WhatsApp do cidadão e devolver a conversa ao bot quando desejar.
2. **Módulo Indicadores:**
   - *Painel Estatístico:* Gráficos consolidados de volume de atendimentos por categoria de necessidade, distribuição por bairros e mapas de calor territoriais gerados via Leaflet.
   - *Temas dos Relatos:* Agrupamento semântico K-Means que descobre sozinho temas correlatos a partir dos relatos livres recebidos, servindo como termômetro territorial para a assistência.
   - *Relatório do Mês:* Visão gerencial com resumo quantitativo e filtros mensais, exportável em PDF e planilha Excel (`.xlsx`).
3. **Módulo Bot do WhatsApp:**
   - *Fluxo da Conversa:* Visualizador gráfico das etapas conversacionais.
   - *Respostas por Necessidade:* Editor sem código para configurar textos de orientação específicos por categoria e por CRAS.
   - *Testar o Bot:* Simulador interativo que processa diálogos idênticos ao WhatsApp real utilizando o mesmo banco de dados.
   - *Conexão do WhatsApp:* Interface de pareamento via QR Code com a Evolution API.
4. **Módulo Classificação (MLOps):**
   - *Modelo de IA:* Painel comparativo de acurácia, F1-macro e matriz de confusão entre o Gemini e os classificadores locais (SVM, Regressão Logística, Naive Bayes).
   - *Dados de Treino:* Gerenciador de sentenças rotuladas com suporte a importação de planilhas Excel (`docs/modelo_relatos_treino.xlsx`).
5. **Módulo Laboratório de IA (Isolado no Painel):**
   - *Base de Conhecimento:* Indexação e visualização dos 20 documentos oficiais compilados, com busca híbrida (vetorial por significado + textual).
   - *Agentes e Fluxos:* Sandbox para experimentação de agentes autônomos e criação de diagramas de decisão.
   - *Copiloto:* Assistente inteligente para suporte interno das equipes.
6. **Módulo Gestão:**
   - *Unidades de Atendimento:* Cadastro oficial dos 4 CRAS, 2 CREAS, Centro POP e CadÚnico de Anápolis.
   - *Equipe e Acesso:* Gerenciamento de credenciais com papéis `tecnico`, `recepcao`, `coordenacao` e `admin`.
   - *Alertas:* Configuração de limiares de tempo para emissão de avisos de fila parada (+10 minutos).
   - *Demonstração:* Controle de injeção e limpeza de até 60 casos fictícios para apresentações acadêmicas.

### 4.4 Modelagem de Dados e Dicionário de Tabelas

```text
ESQUEMA RELACIONAL PRINCIPAL:
┌─────────────────┐            ┌─────────────────┐
│    conversas    │──(1 : N)──►│    mensagens    │
│ (sessão do bot) │            │ (histórico chat)│
└────────┬────────┘            └─────────────────┘
         │
     (1 : 1)
         ▼
┌─────────────────┐            ┌─────────────────┐
│    triagens     │──(N : 1)──►│ unidades_atend. │
│ (casos na fila) │            │ (CRAS / CREAS)  │
└─────────────────┘            └─────────────────┘
```

| Tabela | Campos Principais | Finalidade |
| :--- | :--- | :--- |
| `triagens` | `id`, `protocolo`, `categoria`, `prioridade`, `status`, `relato_anonimizado`, `telefone_cifrado`, `bairro`, `unidade_id`, `created_at` | Registro central do caso encaminhado à fila do CRAS. Guarda dados sensíveis criptografados. |
| `conversas` | `id`, `hash_telefone`, `etapa_fluxo`, `atendimento_humano`, `unidade_id`, `updated_at` | Armazena o estado atual da máquina de diálogo do WhatsApp identificado pelo hash do número. |
| `mensagens` | `id`, `conversa_id`, `direcao`, `conteudo`, `created_at` | Histórico cronológico das mensagens trocadas entre o cidadão e o bot ou assistente social. |
| `unidades_atendimento`| `id`, `nome`, `tipo`, `endereco`, `bairros_atendidos`, `horario_funcionamento`, `telefone` | Registro oficial das unidades socioassistenciais do município extraídas do CadSUAS. |
| `usuarios` | `id`, `login`, `nome`, `senha_hash`, `papel`, `unidade_id`, `ativo`, `ultimo_acesso` | Credenciais administrativas do painel protegidas com hash Argon2id. |
| `documentos_anexos` | `id`, `triagem_id`, `nome_arquivo`, `conteudo_cifrado`, `created_at` | Fotos e comprovantes enviados pelo cidadão armazenados sob criptografia Fernet. |
| `base_conhecimento` | `id`, `titulo`, `fonte`, `conteudo`, `embedding` | Vetores e trechos das legislações sociais para o mecanismo RAG. |

---

# Parte 5: Inteligência Artificial, NLP e MLOps

### 5.1 Arquitetura Híbrida: Gemini 1.5 Flash e Scikit-Learn Local
A arquitetura de Inteligência Artificial opera segundo uma estratégia de **dupla camada com redundância operacional**:
1. **Camada Primária (Google Gemini 1.5 Flash):**
   - Utilizada para compreensão contextual profunda da fala informal e dialetos locais do WhatsApp;
   - Transcrição de mensagens de voz enviadas em arquivos de áudio;
   - Extração estruturada de múltiplas intenções simultâneas em formato JSON rigoroso;
   - Geração de embeddings semânticos para a Base de Conhecimento RAG.
2. **Camada de Reserva (Modelo Local Scikit-Learn):**
   - Opera localmente no servidor sem consumir tráfego externo ou incorrer em custos de API;
   - Assume instantaneamente a triagem caso a chamada ao Gemini exceda o timeout de tolerância ou atinja limite de requisições;
   - Pipeline composto por vetorização TF-IDF combinada com o classificador Linear SVM / Regressão Logística.

### 5.2 Avaliação Científica Rigorosa e Prevenção de Vazamento
A avaliação dos modelos locais foi concebida sob rigor metodológico estrito (`backend/app/services/ml/train_evaluator.py`), visando transparência total para a banca avaliadora:
- **Detecção de Vazamento em Versões Anteriores:** Em estágios iniciais, o grupo constatou que a replicação de frases-modelo gerava um falso F1-score de 1,0 devido ao vazamento de instâncias correlatas entre o treino e o teste.
- **Correção Metodológica:** Foi instituída a validação cruzada `StratifiedGroupKFold (k=5)`, que agrupa obrigatoriamente variações de uma mesma frase no mesmo fold.
- **Conjunto de Teste Independente:** Utilização de **80 relatos informais inéditos** (`data/relatos_teste_informais.json`), redigidos simulando a escrita real de WhatsApp e jamais utilizados nas etapas de treino ou escolha de hiperparâmetros.
- **Tratamento Estatístico:** Cálculo de Intervalos de Confiança de 95% via Bootstrap (1.000 iterações) e aplicação do Teste de Hipótese de McNemar.

| Modelo Avaliado | F1-Macro (CV) | F1-Macro (Teste) | IC 95% (Teste) | Recall Violência (Teste) |
| :--- | :---: | :---: | :---: | :---: |
| **Linha de Base 1: Classe Majoritária** | 0,036 | 0,028 | — | 0% |
| **Linha de Base 2: Palavras-Chave** | 0,873* | 0,613 | — | 0% |
| **Regressão Logística (TF-IDF)** | 0,570 ± 0,120 | 0,717 | 0,614 – 0,801 | 60% |
| **Naive Bayes Multinomial** | 0,473 ± 0,129 | 0,697 | 0,585 – 0,783 | 30% |
| **Linear SVM (Melhor na Validação Cruzada)** | 0,581 ± 0,125 | 0,692 | 0,582 – 0,774 | 60% |
| **Sistema Completo (Trava Violência + SVM + Léxico)** | — | **0,678** | **0,552 – 0,763** | **70%** |

*\* Desempenho artificialmente elevado no CV decorrente de regras léxicas derivadas das próprias frases de treinamento.*

> 💡 **Leitura Acadêmica dos Resultados:** A diferença estatística entre a Regressão Logística e o Linear SVM não foi significativa (McNemar $p = 0,63$). O índice de revocação de violência do modelo estatístico (70%) confirma cientificamente a obrigatoriedade da **trava determinística de regras** implementada na porta de entrada da aplicação.

### 5.3 Laboratório de IA: RAG com Normas Oficiais
A Base de Conhecimento do sistema conta com **20 documentos oficiais compilados**, higienizados e expurgados de trechos revogados:
- Leis Federais: Lei do Bolsa Família, Lei Orgânica da Assistência Social (LOAS), Marco Legal do CadÚnico, Benefício de Prestação Continuada (BPC), Tarifa Social de Energia Elétrica, Auxílio Gás, Lei Maria da Penha, Estatuto da Pessoa Idosa, Estatuto da Criança e do Adolescente (ECA), Lei Berenice Piana (Autismo/CIPTEA) e Lei de Gratuidade de Certidões;
- Manuais Oficiais: Tipificação Nacional de Serviços Socioassistenciais do SUAS, Guias de Perguntas Frequentes do MDS, canais de denúncia Ligue 180, Disque 100 e CVV;
- O motor de busca opera por aproximação vetorial de cosseno quando a chave do Gemini está disponível, chaveando automaticamente para busca textual ponderada em contingência.

---

# Parte 6: Segurança, Privacidade e Conformidade LGPD

### 6.1 Matriz de Riscos Técnicos e Éticos

| Risco Mapeado | Probabilidade | Impacto | Medida Preventiva Implementada no Sistema |
| :--- | :---: | :---: | :--- |
| **Caso de violência não identificado pela IA** | Média | Crítico | Trava determinística baseada em léxico de emergência antes de acionar a IA; recall com revisão humana mandatória. |
| **Vazamento de dados pessoais ou sensíveis** | Baixa | Crítico | Anonimização prévia de relatos, criptografia Fernet em repouso de telefones e documentos, hashing de credenciais com Argon2id. |
| **Bloqueio do chip de WhatsApp pelo provedor** | Média | Alto | Ausência de disparos em massa, mensagens enviadas apenas em resposta reativa ao munícipe e adaptador desacoplado para migração à Meta. |
| **Encaminhamento a unidade com horário fechado** | Média | Médio | Algoritmo dinâmico que cruza o horário do CadSUAS e a tabela de feriados de Anápolis, exibindo o status em tempo real. |
| **Instabilidade ou indisponibilidade de IA em nuvem** | Média | Médio | Fallback instantâneo para o classificador local scikit-learn treinado em disco. |

### 6.2 Minimização e Mecanismos Criptográficos
- **Princípio da Minimização:** Durante a triagem, o bot não coleta CPF, número de RG, dados bancários ou endereço residencial completo (apenas o bairro é armazenado para determinação da unidade de referência).
- **Criptografia Simétrica (Fernet):** Telefones e documentos anexados são criptografados no banco com chaves de 256 bits geradas de forma pseudoaleatória. A revelação do telefone no painel web requer ação deliberada do assistente social e grava log de auditoria com identificação do usuário e carimbo de tempo.
- **Proteção de Acesso:** O painel exige login autenticado via tokens JWT com tempo de expiração curto e renovação segura via refresh tokens.

### 6.3 Políticas de Retenção e Expurgo Programado
Em observância aos direitos dos titulares preconizados na Lei Geral de Proteção de Dados (Lei nº 13.709/2018):
- **Expurgo Automático:** Ao iniciar o backend, uma rotina assíncrona exclui integralmente registros de triagens cujo prazo de retenção (`RETENCAO_DIAS`) tenha expirado;
- **Eliminação de Documentos:** Fotos e comprovantes de documentos são compulsoriamente apagados do sistema 30 dias após o arquivamento definitivo do caso;
- **Direito de Eliminação:** O cidadão dispõe do comando **"apagar meus dados"** a qualquer momento no WhatsApp, provocando a remoção imediata de suas conversas e dados cadastrais vinculados.

---

# Parte 7: Modelo de Negócio B2G, Custos e Roadmap

### 7.1 Modelo de Parceria e Venda Governamental (B2G)
O modelo de sustentabilidade econômica do Ponte Social baseia-se na prestação de serviços para a administração pública municipal (Business-to-Government — B2G):
- **Gratuidade Total para o Cidadão:** O munícipe não paga qualquer taxa para utilizar o assistente de WhatsApp;
- **Contratação pelo Município:** A Prefeitura ou Secretaria Municipal de Assistência Social contrata a plataforma sob a modalidade de software como serviço (SaaS), amparada pelo Marco Legal das Startups (Lei Complementar nº 182/2021) ou por dispensa/inexigibilidade de licitação para soluções inovadoras.

### 7.2 Dimensionamento da Demanda Operacional em Anápolis-GO

O projeto concentra seu foco e operação prioritária no município de **Anápolis-GO**, dimensionando a capacidade técnica e operacional para cobrir toda a demanda socioassistencial da cidade:
- **Rede de Cobertura Física:** 4 CRAS (Norte, Sul, Leste e Tarumã), 2 CREAS, 1 Centro POP e 1 Posto Central do Cadastro Único;
- **População em Vulnerabilidade:** 65.518 famílias cadastradas no CadÚnico e 9.669 famílias beneficiárias do Bolsa Família (dados oficiais MDS/SAGI);
- **Capacidade Operacional Projetada:** Atendimento estimado de **3.000 famílias atendidas por mês** distribuídas entre as unidades da rede socioassistencial;
- **Volume Conversacional:** Média projetada de **10 mensagens enviadas por conversa**, totalizando **30.000 mensagens entregues por mês** em velocidade plena.

---

### 7.3 Estimativa Orçamentária Anual de Operação (Rede de Anápolis-GO)

Para viabilizar uma proposta comercial enxuta, defensável perante a banca e atrativa para a Secretaria Municipal de Assistência Social de Anápolis, levantou-se a composição de custos de infraestrutura e operação com base no volume de **3.000 atendimentos mensais** e **30.000 mensagens**:

#### 1. Consumo de Inteligência Artificial (GPT 6 Luna com RAG e Sistema):
Diferente de um chatbot comum, o Ponte Social executa um pipeline robusto que consome tokens em múltiplas etapas:
- **System Prompt Base e Regras de Segurança:** Diretrizes de acolhimento humanizado, taxonomia das 8 categorias socioassistenciais, travas determinísticas de violência, regras de anonimização e formatação estruturada de saída (JSON) — consumindo entre **1.500 e 2.000 tokens** fixos por chamada;
- **Recuperação e Injeção de Contexto RAG (Base de Conhecimento):** Ao identificar a intenção ou dúvidas específicas (LOAS, Bolsa Família, BPC, Tarifa Social, etc.), o mecanismo busca e injeta de 2 a 4 trechos compilados das legislações sociais oficiais, adicionando de **2.500 a 4.500 tokens** de contexto legal por consulta;
- **Múltiplos Turnos de Diálogo:** A conversa completa com o cidadão (aceite, localização, relato, confirmação, dúvidas como *"não entendi"* ou *"o que preciso levar?"*) acumula o histórico;
- **Processamento no Painel (Copiloto e Análises):** Geração de resumos prévios na ficha do assistente social e clusterização semântica periódica dos temas dos relatos.

**Dimensionamento Médio por Atendimento Completo:**
- **Tokens de Entrada (Input):** Média de **10.000 tokens** por jornada de atendimento (somando prompt de sistema, chunks legais do RAG, histórico e interações);
- **Tokens de Saída (Output):** Média de **1.000 tokens** (orientações completas, síntese, extração JSON e resumo para o painel).

**Cálculo de Custos no GPT 6 Luna ($0,10 / 1M input e $0,50 / 1M output) para 3.000 atendimentos/mês:**
- *Input:* $3.000 \times 10.000 = 30.000.000\text{ tokens (30 M)} \times \$0,10 = \$3,00\text{ USD}$;
- *Output:* $3.000 \times 1.000 = 3.000.000\text{ tokens (3 M)} \times \$0,50 = \$1,50\text{ USD}$;
- *Subtotal Atendimento:* $\$4,50\text{ USD}$ (~R$ 25,50 / mês);
- *Margem para Copiloto e Análise de Temas no Painel do CRAS:* ~R$ 19,50 / mês;
- **Custo Total Estimado de IA:** **~R$ 45,00 / mês** (**R$ 540,00 / ano**).

---

#### 2. Mensageria WhatsApp (API Oficial da Meta / WhatsApp Business Cloud API):
Para sustentar a operação em produção sem as instabilidades e riscos de banimento de conexões não-oficiais (como a Evolution API em ambiente local), a plataforma utiliza a **WhatsApp Cloud API oficial da Meta** através de seu adaptador de mensageria desacoplado.

**Modelo de Cobrança da Meta (atualizado com a política de mensagens entregues):**
- O sistema opera exclusivamente no modelo **Inbound (Receptivo)**, respondendo apenas a mensagens enviadas pelo cidadão (sem disparos ativos de marketing);
- **Franquia Gratuita:** A Meta fornece uma cota mensal de **1.000 mensagens entregues gratuitas por mês** para cada conta empresarial (WABA);
- **Tarifa Excedente:** Cada mensagem entregue além da franquia gratuita custa **R$ 0,035 por mensagem entregue**;
- **Volume por Atendimento:** Média projetada de **10 mensagens enviadas por conversa** (acolhimento, localização, triagem, checagem de dúvidas de documentos, endereço com horário de funcionamento, confirmação de contato e notificações da equipe);
- **Cálculo para o Volume de 3.000 Atendimentos/Mês em Anápolis:**
  - Total de mensagens enviadas: $3.000 \times 10\text{ msgs} = 30.000\text{ mensagens/mês}$;
  - Mensagens faturadas (após deduzir a franquia): $30.000 - 1.000 = 29.000\text{ mensagens}$;
  - Custo Meta: $29.000 \times \text{R\$ } 0,035 = \mathbf{R\$\ 1.015,00\text{ / mês}}$ (**R$ 12.180,00 / ano**).

---

#### 3. Servidor em Nuvem (VPS Otimizada):
- Servidor Linux dedicado (4 vCPU, 8 GB RAM, 80 GB SSD NVMe) em provedor de nuvem estável (Hetzner, Contabo ou Linode). Sustenta com folga operacional o backend FastAPI assíncrono, banco de dados PostgreSQL 16, Redis para filas e o proxy reverso com SSL: **R$ 85,00 / mês** (**R$ 1.020,00 / ano**).

#### 4. Linha Telefônica e Manutenção do Chip:
- Utilização de **1 único chip pré-pago** dedicado exclusivamente à conta do WhatsApp Business da assistência social de Anápolis;
- Custo de aquisição inicial: taxa única de ~R$ 15,00;
- Sem planos pós-pagos caros: recargas de manutenção (R$ 20,00 a cada 2 ou 3 meses) para garantir que a linha não expire na operadora por inatividade: média de **R$ 7,50 / mês** (**R$ 90,00 / ano**).

#### 5. Domínio e Certificado Digital:
- Domínio anual oficial (`.com.br` = R$ 40,00/ano ou `.gov.br` gratuito para a prefeitura) com certificado SSL/TLS Let's Encrypt automatizado e gratuito: **R$ 3,50 / mês** (**R$ 42,00 / ano**).

#### 6. Armazenamento e Backups:
- **Custo R$ 0,00:** O armazenamento dos dados relacionais, fichas e logs utiliza o próprio disco SSD de alta velocidade da VPS (80 GB suporta anos de dados textuais e logs comprimidos), com rotinas automatizadas de backup diário exportadas localmente.

---

### Quadro Resumo do Orçamento Anual de Operação (Anápolis-GO)

| Componente Operacional | Especificação Técnica / Provedor | Custo Mensal Estimado | Custo Anual Estimado |
| :--- | :--- | :---: | :---: |
| **WhatsApp Cloud API (Meta)**| 30.000 msgs/mês (1.000 gratuitas + 29.000 faturadas a R$ 0,035) | R$ 1.015,00 | R$ 12.180,00 |
| **Servidor VPS (Cloud)** | 4 vCPU, 8 GB RAM, 80 GB SSD NVMe (FastAPI + Banco + Web) | R$ 85,00 | R$ 1.020,00 |
| **Inteligência Artificial** | **GPT 6 Luna** ($0,10 / 1M in · $0,50 / 1M out — 3.000 casos com RAG) | R$ 45,00 | R$ 540,00 |
| **Linha Telefônica (Chip)** | 1 chip pré-pago único com recargas de manutenção periódicas | R$ 7,50 | R$ 90,00 |
| **Domínio e Certificado SSL**| Domínio `.com.br` / `.gov.br` com TLS Let's Encrypt | R$ 3,50 | R$ 42,00 |
| **Armazenamento e Backups** | Armazenamento no SSD da VPS e backups automatizados | R$ 0,00 | R$ 0,00 |
| **Total Estimado de Sustentação** | **Rede Socioassistencial Completa de Anápolis-GO** | **R$ 1.156,00 / mês** | **R$ 13.872,00 / ano** |

> 💡 **Viabilidade Orçamentária para o Município:** O custo total de **R$ 1.156,00 por mês** (cerca de **R$ 13.800,00 por ano**) cobre o atendimento pleno e ilimitado de **3.000 famílias por mês** e **30.000 mensagens trocadas**, representando um custo unitário irrisório de **menos de R$ 0,39 por família acolhida**. Para a Secretaria Municipal de Assistência Social de Anápolis, trata-se de uma economia monumental frente ao custo de implantação de novos postos físicos ou contratação de centrais convencionais de atendimento.

### 7.4 Protocolo de Execução do Piloto Supervisionado
A abordagem junto à unidade piloto de Anápolis seguirá um roteiro de seis passos objetivos:
1. Apresentação executiva de 5 minutos demonstrando o painel e o simulador de conversa;
2. Apresentação das métricas de honestidade intelectual e das travas de proteção em violência;
3. Solicitação de amostra de 100 a 300 relatos descaracterizados para rotulagem conjunta com assistentes sociais;
4. Definição do piso de recall aceitável de violência com a equipe assistencial;
5. Validação dos endereços, telefones e bairros de abrangência das unidades;
6. Formalização de termo de confidencialidade e fixação de data para expurgo dos dados ao término da experiência.

> 🚨 **Critério de Parada de Emergência do Piloto:** Qualquer caso de violência doméstica ou violação de direitos graves não identificado pela trava, ou qualquer mensagem automática indevida disparada para uma vítima, suspende imediatamente o piloto até que a causa raiz seja identificada, mitigada e validada pela equipe técnica e pelo orientador.

---

### 7.5 Roadmap Detalhado: 3 Horizontes e 2 Gates de Transição

O Roadmap estratégico do Ponte Social estrutura a evolução do sistema desde a conclusão acadêmica até a escala em múltiplos municípios:

```text
┌─────────────────────────────────────────────────────────┐
│ ROADMAP ESTRATÉGICO: 3 HORIZONTES DE EVOLUÇÃO           │
├─────────────────────────────────────────────────────────┤
│ [HORIZONTE 1: AGORA · Semanas 14 a 19]                  │
│ • Publicação em VPS com HTTPS e Rate Limiting           │
│ • Parecer de Governança Ética e Termo de Cooperação     │
│ • Ensaio da Apresentação e Validação do Plano B         │
│          │                                              │
│          ▼                                              │
│ ═══╡ GATE 1: Parecer Ético, HTTPS e Convênio CRAS ╞═══  │
│          │                                              │
│          ▼                                              │
│ [HORIZONTE 2: PRÓXIMO · 0 a 3 Meses pós-semestre]       │
│ • Piloto supervisionado em 1 CRAS de Anápolis-GO        │
│ • Coleta e rotulagem de 100 a 300 relatos reais         │
│ • Retreino do modelo supervisionado com IC de 95%       │
│ • Mensuração empírica de redução de viagens perdidas    │
│          │                                              │
│          ▼                                              │
│ ═══╡ GATE 2: Validação Empírica & Aprovação Equipe ╞══  │
│          │                                              │
│          ▼                                              │
│ [HORIZONTE 3: DEPOIS · 3 a 12 Meses]                    │
│ • Expansão para os 4 CRAS de Anápolis-GO                │
│ • Migração de mensageria para Meta Cloud API oficial    │
│ • Encaminhamento integrado entre CRAS, CREAS e POP      │
│ • Apresentação de proposta comercial B2G à Secretaria   │
└─────────────────────────────────────────────────────────┘
```

#### Tabela de Entregas por Horizonte:

| Horizonte | Entrega / Meta | Frente | Responsável | Dependência | Critério de Conclusão ("Pronto Quando") |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **H1: Agora (Sem. 14-19)** | Publicação com HTTPS e Rate Limiting | Plataforma | Bot & API | VPS e Domínio | Link público ativo sob SSL e webhooks rejeitados sem token. |
| **H1: Agora (Sem. 14-19)** | Parecer sobre LGPD e Comitê de Ética | Governança | Pesquisa | Orientador | Parecer por escrito e decisão formal sobre trâmite no CEP. |
| **H1: Agora (Sem. 14-19)** | Primeiro contato com CRAS parceiro | Parcerias | Pesquisa | Termo validado | Reunião realizada e resposta do CRAS registrada em ata. |
| **H1: Agora (Sem. 14-19)** | Ensaio cronometrado da apresentação | Gestão | Todos | Roteiro 12 min | Demonstração ensaiada e validação do Plano B executada. |
| **H2: Próximo (0-3 meses)** | Piloto supervisionado no CRAS | Validação | Todos | Gate 1 Aprovado | Atendimento de casos reais sob supervisão por 4 semanas. |
| **H2: Próximo (0-3 meses)** | Coleta de 100 a 300 relatos reais | Dados & IA | Modelo | Termo assinado | Base rotulada e índice de concordância entre anotadores medido. |
| **H2: Próximo (0-3 meses)** | Definição do piso de recall de violência | Segurança | Modelo | Equipe CRAS | Piso mínimo aceitável registrado formalmente em documento. |
| **H2: Próximo (0-3 meses)** | Retreino do modelo com relatos reais | MLOps | Modelo | Dados rotulados | Métricas refeitas com IC de 95% e comparadas com baseline. |
| **H2: Próximo (0-3 meses)** | Medição de indicadores de impacto | Impacto | Pesquisa | Piloto ativo | Tempo até atendimento e redução de viagens perdidas medidos. |
| **H3: Depois (3-12 meses)**| Expansão para os 4 CRAS de Anápolis | Escala | Painel Web | Gate 2 Aprovado | Cada unidade operando contas, bairros e fluxos próprios. |
| **H3: Depois (3-12 meses)**| Encaminhamento interinstitucional | Produto | Bot & Painel | Piloto aprovado | Transferência de casos entre CRAS, CREAS e Centro POP. |
| **H3: Depois (3-12 meses)**| Proposta comercial B2G à Secretaria | Negócio | Negócios | Métricas piloto | Proposta de SaaS com precificação e SLA entregue formalmente. |
| **H3: Depois (3-12 meses)**| Migração para Meta Cloud API oficial | Infra | Bot & API | Receita B2G | Transição de canal via adaptador sem alterar a regra de negócio. |

---

### 7.6 Matriz de Metas e Métricas de Impacto

As metas abaixo vinculam o roadmap a números objetivos mensuráveis, ligando a performance técnica do software aos indicadores socioassistenciais dos ODS:

| Dimensão | Indicador de Desempenho | Linha de Base Atual | Meta Estabelecida | Forma de Aferição |
| :--- | :--- | :---: | :---: | :--- |
| **Confiabilidade da IA** | F1-macro no teste cego | 0,678 (dados simulados) | Refazer com dados reais | Avaliação do pipeline de retreino com IC 95% |
| **Segurança Crítica** | Recall da classe Violência | 70% (no modelo isolado) | 100% com Trava de Regra | Zero falso-negativo na esteira de triagem primária |
| **Agilidade no Acolhimento** | Tempo de espera em casos urgentes | Alerta a partir de 10 min | < 5 minutos | Log de auditoria da Fila de Casos no painel |
| **Assertividade de Triagem** | % de encaminhamentos considerados adequados | Sem medição prévia | > 85% dos casos | Avaliação periódica do assistente social no painel |
| **Desburocratização** | Retornos ao CRAS por falta de documentos | Sem medição prévia | Redução de 40% | Questionário amostral aplicado durante o piloto |
| **Acessibilidade Temporal** | Tempo entre relato e orientação do cidadão | Imediato (< 3 segundos) | Manter < 3 segundos | Monitoramento de latência da Evolution API / FastAPI |
| **Satisfação do Munícipe** | Nota média dada pelo cidadão ao final | 4.8 / 5.0 (simulado) | > 4.2 / 5.0 | Módulo de avaliação do bot no WhatsApp |
| **Disponibilidade Operacional**| Uptime da solução em nuvem | Local (100% sob teste) | > 99,5% em produção | Monitoramento contínuo de disponibilidade em VPS |

---

### 7.7 Estratégia de Precificação e Sustentabilidade B2G (Anápolis-GO)

Para a fase de formalização junto à Secretaria Municipal de Integração Social e Assistência de Anápolis-GO, foram estruturadas três modalidades de contratação pública perfeitamente adaptadas à rede municipal:

1. **Mensalidade Global da Rede Municipal (Valor Fixo Global):**
   - *Como funciona:* Valor fixo mensal cobrindo integralmente toda a rede socioassistencial de Anápolis (os 4 CRAS, 2 CREAS, Centro POP e o Posto do Cadastro Único).
   - *Vantagem:* Previsibilidade orçamentária absoluta para a Secretaria Municipal e atendimento ilimitado a todos os bairros da cidade.
2. **Mensalidade por Unidade Socioassistencial Ativa (Adesão Modular):**
   - *Como funciona:* Cobrança calculada pela quantidade de equipamentos públicos ativados no painel operacional (ex: iniciando com a adesão do CRAS Norte e CRAS Sul e expandindo progressivamente para o CRAS Leste e CRAS Tarumã).
   - *Vantagem:* Permite que a prefeitura inicie o investimento de forma fracionada durante o piloto e expanda a contratação conforme a aprovação dos assistentes sociais.
3. **Implantação Inicial + Sustentação Contínua:**
   - *Como funciona:* Taxa inicial de parametrização e saneamento territorial (mapeamento detalhado de bairros e horários do CadSUAS de Anápolis + treinamento presencial das equipes técnicas), acompanhada de mensalidade para cobertura de custos operacionais (servidores, API oficial da Meta e modelos de IA).
   - *Vantagem:* Garante capacitação aprofundada dos técnicos de referência e suporte técnico contínuo da equipe.

---

# Parte 8: Conclusão e Considerações Finais

O **Ponte Social** demonstra como a Inteligência Artificial e a Engenharia de Software podem ser mobilizadas para responder a desafios humanitários urgentes na gestão pública brasileira. Longe de pretender substituir o discernimento insubstituível do assistente social, o sistema posiciona-se como uma infraestrutura inteligente de desoneração operacional: acolhe quem não sabe por onde começar, elimina viagens desnecessárias aos balcões públicos e organiza as demandas dos municípios para que o atendimento humano aconteça onde ele é verdadeiramente insubstituível.

A robustez da solução está evidenciada na sua concepção ética, na transparência metodológica dos testes científicos e na prontidão de um produto funcional respaldado por 163 testes automatizados, pronto para avançar da academia rumo ao impacto real nas políticas públicas de proteção social.

---
*UniEVANGÉLICA · Faculdade de Inteligência Artificial e Engenharia de Software · 2026/2*
