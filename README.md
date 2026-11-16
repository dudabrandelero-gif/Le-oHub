# LeãoHub

Sistema para escritórios de contabilidade, focado na transição da **reforma tributária** (CBS/IBS).

> **Status:** protótipo para validar a ideia. Roda direto no navegador, sem servidor. Os dados ficam salvos no próprio navegador (localStorage).

## Módulos

| Módulo | O que faz |
|---|---|
| **Painel** | Visão geral: clientes, envios pendentes de conferência e tarefas abertas. |
| **Clientes** | Cadastro das empresas atendidas: regime (Simples, Presumido, Real, PF), setor e faturamento. |
| **Simulador da reforma** | Compara PIS/COFINS (+ ISS) de hoje com CBS (+ IBS): redução por setor, créditos sobre compras, folha sem crédito, crédito acumulado, split payment e distribuição de lucros. Copia um resumo pronto para mandar ao cliente. |
| **Cenários PF x PJ** | Situações práticas lado a lado: de quem comprar (PF, MEI, Simples, empresa fora do Simples), lançar despesa no CPF ou no CNPJ, vender para PF ou PJ, pagar parceiro como PF ou PJ, funcionário CLT x PJ e retirada de lucro. |
| **Consulta de CNPJ** | Informa se um fornecedor é do Simples Nacional ou MEI, pelo CNPJ, usando dados públicos da Receita (BrasilAPI, com CNPJá como reserva). Aparece nos Cenários, no Portal do cliente e no cadastro de clientes. A busca pelo nome não existe em APIs gratuitas. |
| **Portal do cliente** | Tela em que o cliente envia notas e despesas e vê uma estimativa mensal de CBS e créditos. O escritório confere cada envio. |
| **Atas e reuniões** | Registro das reuniões com clientes: resumo, orientações, tarefas com responsável e prazo, pontos em aberto. Exporta em Markdown. |
| **Parâmetros** | Alíquotas de referência editáveis, além de backup (exportar e importar JSON). |

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

Valores padrão, todos editáveis em **Parâmetros**:

- CBS de referência: 11,30%. IBS de referência: 18,79%. **Ainda não definidas oficialmente.**
- Redução por setor: saúde e educação 60%, profissões regulamentadas 30%, demais 0%.
- PIS/COFINS: 3,65% cumulativo (Presumido) e 9,25% não cumulativo (Real).
- Crédito sobre compras: alíquota cheia. Compras de fornecedores do Simples: 0%. Folha: não gera crédito.
- Dividendos: isenção até R$ 50 mil/mês e 10% acima disso. Cenário de projeto de lei: 15% sobre qualquer valor.
- Cálculo mensal e no regime pleno, sem as regras da fase de transição (2026–2033).

> As estimativas não substituem a análise do contador.

## Próximos passos (rumo ao produto)

- [ ] Backend com login por escritório (multiempresa) e acesso separado para o cliente
- [ ] Banco de dados (ex.: Supabase/PostgreSQL) no lugar do localStorage
- [ ] Upload real de notas (PDF/XML) e leitura automática do XML da NF-e
- [ ] Fase de transição da reforma ano a ano (2026–2033)
- [ ] Alertas de prazos e obrigações por cliente
- [ ] Planos e cobrança para os escritórios
