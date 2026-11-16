/*
 * LeãoHub — configuração do produto.
 * Este é o único arquivo que você precisa editar para:
 *   1) ligar o login de verdade (Supabase) — cole a URL e a chave pública do seu projeto;
 *   2) mudar preços e limites dos planos;
 *   3) definir o contato para quem quiser assinar enquanto a cobrança não está ligada.
 * Sem as chaves do Supabase, o app funciona em "modo demonstração" (dados só no navegador).
 */
window.LEAOHUB_CONFIG = {
  // Supabase → Project Settings → API. A "anon public key" é pública e pode ficar aqui.
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',

  NOME_PRODUTO: 'LeãoHub',
  DIAS_TESTE: 14,

  // E-mail ou link (ex.: https://wa.me/55...) para quem quiser assinar. Vazio = "cobrança em breve".
  CONTATO_VENDAS: '',

  // Preços sugeridos (R$/mês). Se mudar "empresas", ajuste também a função limite_empresas no supabase/schema.sql.
  PLANOS: [
    {
      id: 'essencial', nome: 'Essencial', preco: 39, empresas: 1, marcaPropria: false, destaque: false,
      resumo: 'Para quem quer entender o impacto da reforma na própria empresa.',
      itens: ['1 empresa (CNPJ)', 'Simulador da reforma 2027 e 2033', 'Cenários PF x PJ e consulta de CNPJ', 'Guia de tipos de serviço', 'Histórico de simulações', 'Relatório em PDF'],
    },
    {
      id: 'profissional', nome: 'Profissional', preco: 79, empresas: 5, marcaPropria: true, destaque: true,
      resumo: 'Para quem tem mais de um CNPJ ou quer apresentar os números com a própria marca.',
      itens: ['Até 5 empresas (CNPJs)', 'Tudo do Essencial', 'Relatório em PDF com o seu logo e as suas cores'],
    },
    {
      id: 'grupo', nome: 'Grupo', preco: 149, empresas: 20, marcaPropria: true, destaque: false,
      resumo: 'Para grupos empresariais e redes com várias unidades.',
      itens: ['Até 20 empresas (CNPJs)', 'Tudo do Profissional'],
    },
  ],
};
