# LeãoHub

Sistema para escritórios de contabilidade, focado na transição da **reforma tributária** (CBS/IBS).

> **Status:** protótipo para validar a ideia. Roda direto no navegador, sem servidor. Os dados ficam salvos no próprio navegador (localStorage).

## Módulos

O menu é dividido em três grupos.

**Reforma tributária**

| Aba | O que faz |
|---|---|
| **Simulador da reforma** (página inicial) | Compara PIS/COFINS (+ ISS) de hoje com CBS (2027–2028) ou CBS + IBS (2033): redução por atividade, créditos, folha sem crédito, crédito acumulado, split payment e dividendos. Copia um resumo pronto para mandar ao cliente. |
| **Cenários PF x PJ** | Situações práticas lado a lado: de quem comprar (PF, MEI, Simples, empresa fora do Simples), lançar despesa no CPF ou no CNPJ, vender para PF ou PJ, pagar parceiro como PF ou PJ, funcionário CLT x PJ e retirada de lucro. Inclui consulta de CNPJ (Simples/MEI). |
| **Tipos de serviço** | Guia pesquisável com dezenas de serviços e o enquadramento de cada um: alíquota cheia, redução de 30%, 40%, 60% ou regime próprio, com base legal e atalho para simular. |
| **O que ainda não está definido** | Quadro com as regras que ainda podem mudar (com prazo, sem data, interpretação/condições) e as limitações do sistema, dizendo como o LeãoHub trata cada uma e onde atualizar. |

**Escritório**

| Aba | O que faz |
|---|---|
| **Clientes** | Cadastro das empresas atendidas (regime, tipo de atividade, faturamento), com busca de dados pelo CNPJ e estimativa da reforma com os lançamentos do mês. |
| **Portal do cliente** | O cliente envia notas e despesas (com consulta do CNPJ do fornecedor) e vê uma estimativa mensal de CBS e créditos. O escritório confere cada envio. |

**Configuração**

| Aba | O que faz |
|---|---|
| **Parâmetros e dados** | Alíquotas de referência editáveis, além de backup (exportar e importar JSON). |

A consulta de CNPJ usa dados públicos da Receita (BrasilAPI, com CNPJá como reserva). A busca pelo nome da empresa não existe em APIs gratuitas.

## Como rodar

Abra o `index.html` no navegador. Não precisa instalar nada.

### Publicar no GitHub Pages
1. No repositório, abra **Settings → Pages**.
2. Em *Source*, escolha **Deploy from a branch**, depois a branch `main` e a pasta `/ (root)`.
3. O sistema fica disponível em `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

## Estrutura

```
index.html                 # layout e menu
styles.css                 # visual
app.js                     # telas, rotas, dados e cálculos
tools/build_preview.py     # gera dist/preview.html (arquivo único) para demonstração
```

## Premissas do simulador

Valores padrão, todos editáveis em **Parâmetros** (revisados em novembro de 2026):

- **CBS 2027–2028: 11,3%.** É a alíquota de referência calculada pelo TCU em 28/10/2026; o Senado fixa até 15/12/2026. Em 2027 e 2028 a cobrança é de 11,2% de CBS + 0,1% de IBS de teste.
- **Regime completo (2033): CBS 9,21% + IBS 18,70% = 27,91%.** É a estimativa do Comitê Gestor do IBS (Resolução CGIBS nº 14/2026), ainda não definitiva. A lei prevê um teto de 26,5%, mas ele não é automático: se a estimativa passar disso, o governo precisa propor medidas de redução.
- Redução por tipo de atividade: saúde (Anexo III) e educação regular (Anexo II) 60%; profissões regulamentadas da lista do art. 127 30%; bares, restaurantes, hotelaria, parques e turismo 40% (regime específico); prestadores de serviços em geral, software/SaaS, cursos online/comunidades/infoprodutos e comércio 0% (alíquota cheia).
- Cursos livres: há interpretações diferentes sobre a redução da educação, por isso o sistema assume alíquota cheia e recomenda confirmar com o contador.
- PIS/COFINS (vigentes até dez/2026): 3,65% cumulativo (Presumido) e 9,25% não cumulativo (Real).
- Crédito sobre compras: alíquota cheia para fornecedor fora do Simples, desde que ele pague o imposto (art. 47). Fornecedor do Simples: crédito só do CBS/IBS pago no DAS, informado na nota (padrão 0%, conservador), a menos que ele pague CBS/IBS "por fora". Folha: não gera crédito.
- Split payment: começa em 2027 de forma opcional e só entre empresas; a obrigatoriedade ainda não tem data.
- Dividendos (Lei 15.270/2025, em vigor desde jan/2026): retenção de 10% sobre o valor total quando a mesma empresa paga mais de R$ 50 mil no mês ao mesmo sócio, além do imposto mínimo anual (IRPFM) para renda acima de R$ 600 mil. O "cenário de 15%" é só uma comparação hipotética: não há lei aprovada.
- Cálculo mensal; os anos intermediários da transição (2029–2032) não são calculados.

> As estimativas não substituem a análise do contador.

## Próximos passos (rumo ao produto)

- [ ] Backend com login por escritório (multiempresa) e acesso separado para o cliente
- [ ] Banco de dados (ex.: Supabase/PostgreSQL) no lugar do localStorage
- [ ] Upload real de notas (PDF/XML) e leitura automática do XML da NF-e
- [ ] Fase de transição da reforma ano a ano (2026–2033)
- [ ] Alertas de prazos e obrigações por cliente
- [ ] Planos e cobrança para os escritórios
