/*
 * LeãoHub — protótipo de sistema para escritórios de contabilidade.
 * Módulos: clientes, simulador da reforma tributária (CBS/IBS), portal do cliente e atas.
 * Sem servidor: os dados ficam no localStorage do navegador.
 */
'use strict';
(function () {
  const STORAGE_KEY = 'leaohub:v1';

  // ---------------------------------------------------------------- constantes
  // Tipos de atividade. A redução vale para a ATIVIDADE vendida (não para a empresa toda).
  const SETORES = {
    saude: {
      nome: 'Saúde (clínica, consultório, odontologia)', reducao: 60,
      dica: 'Serviços de saúde têm redução de 60%: paga-se 40% da alíquota.',
    },
    educacao: {
      nome: 'Educação regular (escola, faculdade, curso técnico)', reducao: 60,
      dica: 'Redução de 60% só para os serviços de ensino listados na lei (Anexo II da LC 214/2025). Outras vendas da escola pagam alíquota cheia.',
    },
    profissional: {
      nome: 'Profissão regulamentada (contador, advogado, engenheiro, arquiteto…)', reducao: 30,
      dica: 'Profissionais liberais de profissões regulamentadas têm redução de 30%.',
    },
    servicos: {
      nome: 'Prestador de serviços em geral (agência, consultoria, marketing, gestão de tráfego)', reducao: 0,
      dica: 'Sem redução: alíquota cheia. Hoje paga ISS (2% a 5%) + PIS/COFINS. Em compensação, ferramentas, anúncios e serviços comprados de empresas fora do Simples geram crédito.',
    },
    software: {
      nome: 'Software e SaaS (vende sistemas, plataformas, assinaturas)', reducao: 0,
      dica: 'Sem redução: alíquota cheia. Vender sistema para escolas NÃO dá direito à redução da educação, porque a redução vale para o ensino, não para o software. Nuvem, licenças e ferramentas compradas geram crédito.',
    },
    digital: {
      nome: 'Cursos online, comunidades pagas e infoprodutos (mentorias, e-books)', reducao: 0,
      dica: 'Em regra, alíquota cheia. Para "cursos livres" há interpretações diferentes sobre a redução da educação: confirme com o contador antes de usar.',
    },
    hospitalidade: {
      nome: 'Bares, restaurantes, hotelaria, parques e turismo', reducao: 40,
      dica: 'Regime específico com redução de 40%. Em bares, restaurantes e hotelaria, o cliente empresa NÃO pode tomar crédito do que paga.',
    },
    cultura: {
      nome: 'Produções artísticas, culturais, jornalísticas e audiovisuais nacionais', reducao: 60,
      dica: 'Redução de 60% para as produções nacionais listadas na lei (art. 139 da LC 214/2025), com condições. Confirme o enquadramento com o contador.',
    },
    geral: {
      nome: 'Comércio (venda de produtos)', reducao: 0,
      dica: 'Sem redução: alíquota cheia, com crédito sobre as mercadorias compradas de empresas fora do Simples.',
    },
  };
  const dicaSetor = (k) => `<div class="muted small setor-dica" style="margin-top:4px">${esc((SETORES[k] || SETORES.geral).dica)}</div>`;
  // Atualiza a dica abaixo de um select de setor quando ele muda.
  document.addEventListener('change', (e) => {
    if (e.target.matches && e.target.matches('select[data-setor]')) {
      const alvo = e.target.parentElement.querySelector('.setor-dica');
      if (alvo) alvo.outerHTML = dicaSetor(e.target.value);
    }
  });
  const REGIMES = {
    simples: 'Simples Nacional',
    presumido: 'Lucro Presumido',
    real: 'Lucro Real',
    pf: 'Pessoa física (carnê-leão)',
  };
  const CATEGORIAS = {
    receita: 'Receita / nota emitida',
    fornecedor: 'Compra de fornecedor (gera crédito)',
    simples: 'Compra de fornecedor do Simples',
    folha: 'Folha de pagamento (não gera crédito)',
    outros: 'Outras despesas (sem crédito)',
  };
  const PARAMS_PADRAO = {
    cbs: 11.3,
    ibs: 18.79,
    pisCofinsCumulativo: 3.65,
    pisCofinsNaoCumulativo: 9.25,
    issPadrao: 3,
    creditoSimples: 0,
    divLimite: 50000,
    divAliqAtual: 10,
    divBase: 'total',
    divAliqPL: 15,
    irPF: 27.5,
    inssAutonomo: 20,
  };

  // ---------------------------------------------------------------- utilidades
  const $app = document.getElementById('app');
  const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const brl = (v) => fmtBRL.format(Number(v) || 0);
  const pct = (v) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : 0; };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const hojeISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const dataBR = (iso) => { if (!iso) return '—'; const [y, m, d] = String(iso).slice(0, 10).split('-'); return d && m && y ? `${d}/${m}/${y}` : esc(iso); };
  const mesBR = (ym) => { const [y, m] = ym.split('-'); return `${m}/${y}`; };
  const linhas = (txt) => String(txt || '').split('\n').map((l) => l.trim()).filter(Boolean);

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2600);
  }

  function copiar(texto) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(() => toast('Copiado!'), () => copiarFallback(texto));
    } else {
      copiarFallback(texto);
    }
  }
  function copiarFallback(texto) {
    const ta = document.createElement('textarea');
    ta.value = texto;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('Copiado!'); } catch (e) { toast('Não foi possível copiar.'); }
    ta.remove();
  }
  // Confirmação desenhada na página (a janela nativa do navegador é bloqueada em alguns ambientes).
  function confirmar(msg, aoConfirmar) {
    const fundo = document.createElement('div');
    fundo.className = 'modal-bg';
    fundo.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><p>${esc(msg)}</p>
      <div class="actions"><button class="btn danger" data-modal="ok">Confirmar</button><button class="btn secondary" data-modal="cancelar">Cancelar</button></div></div>`;
    fundo.addEventListener('click', (e) => {
      const b = e.target.closest('[data-modal]');
      if (!b && e.target !== fundo) return;
      e.stopPropagation();
      fundo.remove();
      if (b && b.dataset.modal === 'ok') aoConfirmar();
    });
    document.body.appendChild(fundo);
    fundo.querySelector('[data-modal=ok]').focus();
  }

  function baixar(nome, conteudo, tipo) {
    const blob = new Blob([conteudo], { type: tipo || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------------------------------------------------------------- consulta de CNPJ (Simples Nacional / MEI)
  // Usa dados públicos da Receita Federal via BrasilAPI e, se falhar, via CNPJá (API aberta).
  const soNumeros = (s) => String(s || '').replace(/\D/g, '');
  const formatarCNPJ = (d) => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

  function cnpjValido(d) {
    if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
    const dv = (base) => {
      let soma = 0, peso = base.length - 7;
      for (let i = 0; i < base.length; i++) { soma += Number(base[i]) * peso--; if (peso < 2) peso = 9; }
      const r = soma % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return dv(d.slice(0, 12)) === Number(d[12]) && dv(d.slice(0, 13)) === Number(d[13]);
  }

  function buscarComLimite(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
  }

  async function buscarCNPJ(entrada) {
    const d = soNumeros(entrada);
    if (d.length !== 14) throw new Error('O CNPJ precisa ter 14 números. Ele aparece na nota fiscal do fornecedor.');
    if (!cnpjValido(d)) throw new Error('Esse CNPJ não é válido. Confira os números.');
    try {
      const r = await buscarComLimite('https://brasilapi.com.br/api/cnpj/v1/' + d);
      if (r.status === 404) throw Object.assign(new Error('CNPJ não encontrado na Receita Federal.'), { definitivo: true });
      if (r.ok) {
        const j = await r.json();
        return {
          cnpj: d, razao: j.razao_social || '', fantasia: j.nome_fantasia || '', situacao: j.descricao_situacao_cadastral || '',
          simples: j.opcao_pelo_simples === true, mei: j.opcao_pelo_mei === true, desde: j.data_opcao_pelo_simples || '', fonte: 'BrasilAPI',
        };
      }
    } catch (e) { if (e.definitivo) throw e; }
    const r2 = await buscarComLimite('https://open.cnpja.com/office/' + d);
    if (!r2.ok) throw new Error('Não foi possível consultar agora. Tente de novo em alguns minutos.');
    const j = await r2.json();
    const emp = j.company || {};
    return {
      cnpj: d, razao: emp.name || '', fantasia: j.alias || '', situacao: (j.status && j.status.text) || '',
      simples: !!(emp.simples && emp.simples.optant), mei: !!(emp.simei && emp.simei.optant), desde: (emp.simples && emp.simples.since) || '', fonte: 'CNPJá',
    };
  }

  // 'mei' | 'simples' | 'regular'
  const tipoEmpresa = (info) => (info.mei ? 'mei' : info.simples ? 'simples' : 'regular');

  function htmlResultadoCNPJ(info) {
    const tipo = tipoEmpresa(info);
    const selo = tipo === 'mei'
      ? '<span class="badge warn">MEI (Simples): praticamente não gera crédito</span>'
      : tipo === 'simples'
        ? `<span class="badge warn">Optante do Simples Nacional${info.desde ? ' desde ' + dataBR(info.desde) : ''}: crédito pequeno ou nenhum</span>`
        : '<span class="badge ok">Não é do Simples: gera crédito cheio</span>';
    return `<div class="cnpj-res"><b>${esc(info.razao)}</b>${info.fantasia ? ` <span class="muted">(${esc(info.fantasia)})</span>` : ''}
      <div>${selo} ${info.situacao ? `<span class="badge">Situação: ${esc(info.situacao)}</span>` : ''}</div>
      <div class="muted small">CNPJ ${formatarCNPJ(info.cnpj)} · fonte: ${esc(info.fonte)} (dados públicos da Receita Federal, podem ter alguns dias de atraso)</div></div>`;
  }

  // Bloco reutilizável: campo + botão. Ao achar a empresa, chama cnpjRetornos[prefixo](info).
  const cnpjRetornos = {};
  const blocoCnpj = (prefixo, rotulo) => `
    <label>${rotulo || 'CNPJ da empresa'}</label>
    <div class="cnpj-box"><input id="${prefixo}-input" data-cnpj="${prefixo}" placeholder="00.000.000/0000-00" inputmode="numeric">
      <button type="button" class="btn secondary" data-action="consultarCnpj" data-id="${prefixo}">Consultar</button></div>
    <div id="${prefixo}-res" class="small" style="margin-top:6px"></div>`;

  async function consultarCnpj(prefixo) {
    const input = document.getElementById(prefixo + '-input');
    const res = document.getElementById(prefixo + '-res');
    if (!input || !res) return;
    res.innerHTML = '<span class="muted">Consultando a Receita Federal…</span>';
    try {
      const info = await buscarCNPJ(input.value);
      input.value = formatarCNPJ(info.cnpj);
      res.innerHTML = htmlResultadoCNPJ(info);
      if (cnpjRetornos[prefixo]) cnpjRetornos[prefixo](info);
    } catch (e) {
      res.innerHTML = `<span class="badge warn">${esc(e.name === 'AbortError' || e instanceof TypeError ? 'Não foi possível consultar agora (sem conexão ou serviço fora do ar).' : e.message)}</span>`;
    }
  }

  // ---------------------------------------------------------------- dados
  function normalizar(d) {
    return {
      clientes: Array.isArray(d.clientes) ? d.clientes : [],
      lancamentos: Array.isArray(d.lancamentos) ? d.lancamentos : [],
      atas: Array.isArray(d.atas) ? d.atas : [],
      params: Object.assign({}, PARAMS_PADRAO, d.params || {}),
    };
  }
  function carregar() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalizar(JSON.parse(raw));
    } catch (e) { /* sem storage: segue com dados de demonstração */ }
    return dadosDemo();
  }
  function salvar() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); } catch (e) { /* ignora */ }
  }

  function dadosDemo() {
    const mes = hojeISO().slice(0, 8); // AAAA-MM-
    const c1 = 'demo-clinica', c2 = 'demo-mercado', c3 = 'demo-studio';
    return normalizar({
      clientes: [
        { id: c1, nome: 'Clínica Sorriso Exemplo Ltda', cnpj: '00.000.000/0001-00', regime: 'presumido', setor: 'saude', contato: 'Dra. Ana (sócia)', email: 'contato@clinicaexemplo.com.br', faturamento: 50000, obs: 'Dentistas PJ com repasse por atendimento.' },
        { id: c2, nome: 'Mercado Bom Preço Exemplo', cnpj: '11.111.111/0001-11', regime: 'real', setor: 'geral', contato: 'Carlos (financeiro)', email: 'financeiro@mercadoexemplo.com.br', faturamento: 180000, obs: '' },
        { id: c3, nome: 'Studio Design Exemplo ME', cnpj: '22.222.222/0001-22', regime: 'simples', setor: 'servicos', contato: 'Júlia', email: 'julia@studioexemplo.com.br', faturamento: 25000, obs: 'Avaliar se continua no Simples após a reforma.' },
        { id: 'demo-saas', nome: 'EduTech Exemplo Ltda', cnpj: '33.333.333/0001-33', regime: 'presumido', setor: 'software', contato: 'Equipe financeira', email: 'financeiro@edutechexemplo.com.br', faturamento: 40000, obs: 'Vende plataforma para escolas (assinatura) e comunidade online.' },
      ],
      lancamentos: [
        { id: uid(), clienteId: c1, categoria: 'receita', descricao: 'Atendimentos do mês', valor: 50000, data: mes + '05', anexo: 'relatorio-atendimentos.pdf', status: 'conferido', origem: 'cliente' },
        { id: uid(), clienteId: c1, categoria: 'fornecedor', descricao: 'Materiais odontológicos', valor: 12000, data: mes + '08', anexo: 'nf-materiais.pdf', status: 'pendente', origem: 'cliente' },
        { id: uid(), clienteId: c1, categoria: 'fornecedor', descricao: 'Repasse dentistas PJ (NF para a clínica)', valor: 8000, data: mes + '10', anexo: '', status: 'pendente', origem: 'cliente' },
        { id: uid(), clienteId: c1, categoria: 'simples', descricao: 'Laboratório de prótese (Simples)', valor: 3000, data: mes + '10', anexo: '', status: 'pendente', origem: 'cliente' },
        { id: uid(), clienteId: c1, categoria: 'folha', descricao: 'Folha de pagamento', valor: 15000, data: mes + '05', anexo: '', status: 'conferido', origem: 'escritorio' },
        { id: uid(), clienteId: c2, categoria: 'receita', descricao: 'Vendas do mês', valor: 180000, data: mes + '03', anexo: '', status: 'conferido', origem: 'escritorio' },
        { id: uid(), clienteId: c2, categoria: 'fornecedor', descricao: 'Compra de mercadorias', valor: 110000, data: mes + '06', anexo: 'nf-distribuidora.xml', status: 'pendente', origem: 'cliente' },
      ],
      atas: [
        {
          id: 'demo-ata', clienteId: c1, data: hojeISO(), participantes: 'Dra. Ana (Clínica Sorriso); Marcos (contador)',
          tema: 'Impactos da reforma tributária na clínica',
          resumo: [
            'PIS/COFINS de hoje (3,65%) vira CBS: alíquota de referência com redução para saúde, cerca de 4,52% efetivos, com direito a créditos.',
            'Passa a valer mais lançar as despesas na PJ para gerar crédito, sem inflar despesas só para isso.',
            'O split payment retém o imposto antes do dinheiro cair, reduzindo o capital de giro.',
          ],
          orientacoes: [
            'Folha de pagamento não gera crédito.',
            'Compras de empresas do Simples não geram crédito (ou geram pouco).',
            'Não vale a pena passar funcionário de PF para PJ.',
            'Dentistas PJ devem emitir NF para a clínica, que fica com o crédito.',
          ],
          tarefas: [
            { texto: 'Simular a troca de 3,65% por 4,52% com os números reais', responsavel: 'Marcos (contador)', prazo: '', status: 'aberta' },
            { texto: 'Listar despesas hoje na PF que podem ir para a PJ', responsavel: 'Dra. Ana', prazo: '', status: 'aberta' },
            { texto: 'Projetar o caixa considerando o split payment', responsavel: 'Marcos (contador)', prazo: '', status: 'aberta' },
          ],
          abertos: ['Alíquotas finais ainda não definidas.', 'Regra de crédito sobre despesas ainda pode mudar.'],
          proxima: '', pauta: 'Resultado da simulação; despesas que migram para a PJ; impacto do split payment no caixa.',
        },
      ],
    });
  }

  let db = carregar();
  const cliente = (id) => db.clientes.find((c) => c.id === id);
  const nomeCliente = (id) => (cliente(id) || {}).nome || '(cliente removido)';

  function resumoMes(clienteId, ym) {
    const r = { receita: 0, fornecedor: 0, simples: 0, folha: 0, outros: 0 };
    db.lancamentos.filter((l) => l.clienteId === clienteId && String(l.data).startsWith(ym))
      .forEach((l) => { r[l.categoria] = (r[l.categoria] || 0) + num(l.valor); });
    return r;
  }
  function mesesDoCliente(clienteId) {
    const set = new Set(db.lancamentos.filter((l) => l.clienteId === clienteId && l.data).map((l) => l.data.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }
  function tarefasAbertas() {
    const out = [];
    db.atas.forEach((a) => (a.tarefas || []).forEach((t, i) => { if (t.status !== 'feita') out.push(Object.assign({ ataId: a.id, idx: i, clienteId: a.clienteId }, t)); }));
    return out;
  }

  // ---------------------------------------------------------------- cálculo da reforma
  /*
   * Simulação mensal simplificada (regime pleno, sem fase de transição).
   * escopo 'cbs'      -> compara só PIS/COFINS x CBS
   * escopo 'cbs_ibs'  -> compara PIS/COFINS + ISS x CBS + IBS
   */
  function calcularReforma(inp, p) {
    const setor = SETORES[inp.setor] || SETORES.geral;
    const fator = 1 - setor.reducao / 100;
    const comIbs = inp.escopo === 'cbs_ibs';

    // Hoje
    const real = inp.regimeAtual === 'real';
    const aliqPC = real ? p.pisCofinsNaoCumulativo : p.pisCofinsCumulativo;
    const pcBruto = inp.receita * aliqPC / 100;
    const pcCredito = real ? inp.despReg * p.pisCofinsNaoCumulativo / 100 : 0;
    const pcHoje = Math.max(0, pcBruto - pcCredito);
    const issHoje = comIbs ? inp.receita * inp.iss / 100 : 0;
    const totalHoje = pcHoje + issHoje;

    // Reforma
    const aliqCbsEf = p.cbs * fator;
    const aliqIbsEf = comIbs ? p.ibs * fator : 0;
    const debCbs = inp.receita * aliqCbsEf / 100;
    const debIbs = inp.receita * aliqIbsEf / 100;
    const debito = debCbs + debIbs;
    const aliqCredito = p.cbs + (comIbs ? p.ibs : 0);
    const credFornec = inp.despReg * aliqCredito / 100;
    const credSimples = inp.despSimples * p.creditoSimples / 100;
    const credito = credFornec + credSimples + inp.creditoAnterior;
    const saldo = Math.round((debito - credito) * 100) / 100; // arredonda em centavos
    const aPagar = Math.max(0, saldo);
    const creditoProx = Math.max(0, -saldo);

    return {
      setor, fator, comIbs, aliqPC, pcBruto, pcCredito, pcHoje, issHoje, totalHoje,
      aliqCbsEf, aliqIbsEf, debCbs, debIbs, debito, aliqCredito, credFornec, credSimples,
      credito, saldo, aPagar, creditoProx,
      diferenca: aPagar - totalHoje,
      splitRetido: debito,
      splitPctReceita: inp.receita ? debito / inp.receita * 100 : 0,
    };
  }

  function calcularDividendos(valor, p) {
    let atual = 0;
    if (valor > p.divLimite) atual = (p.divBase === 'excedente' ? valor - p.divLimite : valor) * p.divAliqAtual / 100;
    const pl = valor * p.divAliqPL / 100;
    return { atual, pl };
  }

  // ---------------------------------------------------------------- componentes
  const stat = (rotulo, valor) => `<div class="stat"><b>${esc(valor)}</b><span>${esc(rotulo)}</span></div>`;
  const badgeStatus = (s) => s === 'conferido' ? '<span class="badge ok">Conferido</span>' : '<span class="badge warn">Pendente</span>';
  const opcoes = (obj, sel, rotulo) => Object.keys(obj).map((k) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(rotulo ? rotulo(obj[k]) : obj[k])}</option>`).join('');
  const opcoesClientes = (sel, vazio) => (vazio ? `<option value="">${esc(vazio)}</option>` : '') + db.clientes.map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');

  function tabelaLanc(lista, opts) {
    opts = opts || {};
    if (!lista.length) return '<p class="muted">Nenhum lançamento.</p>';
    const linhasHtml = lista.slice().sort((a, b) => String(b.data).localeCompare(String(a.data))).map((l) => `
      <tr>
        <td>${dataBR(l.data)}</td>
        ${opts.mostrarCliente ? `<td><a href="#/clientes/${l.clienteId}">${esc(nomeCliente(l.clienteId))}</a></td>` : ''}
        <td>${esc(l.descricao)}${l.fornecedorNome ? `<div class="muted small">Fornecedor: ${esc(l.fornecedorNome)} · ${l.fornecedorTipo === 'regular' ? 'fora do Simples' : l.fornecedorTipo === 'mei' ? 'MEI' : 'Simples Nacional'}</div>` : ''}${l.anexo ? `<div class="muted small">📎 ${esc(l.anexo)}</div>` : ''}</td>
        <td>${esc(CATEGORIAS[l.categoria] || l.categoria)}</td>
        <td class="num">${brl(l.valor)}</td>
        <td>${badgeStatus(l.status)}</td>
        ${opts.escritorio ? `<td class="num">
          ${l.status !== 'conferido' ? `<button class="btn small" data-action="conferir" data-id="${l.id}">Conferir</button>` : ''}
          <button class="link-btn danger small" data-action="excluirLanc" data-confirm="Excluir este lançamento?" data-id="${l.id}">excluir</button></td>` : ''}
      </tr>`).join('');
    return `<div class="table-wrap"><table>
      <thead><tr><th>Data</th>${opts.mostrarCliente ? '<th>Cliente</th>' : ''}<th>Descrição</th><th>Categoria</th><th class="num">Valor</th><th>Status</th>${opts.escritorio ? '<th></th>' : ''}</tr></thead>
      <tbody>${linhasHtml}</tbody></table></div>`;
  }

  function tabelaTarefas(lista) {
    return `<div class="table-wrap"><table>
      <thead><tr><th>Tarefa</th><th>Responsável</th><th>Prazo</th><th>Cliente</th><th></th></tr></thead>
      <tbody>${lista.map((t) => `<tr>
        <td><a href="#/atas/${t.ataId}">${esc(t.texto)}</a></td>
        <td>${t.responsavel ? esc(t.responsavel) : '<span class="badge warn">A confirmar</span>'}</td>
        <td>${t.prazo ? dataBR(t.prazo) : '<span class="muted">A definir</span>'}</td>
        <td>${esc(nomeCliente(t.clienteId))}</td>
        <td class="num"><button class="btn small secondary" data-action="toggleTarefa" data-id="${t.ataId}:${t.idx}">Concluir</button></td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  // ---------------------------------------------------------------- telas
  function viewPainel() {
    const pend = db.lancamentos.filter((l) => l.status !== 'conferido');
    const tarefas = tarefasAbertas();
    $app.innerHTML = `
      <header class="page-head">
        <div><h1>Painel do escritório</h1><p class="muted">Visão geral de clientes, envios e tarefas.</p></div>
        <div class="actions"><a class="btn secondary" href="#/atas/nova">+ Nova ata</a><a class="btn" href="#/clientes/novo">+ Novo cliente</a></div>
      </header>
      <section class="stats">
        ${stat('Clientes', db.clientes.length)}
        ${stat('Envios pendentes', pend.length)}
        ${stat('Tarefas abertas', tarefas.length)}
        ${stat('Atas registradas', db.atas.length)}
      </section>
      <section class="card"><h2>Tarefas abertas</h2>${tarefas.length ? tabelaTarefas(tarefas) : '<p class="muted">Nenhuma tarefa aberta.</p>'}</section>
      <section class="card"><h2>Envios dos clientes aguardando conferência</h2>${tabelaLanc(pend, { mostrarCliente: true, escritorio: true })}</section>`;
  }

  function viewClientes() {
    $app.innerHTML = `
      <header class="page-head">
        <div><h1>Clientes</h1><p class="muted">Empresas atendidas pelo escritório.</p></div>
        <a class="btn" href="#/clientes/novo">+ Novo cliente</a>
      </header>
      <section class="card">${db.clientes.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Cliente</th><th>CNPJ/CPF</th><th>Regime</th><th>Setor</th><th class="num">Faturamento/mês</th><th>Pendências</th></tr></thead>
        <tbody>${db.clientes.map((c) => {
          const p = db.lancamentos.filter((l) => l.clienteId === c.id && l.status !== 'conferido').length;
          return `<tr><td><a href="#/clientes/${c.id}"><b>${esc(c.nome)}</b></a><div class="muted small">${esc(c.contato)}</div></td>
            <td>${esc(c.cnpj)}</td><td>${esc(REGIMES[c.regime] || '')}</td><td>${esc((SETORES[c.setor] || {}).nome || '')}</td>
            <td class="num">${brl(c.faturamento)}</td><td>${p ? `<span class="badge warn">${p} envio(s)</span>` : '<span class="badge ok">Em dia</span>'}</td></tr>`;
        }).join('')}</tbody></table></div>` : '<p class="muted">Nenhum cliente cadastrado ainda.</p>'}</section>`;
  }

  function viewClienteForm(id) {
    const c = id ? cliente(id) : null;
    if (id && !c) return naoEncontrado();
    const v = c || { nome: '', cnpj: '', regime: 'presumido', setor: 'servicos', contato: '', email: '', faturamento: '', obs: '' };
    $app.innerHTML = `
      <header class="page-head"><div><h1>${c ? 'Editar cliente' : 'Novo cliente'}</h1></div></header>
      <form class="card" id="form-cliente">
        <div class="fields">
          <div class="full"><label>Nome / razão social</label><input name="nome" required value="${esc(v.nome)}"></div>
          <div><label>CNPJ ou CPF</label>
            <div class="cnpj-box"><input name="cnpj" id="cli-cnpj-input" data-cnpj="cli-cnpj" value="${esc(v.cnpj)}">
              <button type="button" class="btn secondary" data-action="consultarCnpj" data-id="cli-cnpj">Buscar dados</button></div>
            <div id="cli-cnpj-res" class="small" style="margin-top:6px"></div></div>
          <div><label>Faturamento médio mensal (R$)</label><input name="faturamento" type="number" step="0.01" min="0" value="${esc(v.faturamento)}"></div>
          <div><label>Regime tributário</label><select name="regime">${opcoes(REGIMES, v.regime)}</select></div>
          <div><label>Tipo de atividade <span class="hint">(define a redução na reforma)</span></label><select name="setor" data-setor>${opcoes(SETORES, v.setor, (s) => `${s.nome} — redução ${s.reducao}%`)}</select>${dicaSetor(v.setor)}</div>
          <div><label>Contato</label><input name="contato" value="${esc(v.contato)}"></div>
          <div><label>E-mail</label><input name="email" type="email" value="${esc(v.email)}"></div>
          <div class="full"><label>Observações</label><textarea name="obs">${esc(v.obs)}</textarea></div>
        </div>
        <div class="form-foot"><button class="btn" type="submit">Salvar</button><a class="btn secondary" href="${c ? '#/clientes/' + c.id : '#/clientes'}">Cancelar</a></div>
      </form>`;
    cnpjRetornos['cli-cnpj'] = (info) => {
      const f = document.getElementById('form-cliente');
      if (!f.elements.nome.value.trim()) f.elements.nome.value = info.razao;
      if (info.simples || info.mei) f.elements.regime.value = 'simples';
      else if (f.elements.regime.value === 'simples') f.elements.regime.value = 'presumido';
    };
    document.getElementById('form-cliente').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const dados = {
        nome: f.get('nome').trim(), cnpj: f.get('cnpj').trim(), regime: f.get('regime'), setor: f.get('setor'),
        contato: f.get('contato').trim(), email: f.get('email').trim(), faturamento: num(f.get('faturamento')), obs: f.get('obs').trim(),
      };
      let alvo;
      if (c) { Object.assign(c, dados); alvo = c.id; } else { alvo = uid(); db.clientes.push(Object.assign({ id: alvo }, dados)); }
      salvar();
      toast('Cliente salvo.');
      location.hash = '#/clientes/' + alvo;
    });
  }

  function viewCliente(id) {
    const c = cliente(id);
    if (!c) return naoEncontrado();
    const lancs = db.lancamentos.filter((l) => l.clienteId === id);
    const atas = db.atas.filter((a) => a.clienteId === id);
    $app.innerHTML = `
      <header class="page-head">
        <div><h1>${esc(c.nome)}</h1><p class="muted">${esc(REGIMES[c.regime] || '')} · ${esc((SETORES[c.setor] || {}).nome || '')} · ${esc(c.cnpj)}</p></div>
        <div class="actions">
          <a class="btn" href="#/simulador/${c.id}">Simular reforma</a>
          <a class="btn secondary" href="#/portal/${c.id}">Abrir portal do cliente</a>
          <a class="btn secondary" href="#/atas/nova/${c.id}">+ Nova ata</a>
          <a class="btn secondary" href="#/clientes/${c.id}/editar">Editar</a>
        </div>
      </header>
      <div class="grid-2">
        <section class="card"><h2>Dados</h2>
          <p><b>Contato:</b> ${esc(c.contato) || '—'}<br><b>E-mail:</b> ${esc(c.email) || '—'}<br><b>Faturamento médio:</b> ${brl(c.faturamento)}</p>
          ${c.obs ? `<p class="muted">${esc(c.obs)}</p>` : ''}
          ${c.regime === 'simples' ? '<div class="note">Empresa do Simples: avaliar se continua no regime. Clientes PJ dela não aproveitam crédito cheio de CBS/IBS.</div>' : ''}
          <p style="margin-top:16px"><button class="link-btn danger" data-action="excluirCliente" data-confirm="Excluir o cliente, os lançamentos e as atas dele?" data-id="${c.id}">Excluir cliente</button></p>
        </section>
        <section class="card"><h2>Atas e reuniões</h2>
          ${atas.length ? `<ul>${atas.map((a) => `<li><a href="#/atas/${a.id}">${dataBR(a.data)} — ${esc(a.tema)}</a></li>`).join('')}</ul>` : '<p class="muted">Nenhuma ata registrada.</p>'}
        </section>
      </div>
      <section class="card" style="margin-top:18px"><h2>Lançamentos enviados</h2>${tabelaLanc(lancs, { escritorio: true })}</section>`;
  }

  // --- simulador
  function viewSimulador(clienteId) {
    const p = db.params;
    // '#/simulador/setor-xxx' abre o simulador já com o tipo de atividade escolhido (vem da aba de tipos de serviço).
    const setorPedido = clienteId && clienteId.startsWith('setor-') ? clienteId.slice(6) : null;
    if (setorPedido) clienteId = null;
    const c = clienteId ? cliente(clienteId) : null;
    const ini = { receita: 50000, despReg: 20000, despSimples: 0, folha: 0, setor: SETORES[setorPedido] ? setorPedido : 'saude', regimeAtual: 'presumido', escopo: 'cbs', iss: p.issPadrao, creditoAnterior: 0, dividendos: 0 };
    let origem = 'Valores de exemplo (receita R$ 50 mil, despesas R$ 20 mil).';
    if (c) {
      ini.setor = c.setor;
      ini.regimeAtual = c.regime === 'real' ? 'real' : 'presumido';
      const meses = mesesDoCliente(c.id);
      if (meses.length) {
        const r = resumoMes(c.id, meses[0]);
        Object.assign(ini, { receita: r.receita || num(c.faturamento), despReg: r.fornecedor, despSimples: r.simples, folha: r.folha });
        origem = `Valores dos lançamentos de ${mesBR(meses[0])}.`;
      } else {
        Object.assign(ini, { receita: num(c.faturamento), despReg: 0 });
        origem = 'Receita pelo faturamento médio cadastrado; preencha as despesas.';
      }
    }
    const campo = (nome, rot, val, extra) => `<div><label>${rot}</label><input name="${nome}" type="number" step="0.01" min="0" value="${val}" ${extra || ''}></div>`;
    $app.innerHTML = `
      <header class="page-head">
        <div><h1>Simulador da reforma tributária</h1><p class="muted">Compare o imposto de hoje com CBS/IBS, créditos e split payment.</p></div>
        <div class="actions"><button class="btn secondary" data-action="copiarSimulacao">Copiar resumo</button></div>
      </header>
      <div class="sim">
        <form class="card" id="form-sim">
          <div class="fields" style="grid-template-columns:1fr">
            <div><label>Cliente</label><select id="sim-cliente">${opcoesClientes(clienteId, 'Simulação livre')}</select>
              <div class="muted small" style="margin-top:4px">${esc(origem)}</div></div>
            <div><label>O que comparar</label><select name="escopo">
              <option value="cbs" ${ini.escopo === 'cbs' ? 'selected' : ''}>Só PIS/COFINS → CBS</option>
              <option value="cbs_ibs">PIS/COFINS + ISS → CBS + IBS</option></select></div>
            <div><label>Regime atual</label><select name="regimeAtual">
              <option value="presumido" ${ini.regimeAtual === 'presumido' ? 'selected' : ''}>Lucro Presumido (PIS/COFINS ${pct(p.pisCofinsCumulativo)})</option>
              <option value="real" ${ini.regimeAtual === 'real' ? 'selected' : ''}>Lucro Real (PIS/COFINS ${pct(p.pisCofinsNaoCumulativo)} com créditos)</option></select></div>
            <div><label>Tipo de atividade</label><select name="setor" data-setor>${opcoes(SETORES, ini.setor, (s) => `${s.nome} — redução ${s.reducao}%`)}</select>${dicaSetor(ini.setor)}</div>
            ${campo('receita', 'Receita do mês (R$)', ini.receita)}
            ${campo('despReg', 'Compras de fornecedores fora do Simples (R$) <span class="hint">geram crédito</span>', ini.despReg)}
            ${campo('despSimples', 'Compras de fornecedores do Simples (R$)', ini.despSimples)}
            ${campo('folha', 'Folha de pagamento (R$) <span class="hint">não gera crédito</span>', ini.folha)}
            ${campo('iss', 'ISS atual (%) <span class="hint">usado ao comparar com IBS</span>', ini.iss)}
            ${campo('creditoAnterior', 'Crédito acumulado do mês anterior (R$)', ini.creditoAnterior)}
            ${campo('dividendos', 'Lucro distribuído no mês, por sócio (R$)', ini.dividendos)}
          </div>
        </form>
        <section class="card" id="sim-resultado"></section>
      </div>`;
    const form = document.getElementById('form-sim');
    const atualizar = () => {
      const f = new FormData(form);
      const inp = {
        escopo: f.get('escopo'), regimeAtual: f.get('regimeAtual'), setor: f.get('setor'),
        receita: num(f.get('receita')), despReg: num(f.get('despReg')), despSimples: num(f.get('despSimples')),
        folha: num(f.get('folha')), iss: num(f.get('iss')), creditoAnterior: num(f.get('creditoAnterior')),
      };
      const r = calcularReforma(inp, p);
      const div = calcularDividendos(num(f.get('dividendos')), p);
      viewSimulador.ultimo = { inp, r, div, dividendos: num(f.get('dividendos')), cliente: c ? c.nome : null };
      document.getElementById('sim-resultado').innerHTML = resultadoSimulacao(inp, r, div, num(f.get('dividendos')), p);
    };
    form.addEventListener('input', atualizar);
    form.addEventListener('submit', (e) => e.preventDefault());
    document.getElementById('sim-cliente').addEventListener('change', (e) => { location.hash = e.target.value ? '#/simulador/' + e.target.value : '#/simulador'; });
    atualizar();
  }

  function resultadoSimulacao(inp, r, div, dividendos, p) {
    const hojeRot = r.comIbs ? 'PIS/COFINS + ISS hoje' : 'PIS/COFINS hoje';
    const novoRot = r.comIbs ? 'CBS + IBS a pagar' : 'CBS a pagar';
    const dif = r.diferenca;
    return `
      <h2>Resultado do mês</h2>
      <div class="result-grid">
        <div class="result"><span>${hojeRot}</span><b>${brl(r.totalHoje)}</b></div>
        <div class="result highlight"><span>${novoRot} (após créditos)</span><b>${brl(r.aPagar)}</b></div>
        <div class="result ${dif > 0 ? 'alert' : ''}"><span>Diferença por mês</span><b>${dif > 0 ? '+' : ''}${brl(dif)}</b></div>
        <div class="result"><span>Crédito que sobra para o próximo mês</span><b>${brl(r.creditoProx)}</b></div>
      </div>
      <table class="calc-lines"><tbody>
        <tr><td colspan="2"><b>Hoje</b></td></tr>
        <tr><td>PIS/COFINS: ${brl(inp.receita)} × ${pct(r.aliqPC)}</td><td class="num">${brl(r.pcBruto)}</td></tr>
        ${r.pcCredito ? `<tr><td>(−) Créditos de PIS/COFINS sobre compras</td><td class="num">−${brl(r.pcCredito)}</td></tr>` : ''}
        ${r.comIbs ? `<tr><td>ISS: ${brl(inp.receita)} × ${pct(inp.iss)}</td><td class="num">${brl(r.issHoje)}</td></tr>` : ''}
        <tr class="total"><td>Total hoje</td><td class="num">${brl(r.totalHoje)}</td></tr>
        <tr><td colspan="2" style="padding-top:14px"><b>Com a reforma</b> <span class="muted small">(redução do setor: ${r.setor.reducao}%)</span></td></tr>
        <tr><td>Débito CBS: ${brl(inp.receita)} × ${pct(r.aliqCbsEf)} <span class="muted small">(${pct(p.cbs)} × ${pct(r.fator * 100)})</span></td><td class="num">${brl(r.debCbs)}</td></tr>
        ${r.comIbs ? `<tr><td>Débito IBS: ${brl(inp.receita)} × ${pct(r.aliqIbsEf)}</td><td class="num">${brl(r.debIbs)}</td></tr>` : ''}
        <tr><td>(−) Crédito sobre compras fora do Simples: ${brl(inp.despReg)} × ${pct(r.aliqCredito)}</td><td class="num">−${brl(r.credFornec)}</td></tr>
        <tr><td>(−) Crédito sobre compras do Simples: ${brl(inp.despSimples)} × ${pct(p.creditoSimples)}</td><td class="num">−${brl(r.credSimples)}</td></tr>
        ${inp.creditoAnterior ? `<tr><td>(−) Crédito acumulado do mês anterior</td><td class="num">−${brl(inp.creditoAnterior)}</td></tr>` : ''}
        <tr><td>Folha de pagamento (${brl(inp.folha)}): não gera crédito</td><td class="num">${brl(0)}</td></tr>
        <tr class="total"><td>A pagar com a reforma</td><td class="num">${brl(r.aPagar)}</td></tr>
      </tbody></table>

      <h3>Split payment e capital de giro</h3>
      <p>No split payment, o imposto é retido no momento do recebimento. Na prática, cerca de <b>${brl(r.splitRetido)}</b> (${pct(r.splitPctReceita)} da receita) deixam de cair na conta. Os créditos são compensados depois.</p>

      ${dividendos > 0 ? `<h3>Distribuição de lucros</h3>
      <table class="calc-lines"><tbody>
        <tr><td>Regra atual: isento até ${brl(p.divLimite)}/mês; acima disso, ${pct(p.divAliqAtual)} sobre o ${p.divBase === 'excedente' ? 'excedente' : 'total'}</td><td class="num">${brl(div.atual)}</td></tr>
        <tr><td>Cenário do projeto de lei: ${pct(p.divAliqPL)} sobre qualquer valor, retido na fonte</td><td class="num">${brl(div.pl)}</td></tr>
      </tbody></table>
      <p class="muted small">O valor retido pode ser ajustado na declaração anual.</p>` : ''}

      ${r.credFornec >= r.debito && inp.despReg > 0 ? '<div class="note">Os créditos sobre compras estão zerando ou superando o débito. Isso acontece porque a redução do setor vale para a venda (saída), mas o crédito entra com a alíquota cheia. Essa regra ainda pode mudar, então não conte com esse crédito no planejamento.</div>' : ''}
      <div class="note info">Estimativa para o regime pleno, com alíquotas de referência editáveis em <a href="#/config">Parâmetros</a>. As alíquotas finais ainda não estão definidas e não há fase de transição na conta. Não substitui a análise do contador.</div>`;
  }

  function textoSimulacao() {
    const s = viewSimulador.ultimo;
    if (!s) return '';
    const { inp, r, div, dividendos } = s;
    const out = [
      `Simulação da reforma tributária${s.cliente ? ' — ' + s.cliente : ''}`,
      `Receita do mês: ${brl(inp.receita)} | Compras com crédito: ${brl(inp.despReg)} | Compras do Simples: ${brl(inp.despSimples)} | Folha: ${brl(inp.folha)}`,
      `Hoje (${r.comIbs ? 'PIS/COFINS + ISS' : 'PIS/COFINS'}): ${brl(r.totalHoje)}`,
      `Reforma: débito ${brl(r.debito)} − créditos ${brl(r.credito)} = a pagar ${brl(r.aPagar)}`,
      `Diferença por mês: ${r.diferenca > 0 ? '+' : ''}${brl(r.diferenca)}`,
      `Crédito para o próximo mês: ${brl(r.creditoProx)}`,
      `Split payment: cerca de ${brl(r.splitRetido)} retidos no recebimento (${pct(r.splitPctReceita)} da receita).`,
    ];
    if (dividendos > 0) out.push(`Dividendos (${brl(dividendos)}): regra atual ${brl(div.atual)} | cenário PL ${brl(div.pl)}`);
    out.push('Estimativa com alíquotas de referência ainda não definitivas.');
    return out.join('\n');
  }

  // --- cenários PF x PJ
  /*
   * Situações práticas com cálculo lado a lado.
   * Premissa: o crédito de quem compra é igual ao imposto cobrado pelo fornecedor
   * (alíquota cheia para fornecedor fora do Simples, reduzida se o setor dele tiver redução).
   */
  function calcularCenarios(v, p) {
    const aliqCheia = p.cbs + (v.comIbs ? p.ibs : 0);
    const aliqSetor = (setor) => aliqCheia * (1 - (SETORES[setor] || SETORES.geral).reducao / 100);
    const pc = (valor, aliq) => valor * aliq / 100;

    const compra = [
      { id: 'pf', nome: 'Pessoa física (autônomo, sem empresa)', credito: 0 },
      { id: 'mei', nome: 'MEI', credito: 0 },
      { id: 'simples', nome: 'Empresa do Simples Nacional', credito: pc(v.c1Valor, p.creditoSimples) },
      { id: 'simplesFora', nome: 'Empresa do Simples que paga CBS/IBS "por fora"', credito: pc(v.c1Valor, aliqCheia) },
      { id: 'regular', nome: 'Empresa fora do Simples (Presumido ou Real)', credito: pc(v.c1Valor, aliqCheia) },
    ].map((o) => Object.assign(o, { custo: v.c1Valor - o.credito }));

    const despesaPF = v.c2Dedutivel ? pc(v.c2Valor, v.c2IR) : 0;
    const despesaPJ = v.c2Regime === 'simples' ? 0 : pc(v.c2Valor, aliqCheia);

    const impostoVenda = pc(v.c3Valor, aliqSetor(v.setor));

    const inss = pc(v.c4Valor, p.inssAutonomo);
    const parceiro = [
      { id: 'pf', nome: 'Pessoa física (recibo/RPA)', credito: 0, extra: inss, obs: `+ INSS da empresa (${pct(p.inssAutonomo)})` },
      { id: 'simples', nome: 'PJ do Simples Nacional (emite nota)', credito: pc(v.c4Valor, p.creditoSimples), extra: 0, obs: '' },
      { id: 'regular', nome: 'PJ fora do Simples (emite nota)', credito: pc(v.c4Valor, aliqSetor(v.c4Setor)), extra: 0, obs: '' },
    ].map((o) => Object.assign(o, { custo: v.c4Valor + o.extra - o.credito }));

    const div = calcularDividendos(v.c6Valor, p);
    return { aliqCheia, aliqSetorVenda: aliqSetor(v.setor), compra, despesaPF, despesaPJ, impostoVenda, parceiro, div };
  }

  function viewCenarios() {
    const p = db.params;
    const campo = (nome, rot, val) => `<div><label>${rot}</label><input name="${nome}" type="number" step="0.01" min="0" value="${val}"></div>`;
    $app.innerHTML = `
      <header class="page-head">
        <div><h1>Cenários PF x PJ</h1><p class="muted">Situações do dia a dia: de quem comprar, em nome de quem lançar, para quem vender e como pagar parceiros.</p></div>
      </header>
      <section class="card">
        <h2>🔎 A empresa de quem vou comprar é do Simples?</h2>
        <p class="muted small" style="margin-top:-6px">Digite o CNPJ que aparece na nota fiscal ou no orçamento. A busca pelo nome da empresa não é possível em consultas gratuitas.</p>
        ${blocoCnpj('cen-cnpj', 'CNPJ do fornecedor')}
      </section>
      <form id="form-cen">
        <section class="card">
          <div class="fields">
            <div><label>O que a sua empresa vende</label><select name="setor" data-setor>${opcoes(SETORES, 'saude', (s) => `${s.nome} (redução ${s.reducao}%)`)}</select>${dicaSetor('saude')}</div>
            <div><label>Quais tributos considerar</label><select name="escopo">
              <option value="cbs">Só CBS (substitui PIS/COFINS, vale a partir de 2027)</option>
              <option value="cbs_ibs">CBS + IBS (regime completo, a partir de 2033)</option></select></div>
          </div>
        </section>
        <div class="grid-2 cenarios">
          <section class="card"><h2>1. De quem comprar?</h2>
            <p class="muted small">Uma mesma compra gera créditos diferentes conforme quem vende.</p>
            ${campo('c1Valor', 'Valor da compra (R$)', 10000)}
            <div id="r1"></div></section>
          <section class="card"><h2>2. Lançar a despesa no CPF ou no CNPJ?</h2>
            <p class="muted small">Hoje muita despesa vai para a PF (livro-caixa/carnê-leão). Com a reforma, na PJ ela pode gerar crédito.</p>
            <div class="fields">
              ${campo('c2Valor', 'Valor da despesa (R$)', 5000)}
              ${campo('c2IR', 'Sua alíquota de IR na PF (%)', p.irPF)}
              <div><label>Regime da empresa</label><select name="c2Regime"><option value="regular">Fora do Simples</option><option value="simples">Simples Nacional</option></select></div>
              <div><label>Dedutível no livro-caixa?</label><select name="c2Dedutivel"><option value="1">Sim</option><option value="0">Não</option></select></div>
            </div>
            <div id="r2"></div></section>
          <section class="card"><h2>3. Vender para PF ou para PJ?</h2>
            <p class="muted small">O seu imposto é o mesmo. A diferença é quanto o cliente recupera.</p>
            ${campo('c3Valor', 'Valor da venda ou serviço (R$)', 1000)}
            <div id="r3"></div></section>
          <section class="card"><h2>4. Pagar um parceiro como PF ou PJ?</h2>
            <p class="muted small">Exemplo: dentista que recebe repasse por atendimento.</p>
            <div class="fields">
              ${campo('c4Valor', 'Valor do repasse no mês (R$)', 8000)}
              <div><label>Atividade do parceiro</label><select name="c4Setor">${opcoes(SETORES, 'saude', (s) => s.nome)}</select></div>
            </div>
            <div id="r4"></div></section>
          <section class="card"><h2>5. Funcionário CLT ou PJ?</h2>
            <p>A <b>folha de pagamento não gera crédito</b> de CBS/IBS. Trocar um funcionário CLT por PJ só para gerar crédito normalmente <b>não compensa</b>:</p>
            <ul>
              <li>o ganho de crédito costuma ser pequeno perto dos outros custos;</li>
              <li>se a pessoa trabalha com horário, chefe e rotina de funcionário, há <b>risco trabalhista</b> (reconhecimento de vínculo).</li>
            </ul>
            <p class="muted small">Decisão para tomar sempre com o contador.</p></section>
          <section class="card"><h2>6. Tirar o lucro da empresa para o CPF</h2>
            ${campo('c6Valor', 'Lucro distribuído no mês, por sócio (R$)', 60000)}
            <div id="r6"></div></section>
        </div>
      </form>
      <div class="note info">Estimativas com alíquotas de referência ainda não definitivas (ajuste em <a href="#/config">Parâmetros</a>). Servem para comparar caminhos, não substituem o contador.</div>`;

    const form = document.getElementById('form-cen');
    let destaque = null;
    const linhaTabela = (cols, marcada) => `<tr class="${marcada ? 'marcada' : ''}">${cols.join('')}</tr>`;
    const atualizar = () => {
      const f = new FormData(form);
      const v = {
        setor: f.get('setor'), comIbs: f.get('escopo') === 'cbs_ibs',
        c1Valor: num(f.get('c1Valor')), c2Valor: num(f.get('c2Valor')), c2IR: num(f.get('c2IR')), c2Regime: f.get('c2Regime'),
        c2Dedutivel: f.get('c2Dedutivel') === '1', c3Valor: num(f.get('c3Valor')), c4Valor: num(f.get('c4Valor')), c4Setor: f.get('c4Setor'),
        c6Valor: num(f.get('c6Valor')),
      };
      const r = calcularCenarios(v, p);

      const melhorCompra = Math.min.apply(null, r.compra.map((o) => o.custo));
      document.getElementById('r1').innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Fornecedor</th><th class="num">Crédito</th><th class="num">Custo real</th></tr></thead>
        <tbody>${r.compra.map((o) => linhaTabela([`<td>${esc(o.nome)}</td>`, `<td class="num">${brl(o.credito)}</td>`, `<td class="num">${o.custo === melhorCompra ? '<b>' + brl(o.custo) + '</b>' : brl(o.custo)}</td>`], destaque === o.id)).join('')}</tbody></table></div>
        <p class="small">Comprando de empresa fora do Simples, você recupera <b>${brl(r.compra[4].credito)}</b> (${pct(r.aliqCheia)}). Se o preço do fornecedor do Simples for até ${brl(r.compra[4].custo)}, ele ainda sai mais barato.</p>
        <p class="muted small">Se o fornecedor tiver redução no setor dele, o crédito é menor. Compras no CPF não geram crédito para a empresa.</p>`;

      const ganhaPJ = r.despesaPJ > r.despesaPF;
      document.getElementById('r2').innerHTML = `<table class="calc-lines"><tbody>
        <tr class="${!ganhaPJ ? 'marcada' : ''}"><td>No CPF (livro-caixa): reduz o IR</td><td class="num">${brl(r.despesaPF)}</td></tr>
        <tr class="${ganhaPJ ? 'marcada' : ''}"><td>No CNPJ: crédito de ${v.comIbs ? 'CBS/IBS' : 'CBS'}</td><td class="num">${brl(r.despesaPJ)}</td></tr></tbody></table>
        <p class="small"><b>${r.despesaPF === r.despesaPJ ? 'Empate.' : ganhaPJ ? 'Vale mais lançar no CNPJ' : 'Vale mais lançar no CPF'}</b>${r.despesaPF !== r.despesaPJ ? `: economia de ${brl(Math.abs(r.despesaPJ - r.despesaPF))} a mais.` : ''}</p>
        <p class="muted small">Atenção: na PJ só entram despesas da atividade da empresa. Lançar gasto pessoal na PJ para gerar crédito não é permitido. Lembre também que receita tirada do livro-caixa e passada para a PJ vira receita da empresa.</p>`;

      document.getElementById('r3').innerHTML = `<table class="calc-lines"><tbody>
        <tr><td>Seu imposto sobre a venda (${pct(r.aliqSetorVenda)})</td><td class="num">${brl(r.impostoVenda)}</td></tr>
        <tr><td>Cliente <b>pessoa física</b>: custo real para ele</td><td class="num">${brl(v.c3Valor)}</td></tr>
        <tr><td>Cliente <b>empresa fora do Simples</b>: recupera ${brl(r.impostoVenda)} de crédito, custo real</td><td class="num">${brl(v.c3Valor - r.impostoVenda)}</td></tr></tbody></table>
        <p class="muted small">Para empresas clientes, quem gera crédito fica mais competitivo. Se a sua empresa for do Simples, o cliente PJ recupera pouco ou nada; por isso existe a opção de pagar CBS/IBS "por fora" do Simples.</p>`;

      const melhorParc = Math.min.apply(null, r.parceiro.map((o) => o.custo));
      document.getElementById('r4').innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Forma de pagamento</th><th class="num">Crédito</th><th class="num">Custo real</th></tr></thead>
        <tbody>${r.parceiro.map((o) => `<tr class="${o.custo === melhorParc ? 'marcada' : ''}"><td>${esc(o.nome)}${o.obs ? `<div class="muted small">${esc(o.obs)}: ${brl(o.extra)}</div>` : ''}</td><td class="num">${brl(o.credito)}</td><td class="num">${brl(o.custo)}</td></tr>`).join('')}</tbody></table></div>
        <p class="muted small">Com o parceiro PJ emitindo nota para a empresa, o crédito fica com a empresa. Ele recebe o valor cheio na PJ dele e paga os próprios impostos ao transferir para o CPF. Avalie com o contador o risco de vínculo.</p>`;

      document.getElementById('r6').innerHTML = `<table class="calc-lines"><tbody>
        <tr><td>Regra atual: isento até ${brl(p.divLimite)}/mês; acima disso, ${pct(p.divAliqAtual)} sobre o ${p.divBase === 'excedente' ? 'excedente' : 'total'}</td><td class="num">${brl(r.div.atual)}</td></tr>
        <tr><td>Cenário do projeto de lei: ${pct(p.divAliqPL)} retido sobre qualquer valor</td><td class="num">${brl(r.div.pl)}</td></tr></tbody></table>
        <p class="muted small">O imposto retido na fonte pode ser ajustado na declaração anual.</p>`;
    };
    form.addEventListener('input', atualizar);
    form.addEventListener('change', atualizar);
    form.addEventListener('submit', (e) => e.preventDefault());
    cnpjRetornos['cen-cnpj'] = (info) => {
      const t = tipoEmpresa(info);
      destaque = t === 'regular' ? 'regular' : t;
      atualizar();
    };
    atualizar();
  }

  // --- tipos de serviço e enquadramento na reforma
  // faixa: 'cheia' | '30' | '40' | '60' | 'proprio'. setor: chave de SETORES usada no simulador (ou null).
  const SERVICOS = [
    // Saúde
    { grupo: 'Saúde', servico: 'Consultas médicas e clínicas', exemplos: 'Clínica geral, especialidades, pronto atendimento', faixa: '60', setor: 'saude', obs: 'Serviços do Anexo III, classificados pelo código NBS.', base: 'Art. 130 e Anexo III' },
    { grupo: 'Saúde', servico: 'Odontologia', exemplos: 'Consultório, clínica odontológica, tratamento, prótese', faixa: '60', setor: 'saude', obs: 'Está no Anexo III (código NBS de odontologia).', base: 'Art. 130 e Anexo III' },
    { grupo: 'Saúde', servico: 'Hospitais, cirurgias e UTI', exemplos: 'Internação, centro cirúrgico, urgência', faixa: '60', setor: 'saude', obs: '', base: 'Art. 130 e Anexo III' },
    { grupo: 'Saúde', servico: 'Laboratórios e exames de imagem', exemplos: 'Análises clínicas, raio-X, ultrassom, ressonância', faixa: '60', setor: 'saude', obs: '', base: 'Art. 130 e Anexo III' },
    { grupo: 'Saúde', servico: 'Fisioterapia, fonoaudiologia e terapia ocupacional', exemplos: 'Reabilitação, terapias', faixa: '60', setor: 'saude', obs: '', base: 'Art. 130 e Anexo III' },
    { grupo: 'Saúde', servico: 'Psicologia e psiquiatria', exemplos: 'Consultório, clínica de saúde mental', faixa: '60', setor: 'saude', obs: '', base: 'Art. 130 e Anexo III' },
    { grupo: 'Saúde', servico: 'Enfermagem e atendimento domiciliar', exemplos: 'Home care, enfermagem', faixa: '60', setor: 'saude', obs: '', base: 'Art. 130 e Anexo III' },
    { grupo: 'Saúde', servico: 'Procedimentos só estéticos', exemplos: 'Procedimento sem finalidade de saúde', faixa: 'cheia', setor: 'servicos', obs: 'Procedimento com finalidade exclusivamente cosmética pode ficar fora da redução da saúde. Confirme a classificação com o contador.', base: 'Art. 130 (interpretação)' },
    { grupo: 'Saúde', servico: 'Planos de saúde', exemplos: 'Operadoras, cooperativas médicas, seguro-saúde', faixa: 'proprio', setor: null, obs: 'Regime específico, com cálculo próprio.', base: 'Arts. 234 a 243' },
    // Educação
    { grupo: 'Educação', servico: 'Educação infantil, fundamental e médio', exemplos: 'Creche, pré-escola, escola', faixa: '60', setor: 'educacao', obs: 'Só os serviços de ensino da lista do Anexo II. Outras vendas da escola pagam alíquota cheia.', base: 'Art. 129 e Anexo II' },
    { grupo: 'Educação', servico: 'Ensino superior e curso técnico', exemplos: 'Graduação, pós-graduação, técnico', faixa: '60', setor: 'educacao', obs: 'Só os serviços listados no Anexo II.', base: 'Art. 129 e Anexo II' },
    { grupo: 'Educação', servico: 'Cursos livres, idiomas e cursos online', exemplos: 'Escola de inglês, curso livre, curso gravado', faixa: 'cheia', setor: 'digital', obs: 'Há interpretações diferentes sobre a redução da educação. O sistema assume alíquota cheia: confirme com o contador.', base: 'Art. 129 e Anexo II (divergência)' },
    { grupo: 'Educação', servico: 'Infoprodutos, mentorias e comunidades pagas', exemplos: 'E-book, mentoria, comunidade por assinatura', faixa: 'cheia', setor: 'digital', obs: '', base: 'Regra geral' },
    // Profissões regulamentadas
    { grupo: 'Profissões regulamentadas', servico: 'Advocacia', exemplos: 'Advogado, sociedade de advogados', faixa: '30', setor: 'profissional', obs: 'Vale para PF ou sociedade com sócios habilitados no conselho e sem empresa como sócia.', base: 'Art. 127' },
    { grupo: 'Profissões regulamentadas', servico: 'Contabilidade', exemplos: 'Escritório contábil, contador', faixa: '30', setor: 'profissional', obs: 'Mesmas condições: sócios habilitados no conselho e sem empresa como sócia.', base: 'Art. 127' },
    { grupo: 'Profissões regulamentadas', servico: 'Engenharia e agronomia', exemplos: 'Projetos, laudos, ART', faixa: '30', setor: 'profissional', obs: 'Mesmas condições do art. 127.', base: 'Art. 127' },
    { grupo: 'Profissões regulamentadas', servico: 'Arquitetura e urbanismo', exemplos: 'Projetos arquitetônicos', faixa: '30', setor: 'profissional', obs: 'Mesmas condições do art. 127.', base: 'Art. 127' },
    { grupo: 'Profissões regulamentadas', servico: 'Administração e economia', exemplos: 'Administrador, economista', faixa: '30', setor: 'profissional', obs: 'Mesmas condições do art. 127.', base: 'Art. 127' },
    { grupo: 'Profissões regulamentadas', servico: 'Veterinária e zootecnia', exemplos: 'Clínica veterinária', faixa: '30', setor: 'profissional', obs: 'Hoje está na lista de 30%. Há projeto para mudar para a lista da saúde (60%).', base: 'Art. 127' },
    { grupo: 'Profissões regulamentadas', servico: 'Outras profissões da lista', exemplos: 'Assistente social, bibliotecário, biólogo, educação física, estatístico, museólogo, químico, relações públicas, técnico industrial e agrícola', faixa: '30', setor: 'profissional', obs: 'A lista é fechada: profissão fora dela não tem a redução, mesmo com conselho.', base: 'Art. 127' },
    // Tecnologia e marketing
    { grupo: 'Tecnologia e marketing', servico: 'Software, SaaS e serviços de TI', exemplos: 'Sistemas, plataformas, desenvolvimento, suporte', faixa: 'cheia', setor: 'software', obs: 'TI ficou fora das reduções. Vender sistema para escola ou clínica não muda isso.', base: 'Regra geral' },
    { grupo: 'Tecnologia e marketing', servico: 'Segurança da informação e cibernética', exemplos: 'Serviços de segurança digital', faixa: '60', setor: null, obs: 'Redução com condição sobre os sócios da empresa. Confirme com o contador.', base: 'Art. 142' },
    { grupo: 'Tecnologia e marketing', servico: 'Agência de marketing e publicidade', exemplos: 'Gestão de tráfego, social media, criação de conteúdo', faixa: 'cheia', setor: 'servicos', obs: '', base: 'Regra geral' },
    { grupo: 'Tecnologia e marketing', servico: 'Comunicação institucional para órgãos públicos', exemplos: 'Agência contratada pelo governo', faixa: '60', setor: null, obs: 'Só quando o contratante é a administração pública. Para empresas privadas, alíquota cheia.', base: 'Art. 140' },
    // Cultura, esporte e turismo
    { grupo: 'Cultura, esporte e turismo', servico: 'Produções artísticas, culturais, jornalísticas e audiovisuais nacionais', exemplos: 'Shows, teatro, cinema, eventos culturais', faixa: '60', setor: 'cultura', obs: 'Vale para as produções listadas na lei, com condições.', base: 'Art. 139' },
    { grupo: 'Cultura, esporte e turismo', servico: 'Atividades desportivas', exemplos: 'Eventos e práticas esportivas', faixa: '60', setor: null, obs: 'Confirme as condições do art. 141 com o contador.', base: 'Art. 141' },
    { grupo: 'Cultura, esporte e turismo', servico: 'Bares, restaurantes e lanchonetes', exemplos: 'Alimentação fora de casa', faixa: '40', setor: 'hospitalidade', obs: 'O cliente empresa não pode tomar crédito. Bebida alcoólica fica fora da redução.', base: 'Arts. 273 a 276' },
    { grupo: 'Cultura, esporte e turismo', servico: 'Hotelaria e parques', exemplos: 'Hotel, pousada, parque de diversão ou temático', faixa: '40', setor: 'hospitalidade', obs: 'O cliente empresa não pode tomar crédito.', base: 'Arts. 277 a 283' },
    { grupo: 'Cultura, esporte e turismo', servico: 'Agências de turismo', exemplos: 'Agência de viagens', faixa: '40', setor: 'hospitalidade', obs: 'O imposto incide sobre a receita da agência, sem os valores repassados a terceiros.', base: 'Arts. 288 a 291' },
    // Outros
    { grupo: 'Outros serviços', servico: 'Imóveis: venda e aluguel', exemplos: 'Incorporação, venda, locação', faixa: 'proprio', setor: null, obs: 'Regime específico: redução de 50% na venda e 70% na locação, além de redutores na base.', base: 'Regime de bens imóveis' },
    { grupo: 'Outros serviços', servico: 'Bancos, seguros e serviços financeiros', exemplos: 'Instituições financeiras, seguradoras', faixa: 'proprio', setor: null, obs: 'Regime específico, com cálculo próprio.', base: 'Regime de serviços financeiros' },
    { grupo: 'Outros serviços', servico: 'Consultoria, design, fotografia e tradução', exemplos: 'Profissões não regulamentadas', faixa: 'cheia', setor: 'servicos', obs: 'Sem conselho profissional da lista do art. 127, não há redução.', base: 'Regra geral' },
    { grupo: 'Outros serviços', servico: 'Salão de beleza e estética', exemplos: 'Cabeleireiro, manicure, estética', faixa: 'cheia', setor: 'servicos', obs: '', base: 'Regra geral' },
    { grupo: 'Outros serviços', servico: 'Limpeza, manutenção e conservação', exemplos: 'Terceirização de serviços', faixa: 'cheia', setor: 'servicos', obs: '', base: 'Regra geral' },
    { grupo: 'Outros serviços', servico: 'Transporte de cargas e logística', exemplos: 'Frete, entregas', faixa: 'cheia', setor: 'servicos', obs: '', base: 'Regra geral' },
    { grupo: 'Outros serviços', servico: 'Comércio de produtos', exemplos: 'Lojas, mercados, e-commerce', faixa: 'cheia', setor: 'geral', obs: 'Alguns produtos têm regra própria (ex.: cesta básica com alíquota zero; alguns alimentos, higiene e medicamentos com 60%).', base: 'Regra geral e anexos' },
  ];
  // Palavras extras para a busca (como as pessoas costumam chamar cada serviço).
  const SINONIMOS = {
    'Consultas médicas e clínicas': 'médico medico clínica consultório pediatra cardiologista dermatologista',
    'Odontologia': 'dentista ortodontia ortodontista implante aparelho dental',
    'Hospitais, cirurgias e UTI': 'hospital cirurgião',
    'Laboratórios e exames de imagem': 'exame sangue radiologia tomografia',
    'Fisioterapia, fonoaudiologia e terapia ocupacional': 'fisioterapeuta fonoaudiólogo pilates clínico',
    'Psicologia e psiquiatria': 'psicólogo psicologo psiquiatra terapia terapeuta',
    'Enfermagem e atendimento domiciliar': 'enfermeiro cuidador',
    'Procedimentos só estéticos': 'harmonização botox clareamento estética',
    'Cursos livres, idiomas e cursos online': 'inglês ingles espanhol EAD curso online escola de idiomas',
    'Infoprodutos, mentorias e comunidades pagas': 'curso digital hotmart coach coaching comunidade membros',
    'Advocacia': 'advogado jurídico',
    'Contabilidade': 'contador contábil',
    'Engenharia e agronomia': 'engenheiro agrônomo',
    'Arquitetura e urbanismo': 'arquiteto',
    'Administração e economia': 'administrador economista',
    'Veterinária e zootecnia': 'veterinário pet animal',
    'Software, SaaS e serviços de TI': 'sistema aplicativo app programador desenvolvedor tecnologia plataforma assinatura',
    'Agência de marketing e publicidade': 'tráfego pago anúncios social media designer criativo',
    'Bares, restaurantes e lanchonetes': 'restaurante bar lanchonete comida delivery',
    'Hotelaria e parques': 'hotel pousada hospedagem',
    'Agências de turismo': 'viagem turismo',
    'Salão de beleza e estética': 'cabeleireiro barbearia manicure',
    'Comércio de produtos': 'loja varejo venda produtos',
  };
  SERVICOS.forEach((s) => { s.busca = SINONIMOS[s.servico] || ''; });

  const FAIXAS = {
    cheia: { nome: 'Alíquota cheia', reducao: 0, classe: '' },
    '30': { nome: 'Redução de 30%', reducao: 30, classe: 'accent' },
    '40': { nome: 'Redução de 40% (regime específico)', reducao: 40, classe: 'accent' },
    '60': { nome: 'Redução de 60%', reducao: 60, classe: 'ok' },
    proprio: { nome: 'Regime próprio', reducao: null, classe: 'warn' },
  };

  function viewServicos() {
    const p = db.params;
    const cheia = p.cbs + p.ibs;
    const efetiva = (f) => (FAIXAS[f].reducao == null ? 'cálculo próprio' : pct(cheia * (1 - FAIXAS[f].reducao / 100)));
    $app.innerHTML = `
      <header class="page-head">
        <div><h1>Tipos de serviço e enquadramento</h1>
          <p class="muted">Procure o serviço e veja em qual faixa da reforma tributária ele se encaixa.</p></div>
      </header>
      <section class="card">
        <h2>Como ler</h2>
        <p>O imposto novo (CBS + IBS) tem uma alíquota cheia, hoje estimada em <b>${pct(cheia)}</b>. Alguns serviços pagam só uma parte dela:</p>
        <div class="faixas">
          ${['cheia', '30', '40', '60', 'proprio'].map((f) => `<div class="faixa"><span class="badge ${FAIXAS[f].classe}">${FAIXAS[f].nome}</span>
            <b>${efetiva(f)}</b><span class="muted small">${f === 'cheia' ? 'paga tudo' : f === 'proprio' ? 'regras específicas do setor' : `paga ${100 - FAIXAS[f].reducao}% da alíquota`}</span></div>`).join('')}
        </div>
        <p class="muted small">O que vale é a <b>atividade vendida</b>, não o nome da empresa. Uma clínica que também vende produtos paga alíquota cheia sobre os produtos.</p>
      </section>
      <section class="card">
        <div class="fields">
          <div><label>Buscar serviço</label><input id="busca-servico" placeholder="Ex.: dentista, restaurante, software, curso…"></div>
          <div><label>Filtrar por faixa</label><select id="filtro-faixa"><option value="">Todas</option>${Object.keys(FAIXAS).map((f) => `<option value="${f}">${FAIXAS[f].nome}</option>`).join('')}</select></div>
        </div>
        <div id="lista-servicos" style="margin-top:14px"></div>
      </section>
      <div class="note info">Base: Lei Complementar 214/2025. As alíquotas finais ainda não foram fixadas e cada serviço depende do código NBS correto na nota. Use como guia e confirme o enquadramento com o contador.</div>`;

    const normal = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const desenhar = () => {
      const termo = normal(document.getElementById('busca-servico').value.trim());
      const faixa = document.getElementById('filtro-faixa').value;
      const itens = SERVICOS.filter((s) => (!faixa || s.faixa === faixa) && (!termo || normal(s.servico + ' ' + s.exemplos + ' ' + s.grupo + ' ' + s.obs + ' ' + s.busca).includes(termo)));
      const grupos = [...new Set(itens.map((s) => s.grupo))];
      document.getElementById('lista-servicos').innerHTML = itens.length ? grupos.map((g) => `
        <h3>${esc(g)}</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>Serviço</th><th>Enquadramento</th><th>Observação</th><th></th></tr></thead>
          <tbody>${itens.filter((s) => s.grupo === g).map((s) => `<tr>
            <td><b>${esc(s.servico)}</b><div class="muted small">${esc(s.exemplos)}</div></td>
            <td><span class="badge ${FAIXAS[s.faixa].classe}">${esc(FAIXAS[s.faixa].nome)}</span><div class="small">${efetiva(s.faixa)}</div></td>
            <td class="small">${esc(s.obs) || '—'}<div class="muted small">${esc(s.base)}</div></td>
            <td class="num">${s.setor ? `<a class="btn small secondary" href="#/simulador/setor-${s.setor}">Simular</a>` : ''}</td>
          </tr>`).join('')}</tbody></table></div>`).join('')
        : '<p class="muted">Nenhum serviço encontrado. Tente outra palavra ou confirme com o contador.</p>';
    };
    document.getElementById('busca-servico').addEventListener('input', desenhar);
    document.getElementById('filtro-faixa').addEventListener('change', desenhar);
    desenhar();
  }

  // --- portal do cliente
  function viewPortalEscolha() {
    $app.innerHTML = `
      <header class="page-head"><div><h1>Portal do cliente</h1>
        <p class="muted">Área em que o cliente envia notas e despesas. No protótipo, escolha o cliente para ver a tela como ele veria.</p></div></header>
      <div class="client-cards">${db.clientes.map((c) => `<a class="client-card" href="#/portal/${c.id}"><b>${esc(c.nome)}</b><div class="muted small">${esc(c.contato)}</div></a>`).join('') || '<p class="muted">Cadastre um cliente primeiro.</p>'}</div>`;
  }

  function viewPortal(id) {
    const c = cliente(id);
    if (!c) return naoEncontrado();
    const meses = mesesDoCliente(id);
    const mesSel = viewPortal.mes && meses.includes(viewPortal.mes) ? viewPortal.mes : (meses[0] || hojeISO().slice(0, 7));
    const r = resumoMes(id, mesSel);
    const calc = calcularReforma({ escopo: 'cbs', regimeAtual: c.regime === 'real' ? 'real' : 'presumido', setor: c.setor, receita: r.receita, despReg: r.fornecedor, despSimples: r.simples, folha: r.folha, iss: 0, creditoAnterior: 0 }, db.params);
    const lancs = db.lancamentos.filter((l) => l.clienteId === id);
    $app.innerHTML = `
      <header class="page-head">
        <div><p class="muted small" style="margin:0">Portal do cliente</p><h1>Olá, ${esc(c.contato || c.nome)}</h1><p class="muted">${esc(c.nome)}</p></div>
        <a class="btn secondary" href="#/clientes/${c.id}">Voltar à visão do escritório</a>
      </header>
      <div class="grid-2">
        <form class="card" id="form-lanc">
          <h2>Enviar nota ou despesa</h2>
          <div class="fields">
            <div class="full">${blocoCnpj('portal-cnpj', 'CNPJ do fornecedor <span class="hint">(opcional: descobre se é do Simples)</span>')}</div>
            <div class="full"><label>Tipo</label><select name="categoria">${opcoes(CATEGORIAS, 'fornecedor')}</select></div>
            <div class="full"><label>Descrição</label><input name="descricao" required placeholder="Ex.: Materiais de consumo — fornecedor X"></div>
            <div><label>Valor (R$)</label><input name="valor" type="number" step="0.01" min="0.01" required></div>
            <div><label>Data</label><input name="data" type="date" required value="${hojeISO()}"></div>
            <div class="full"><label>Arquivo da nota <span class="hint">(no protótipo, só o nome é guardado)</span></label><input name="anexo" type="file"></div>
          </div>
          <div class="form-foot"><button class="btn" type="submit">Enviar para o escritório</button></div>
          <div class="note info">Dica: compras feitas no CNPJ (PJ) geram crédito na reforma; compras no CPF não geram.</div>
        </form>
        <section class="card">
          <h2>Resumo do mês</h2>
          <label>Mês</label>
          <select id="portal-mes">${(meses.length ? meses : [mesSel]).map((m) => `<option value="${m}" ${m === mesSel ? 'selected' : ''}>${mesBR(m)}</option>`).join('')}</select>
          <table class="calc-lines" style="margin-top:10px"><tbody>
            <tr><td>Receitas</td><td class="num">${brl(r.receita)}</td></tr>
            <tr><td>Compras que geram crédito</td><td class="num">${brl(r.fornecedor)}</td></tr>
            <tr><td>Compras do Simples</td><td class="num">${brl(r.simples)}</td></tr>
            <tr><td>Folha e outras despesas</td><td class="num">${brl(r.folha + r.outros)}</td></tr>
            <tr class="total"><td>Estimativa de CBS a pagar (após créditos)</td><td class="num">${brl(calc.aPagar)}</td></tr>
            <tr><td>Crédito estimado para o próximo mês</td><td class="num">${brl(calc.creditoProx)}</td></tr>
          </tbody></table>
          <p class="muted small">Estimativa simplificada. O valor oficial é calculado pelo escritório.</p>
        </section>
      </div>
      <section class="card" style="margin-top:18px"><h2>Meus envios</h2>${tabelaLanc(lancs)}</section>`;
    document.getElementById('portal-mes').addEventListener('change', (e) => { viewPortal.mes = e.target.value; render(); });
    let fornecedor = null;
    cnpjRetornos['portal-cnpj'] = (info) => {
      fornecedor = info;
      const f = document.getElementById('form-lanc');
      if (['fornecedor', 'simples'].includes(f.elements.categoria.value)) f.elements.categoria.value = tipoEmpresa(info) === 'regular' ? 'fornecedor' : 'simples';
      if (!f.elements.descricao.value.trim()) f.elements.descricao.value = 'Compra — ' + (info.fantasia || info.razao);
    };
    document.getElementById('form-lanc').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const arq = f.get('anexo');
      const cnpjDigitado = soNumeros(document.getElementById('portal-cnpj-input').value);
      const forn = fornecedor && fornecedor.cnpj === cnpjDigitado ? fornecedor : null;
      db.lancamentos.push({
        id: uid(), clienteId: id, categoria: f.get('categoria'), descricao: f.get('descricao').trim(), valor: num(f.get('valor')),
        data: f.get('data'), anexo: arq && arq.name ? arq.name : '', status: 'pendente', origem: 'cliente',
        fornecedorCnpj: forn ? forn.cnpj : (cnpjDigitado || ''), fornecedorNome: forn ? (forn.fantasia || forn.razao) : '', fornecedorTipo: forn ? tipoEmpresa(forn) : '',
      });
      viewPortal.mes = String(f.get('data')).slice(0, 7);
      salvar();
      toast('Enviado para o escritório.');
      render();
    });
  }

  // --- atas
  function viewAtas() {
    const atas = db.atas.slice().sort((a, b) => String(b.data).localeCompare(String(a.data)));
    $app.innerHTML = `
      <header class="page-head">
        <div><h1>Atas e reuniões</h1><p class="muted">Orientações dadas aos clientes, tarefas e pendências.</p></div>
        <a class="btn" href="#/atas/nova">+ Nova ata</a>
      </header>
      <section class="card">${atas.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Data</th><th>Cliente</th><th>Tema</th><th>Tarefas abertas</th></tr></thead>
        <tbody>${atas.map((a) => {
          const ab = (a.tarefas || []).filter((t) => t.status !== 'feita').length;
          return `<tr><td>${dataBR(a.data)}</td><td>${esc(nomeCliente(a.clienteId))}</td><td><a href="#/atas/${a.id}">${esc(a.tema)}</a></td>
            <td>${ab ? `<span class="badge warn">${ab}</span>` : '<span class="badge ok">0</span>'}</td></tr>`;
        }).join('')}</tbody></table></div>` : '<p class="muted">Nenhuma ata registrada.</p>'}</section>`;
  }

  function linhaTarefa(t) {
    t = t || {};
    return `<div class="tarefa-row">
      <input name="t_texto" placeholder="Tarefa" value="${esc(t.texto || '')}">
      <input name="t_resp" placeholder="Responsável" value="${esc(t.responsavel || '')}">
      <input name="t_prazo" type="date" value="${esc(t.prazo || '')}">
      <button type="button" class="btn small secondary" data-action="removerTarefaRow">remover</button>
    </div>`;
  }

  function viewAtaForm(clienteId) {
    if (!db.clientes.length) { $app.innerHTML = '<section class="card"><p>Cadastre um cliente antes de registrar uma ata. <a href="#/clientes/novo">Novo cliente</a></p></section>'; return; }
    $app.innerHTML = `
      <header class="page-head"><div><h1>Nova ata</h1><p class="muted">Um item por linha nos campos de lista.</p></div></header>
      <form class="card" id="form-ata">
        <div class="fields">
          <div><label>Cliente</label><select name="clienteId" required>${opcoesClientes(clienteId)}</select></div>
          <div><label>Data da reunião</label><input name="data" type="date" required value="${hojeISO()}"></div>
          <div class="full"><label>Participantes</label><input name="participantes" placeholder="Nome (empresa); Nome (escritório)"></div>
          <div class="full"><label>Tema principal</label><input name="tema" required placeholder="Ex.: Impactos da reforma tributária"></div>
          <div class="full"><label>Resumo <span class="hint">(até 3 pontos principais)</span></label><textarea name="resumo"></textarea></div>
          <div class="full"><label>Orientações e decisões</label><textarea name="orientacoes"></textarea></div>
          <div class="full"><label>Tarefas</label><div id="tarefas-rows">${linhaTarefa()}</div>
            <button type="button" class="btn small secondary" data-action="addTarefaRow">+ tarefa</button></div>
          <div class="full"><label>Pontos em aberto</label><textarea name="abertos"></textarea></div>
          <div><label>Próxima reunião</label><input name="proxima" type="date"></div>
          <div><label>Pauta sugerida</label><input name="pauta"></div>
        </div>
        <div class="form-foot"><button class="btn" type="submit">Salvar ata</button><a class="btn secondary" href="#/atas">Cancelar</a></div>
      </form>`;
    document.getElementById('form-ata').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const textos = f.getAll('t_texto'), resps = f.getAll('t_resp'), prazos = f.getAll('t_prazo');
      const tarefas = textos.map((t, i) => ({ texto: t.trim(), responsavel: (resps[i] || '').trim(), prazo: prazos[i] || '', status: 'aberta' })).filter((t) => t.texto);
      const ata = {
        id: uid(), clienteId: f.get('clienteId'), data: f.get('data'), participantes: f.get('participantes').trim(), tema: f.get('tema').trim(),
        resumo: linhas(f.get('resumo')), orientacoes: linhas(f.get('orientacoes')), tarefas, abertos: linhas(f.get('abertos')),
        proxima: f.get('proxima'), pauta: f.get('pauta').trim(),
      };
      db.atas.push(ata);
      salvar();
      toast('Ata salva.');
      location.hash = '#/atas/' + ata.id;
    });
  }

  function ataMarkdown(a) {
    const lista = (arr) => (arr && arr.length ? arr.map((x) => `- ${x}`).join('\n') : '- —');
    const tarefas = (a.tarefas || []).length
      ? '| Tarefa | Responsável | Prazo | Status |\n|---|---|---|---|\n' + a.tarefas.map((t) => `| ${t.texto} | ${t.responsavel || '[RESPONSÁVEL A CONFIRMAR]'} | ${t.prazo ? dataBR(t.prazo) : '[PRAZO A DEFINIR]'} | ${t.status === 'feita' ? 'Feita' : 'A fazer'} |`).join('\n')
      : 'Nenhuma tarefa registrada.';
    return `# Ata — ${a.tema}
**Cliente:** ${nomeCliente(a.clienteId)}
**Data:** ${dataBR(a.data)}
**Participantes:** ${a.participantes || '[A CONFIRMAR]'}

## Resumo
${lista(a.resumo)}

## Orientações e decisões
${(a.orientacoes || []).length ? a.orientacoes.map((x, i) => `${i + 1}. ${x}`).join('\n') : 'Nenhuma decisão formal registrada.'}

## Tarefas
${tarefas}

## Pontos em aberto
${lista(a.abertos)}

## Próxima reunião
- **Quando:** ${a.proxima ? dataBR(a.proxima) : '[A DEFINIR]'}
- **Pauta sugerida:** ${a.pauta || '—'}
`;
  }

  function viewAta(id) {
    const a = db.atas.find((x) => x.id === id);
    if (!a) return naoEncontrado();
    const li = (arr) => (arr && arr.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted">—</p>');
    $app.innerHTML = `
      <header class="page-head">
        <div><h1>${esc(a.tema)}</h1><p class="muted"><a href="#/clientes/${a.clienteId}">${esc(nomeCliente(a.clienteId))}</a> · ${dataBR(a.data)}</p></div>
        <div class="actions">
          <button class="btn" data-action="copiarAta" data-id="${a.id}">Copiar (Markdown)</button>
          <button class="btn secondary" data-action="baixarAta" data-id="${a.id}">Baixar .md</button>
          <button class="btn secondary danger" data-action="excluirAta" data-confirm="Excluir esta ata?" data-id="${a.id}" style="color:#fff">Excluir</button>
        </div>
      </header>
      <section class="card ata">
        <p><b>Participantes:</b> ${esc(a.participantes) || '<span class="badge warn">A confirmar</span>'}</p>
        <h3>Resumo</h3>${li(a.resumo)}
        <h3>Orientações e decisões</h3>${(a.orientacoes || []).length ? `<ol>${a.orientacoes.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : '<p class="muted">Nenhuma decisão formal registrada.</p>'}
        <h3>Tarefas</h3>
        ${(a.tarefas || []).length ? `<div class="table-wrap"><table><thead><tr><th>Tarefa</th><th>Responsável</th><th>Prazo</th><th></th></tr></thead><tbody>
          ${a.tarefas.map((t, i) => `<tr><td class="${t.status === 'feita' ? 'done' : ''}">${esc(t.texto)}</td>
            <td>${t.responsavel ? esc(t.responsavel) : '<span class="badge warn">A confirmar</span>'}</td>
            <td>${t.prazo ? dataBR(t.prazo) : '<span class="muted">A definir</span>'}</td>
            <td class="num"><button class="btn small secondary" data-action="toggleTarefa" data-id="${a.id}:${i}">${t.status === 'feita' ? 'Reabrir' : 'Concluir'}</button></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">Nenhuma tarefa.</p>'}
        <h3>Pontos em aberto</h3>${li(a.abertos)}
        <h3>Próxima reunião</h3>
        <p><b>Quando:</b> ${a.proxima ? dataBR(a.proxima) : 'A definir'}<br><b>Pauta sugerida:</b> ${esc(a.pauta) || '—'}</p>
      </section>`;
  }

  // --- configurações
  function viewConfig() {
    const p = db.params;
    const campo = (nome, rot, extra) => `<div><label>${rot}</label><input name="${nome}" type="number" step="0.01" value="${esc(p[nome])}" ${extra || ''}></div>`;
    $app.innerHTML = `
      <header class="page-head"><div><h1>Parâmetros e dados</h1><p class="muted">Alíquotas usadas no simulador e backup dos dados.</p></div></header>
      <form class="card" id="form-params">
        <h2>Alíquotas de referência</h2>
        <div class="fields">
          ${campo('cbs', 'CBS — alíquota de referência (%)')}
          ${campo('ibs', 'IBS — alíquota de referência (%)')}
          ${campo('pisCofinsCumulativo', 'PIS/COFINS cumulativo — Presumido (%)')}
          ${campo('pisCofinsNaoCumulativo', 'PIS/COFINS não cumulativo — Real (%)')}
          ${campo('issPadrao', 'ISS padrão (%)')}
          ${campo('creditoSimples', 'Crédito sobre compras do Simples (%)')}
          ${campo('irPF', 'Alíquota de IR da PF usada nos cenários (%)')}
          ${campo('inssAutonomo', 'INSS da empresa sobre pagamento a autônomo (%)')}
        </div>
        <h2 style="margin-top:20px">Distribuição de lucros</h2>
        <div class="fields">
          ${campo('divLimite', 'Limite mensal isento hoje (R$)')}
          ${campo('divAliqAtual', 'Alíquota acima do limite hoje (%)')}
          <div><label>Base da alíquota acima do limite</label><select name="divBase">
            <option value="total" ${p.divBase === 'total' ? 'selected' : ''}>Sobre o valor total</option>
            <option value="excedente" ${p.divBase === 'excedente' ? 'selected' : ''}>Só sobre o excedente</option></select></div>
          ${campo('divAliqPL', 'Cenário do projeto de lei (%)')}
        </div>
        <div class="note info">Reduções por setor usadas no simulador: ${Object.values(SETORES).map((s) => `${esc(s.nome)} ${s.reducao}%`).join(' · ')}.</div>
        <div class="form-foot"><button class="btn" type="submit">Salvar parâmetros</button><button class="btn secondary" type="button" data-action="restaurarParams">Restaurar padrão</button></div>
      </form>
      <section class="card">
        <h2>Backup</h2>
        <p class="muted">No protótipo os dados ficam só neste navegador. Exporte para não perder.</p>
        <div class="actions">
          <button class="btn" data-action="exportar">Exportar dados (.json)</button>
          <button class="btn secondary" data-action="copiarBackup">Copiar backup</button>
          <label class="btn secondary" style="margin:0">Importar .json<input id="importar" type="file" accept="application/json" hidden></label>
          <button class="btn secondary" data-action="resetDemo" data-confirm="Substituir todos os dados pelos dados de exemplo?">Recarregar dados de exemplo</button>
          <button class="btn danger" data-action="limparTudo" data-confirm="Apagar todos os clientes, lançamentos e atas?">Apagar tudo</button>
        </div>
      </section>`;
    document.getElementById('form-params').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      Object.keys(PARAMS_PADRAO).forEach((k) => { if (f.has(k)) db.params[k] = k === 'divBase' ? f.get(k) : num(f.get(k)); });
      salvar();
      toast('Parâmetros salvos.');
    });
    document.getElementById('importar').addEventListener('change', (e) => {
      const arq = e.target.files[0];
      if (!arq) return;
      const leitor = new FileReader();
      leitor.onload = () => {
        try { db = normalizar(JSON.parse(leitor.result)); salvar(); toast('Dados importados.'); render(); } catch (err) { toast('Arquivo inválido.'); }
      };
      leitor.readAsText(arq);
    });
  }

  function naoEncontrado() {
    $app.innerHTML = '<section class="card"><h2>Não encontrado</h2><p>Esse registro não existe mais. <a href="#/">Voltar ao painel</a></p></section>';
  }

  // ---------------------------------------------------------------- ações
  const acoes = {
    conferir(id) { const l = db.lancamentos.find((x) => x.id === id); if (l) { l.status = 'conferido'; salvar(); render(); } },
    excluirLanc(id) { db.lancamentos = db.lancamentos.filter((x) => x.id !== id); salvar(); render(); },
    excluirCliente(id) {
      db.clientes = db.clientes.filter((c) => c.id !== id);
      db.lancamentos = db.lancamentos.filter((l) => l.clienteId !== id);
      db.atas = db.atas.filter((a) => a.clienteId !== id);
      salvar(); location.hash = '#/clientes';
    },
    excluirAta(id) { db.atas = db.atas.filter((a) => a.id !== id); salvar(); location.hash = '#/atas'; },
    toggleTarefa(ref) {
      const [ataId, idx] = ref.split(':');
      const a = db.atas.find((x) => x.id === ataId);
      const t = a && a.tarefas[Number(idx)];
      if (t) { t.status = t.status === 'feita' ? 'aberta' : 'feita'; salvar(); render(); }
    },
    addTarefaRow() { document.getElementById('tarefas-rows').insertAdjacentHTML('beforeend', linhaTarefa()); },
    removerTarefaRow(_id, el) { el.closest('.tarefa-row').remove(); },
    copiarAta(id) { const a = db.atas.find((x) => x.id === id); if (a) copiar(ataMarkdown(a)); },
    baixarAta(id) {
      const a = db.atas.find((x) => x.id === id);
      if (a) baixar(`ata-${a.data || 'reuniao'}.md`, ataMarkdown(a), 'text/markdown;charset=utf-8');
    },
    copiarSimulacao() { const t = textoSimulacao(); if (t) copiar(t); },
    restaurarParams() { db.params = Object.assign({}, PARAMS_PADRAO); salvar(); toast('Parâmetros restaurados.'); render(); },
    consultarCnpj(prefixo) { consultarCnpj(prefixo); },
    copiarBackup() { copiar(JSON.stringify(db, null, 2)); },
    exportar() { baixar(`leaohub-backup-${hojeISO()}.json`, JSON.stringify(db, null, 2), 'application/json'); },
    resetDemo() { db = dadosDemo(); salvar(); toast('Dados de exemplo carregados.'); location.hash = '#/'; render(); },
    limparTudo() {
      db = normalizar({ params: db.params }); salvar(); toast('Dados apagados.'); location.hash = '#/'; render();
    },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || !acoes[el.dataset.action]) return;
    e.preventDefault();
    const executar = () => acoes[el.dataset.action](el.dataset.id, el, e);
    if (el.dataset.confirm) confirmar(el.dataset.confirm, executar); else executar();
  });

  // Enter no campo de CNPJ consulta, em vez de enviar o formulário.
  document.addEventListener('keydown', (e) => {
    const el = e.target.closest && e.target.closest('[data-cnpj]');
    if (el && e.key === 'Enter') { e.preventDefault(); consultarCnpj(el.dataset.cnpj); }
  });

  // ---------------------------------------------------------------- rotas
  function marcarNav(rotaAtual) {
    document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === rotaAtual));
  }

  function render() {
    const [a, b, c] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    marcarNav(a || '');
    try {
      switch (a) {
        case undefined: viewPainel(); break;
        case 'clientes':
          if (!b) viewClientes();
          else if (b === 'novo') viewClienteForm();
          else if (c === 'editar') viewClienteForm(b);
          else viewCliente(b);
          break;
        case 'simulador': viewSimulador(b); break;
        case 'cenarios': viewCenarios(); break;
        case 'servicos': viewServicos(); break;
        case 'portal': if (b) viewPortal(b); else viewPortalEscolha(); break;
        case 'atas':
          if (!b) viewAtas();
          else if (b === 'nova') viewAtaForm(c);
          else viewAta(b);
          break;
        case 'config': viewConfig(); break;
        default: viewPainel();
      }
    } catch (err) {
      console.error(err);
      $app.innerHTML = `<section class="card"><h2>Algo deu errado</h2><p>${esc(err.message)}</p></section>`;
    }
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', render);
  // Expõe o cálculo para testes automatizados.
  window.LeaoHub = { calcularReforma, calcularDividendos, PARAMS_PADRAO };
  render();
})();
