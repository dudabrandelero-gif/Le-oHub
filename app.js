/*
 * LeãoHub — protótipo de sistema para escritórios de contabilidade.
 * Módulos: login, minhas empresas, simulador da reforma (CBS/IBS) com histórico e relatório,
 * cenários PF x PJ, tipos de serviço, quadro do que ainda não está definido e minha conta.
 * Dados de conta, empresas e simulações: store.js (modo demonstração ou Supabase).
 * Parâmetros (alíquotas): localStorage do navegador.
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
  // Revisão de nov/2026:
  // - CBS 2027–2028: referência de 11,3% calculada pelo TCU em 28/10/2026 (cobrança de 11,2% + 0,1% de IBS de teste).
  // - Regime completo (2033): estimativa do Comitê Gestor do IBS (Res. CGIBS 14/2026): IBS 18,70% + CBS 9,21% = 27,91%.
  const VERSAO_PARAMS = 2;
  const PARAMS_PADRAO = {
    versao: VERSAO_PARAMS,
    cbs: 11.3,
    cbs2033: 9.21,
    ibs: 18.7,
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
  const dataBR = (iso) => { if (!iso) return '—'; const [y, m, d] = String(iso).slice(0, 10).split('-'); return d && m && y ? `${d}/${m}/${y}` : esc(iso); };

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
        ? `<span class="badge warn">Optante do Simples Nacional${info.desde ? ' desde ' + dataBR(info.desde) : ''}: crédito só do que ele paga no DAS (bem menor), a menos que pague CBS/IBS "por fora"</span>`
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

  // ---------------------------------------------------------------- dados (só parâmetros)
  function migrarParams(antigos) {
    const p = Object.assign({}, PARAMS_PADRAO, antigos || {});
    if (!antigos || (antigos.versao || 1) < VERSAO_PARAMS) {
      ['versao', 'cbs', 'cbs2033', 'ibs', 'creditoSimples', 'divAliqPL'].forEach((k) => { p[k] = PARAMS_PADRAO[k]; });
    }
    return p;
  }
  function lerArmazenado() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { return {}; }
  }
  function salvar() {
    // Grava só os parâmetros, mantendo o resto do que já estava salvo.
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.assign(lerArmazenado(), { params: db.params }))); } catch (e) { /* ignora */ }
  }
  const db = { params: migrarParams(lerArmazenado().params) };

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
    const cbsRef = comIbs ? p.cbs2033 : p.cbs; // 2027–2028: CBS do TCU; 2033: estimativa do regime completo
    const aliqCbsEf = cbsRef * fator;
    const aliqIbsEf = comIbs ? p.ibs * fator : 0;
    const debCbs = inp.receita * aliqCbsEf / 100;
    const debIbs = inp.receita * aliqIbsEf / 100;
    const debito = debCbs + debIbs;
    const aliqCredito = cbsRef + (comIbs ? p.ibs : 0);
    const credFornec = inp.despReg * aliqCredito / 100;
    const credSimples = inp.despSimples * p.creditoSimples / 100;
    const credito = credFornec + credSimples + inp.creditoAnterior;
    const saldo = Math.round((debito - credito) * 100) / 100; // arredonda em centavos
    const aPagar = Math.max(0, saldo);
    const creditoProx = Math.max(0, -saldo);

    return {
      setor, fator, comIbs, cbsRef, aliqPC, pcBruto, pcCredito, pcHoje, issHoje, totalHoje,
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
  const opcoes = (obj, sel, rotulo) => Object.keys(obj).map((k) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(rotulo ? rotulo(obj[k]) : obj[k])}</option>`).join('');

  // ---------------------------------------------------------------- telas
  // --- simulador
  async function viewSimulador(param) {
    const vez = renderVez;
    const p = db.params;
    const empresas = await S.empresas.listar();
    const ini = { receita: 50000, despReg: 20000, despSimples: 0, folha: 0, setor: 'saude', regimeAtual: 'presumido', escopo: 'cbs', iss: p.issPadrao, creditoAnterior: 0, dividendos: 0, empresaId: '', titulo: '' };
    let origem = '';
    // '#/simulador/setor-xxx' (da aba Tipos de serviço), 'empresa-<id>' (de Minhas empresas) ou 'sim-<id>' (simulação salva).
    if (param && param.startsWith('setor-') && SETORES[param.slice(6)]) ini.setor = param.slice(6);
    if (param && param.startsWith('empresa-')) {
      const emp = empresas.find((e) => e.id === param.slice(8));
      if (emp) {
        Object.assign(ini, { empresaId: emp.id, setor: SETORES[emp.setor] ? emp.setor : ini.setor, regimeAtual: emp.regime === 'real' ? 'real' : 'presumido', receita: num(emp.faturamento) || ini.receita, despReg: 0 });
        origem = 'Receita preenchida com o faturamento médio da empresa. Informe as compras e a folha do mês.';
      }
    }
    if (param && param.startsWith('sim-')) {
      const sim = await S.simulacoes.obter(param.slice(4));
      if (sim && sim.dados && sim.dados.inp) {
        Object.assign(ini, sim.dados.inp, { dividendos: sim.dados.dividendos || 0, empresaId: sim.empresa_id || '', titulo: sim.titulo || '' });
        origem = `Simulação salva em ${dataBR(sim.criado_em)}, recalculada com as alíquotas atuais.`;
      }
    }
    if (vez !== renderVez) return;
    const campo = (nome, rot, val, extra) => `<div><label>${rot}</label><input name="${nome}" type="number" step="0.01" min="0" value="${esc(val)}" ${extra || ''}></div>`;
    $app.innerHTML = `
      <header class="page-head">
        <div><h1>Simulador da reforma tributária</h1><p class="muted">Compare o imposto de hoje com CBS/IBS, créditos e split payment.</p></div>
        <div class="actions">
          <button class="btn secondary" data-action="copiarSimulacao">Copiar resumo</button>
          <button class="btn secondary" data-action="relatorioAtual">Gerar relatório (PDF)</button>
          <button class="btn" data-action="salvarSimulacao">Salvar simulação</button>
        </div>
      </header>
      <div class="sim">
        <form class="card" id="form-sim">
          <div class="fields" style="grid-template-columns:1fr">
            <div><label>Empresa</label><select name="empresaId"><option value="">Sem empresa (simulação livre)</option>${empresas.map((e) => `<option value="${e.id}" ${e.id === ini.empresaId ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}</select>
              ${origem ? `<div class="muted small" style="margin-top:4px">${esc(origem)}</div>` : ''}
              ${empresas.length ? '' : '<div class="muted small" style="margin-top:4px"><a href="#/empresas/nova">Cadastre sua empresa</a> para salvar o histórico.</div>'}</div>
            <div><label>Nome da simulação <span class="hint">(opcional)</span></label><input name="titulo" value="${esc(ini.titulo)}" placeholder="Ex.: Novembro com novas compras"></div>
            <div><label>O que comparar</label><select name="escopo">
              <option value="cbs" ${ini.escopo !== 'cbs_ibs' ? 'selected' : ''}>2027–2028: PIS/COFINS → CBS (${pct(p.cbs)})</option>
              <option value="cbs_ibs" ${ini.escopo === 'cbs_ibs' ? 'selected' : ''}>2033 em diante: PIS/COFINS + ISS → CBS + IBS (${pct(p.cbs2033 + p.ibs)})</option></select></div>
            <div><label>Regime atual</label><select name="regimeAtual">
              <option value="presumido" ${ini.regimeAtual !== 'real' ? 'selected' : ''}>Lucro Presumido (PIS/COFINS ${pct(p.pisCofinsCumulativo)})</option>
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
      const dividendos = num(f.get('dividendos'));
      const div = calcularDividendos(dividendos, p);
      viewSimulador.ultimo = { inp, r, div, dividendos, empresaId: f.get('empresaId') || '', titulo: f.get('titulo').trim() };
      document.getElementById('sim-resultado').innerHTML = resultadoSimulacao(inp, r, div, dividendos, p);
    };
    form.addEventListener('input', atualizar);
    form.addEventListener('change', atualizar);
    form.addEventListener('submit', (e) => e.preventDefault());
    atualizar();
  }

  // Resumo numérico guardado junto com a simulação (para listar sem recalcular).
  const resumoResultado = (r) => ({ totalHoje: r.totalHoje, aPagar: r.aPagar, diferenca: r.diferenca, creditoProx: r.creditoProx, debito: r.debito, credito: r.credito, splitRetido: r.splitRetido });
  const copiaParams = () => { const c = {}; ['cbs', 'cbs2033', 'ibs', 'pisCofinsCumulativo', 'pisCofinsNaoCumulativo', 'creditoSimples', 'divLimite', 'divAliqAtual', 'divBase', 'divAliqPL'].forEach((k) => { c[k] = db.params[k]; }); return c; };

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
        <tr><td>Débito CBS: ${brl(inp.receita)} × ${pct(r.aliqCbsEf)} <span class="muted small">(${pct(r.cbsRef)} × ${pct(r.fator * 100)})</span></td><td class="num">${brl(r.debCbs)}</td></tr>
        ${r.comIbs ? `<tr><td>Débito IBS: ${brl(inp.receita)} × ${pct(r.aliqIbsEf)}</td><td class="num">${brl(r.debIbs)}</td></tr>` : ''}
        <tr><td>(−) Crédito sobre compras fora do Simples: ${brl(inp.despReg)} × ${pct(r.aliqCredito)}</td><td class="num">−${brl(r.credFornec)}</td></tr>
        <tr><td>(−) Crédito sobre compras do Simples: ${brl(inp.despSimples)} × ${pct(p.creditoSimples)} <span class="muted small">(só o CBS/IBS pago no DAS, informado na nota; ajuste em Parâmetros)</span></td><td class="num">−${brl(r.credSimples)}</td></tr>
        ${inp.creditoAnterior ? `<tr><td>(−) Crédito acumulado do mês anterior</td><td class="num">−${brl(inp.creditoAnterior)}</td></tr>` : ''}
        <tr><td>Folha de pagamento (${brl(inp.folha)}): não gera crédito</td><td class="num">${brl(0)}</td></tr>
        <tr class="total"><td>A pagar com a reforma</td><td class="num">${brl(r.aPagar)}</td></tr>
      </tbody></table>

      <h3>Split payment e capital de giro</h3>
      <p>Quando o split payment estiver valendo, o imposto é retido no momento do recebimento: cerca de <b>${brl(r.splitRetido)}</b> (${pct(r.splitPctReceita)} da receita) deixariam de cair na conta, e os créditos são compensados depois.</p>
      <p class="muted small">Cronograma: começa em 2027 de forma <b>opcional</b> e só entre empresas (Pix, boleto, transferência). A obrigatoriedade ainda não tem data (a Receita trabalha com 2028). Vendas para pessoa física e pagamentos com cartão ficam fora da primeira fase.</p>

      ${dividendos > 0 ? `<h3>Distribuição de lucros</h3>
      <table class="calc-lines"><tbody>
        <tr><td>Regra atual: isento até ${brl(p.divLimite)}/mês; acima disso, ${pct(p.divAliqAtual)} sobre o ${p.divBase === 'excedente' ? 'excedente' : 'total'}</td><td class="num">${brl(div.atual)}</td></tr>
        <tr><td>Cenário hipotético: ${pct(p.divAliqPL)} sobre qualquer valor <span class="muted small">(não há lei aprovada)</span></td><td class="num">${brl(div.pl)}</td></tr>
      </tbody></table>
      <p class="muted small">Regra atual: Lei 15.270/2025, em vigor desde jan/2026. O valor retido é antecipação: no ajuste anual entra o imposto mínimo de quem tem renda acima de R$ 600 mil/ano (IRPFM), e pode haver restituição.</p>` : ''}

      ${r.credFornec >= r.debito && inp.despReg > 0 ? '<div class="note">Os créditos sobre compras estão zerando ou superando o débito. Isso acontece porque a redução do setor vale para a venda (saída), mas o crédito entra com a alíquota cheia. Essa regra ainda pode mudar, então não conte com esse crédito no planejamento.</div>' : ''}
      <div class="note info">Alíquotas editáveis em <a href="#/config">Parâmetros</a>: CBS de 2027 = 11,3% (cálculo do TCU, falta o Senado fixar); regime completo de 2033 = estimativa do Comitê Gestor do IBS. A conta não inclui os anos intermediários da transição (2029–2032). Não substitui a análise do contador.</div>`;
  }

  function textoSimulacao() {
    const s = viewSimulador.ultimo;
    if (!s) return '';
    const { inp, r, div, dividendos } = s;
    const out = [
      'Simulação da reforma tributária' + (s.titulo ? ' — ' + s.titulo : ''),
      `Receita do mês: ${brl(inp.receita)} | Compras com crédito: ${brl(inp.despReg)} | Compras do Simples: ${brl(inp.despSimples)} | Folha: ${brl(inp.folha)}`,
      `Hoje (${r.comIbs ? 'PIS/COFINS + ISS' : 'PIS/COFINS'}): ${brl(r.totalHoje)}`,
      `Reforma: débito ${brl(r.debito)} − créditos ${brl(r.credito)} = a pagar ${brl(r.aPagar)}`,
      `Diferença por mês: ${r.diferenca > 0 ? '+' : ''}${brl(r.diferenca)}`,
      `Crédito para o próximo mês: ${brl(r.creditoProx)}`,
      `Split payment: cerca de ${brl(r.splitRetido)} retidos no recebimento (${pct(r.splitPctReceita)} da receita).`,
    ];
    if (dividendos > 0) out.push(`Dividendos (${brl(dividendos)}): regra atual (Lei 15.270/2025) ${brl(div.atual)} | cenário hipotético ${brl(div.pl)}`);
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
    const aliqCheia = v.comIbs ? p.cbs2033 + p.ibs : p.cbs;
    const aliqSetor = (setor) => aliqCheia * (1 - (SETORES[setor] || SETORES.geral).reducao / 100);
    const pc = (valor, aliq) => valor * aliq / 100;

    const compra = [
      { id: 'pf', nome: 'Pessoa física (autônomo, sem empresa)', credito: 0 },
      { id: 'mei', nome: 'MEI', credito: 0 },
      { id: 'simples', nome: `Empresa do Simples Nacional (crédito = CBS/IBS pago no DAS; usando ${pct(p.creditoSimples)})`, credito: pc(v.c1Valor, p.creditoSimples) },
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
              <option value="cbs">2027–2028: só CBS (${pct(p.cbs)}), substitui PIS/COFINS</option>
              <option value="cbs_ibs">2033 em diante: CBS + IBS (${pct(p.cbs2033 + p.ibs)}), regime completo</option></select></div>
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
        <p class="muted small">Se o fornecedor tiver redução no setor dele, o crédito é menor. Compras no CPF não geram crédito para a empresa. Pela LC 214/2025 (art. 47), o crédito só vale quando o fornecedor efetivamente paga o imposto: fornecedor irregular vira risco.</p>`;

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
        <tr><td>Cenário hipotético: ${pct(p.divAliqPL)} sobre qualquer valor <span class="muted small">(não há lei aprovada)</span></td><td class="num">${brl(r.div.pl)}</td></tr></tbody></table>
        <p class="muted small">Regra atual: Lei 15.270/2025, em vigor desde jan/2026. O valor retido é antecipação: no ajuste anual entra o imposto mínimo de quem tem renda acima de R$ 600 mil/ano (IRPFM), e pode haver restituição.</p>`;
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
    const cheia = p.cbs2033 + p.ibs;
    const efetiva = (f) => (FAIXAS[f].reducao == null ? 'cálculo próprio' : pct(cheia * (1 - FAIXAS[f].reducao / 100)));
    $app.innerHTML = `
      <header class="page-head">
        <div><h1>Tipos de serviço e enquadramento</h1>
          <p class="muted">Procure o serviço e veja em qual faixa da reforma tributária ele se encaixa.</p></div>
      </header>
      <section class="card">
        <h2>Como ler</h2>
        <p>Quando a reforma estiver completa (2033), o imposto novo (CBS + IBS) terá uma alíquota cheia hoje estimada em <b>${pct(cheia)}</b> (estimativa do Comitê Gestor do IBS). Em 2027 e 2028 só a CBS é cobrada de verdade: <b>${pct(p.cbs)}</b>, com as mesmas reduções. Alguns serviços pagam só uma parte da alíquota:</p>
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

  // --- quadro: o que ainda não está definido (revisado em 16/11/2026)
  // coluna: 'data' (tem prazo), 'semdata' (sem data), 'divergencia' (interpretação/condição), 'limite' (limitação do LeãoHub)
  const PENDENCIAS = [
    { coluna: 'data', titulo: 'Alíquota da CBS de 2027', situacao: 'O TCU calculou 11,3% em 28/10/2026.', falta: 'O Senado fixar o percentual. Se não decidir no prazo, vale o cálculo do TCU.', quando: 'Até 15/12/2026', sistema: 'Usa 11,3% (em 2027–2028 a cobrança é 11,2% de CBS + 0,1% de IBS de teste).', param: true, fonte: { nome: 'Alianzo', url: 'https://alianzo.com.br/blog/aliquota-da-cbs-de-113-em-2027-o-que-significa-para-a-sua-empresa/' } },
    { coluna: 'data', titulo: 'Simples Nacional: pagar CBS/IBS dentro ou fora do DAS', situacao: 'A opção é semestral. A janela do 1º semestre de 2027 foi em setembro/2026.', falta: 'Cancelamento da opção até 30/11/2026. Próxima janela: 01 a 31/03/2027.', quando: '30/11/2026 e março/2027', sistema: 'Os cenários mostram o fornecedor do Simples "por fora" com crédito cheio.', param: false, fonte: { nome: 'Taxcel', url: 'https://taxcel.com.br/simples-nacional-regime-regular-ibs-cbs-opcao-semestral' } },
    { coluna: 'semdata', titulo: 'Alíquota definitiva do IBS', situacao: 'O Comitê Gestor usa 18,70% só como estimativa para cálculos internos.', falta: 'Fixação oficial das alíquotas estaduais e municipais. O IBS é a soma das alíquotas do estado e do município de destino, então pode variar por cidade.', quando: 'Prevista para 2029', sistema: 'Usa 18,70% no regime completo (2033).', param: true, fonte: { nome: 'Contadores.cnt.br', url: 'https://contadores.cnt.br/projetos/46/noticias/tecnicas/2026/08/05/reforma-tributaria-aliquota-padrao-e-estimativa-18-7-do-ibs.html' } },
    { coluna: 'semdata', titulo: 'Alíquota cheia de 2033 e o teto de 26,5%', situacao: 'A estimativa oficial é 27,91% (IBS 18,70% + CBS 9,21%), acima do teto de 26,5%.', falta: 'O teto não é automático: se passar dele, o governo precisa propor medidas de redução ao Congresso.', quando: 'Avaliação com dados de 2030', sistema: 'Usa 27,91% no regime completo. Os anos de 2029 a 2032 não são calculados.', param: true, fonte: { nome: 'APET', url: 'https://apet.org.br/artigos/iva-a-2791-a-trava-dos-265-protege-a-arrecadacao-nao-voce/' } },
    { coluna: 'semdata', titulo: 'Split payment obrigatório', situacao: 'Começa em 2027 de forma opcional, só entre empresas (Pix, boleto, transferência).', falta: 'Data de obrigatoriedade. Vendas para pessoa física e cartão ficam fora da 1ª fase.', quando: 'Sem data (Receita trabalha com 2028)', sistema: 'O simulador mostra quanto ficaria retido quando o split estiver valendo.', param: false, fonte: { nome: 'Convergência Digital', url: 'https://convergenciadigital.com.br/?p=55591' } },
    { coluna: 'semdata', titulo: 'Quanto de crédito gera a compra do Simples', situacao: 'O crédito é limitado ao CBS/IBS que o fornecedor paga dentro do DAS.', falta: 'O percentual depende do anexo e da faixa de cada fornecedor e vem informado na nota.', quando: 'A partir das notas de 2027', sistema: 'Usa 0% (conservador). Ajuste em Parâmetros se souber o percentual.', param: true, fonte: { nome: 'UAI', url: 'https://www.uai.com.br/?p=184595' } },
    { coluna: 'semdata', titulo: 'Rejeição de nota fiscal sem os campos de IBS/CBS', situacao: 'A regra que rejeitaria a nota sem os grupos de IBS e CBS foi adiada.', falta: 'Nova data de entrada em produção.', quando: 'Sem data', sistema: 'Não afeta os cálculos. Vale preencher os campos mesmo assim.', param: false, fonte: { nome: 'Escola Superior ESN', url: 'https://escolasuperioresn.com.br/?p=12495' } },
    { coluna: 'divergencia', titulo: 'Cursos livres, idiomas e cursos online', situacao: 'Fontes divergem se entram na redução de 60% da educação.', falta: 'Posição oficial ou consolidação do entendimento.', quando: 'Sem data', sistema: 'Usa alíquota cheia (mais cauteloso).', param: false, fonte: { nome: 'Taxup', url: 'https://taxup.com.br/reforma-tributaria-educacao/' } },
    { coluna: 'divergencia', titulo: 'Procedimentos só estéticos em clínicas', situacao: 'Procedimento com finalidade exclusivamente cosmética pode ficar fora da redução da saúde.', falta: 'Classificação de cada procedimento pelo código NBS.', quando: 'Caso a caso', sistema: 'Aparece em Tipos de serviço como alíquota cheia, para confirmar.', param: false, fonte: { nome: 'Fiscalia', url: 'https://fiscalia.app/blog/clinicas-medicas-reducao-60-reforma-tributaria' } },
    { coluna: 'divergencia', titulo: 'Veterinários: 30% ou 60%?', situacao: 'Hoje estão na lista de profissões com 30%.', falta: 'Há projeto no Senado para passá-los para a lista da saúde (60%).', quando: 'Depende do projeto', sistema: 'Usa 30%.', param: false, fonte: { nome: 'Senado Federal', url: 'https://legis.senado.leg.br/sdleg-getter/documento?dm=9958173' } },
    { coluna: 'divergencia', titulo: 'Reduções com condições', situacao: 'Segurança da informação, atividades desportivas, produções culturais e profissões do art. 127 têm redução só se cumprirem condições (ex.: sócios habilitados no conselho, sem empresa como sócia).', falta: 'Conferir as condições de cada cliente.', quando: 'Caso a caso', sistema: 'Mostra a redução com o aviso "confirmar com o contador".', param: false, fonte: { nome: 'CRC-MG', url: 'https://crcmg.org.br/wp-content/uploads/2025/07/ApresentacaoReformaTributariaDanielCardosoProfissionaisContabeis.pdf' } },
    { coluna: 'divergencia', titulo: 'Dividendos: "15% sobre qualquer valor"', situacao: 'Citado na reunião, mas não há lei aprovada com essa regra. A regra em vigor é 10% sobre o total acima de R$ 50 mil/mês (Lei 15.270/2025).', falta: 'Confirmar com a contabilidade de onde veio o número (o 15% na fonte que existe é do JCP).', quando: '—', sistema: 'Mostra 15% só como "cenário hipotético".', param: true, fonte: { nome: 'Tributário nos Bastidores', url: 'https://tributarionosbastidores.com.br/2026/10/trf4-questiona-retencao-de-10-sobre-lucros-e-dividendos-acima-de-50-000/amp/' } },
    { coluna: 'limite', titulo: 'Cobrança ainda não ligada', situacao: 'Os planos aparecem no site e no app, mas o pagamento online ainda não está conectado.', falta: 'Escolher a plataforma de cobrança (ex.: Asaas, Mercado Pago) e ligar a assinatura.', quando: 'Próxima etapa', sistema: 'Fim do teste mostra a tela "Assinar". O plano ativo é trocado manualmente no Supabase.', param: false, fonte: null },
    { coluna: 'limite', titulo: 'Alíquotas iguais para todos ficam no navegador', situacao: 'Os Parâmetros (alíquotas) são salvos no navegador de cada usuário, não na conta.', falta: 'Guardar as alíquotas oficiais no servidor e atualizar todos de uma vez.', quando: 'Próxima etapa', sistema: 'Quando as alíquotas oficiais mudarem, uma nova versão do LeãoHub atualiza o padrão de todos os usuários.', param: true, fonte: null },
    { coluna: 'limite', titulo: 'Transição 2029–2032 não calculada', situacao: 'O sistema compara hoje x 2027–2028 e hoje x 2033.', falta: 'Calcular a troca gradual de ICMS/ISS por IBS ano a ano.', quando: 'Próxima etapa', sistema: '—', param: false, fonte: null },
    { coluna: 'limite', titulo: 'Crédito de fornecedor com redução', situacao: 'O crédito das compras usa a alíquota cheia.', falta: 'Permitir informar a redução do setor de cada fornecedor (o crédito é o imposto que ele cobrou).', quando: 'Próxima etapa', sistema: 'Pode superestimar o crédito quando o fornecedor tem redução.', param: false, fonte: null },
    { coluna: 'limite', titulo: 'IBS por cidade', situacao: 'O sistema usa uma alíquota única de IBS.', falta: 'Estados e municípios podem fixar alíquotas próprias.', quando: 'Quando as alíquotas locais saírem', sistema: 'Ajuste o IBS em Parâmetros para a cidade do cliente.', param: true, fonte: null },
  ];
  const COLUNAS_PEND = {
    data: { nome: 'Tem prazo para sair', classe: 'accent', dica: 'Já existe data. Atualize os Parâmetros quando sair.' },
    semdata: { nome: 'Ainda sem data definida', classe: 'warn', dica: 'Depende de regulamentação ou de cálculo oficial.' },
    divergencia: { nome: 'Interpretação ou condições', classe: 'warn', dica: 'Confirmar caso a caso com o contador.' },
    limite: { nome: 'Limitações do LeãoHub', classe: '', dica: 'O que o sistema ainda não faz.' },
  };

  function viewPendencias() {
    $app.innerHTML = `
      <header class="page-head">
        <div><h1>O que ainda não está definido</h1>
          <p class="muted">Quadro das regras da reforma que ainda podem mudar, e de como o LeãoHub trata cada uma. Revisado em 16/11/2026.</p></div>
      </header>
      <div class="quadro">
        ${Object.keys(COLUNAS_PEND).map((k) => {
          const itens = PENDENCIAS.filter((x) => x.coluna === k);
          return `<section class="coluna">
            <div class="coluna-head"><span class="badge ${COLUNAS_PEND[k].classe}">${esc(COLUNAS_PEND[k].nome)}</span><span class="muted small">${itens.length}</span></div>
            <p class="muted small">${esc(COLUNAS_PEND[k].dica)}</p>
            ${itens.map((x) => `<article class="pend">
              <h3>${esc(x.titulo)}</h3>
              <p class="small">${esc(x.situacao)}</p>
              <p class="small"><b>Falta:</b> ${esc(x.falta)}</p>
              <p class="small"><b>Quando:</b> ${esc(x.quando)}</p>
              <p class="small muted"><b>No sistema:</b> ${esc(x.sistema)}${x.param ? ' <a href="#/config">Parâmetros</a>' : ''}</p>
              ${x.fonte ? `<p class="small"><a href="${esc(x.fonte.url)}" target="_blank" rel="noopener">Fonte: ${esc(x.fonte.nome)}</a></p>` : ''}
            </article>`).join('')}
          </section>`;
        }).join('')}
      </div>
      <div class="note info">Quando um item for definido, basta atualizar o valor em Parâmetros. As estimativas não substituem a análise do contador.</div>`;
  }

  // ---------------------------------------------------------------- sessão e conta
  let usuario = null;
  let conta = null;
  let renderVez = 0;
  const S = window.LeaoStore;
  const P = window.LeaoPlanos;
  const CFG = window.LEAOHUB_CONFIG || {};
  const corValida = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#0f766e');
  const logoValido = (l) => (typeof l === 'string' && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(l) ? l : '');
  const nomePlano = (id) => (P.planos.find((x) => x.id === id) || {}).nome || id;
  const REGIMES_EMP = { simples: 'Simples Nacional', presumido: 'Lucro Presumido', real: 'Lucro Real' };

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

  // Moldura: com menu (logado) ou tela cheia (entrar/cadastrar).
  function montarMoldura(logado) {
    document.body.classList.toggle('sem-menu', !logado);
    const box = document.getElementById('usuario-box');
    if (box) {
      const rec = logado ? P.recursos(conta) : null;
      box.innerHTML = logado ? `
        <div class="usuario-nome">${esc((conta && conta.nome) || usuario.email)}</div>
        <div class="usuario-plano">${esc(rec.nomePlano)}${rec.emTeste ? ` · ${rec.diasTeste} dia(s)` : ''}</div>
        <button class="link-btn" data-action="sair">Sair</button>` : '';
    }
    const aviso = document.getElementById('aviso-demo');
    if (aviso) {
      aviso.hidden = S.modo !== 'demo';
      aviso.textContent = S.aviso || 'Modo demonstração: os dados ficam só neste navegador e não há senha. Para usar com login de verdade, siga o passo a passo do README (Supabase).';
    }
  }

  // ---------------------------------------------------------------- entrar / cadastrar
  function telaAuth(titulo, corpo) {
    $app.innerHTML = `<div class="auth"><div class="auth-card card">
      <div class="auth-marca">LeãoHub</div>
      <h1>${titulo}</h1>${corpo}</div>
      <p class="muted small" style="text-align:center"><a href="index.html">Conheça o LeãoHub e os planos</a></p></div>`;
  }
  const demo = () => S.modo === 'demo';

  function viewEntrar() {
    telaAuth('Entrar', `
      <form id="form-auth">
        <label>E-mail</label><input name="email" type="email" autocomplete="email" required>
        ${demo() ? '<p class="muted small">Modo demonstração: não precisa de senha.</p>' : '<label style="margin-top:10px">Senha</label><input name="senha" type="password" autocomplete="current-password" required>'}
        <div id="auth-msg" class="small" style="margin-top:8px"></div>
        <button class="btn" type="submit" style="width:100%;margin-top:12px">Entrar</button>
      </form>
      <p class="small" style="margin-top:14px">Ainda não tem conta? <a href="#/cadastro">Comece o teste grátis</a>${demo() ? '' : ' · <a href="#/recuperar">Esqueci a senha</a>'}</p>`);
    enviarAuth(async (f) => { await S.auth.entrar({ email: f.get('email'), senha: f.get('senha') }); location.hash = '#/simulador'; });
  }

  function viewCadastro(planoPedido) {
    const plano = P.planos.some((x) => x.id === planoPedido) ? planoPedido : 'profissional';
    telaAuth(`Teste grátis por ${CFG.DIAS_TESTE || 14} dias`, `
      <p class="muted small">Sem cartão. Durante o teste você usa os recursos do plano Profissional.</p>
      <form id="form-auth">
        <label>Seu nome ou nome da empresa</label><input name="nome" required>
        <label style="margin-top:10px">E-mail</label><input name="email" type="email" autocomplete="email" required>
        ${demo() ? '' : '<label style="margin-top:10px">Senha <span class="hint">(mínimo 6 caracteres)</span></label><input name="senha" type="password" minlength="6" autocomplete="new-password" required>'}
        <label style="margin-top:10px">Plano que pretende assinar depois</label>
        <select name="plano">${P.planos.map((x) => `<option value="${x.id}" ${x.id === plano ? 'selected' : ''}>${esc(x.nome)} — ${brl(x.preco)}/mês</option>`).join('')}</select>
        <div id="auth-msg" class="small" style="margin-top:8px"></div>
        <button class="btn" type="submit" style="width:100%;margin-top:12px">Criar conta e começar</button>
      </form>
      <p class="small" style="margin-top:14px">Já tem conta? <a href="#/entrar">Entrar</a></p>`);
    enviarAuth(async (f) => {
      const r = await S.auth.cadastrar({ nome: f.get('nome').trim(), email: f.get('email'), senha: f.get('senha'), plano: f.get('plano') });
      if (r.confirmar) { mensagemAuth('Conta criada! Enviamos um e-mail de confirmação. Clique no link do e-mail e depois entre aqui.', 'ok'); return; }
      location.hash = '#/empresas/nova';
    });
  }

  function viewRecuperar() {
    telaAuth('Recuperar senha', `
      <form id="form-auth">
        <label>E-mail da conta</label><input name="email" type="email" required>
        <div id="auth-msg" class="small" style="margin-top:8px"></div>
        <button class="btn" type="submit" style="width:100%;margin-top:12px">Enviar link para criar nova senha</button>
      </form>
      <p class="small" style="margin-top:14px"><a href="#/entrar">Voltar para entrar</a></p>`);
    enviarAuth(async (f) => { await S.auth.recuperar(f.get('email')); mensagemAuth('Se o e-mail tiver conta, você vai receber um link em alguns minutos.', 'ok'); });
  }

  function viewNovaSenha() {
    telaAuth('Criar nova senha', `
      <form id="form-auth">
        <label>Nova senha <span class="hint">(mínimo 6 caracteres)</span></label><input name="senha" type="password" minlength="6" required>
        <div id="auth-msg" class="small" style="margin-top:8px"></div>
        <button class="btn" type="submit" style="width:100%;margin-top:12px">Salvar nova senha</button>
      </form>`);
    enviarAuth(async (f) => { await S.auth.novaSenha(f.get('senha')); history.replaceState(null, '', location.pathname + '#/simulador'); toast('Senha alterada.'); render(); });
  }

  function mensagemAuth(texto, tipo) {
    const el = document.getElementById('auth-msg');
    if (el) el.innerHTML = `<span class="badge ${tipo === 'ok' ? 'ok' : 'warn'}" style="white-space:normal">${esc(texto)}</span>`;
  }
  function enviarAuth(acao) {
    const form = document.getElementById('form-auth');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const botao = form.querySelector('button[type=submit]');
      botao.disabled = true;
      try { await acao(new FormData(form)); } catch (err) { mensagemAuth(err.message, 'erro'); } finally { botao.disabled = false; }
    });
  }

  function viewTesteAcabou() {
    $app.innerHTML = `
      <section class="card" style="max-width:640px">
        <h1>Seu teste grátis terminou</h1>
        <p>Para continuar usando o LeãoHub e manter suas empresas e simulações, escolha um plano.</p>
        ${blocoAssinar()}
        <p class="small" style="margin-top:14px"><a href="#/conta">Ver minha conta</a></p>
      </section>`;
  }

  function blocoAssinar() {
    const contato = (CFG.CONTATO_VENDAS || '').trim();
    if (!contato) return '<p><span class="badge warn">Cobrança online em breve</span></p><p class="muted small">A assinatura ainda não está disponível pelo app.</p>';
    const href = /^https?:\/\//i.test(contato) ? contato : 'mailto:' + contato;
    return `<p><a class="btn" href="${esc(href)}" target="_blank" rel="noopener">Quero assinar</a></p><p class="muted small">Contato: ${esc(contato)}</p>`;
  }

  // ---------------------------------------------------------------- minhas empresas
  async function viewEmpresas() {
    const vez = renderVez;
    const lista = await S.empresas.listar();
    if (vez !== renderVez) return;
    const rec = P.recursos(conta);
    const cheio = lista.length >= rec.empresas;
    $app.innerHTML = `
      <header class="page-head">
        <div><h1>Minhas empresas</h1><p class="muted">${lista.length} de ${rec.empresas} empresa(s) do plano ${esc(rec.nomePlano)}.</p></div>
        ${cheio ? '<a class="btn secondary" href="#/conta">Ver planos para cadastrar mais</a>' : '<a class="btn" href="#/empresas/nova">+ Nova empresa</a>'}
      </header>
      <section class="card">${lista.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Empresa</th><th>CNPJ</th><th>Regime</th><th>Atividade</th><th class="num">Faturamento/mês</th><th></th></tr></thead>
        <tbody>${lista.map((e) => `<tr>
          <td><a href="#/empresas/${e.id}"><b>${esc(e.nome)}</b></a></td><td>${esc(e.cnpj) || '—'}</td>
          <td>${esc(REGIMES_EMP[e.regime] || '')}</td><td>${esc((SETORES[e.setor] || {}).nome || '')}</td>
          <td class="num">${brl(e.faturamento)}</td>
          <td class="num"><a class="btn small" href="#/simulador/empresa-${e.id}">Simular</a></td></tr>`).join('')}</tbody></table></div>`
        : '<p>Cadastre sua empresa para salvar simulações e gerar relatórios.</p><p><a class="btn" href="#/empresas/nova">Cadastrar a primeira empresa</a></p>'}</section>`;
  }

  async function viewEmpresaForm(id) {
    const vez = renderVez;
    const e = id ? await S.empresas.obter(id) : null;
    if (vez !== renderVez) return;
    if (id && !e) { location.hash = '#/empresas'; return; }
    const v = e || { nome: '', cnpj: '', regime: 'presumido', setor: 'servicos', faturamento: '', obs: '' };
    $app.innerHTML = `
      <header class="page-head"><div><h1>${e ? 'Editar empresa' : 'Nova empresa'}</h1></div></header>
      <form class="card" id="form-empresa">
        <div class="fields">
          <div class="full"><label>CNPJ <span class="hint">(opcional: preenche o nome e diz se é do Simples)</span></label>
            <div class="cnpj-box"><input name="cnpj" id="emp-cnpj-input" data-cnpj="emp-cnpj" value="${esc(v.cnpj)}" placeholder="00.000.000/0000-00" inputmode="numeric">
              <button type="button" class="btn secondary" data-action="consultarCnpj" data-id="emp-cnpj">Buscar dados</button></div>
            <div id="emp-cnpj-res" class="small" style="margin-top:6px"></div></div>
          <div class="full"><label>Nome / razão social</label><input name="nome" required value="${esc(v.nome)}"></div>
          <div><label>Regime tributário</label><select name="regime">${opcoes(REGIMES_EMP, v.regime)}</select></div>
          <div><label>Faturamento médio mensal (R$)</label><input name="faturamento" type="number" step="0.01" min="0" value="${esc(v.faturamento)}"></div>
          <div class="full"><label>Tipo de atividade <span class="hint">(define a redução na reforma)</span></label><select name="setor" data-setor>${opcoes(SETORES, v.setor, (s) => `${s.nome} — redução ${s.reducao}%`)}</select>${dicaSetor(v.setor)}</div>
          <div class="full"><label>Observações</label><textarea name="obs">${esc(v.obs)}</textarea></div>
        </div>
        <div id="emp-msg" class="small" style="margin-top:8px"></div>
        <div class="form-foot"><button class="btn" type="submit">Salvar</button><a class="btn secondary" href="${e ? '#/empresas/' + e.id : '#/empresas'}">Cancelar</a></div>
      </form>`;
    cnpjRetornos['emp-cnpj'] = (info) => {
      const f = document.getElementById('form-empresa');
      if (!f.elements.nome.value.trim()) f.elements.nome.value = info.razao;
      if (info.simples || info.mei) f.elements.regime.value = 'simples';
      else if (f.elements.regime.value === 'simples') f.elements.regime.value = 'presumido';
    };
    document.getElementById('form-empresa').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      const dados = { nome: f.get('nome').trim(), cnpj: f.get('cnpj').trim(), regime: f.get('regime'), setor: f.get('setor'), faturamento: num(f.get('faturamento')), obs: f.get('obs').trim() };
      if (e) dados.id = e.id;
      try {
        const salva = await S.empresas.salvar(dados);
        toast('Empresa salva.');
        location.hash = '#/empresas/' + salva.id;
      } catch (err) {
        document.getElementById('emp-msg').innerHTML = `<span class="badge warn" style="white-space:normal">${esc(err.message)}</span>`;
      }
    });
  }

  async function viewEmpresa(id) {
    const vez = renderVez;
    const [e, sims] = await Promise.all([S.empresas.obter(id), S.simulacoes.listar(id)]);
    if (vez !== renderVez) return;
    if (!e) { location.hash = '#/empresas'; return; }
    $app.innerHTML = `
      <header class="page-head">
        <div><h1>${esc(e.nome)}</h1><p class="muted">${esc(REGIMES_EMP[e.regime] || '')} · ${esc((SETORES[e.setor] || {}).nome || '')}${e.cnpj ? ' · ' + esc(e.cnpj) : ''}</p></div>
        <div class="actions">
          <a class="btn" href="#/simulador/empresa-${e.id}">Nova simulação</a>
          <a class="btn secondary" href="#/empresas/${e.id}/editar">Editar</a>
          <button class="btn secondary" data-action="excluirEmpresa" data-id="${e.id}" data-confirm="Excluir esta empresa? As simulações dela continuam salvas, sem empresa.">Excluir</button>
        </div>
      </header>
      <section class="card"><h2>Dados</h2>
        <p><b>Faturamento médio:</b> ${brl(e.faturamento)}<br><b>Redução na reforma:</b> ${(SETORES[e.setor] || SETORES.geral).reducao}%</p>
        ${e.obs ? `<p class="muted">${esc(e.obs)}</p>` : ''}
        ${e.regime === 'simples' ? '<div class="note">Empresa do Simples: pode continuar no Simples e pagar CBS/IBS dentro do DAS, ou pagar "por fora" para que os clientes empresa tenham crédito cheio. O simulador compara com o regime regular.</div>' : ''}
      </section>
      <section class="card"><h2>Simulações salvas</h2>${tabelaSimulacoes(sims)}</section>`;
  }

  function tabelaSimulacoes(sims) {
    if (!sims.length) return '<p class="muted">Nenhuma simulação salva ainda. Faça uma no simulador e clique em "Salvar simulação".</p>';
    return `<div class="table-wrap"><table>
      <thead><tr><th>Data</th><th>Simulação</th><th>Período</th><th class="num">Imposto hoje</th><th class="num">Com a reforma</th><th class="num">Diferença</th><th></th></tr></thead>
      <tbody>${sims.map((s) => { const r = s.resultado || {}; const dados = s.dados || {}; const inp = dados.inp || {}; return `<tr>
        <td>${dataBR(s.criado_em)}</td><td>${esc(s.titulo) || '—'}</td><td>${inp.escopo === 'cbs_ibs' ? '2033' : '2027–2028'}</td>
        <td class="num">${brl(r.totalHoje)}</td><td class="num">${brl(r.aPagar)}</td>
        <td class="num">${r.diferenca > 0 ? '+' : ''}${brl(r.diferenca)}</td>
        <td class="num acoes-linha"><a class="btn small secondary" href="#/simulador/sim-${s.id}">Abrir</a>
          <a class="btn small secondary" href="#/relatorio/${s.id}">Relatório</a>
          <button class="link-btn danger small" data-action="excluirSimulacao" data-id="${s.id}" data-confirm="Excluir esta simulação?">excluir</button></td></tr>`; }).join('')}</tbody></table></div>`;
  }

  // ---------------------------------------------------------------- relatório (impressão / PDF)
  async function viewRelatorio(id) {
    const vez = renderVez;
    let fonte = null;
    if (id === 'atual') {
      const s = viewSimulador.ultimo;
      if (s) fonte = { inp: s.inp, dividendos: s.dividendos, params: db.params, empresaId: s.empresaId, titulo: s.titulo, data: new Date().toISOString() };
    } else {
      const sim = await S.simulacoes.obter(id);
      if (sim && sim.dados && sim.dados.inp) fonte = { inp: sim.dados.inp, dividendos: sim.dados.dividendos || 0, params: Object.assign({}, PARAMS_PADRAO, sim.dados.params || {}), empresaId: sim.empresa_id, titulo: sim.titulo, data: sim.criado_em };
    }
    if (vez !== renderVez) return;
    if (!fonte) { location.hash = '#/simulador'; return; }
    const emp = fonte.empresaId ? await S.empresas.obter(fonte.empresaId) : null;
    if (vez !== renderVez) return;
    const p = fonte.params;
    const inp = fonte.inp;
    const r = calcularReforma(inp, p);
    const div = calcularDividendos(fonte.dividendos, p);
    const rec = P.recursos(conta);
    const propria = rec.marcaPropria && conta && (logoValido(conta.logo) || conta.nome);
    const marca = propria ? { nome: conta.nome, logo: logoValido(conta.logo), cor: corValida(conta.cor) } : { nome: 'LeãoHub', logo: '', cor: '#0f766e' };
    const periodo = r.comIbs ? `2033 em diante: CBS + IBS (${pct(p.cbs2033 + p.ibs)})` : `2027–2028: CBS (${pct(p.cbs)})`;
    $app.innerHTML = `
      <div class="no-print relatorio-acoes">
        <button class="btn" data-action="imprimir">Imprimir / salvar em PDF</button>
        <a class="btn secondary" href="${id === 'atual' ? '#/simulador' : (fonte.empresaId ? '#/empresas/' + fonte.empresaId : '#/simulador')}">Voltar</a>
        <span class="muted small">Na janela de impressão, escolha "Salvar como PDF".</span>
        ${!rec.marcaPropria ? '<span class="muted small">Logo próprio no relatório: planos Profissional e Grupo.</span>' : (!propria ? '<span class="muted small">Adicione seu logo em <a href="#/conta">Minha conta</a>.</span>' : '')}
      </div>
      <article class="relatorio card" style="--marca:${marca.cor}">
        <header class="rel-topo">
          ${marca.logo ? `<img class="rel-logo" src="${marca.logo}" alt="${esc(marca.nome)}">` : `<div class="rel-nome-marca">${esc(marca.nome)}</div>`}
          <div class="rel-titulo"><h1>Simulação da reforma tributária</h1>
            <p>${emp ? `<b>${esc(emp.nome)}</b>${emp.cnpj ? ' · CNPJ ' + esc(emp.cnpj) : ''} · ` : ''}${dataBR(fonte.data)}${fonte.titulo ? ' · ' + esc(fonte.titulo) : ''}</p></div>
        </header>
        <table class="calc-lines rel-premissas"><tbody>
          <tr><td>Período comparado</td><td>${esc(periodo)}</td></tr>
          <tr><td>Atividade</td><td>${esc(r.setor.nome)} (redução de ${r.setor.reducao}%)</td></tr>
          <tr><td>Regime atual</td><td>${inp.regimeAtual === 'real' ? 'Lucro Real' : 'Lucro Presumido'}</td></tr>
          <tr><td>Receita do mês</td><td>${brl(inp.receita)}</td></tr>
          <tr><td>Compras de fornecedores fora do Simples / do Simples</td><td>${brl(inp.despReg)} / ${brl(inp.despSimples)}</td></tr>
          <tr><td>Folha de pagamento</td><td>${brl(inp.folha)}</td></tr>
        </tbody></table>
        <div class="result-grid">
          <div class="result"><span>${r.comIbs ? 'PIS/COFINS + ISS hoje' : 'PIS/COFINS hoje'}</span><b>${brl(r.totalHoje)}</b></div>
          <div class="result rel-destaque"><span>${r.comIbs ? 'CBS + IBS' : 'CBS'} a pagar (após créditos)</span><b>${brl(r.aPagar)}</b></div>
          <div class="result"><span>Diferença por mês</span><b>${r.diferenca > 0 ? '+' : ''}${brl(r.diferenca)}</b></div>
          <div class="result"><span>Diferença em 12 meses</span><b>${r.diferenca * 12 > 0 ? '+' : ''}${brl(r.diferenca * 12)}</b></div>
        </div>
        <h3>Como chegamos a esses números</h3>
        <table class="calc-lines"><tbody>
          <tr><td>PIS/COFINS hoje: ${brl(inp.receita)} × ${pct(r.aliqPC)}</td><td class="num">${brl(r.pcBruto)}</td></tr>
          ${r.pcCredito ? `<tr><td>(−) Créditos de PIS/COFINS</td><td class="num">−${brl(r.pcCredito)}</td></tr>` : ''}
          ${r.comIbs ? `<tr><td>ISS hoje: ${brl(inp.receita)} × ${pct(inp.iss)}</td><td class="num">${brl(r.issHoje)}</td></tr>` : ''}
          <tr class="total"><td>Total hoje</td><td class="num">${brl(r.totalHoje)}</td></tr>
          <tr><td>Débito CBS: ${brl(inp.receita)} × ${pct(r.aliqCbsEf)}</td><td class="num">${brl(r.debCbs)}</td></tr>
          ${r.comIbs ? `<tr><td>Débito IBS: ${brl(inp.receita)} × ${pct(r.aliqIbsEf)}</td><td class="num">${brl(r.debIbs)}</td></tr>` : ''}
          <tr><td>(−) Crédito sobre compras fora do Simples (${pct(r.aliqCredito)})</td><td class="num">−${brl(r.credFornec)}</td></tr>
          ${r.credSimples ? `<tr><td>(−) Crédito sobre compras do Simples (${pct(p.creditoSimples)})</td><td class="num">−${brl(r.credSimples)}</td></tr>` : ''}
          ${inp.creditoAnterior ? `<tr><td>(−) Crédito acumulado do mês anterior</td><td class="num">−${brl(inp.creditoAnterior)}</td></tr>` : ''}
          <tr class="total"><td>A pagar com a reforma</td><td class="num">${brl(r.aPagar)}</td></tr>
        </tbody></table>
        ${r.creditoProx ? `<p>Crédito que sobra para o mês seguinte: <b>${brl(r.creditoProx)}</b>.</p>` : ''}
        <h3>Caixa (split payment)</h3>
        <p>Quando o split payment estiver valendo, cerca de <b>${brl(r.splitRetido)}</b> (${pct(r.splitPctReceita)} da receita) serão retidos no recebimento. Em 2027 ele começa opcional e só entre empresas; a obrigatoriedade ainda não tem data.</p>
        ${fonte.dividendos > 0 ? `<h3>Distribuição de lucros (${brl(fonte.dividendos)} no mês, por sócio)</h3>
          <p>Regra atual (Lei 15.270/2025): retenção de <b>${brl(div.atual)}</b>${div.atual ? ' (10% sobre o total, por passar de R$ 50 mil no mês)' : ' (até R$ 50 mil no mês não há retenção)'}.</p>` : ''}
        <footer class="rel-rodape">
          <p><b>Premissas:</b> CBS 2027–2028 de ${pct(p.cbs)} (cálculo do TCU, pendente de fixação pelo Senado); regime completo de ${pct(p.cbs2033 + p.ibs)} (estimativa do Comitê Gestor do IBS). Alíquotas ainda não definitivas; os anos de transição 2029–2032 não estão no cálculo.</p>
          <p>Esta é uma estimativa para planejamento e não substitui a análise de um contador.</p>
          <p class="muted">Gerado ${propria ? 'com LeãoHub ' : ''}em ${dataBR(new Date().toISOString())}.</p>
        </footer>
      </article>`;
  }

  // ---------------------------------------------------------------- minha conta
  async function viewConta() {
    const rec = P.recursos(conta);
    const escolhido = conta.plano_escolhido || 'profissional';
    $app.innerHTML = `
      <header class="page-head"><div><h1>Minha conta</h1><p class="muted">${esc(usuario.email)}</p></div>
        <button class="btn secondary" data-action="sair">Sair</button></header>
      <section class="card">
        <h2>Plano</h2>
        <p>Plano atual: <b>${esc(rec.nomePlano)}</b>${rec.emTeste ? ` · ${rec.testeAcabou ? '<span class="badge warn">teste encerrado</span>' : `faltam <b>${rec.diasTeste}</b> dia(s) de teste (até ${dataBR(conta.teste_ate)})`}` : ''} · até ${rec.empresas} empresa(s)</p>
        <form id="form-plano">
          <div class="planos-mini">${P.planos.map((x) => `<label class="plano-mini ${x.id === escolhido ? 'sel' : ''}">
            <input type="radio" name="plano" value="${x.id}" ${x.id === escolhido ? 'checked' : ''}>
            <b>${esc(x.nome)}</b><span>${brl(x.preco)}/mês · até ${x.empresas} empresa(s)${x.marcaPropria ? ' · relatório com sua marca' : ''}</span></label>`).join('')}</div>
        </form>
        ${blocoAssinar()}
      </section>
      <form class="card" id="form-marca">
        <h2>Sua marca nos relatórios</h2>
        ${rec.marcaPropria ? '' : '<div class="note">Disponível nos planos Profissional e Grupo. No seu plano, o relatório sai com a marca LeãoHub.</div>'}
        <div class="fields">
          <div><label>Nome que aparece no relatório</label><input name="nome" value="${esc(conta.nome)}"></div>
          <div><label>Cor principal</label><input name="cor" type="color" value="${corValida(conta.cor)}" style="height:40px;padding:4px"></div>
          <div class="full"><label>Logo <span class="hint">(PNG ou JPG; reduzimos automaticamente)</span></label>
            <input id="logo-arquivo" type="file" accept="image/png,image/jpeg,image/webp">
            <div id="logo-previa" style="margin-top:10px">${logoValido(conta.logo) ? `<img src="${logoValido(conta.logo)}" alt="Logo" class="logo-previa"> <button type="button" class="link-btn danger" data-action="removerLogo">remover logo</button>` : '<span class="muted small">Nenhum logo enviado.</span>'}</div></div>
        </div>
        <div class="form-foot"><button class="btn" type="submit">Salvar</button></div>
      </form>`;
    document.getElementById('form-plano').addEventListener('change', async (e) => {
      if (e.target.name !== 'plano') return;
      try { conta = await S.conta.salvar({ plano_escolhido: e.target.value }); toast('Plano de interesse atualizado.'); render(); } catch (err) { toast(err.message); }
    });
    let novoLogo = null;
    document.getElementById('logo-arquivo').addEventListener('change', async (e) => {
      const arq = e.target.files[0];
      if (!arq) return;
      try {
        novoLogo = await reduzirImagem(arq, 480, 160);
        document.getElementById('logo-previa').innerHTML = `<img src="${novoLogo}" alt="Logo" class="logo-previa"> <span class="muted small">Clique em Salvar para usar.</span>`;
      } catch (err) { toast('Não foi possível ler a imagem.'); }
    });
    document.getElementById('form-marca').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const campos = { nome: f.get('nome').trim(), cor: corValida(f.get('cor')) };
      if (novoLogo) campos.logo = novoLogo;
      try { conta = await S.conta.salvar(campos); toast('Marca salva.'); render(); } catch (err) { toast(err.message); }
    });
  }

  function reduzirImagem(arquivo, maxL, maxA) {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onerror = reject;
      leitor.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const escala = Math.min(1, maxL / img.width, maxA / img.height);
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * escala));
          c.height = Math.max(1, Math.round(img.height * escala));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/png'));
        };
        img.src = leitor.result;
      };
      leitor.readAsDataURL(arquivo);
    });
  }

  // --- configurações
  function viewConfig() {
    const p = db.params;
    const campo = (nome, rot, extra) => `<div><label>${rot}</label><input name="${nome}" type="number" step="0.01" value="${esc(p[nome])}" ${extra || ''}></div>`;
    $app.innerHTML = `
      <header class="page-head"><div><h1>Parâmetros</h1><p class="muted">Alíquotas usadas no simulador, nos cenários e na aba de tipos de serviço. Ficam salvas neste navegador.</p></div></header>
      <form class="card" id="form-params">
        <h2>Alíquotas de referência</h2>
        <div class="fields">
          ${campo('cbs', 'CBS 2027–2028: referência (%) <span class="hint">TCU, 28/10/2026; Senado fixa até 15/12</span>')}
          ${campo('cbs2033', 'CBS no regime completo, 2033 (%) <span class="hint">estimativa CGIBS</span>')}
          ${campo('ibs', 'IBS no regime completo, 2033 (%) <span class="hint">estimativa CGIBS (Res. 14/2026)</span>')}
          ${campo('pisCofinsCumulativo', 'PIS/COFINS cumulativo — Presumido (%)')}
          ${campo('pisCofinsNaoCumulativo', 'PIS/COFINS não cumulativo — Real (%)')}
          ${campo('issPadrao', 'ISS padrão (%)')}
          ${campo('creditoSimples', 'Crédito sobre compras do Simples (%) <span class="hint">CBS/IBS que o fornecedor paga no DAS; vem na nota. 0 = conservador</span>')}
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
          ${campo('divAliqPL', 'Cenário hipotético de comparação (%) <span class="hint">não há lei aprovada</span>')}
        </div>
        <div class="note">As alíquotas ainda não são definitivas. A lei prevê um teto de 26,5% para CBS + IBS, mas ele não é automático: se a estimativa passar disso, o governo precisa propor medidas de redução ao Congresso.</div>
        <div class="note info">Reduções por setor usadas no simulador: ${Object.values(SETORES).map((s) => `${esc(s.nome)} ${s.reducao}%`).join(' · ')}.</div>
        <div class="form-foot"><button class="btn" type="submit">Salvar parâmetros</button><button class="btn secondary" type="button" data-action="restaurarParams">Restaurar padrão</button></div>
      </form>`;
    document.getElementById('form-params').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      Object.keys(PARAMS_PADRAO).forEach((k) => { if (f.has(k)) db.params[k] = k === 'divBase' ? f.get(k) : num(f.get(k)); });
      db.params.versao = VERSAO_PARAMS;
      salvar();
      toast('Parâmetros salvos.');
    });
  }

  // ---------------------------------------------------------------- ações
  const acoes = {
    copiarSimulacao() { const t = textoSimulacao(); if (t) copiar(t); },
    async salvarSimulacao() {
      const s = viewSimulador.ultimo;
      if (!s) return;
      const titulo = s.titulo || `Simulação de ${dataBR(new Date().toISOString())}`;
      await S.simulacoes.salvar({ empresa_id: s.empresaId || null, titulo, dados: { inp: s.inp, dividendos: s.dividendos, params: copiaParams() }, resultado: resumoResultado(s.r) });
      toast(s.empresaId ? 'Simulação salva no histórico da empresa.' : 'Simulação salva (sem empresa).');
    },
    relatorioAtual() { if (viewSimulador.ultimo) location.hash = '#/relatorio/atual'; },
    imprimir() { window.print(); },
    restaurarParams() { db.params = Object.assign({}, PARAMS_PADRAO); salvar(); toast('Parâmetros restaurados.'); render(); },
    consultarCnpj(prefixo) { consultarCnpj(prefixo); },
    async excluirEmpresa(id) { await S.empresas.excluir(id); toast('Empresa excluída.'); location.hash = '#/empresas'; },
    async excluirSimulacao(id) { await S.simulacoes.excluir(id); toast('Simulação excluída.'); render(); },
    async removerLogo() { conta = await S.conta.salvar({ logo: '' }); toast('Logo removido.'); render(); },
    async sair() { await S.auth.sair(); usuario = null; conta = null; location.hash = '#/entrar'; render(); },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || !acoes[el.dataset.action]) return;
    e.preventDefault();
    const executar = async () => {
      try { await acoes[el.dataset.action](el.dataset.id, el, e); } catch (err) { toast(err.message || 'Não foi possível concluir.'); }
    };
    if (el.dataset.confirm) confirmar(el.dataset.confirm, executar); else executar();
  });

  // Enter no campo de CNPJ consulta, em vez de enviar o formulário.
  document.addEventListener('keydown', (e) => {
    const el = e.target.closest && e.target.closest('[data-cnpj]');
    if (el && e.key === 'Enter') { e.preventDefault(); consultarCnpj(el.dataset.cnpj); }
  });

  // ---------------------------------------------------------------- rotas
  const PUBLICAS = ['entrar', 'cadastro', 'recuperar', 'nova-senha'];
  function marcarNav(rotaAtual) {
    document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === rotaAtual));
  }

  async function render() {
    const vez = ++renderVez;
    const [a, b, c] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    try {
      usuario = await S.auth.usuario();
      if (vez !== renderVez) return;
      if (!usuario && !PUBLICAS.includes(a)) { montarMoldura(false); if (a !== 'entrar') { location.hash = '#/entrar'; return; } }
      if (usuario && (a === 'entrar' || a === 'cadastro')) { location.hash = '#/simulador'; return; }
      conta = usuario ? ((await S.conta.obter()) || { nome: '', logo: '', cor: '#0f766e', plano: 'teste', plano_escolhido: 'profissional', teste_ate: P.hoje() }) : null;
      if (vez !== renderVez) return;
      montarMoldura(!!usuario);
      marcarNav(a || 'simulador');
      if (usuario && P.recursos(conta).testeAcabou && !['conta', 'config', 'nova-senha'].includes(a)) { viewTesteAcabou(); window.scrollTo(0, 0); return; }
      switch (a) {
        case 'entrar': viewEntrar(); break;
        case 'cadastro': viewCadastro(b); break;
        case 'recuperar': viewRecuperar(); break;
        case 'nova-senha': viewNovaSenha(); break;
        case undefined: await viewSimulador(); break;
        case 'simulador': await viewSimulador(b); break;
        case 'cenarios': viewCenarios(); break;
        case 'servicos': viewServicos(); break;
        case 'pendencias': viewPendencias(); break;
        case 'empresas':
          if (!b) await viewEmpresas();
          else if (b === 'nova') await viewEmpresaForm();
          else if (c === 'editar') await viewEmpresaForm(b);
          else await viewEmpresa(b);
          break;
        case 'relatorio': await viewRelatorio(b); break;
        case 'conta': await viewConta(); break;
        case 'config': viewConfig(); break;
        default: await viewSimulador();
      }
    } catch (err) {
      console.error(err);
      if (vez === renderVez) $app.innerHTML = `<section class="card"><h2>Algo deu errado</h2><p>${esc(err.message)}</p></section>`;
    }
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', render);
  // Expõe o cálculo para testes automatizados.
  window.LeaoHub = { calcularReforma, calcularDividendos, PARAMS_PADRAO };
  // Link de "esqueci a senha" (Supabase) volta com ?nova-senha=1.
  S.auth.aoMudar((evento) => {
    if (evento === 'PASSWORD_RECOVERY') location.hash = '#/nova-senha';
    else if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') render();
  });
  if (new URLSearchParams(location.search).has('nova-senha')) location.hash = '#/nova-senha';
  render();
})();
