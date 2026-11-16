/*
 * LeãoHub — protótipo de sistema para escritórios de contabilidade.
 * Módulos: clientes, simulador da reforma tributária (CBS/IBS), portal do cliente e atas.
 * Sem servidor: os dados ficam no localStorage do navegador.
 */
'use strict';
(function () {
  const STORAGE_KEY = 'leaohub:v1';

  // ---------------------------------------------------------------- constantes
  const SETORES = {
    saude: { nome: 'Saúde (clínicas, odontologia)', reducao: 60 },
    educacao: { nome: 'Educação', reducao: 60 },
    profissional: { nome: 'Profissão regulamentada (contador, advogado etc.)', reducao: 30 },
    geral: { nome: 'Geral (comércio e serviços)', reducao: 0 },
  };
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
        { id: c3, nome: 'Studio Design Exemplo ME', cnpj: '22.222.222/0001-22', regime: 'simples', setor: 'geral', contato: 'Júlia', email: 'julia@studioexemplo.com.br', faturamento: 25000, obs: 'Avaliar se continua no Simples após a reforma.' },
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
        <td>${esc(l.descricao)}${l.anexo ? `<div class="muted small">📎 ${esc(l.anexo)}</div>` : ''}</td>
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
    const v = c || { nome: '', cnpj: '', regime: 'presumido', setor: 'geral', contato: '', email: '', faturamento: '', obs: '' };
    $app.innerHTML = `
      <header class="page-head"><div><h1>${c ? 'Editar cliente' : 'Novo cliente'}</h1></div></header>
      <form class="card" id="form-cliente">
        <div class="fields">
          <div class="full"><label>Nome / razão social</label><input name="nome" required value="${esc(v.nome)}"></div>
          <div><label>CNPJ ou CPF</label><input name="cnpj" value="${esc(v.cnpj)}"></div>
          <div><label>Faturamento médio mensal (R$)</label><input name="faturamento" type="number" step="0.01" min="0" value="${esc(v.faturamento)}"></div>
          <div><label>Regime tributário</label><select name="regime">${opcoes(REGIMES, v.regime)}</select></div>
          <div><label>Setor <span class="hint">(define a redução na reforma)</span></label><select name="setor">${opcoes(SETORES, v.setor, (s) => `${s.nome} — redução ${s.reducao}%`)}</select></div>
          <div><label>Contato</label><input name="contato" value="${esc(v.contato)}"></div>
          <div><label>E-mail</label><input name="email" type="email" value="${esc(v.email)}"></div>
          <div class="full"><label>Observações</label><textarea name="obs">${esc(v.obs)}</textarea></div>
        </div>
        <div class="form-foot"><button class="btn" type="submit">Salvar</button><a class="btn secondary" href="${c ? '#/clientes/' + c.id : '#/clientes'}">Cancelar</a></div>
      </form>`;
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
    const c = clienteId ? cliente(clienteId) : null;
    const ini = { receita: 50000, despReg: 20000, despSimples: 0, folha: 0, setor: 'saude', regimeAtual: 'presumido', escopo: 'cbs', iss: p.issPadrao, creditoAnterior: 0, dividendos: 0 };
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
            <div><label>Setor</label><select name="setor">${opcoes(SETORES, ini.setor, (s) => `${s.nome} — redução ${s.reducao}%`)}</select></div>
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
    document.getElementById('form-lanc').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const arq = f.get('anexo');
      db.lancamentos.push({
        id: uid(), clienteId: id, categoria: f.get('categoria'), descricao: f.get('descricao').trim(), valor: num(f.get('valor')),
        data: f.get('data'), anexo: arq && arq.name ? arq.name : '', status: 'pendente', origem: 'cliente',
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
