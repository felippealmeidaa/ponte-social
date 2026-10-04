import json
import random

# Padrões de templates e variações para cada classe
TEMPLATES = {
    "renda_beneficio": [
        "Estou desempregado há {meses} meses e sem dinheiro para sustentar meus {filhos} filhos, preciso de benefício.",
        "Como faço para solicitar o Bolsa Família? Minha renda familiar é menor que um salário mínimo.",
        "Não temos nenhuma renda em casa no momento, preciso urgente de ajuda financeira do governo.",
        "Gostaria de saber se tenho direito ao BPC LOAS, estou sem trabalho e sem recursos.",
        "Cortaram minha luz e não tenho dinheiro para comer ou comprar gás, preciso de auxílio.",
        "Fui demitido e não consegui seguro desemprego, como conseguir benefício emergencial?",
        "Minha família vive de bicos e a renda não dá para as contas básicas, quero dar entrada no auxílio.",
        "Gostaria de solicitar a tarifa social de energia elétrica e o auxílio gás para minha residência.",
        "Preciso de apoio financeiro da assistência social da prefeitura para a minha família.",
        "Sou mãe solo de {filhos} crianças e não tenho renda fixa, como receber o benefício social?"
    ],
    "cadastro_atualizacao": [
        "Preciso atualizar meu Cadastro Único pois mudei de casa recentemente.",
        "Meu Bolsa Família foi bloqueado porque meu CadÚnico está desatualizado.",
        "Quero incluir meu novo filho no Cadastro Único da minha família.",
        "Onde posso tirar o comprovante com o número do NIS do meu CadÚnico?",
        "Recebi um aviso no aplicativo para fazer o recadastramento obrigatório do CadÚnico.",
        "Como faço para agendar a atualização cadastral no posto de atendimento do município?",
        "Gostaria de verificar se a folha resumo do meu Cadastro Único está ativa.",
        "Preciso comprovar renda com o extrato do CadÚnico para conseguir isenção em concurso.",
        "Meu cadastro único faz mais de dois anos que não atualizo, o que devo levar?",
        "Quero saber o endereço do CRAS para renovar os dados do cadastro único."
    ],
    "moradia": [
        "Fui despejado da minha casa de aluguel e estou morando de favor com parentes.",
        "Minha casa está com rachaduras graves e risco de desabamento com as chuvas fortes.",
        "Não tenho onde morar na cidade e estou em situação de rua, preciso de abrigo.",
        "Gostaria de saber como se cadastrar no programa municipal de aluguel social.",
        "Moro em área de risco condenada pela defesa civil, para onde posso ir?",
        "Preciso de auxílio habitacional pois minha família não consegue pagar o aluguel.",
        "Tivemos nossa casa inundada pela enchente e perdemos tudo, onde conseguir moradia?",
        "Existe cadastro aberto para casas populares da prefeitura no município?",
        "Estou dormindo em um barraco improvisado sem saneamento e sem condições básicas.",
        "Procuro acolhimento temporário ou abrigo comunitário para passar a noite com segurança."
    ],
    "documentacao": [
        "Perdi todos os meus documentos num assalto e não tenho como pagar a segunda via.",
        "Preciso de uma declaração de hipossuficiência para tirar certidão de nascimento de graça.",
        "Não tenho RG nem CPF para poder procurar emprego e me cadastrar em programas.",
        "Meu filho não foi registrado no cartório ainda, como conseguir certidão gratuita?",
        "Preciso da 2ª via da certidão de casamento e identidade, mas não tenho dinheiro para taxas.",
        "Onde consigo atendimento gratuito para emitir a nova Carteira de Identidade Nacional?",
        "Perdi minha carteira de trabalho física e meus documentos pessoais, como regularizar?",
        "Preciso de orientação do CRAS para conseguir gratuidade em documentos civis.",
        "Gostaria de saber o horário do cartório ou Vapt Vupt para emissão de certidão de óbito sem taxa.",
        "Fui furtado e estou sem nenhum documento oficial com foto."
    ],
    "alimentacao": [
        "Não temos absolutamente nada para comer hoje em casa, meus filhos estão chorando de fome.",
        "Preciso com urgência de uma cesta básica de alimentos da prefeitura.",
        "Onde posso conseguir doação de leite e fórmula infantil para o meu bebê?",
        "Gostaria de saber o endereço e horário de funcionamento do restaurante comunitário popular.",
        "Estamos sem alimentos e sem gás de cozinha, onde peço socorro alimentar?",
        "Gostaria de saber se o CRAS entrega cesta básica emergencial para famílias sem renda.",
        "Procuro doação de comida e mantimentos para idoso que mora sozinho e não tem o que comer.",
        "Preciso de ajuda de segurança alimentar pois a despensa está completamente vazia.",
        "Minha família está passando fome, por favor nos ajude com cesta de alimentos.",
        "Onde fica o banco de alimentos municipal para cadastro de famílias carentes?"
    ],
    "pessoa_idosa_pcd": [
        "Minha mãe idosa de 82 anos precisa de cadeira de rodas e fraldas geriátricas do SUS/CRAS.",
        "Tenho deficiência física permanente e preciso dar entrada no BPC LOAS para PCD.",
        "Como funciona o centro dia ou centro de convivência para idosos na nossa cidade?",
        "Preciso da carteirinha de passe livre municipal para levar meu filho com autismo às terapias.",
        "Meu avô mora sozinho e sofre de problemas de saúde, tem serviço de visitação domiciliar do CRAS?",
        "Tenho laudo médico comprovando deficiência severa e busco orientação sobre benefícios sociais.",
        "Gostaria de saber onde conseguir auxílio para compra de prótese ou órtese pelo município.",
        "Sou idoso com mais de 65 anos e não tenho aposentadoria, posso receber ajuda social?",
        "Procuro acolhimento em instituição de longa permanência (ILPI) para idoso em vulnerabilidade.",
        "Preciso de apoio e orientação para emissão da carteira de identificação da pessoa com TEA."
    ],
    "trabalho_renda": [
        "Quero me cadastrar no Sine para receber oportunidades de emprego na minha área.",
        "Gostaria de saber sobre cursos gratuitos de formação profissional oferecidos pela prefeitura.",
        "Estou desempregado e procuro cursos de qualificação em informática ou atendimento.",
        "Onde posso receber orientação profissional e ajuda para formatar meu currículo?",
        "Tenho interesse em programas de apoio ao jovem aprendiz e primeiro emprego.",
        "Como funciona a Sala do Empreendedor para regularizar meu negócio informal e MEI?",
        "Gostaria de participar das feiras municipais de artesanato e economia solidária.",
        "Procuro vagas de emprego com urgência para sustentar minha casa.",
        "Existem oficinas de capacitação e geração de renda no CRAS do meu bairro?",
        "Gostaria de saber quais cursos técnicos estão com inscrições abertas na cidade."
    ],
    "violencia_protecao": [
        "Meu companheiro me agrediu fisicamente e está me ameaçando de morte, temo pela minha vida.",
        "Estou sofrendo violência doméstica severa e preciso de uma casa abrigo com meus filhos.",
        "Meu vizinho espanca a esposa e as crianças pequenas todos os dias, estão gritando por socorro.",
        "Sofri abuso e agressão dentro de casa e preciso de acolhimento emergencial e medida protetiva.",
        "Meu ex-marido está rondando minha casa armado e quebrou a medida protetiva da justiça.",
        "Estão agredindo e maltratando uma pessoa idosa indefesa na minha vizinhança.",
        "Fui vítima de violência física e psicológica e não tenho para onde fugir com segurança.",
        "Estou trancada no quarto com meus filhos com medo do agressor, onde peço ajuda imediata?",
        "Meu pai está espancando minha mãe agora mesmo, preciso de socorro da polícia e assistência.",
        "Estão ocorrendo abusos e violência grave contra menor de idade nesta residência."
    ]
}

def generate_augmented_dataset(output_path: str):
    dataset = []
    
    for cat, templates in TEMPLATES.items():
        prioridade = "urgente" if cat == "violencia_protecao" else ("alta" if cat in ["moradia", "alimentacao", "renda_beneficio"] else "media")
        
        for t in templates:
            for i in range(3):
                texto = t.replace("{meses}", str(random.randint(2, 18))).replace("{filhos}", str(random.randint(1, 5)))
                dataset.append({
                    "texto": texto,
                    "categoria": cat,
                    "prioridade": prioridade
                })
    
    # Embaralhar
    random.seed(42)
    random.shuffle(dataset)
    
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(dataset, f, indent=2, ensure_ascii=False)
    
    print(f"Dataset ampliado com sucesso! Total de relatos: {len(dataset)}")

if __name__ == "__main__":
    generate_augmented_dataset(r"c:\Users\felip\OneDrive\Documentos\projeto\data\relatos_treino_social.json")
