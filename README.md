# LeãoHub

Simulador da reforma tributária (CBS/IBS) vendido por assinatura para empresas.

- **Site de vendas:** `index.html`, com proposta, recursos, planos e dúvidas.
- **App:** `app.html`, com login, minhas empresas, simulador, cenários, relatório em PDF e conta.

> **Status:** versão 1. Funciona em **modo demonstração** (dados no navegador, sem senha) até você ligar o Supabase. A cobrança online ainda não está conectada.

## O que o assinante tem

| Área | O que faz |
|---|---|
| **Entrar / teste grátis** | Cadastro com e-mail e senha, teste grátis de 14 dias com recursos do plano Profissional, recuperação de senha. |
| **Minhas empresas** | Cadastro de empresas (busca nome e Simples pelo CNPJ), com limite por plano e histórico de simulações. |
| **Simulador da reforma** | Hoje x CBS (2027–2028) ou x CBS + IBS (2033): redução por atividade, créditos, folha, crédito acumulado, split payment e dividendos. Salva no histórico da empresa. |
| **Relatório (PDF)** | Relatório da simulação pronto para imprimir ou salvar em PDF. Nos planos Profissional e Grupo, sai com o logo, o nome e a cor do assinante. |
| **Cenários PF x PJ** | De quem comprar, CPF x CNPJ, vender para PF ou PJ, parceiro PF ou PJ, CLT x PJ, retirada de lucro. Consulta de CNPJ (Simples/MEI). |
| **Tipos de serviço** | Guia pesquisável com o enquadramento de cada serviço na reforma (cheia, 30%, 40%, 60%, regime próprio). |
| **O que ainda não está definido** | Quadro com as regras que ainda podem mudar e as limitações do sistema. |
| **Minha conta e plano** | Plano atual, dias de teste, plano de interesse, logo, nome e cor da marca. |
| **Parâmetros** | Alíquotas de referência editáveis. |

## Planos

Preços, limites e textos ficam em **`config.js`** e aparecem automaticamente no site e no app.

| Plano | Preço sugerido | Empresas | Relatório com marca própria |
|---|---|---|---|
| Essencial | R$ 39/mês | 1 | não |
| Profissional | R$ 79/mês | 5 | sim |
| Grupo | R$ 149/mês | 20 | sim |

Se mudar o número de empresas de um plano, ajuste também a função `limite_empresas` em `supabase/schema.sql` e rode o arquivo de novo.

## Como ligar o login de verdade (Supabase, gratuito)

1. Crie uma conta em **supabase.com** e clique em **New project**. Escolha um nome, uma senha do banco e a região **South America (São Paulo)**.
2. No projeto, abra **SQL Editor → New query**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Abra **Authentication → URL Configuration**:
   - **Site URL:** `https://dudabrandelero-gif.github.io/Le-oHub/app.html`
   - **Redirect URLs:** adicione a mesma URL.
4. Abra **Project Settings → API** e copie a **Project URL** e a **anon public key**.
5. Cole as duas em `config.js`, nos campos `SUPABASE_URL` e `SUPABASE_ANON_KEY`, e publique.

Pronto: o aviso de "modo demonstração" some, o cadastro passa a pedir senha e cada conta só enxerga os próprios dados. A segurança é garantida pelo próprio banco (Row Level Security).

**Liberar um plano pago para um cliente** (enquanto a cobrança não está ligada): no Supabase, abra **Table Editor → contas** e mude a coluna `plano` de `teste` para `essencial`, `profissional` ou `grupo`.

> A chave "anon public" pode ficar no código: ela é pública por design. Nunca coloque a chave **service_role** no `config.js`.

## Estrutura

```
index.html            # site de vendas
site.css              # visual do site de vendas
app.html              # app (login + menu)
styles.css            # visual do app (inclui o layout de impressão do relatório)
config.js             # chaves do Supabase, planos, dias de teste, contato de vendas
store.js              # dados: modo demonstração (navegador) ou Supabase
app.js                # telas, cálculos e rotas
supabase/schema.sql   # tabelas, segurança por conta, limite de empresas por plano
tools/build_preview.py  # gera dist/app-preview.html (arquivo único) para demonstração
```

## Premissas tributárias

Valores padrão, todos editáveis em **Parâmetros** (revisados em novembro de 2026):

- **CBS 2027–2028: 11,3%.** É a alíquota de referência calculada pelo TCU em 28/10/2026; o Senado fixa até 15/12/2026. Em 2027 e 2028 a cobrança é de 11,2% de CBS + 0,1% de IBS de teste.
- **Regime completo (2033): CBS 9,21% + IBS 18,70% = 27,91%.** É a estimativa do Comitê Gestor do IBS (Resolução CGIBS nº 14/2026), ainda não definitiva. A lei prevê um teto de 26,5%, mas ele não é automático.
- **Reduções por atividade:**
  - 60%: saúde (Anexo III) e educação regular (Anexo II);
  - 30%: profissões regulamentadas do art. 127;
  - 40%: bares, restaurantes, hotelaria, parques e turismo (regime específico);
  - alíquota cheia: serviços em geral, software/SaaS, cursos online e comércio.
- **Crédito:** alíquota cheia para fornecedor fora do Simples (art. 47). Fornecedor do Simples: só o CBS/IBS pago no DAS (padrão 0%, conservador). Folha não gera crédito.
- **Split payment:** começa em 2027 de forma opcional, só entre empresas; a obrigatoriedade ainda não tem data.
- **Dividendos (Lei 15.270/2025):** retenção de 10% sobre o total quando a mesma empresa paga mais de R$ 50 mil no mês ao mesmo sócio, mais o IRPFM anual acima de R$ 600 mil.

> As estimativas não substituem a análise de um contador.

## Próximos passos

- [ ] Ligar a cobrança recorrente (ex.: Asaas ou Mercado Pago), com troca automática de plano
- [ ] Guardar as alíquotas oficiais no servidor (hoje ficam no navegador de cada usuário)
- [ ] Fase de transição da reforma ano a ano (2029–2032)
- [ ] Domínio próprio (ex.: leaohub.com.br)
