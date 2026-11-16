/*
 * LeãoHub — camada de dados.
 * Duas implementações com a mesma interface:
 *   - "demo": tudo no localStorage do navegador (sem senha, para testar);
 *   - "nuvem": Supabase (login com e-mail e senha, dados separados por conta com segurança no banco).
 * A escolha é automática: com SUPABASE_URL e SUPABASE_ANON_KEY no config.js, usa a nuvem.
 */
'use strict';
(function () {
  const C = window.LEAOHUB_CONFIG || {};
  const PLANOS = C.PLANOS || [];
  const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const somaDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

  // ---------------------------------------------------------------- planos
  // Durante o teste grátis, a conta tem os recursos do plano Profissional.
  function recursos(conta) {
    const emTeste = !conta || conta.plano === 'teste';
    const plano = PLANOS.find((p) => p.id === (emTeste ? 'profissional' : conta.plano)) || PLANOS[0] || { empresas: 1, marcaPropria: false, nome: '—' };
    const fim = conta && conta.teste_ate;
    const dias = fim ? Math.round((new Date(fim + 'T00:00:00Z') - new Date(hoje() + 'T00:00:00Z')) / 86400000) : 0;
    return {
      plano, emTeste,
      nomePlano: emTeste ? 'Teste grátis' : plano.nome,
      empresas: plano.empresas,
      marcaPropria: !!plano.marcaPropria,
      diasTeste: Math.max(0, dias),
      testeAcabou: emTeste && !!fim && fim < hoje(),
    };
  }

  // ---------------------------------------------------------------- modo demonstração
  function criarLocal(aviso) {
    const K = 'leaohub:demo';
    const ler = () => { try { return JSON.parse(localStorage.getItem(K)) || {}; } catch (e) { return {}; } };
    const base = () => { const d = ler(); d.contas = d.contas || {}; d.empresas = d.empresas || []; d.simulacoes = d.simulacoes || []; return d; };
    const gravar = (d) => { try { localStorage.setItem(K, JSON.stringify(d)); } catch (e) { /* sem armazenamento */ } };
    const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const exigirSessao = (d) => { if (!d.sessao || !d.contas[d.sessao]) throw new Error('Entre na sua conta para continuar.'); return d.sessao; };

    function abrirSessao({ email, nome, plano }) {
      const e = String(email || '').trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(e)) throw new Error('Digite um e-mail válido.');
      const d = base();
      let uid = Object.keys(d.contas).find((k) => d.contas[k].email === e);
      if (!uid) {
        uid = novoId();
        d.contas[uid] = { id: uid, email: e, nome: nome || '', logo: '', cor: '#0f766e', plano: 'teste', plano_escolhido: plano || 'profissional', teste_ate: somaDias(C.DIAS_TESTE || 14) };
      }
      d.sessao = uid;
      gravar(d);
      return { ok: true };
    }

    return {
      modo: 'demo',
      aviso: aviso || '',
      auth: {
        async usuario() { const d = base(); return d.sessao && d.contas[d.sessao] ? { id: d.sessao, email: d.contas[d.sessao].email } : null; },
        async cadastrar(dados) { return abrirSessao(dados); },
        async entrar(dados) { return abrirSessao(dados); },
        async sair() { const d = base(); delete d.sessao; gravar(d); },
        async recuperar() { return { ok: true }; },
        async novaSenha() { return { ok: true }; },
        aoMudar() { /* nada a ouvir no modo demonstração */ },
      },
      conta: {
        async obter() { const d = base(); return d.sessao && d.contas[d.sessao] ? Object.assign({}, d.contas[d.sessao]) : null; },
        async salvar(campos) {
          const d = base(); const uid = exigirSessao(d); const c = d.contas[uid];
          ['nome', 'logo', 'cor', 'plano_escolhido'].forEach((k) => { if (k in campos) c[k] = campos[k]; });
          gravar(d); return Object.assign({}, c);
        },
      },
      empresas: {
        async listar() { const d = base(); const uid = exigirSessao(d); return d.empresas.filter((e) => e.conta_id === uid).sort((a, b) => a.nome.localeCompare(b.nome)); },
        async obter(id) { const d = base(); const uid = exigirSessao(d); return d.empresas.find((e) => e.id === id && e.conta_id === uid) || null; },
        async salvar(emp) {
          const d = base(); const uid = exigirSessao(d);
          if (emp.id) {
            const atual = d.empresas.find((e) => e.id === emp.id && e.conta_id === uid);
            if (!atual) throw new Error('Empresa não encontrada.');
            Object.assign(atual, emp, { conta_id: uid });
            gravar(d); return Object.assign({}, atual);
          }
          const limite = recursos(d.contas[uid]).empresas;
          if (d.empresas.filter((e) => e.conta_id === uid).length >= limite) throw new Error(`Seu plano permite até ${limite} empresa(s). Troque de plano para cadastrar mais.`);
          const nova = Object.assign({}, emp, { id: novoId(), conta_id: uid, criado_em: new Date().toISOString() });
          d.empresas.push(nova); gravar(d); return Object.assign({}, nova);
        },
        async excluir(id) {
          const d = base(); const uid = exigirSessao(d);
          d.empresas = d.empresas.filter((e) => !(e.id === id && e.conta_id === uid));
          d.simulacoes.forEach((s) => { if (s.empresa_id === id && s.conta_id === uid) s.empresa_id = null; });
          gravar(d);
        },
      },
      simulacoes: {
        async listar(empresaId) {
          const d = base(); const uid = exigirSessao(d);
          return d.simulacoes.filter((s) => s.conta_id === uid && (empresaId === undefined || s.empresa_id === empresaId))
            .sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
        },
        async obter(id) { const d = base(); const uid = exigirSessao(d); return d.simulacoes.find((s) => s.id === id && s.conta_id === uid) || null; },
        async salvar(sim) {
          const d = base(); const uid = exigirSessao(d);
          const nova = Object.assign({}, sim, { id: novoId(), conta_id: uid, criado_em: new Date().toISOString() });
          d.simulacoes.push(nova); gravar(d); return Object.assign({}, nova);
        },
        async excluir(id) { const d = base(); const uid = exigirSessao(d); d.simulacoes = d.simulacoes.filter((s) => !(s.id === id && s.conta_id === uid)); gravar(d); },
      },
    };
  }

  // ---------------------------------------------------------------- nuvem (Supabase)
  function traduzirErro(msg) {
    const m = String(msg || '');
    const mapa = [
      [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
      [/already registered|already been registered/i, 'Este e-mail já tem conta. Use "Entrar".'],
      [/email not confirmed/i, 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).'],
      [/password should be at least|at least \d+ characters/i, 'A senha precisa ter pelo menos 6 caracteres.'],
      [/rate limit|too many/i, 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.'],
      [/failed to fetch|network/i, 'Sem conexão com o servidor. Verifique a internet.'],
      [/limite de empresas/i, m],
    ];
    const achado = mapa.find(([re]) => re.test(m));
    return achado ? achado[1] : (m || 'Não foi possível concluir. Tente de novo.');
  }

  function criarSupabase() {
    const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    const urlApp = location.origin + location.pathname;
    const checar = ({ data, error }) => { if (error) throw new Error(traduzirErro(error.message)); return data; };
    async function uidAtual() {
      const { data } = await sb.auth.getSession();
      const u = data.session && data.session.user;
      if (!u) throw new Error('Entre na sua conta para continuar.');
      return u.id;
    }

    return {
      modo: 'nuvem',
      aviso: '',
      auth: {
        async usuario() { const { data } = await sb.auth.getSession(); const u = data.session && data.session.user; return u ? { id: u.id, email: u.email } : null; },
        async cadastrar({ email, senha, nome, plano }) {
          const data = checar(await sb.auth.signUp({ email, password: senha, options: { data: { nome, plano_escolhido: plano || 'profissional' }, emailRedirectTo: urlApp } }));
          return { ok: true, confirmar: !data.session };
        },
        async entrar({ email, senha }) { checar(await sb.auth.signInWithPassword({ email, password: senha })); return { ok: true }; },
        async sair() { await sb.auth.signOut(); },
        async recuperar(email) { checar(await sb.auth.resetPasswordForEmail(email, { redirectTo: urlApp + '?nova-senha=1' })); return { ok: true }; },
        async novaSenha(senha) { checar(await sb.auth.updateUser({ password: senha })); return { ok: true }; },
        aoMudar(cb) { sb.auth.onAuthStateChange((evento) => cb(evento)); },
      },
      conta: {
        async obter() { const uid = await uidAtual(); return checar(await sb.from('contas').select('*').eq('id', uid).maybeSingle()); },
        async salvar(campos) {
          const uid = await uidAtual();
          const permitido = {};
          ['nome', 'logo', 'cor', 'plano_escolhido'].forEach((k) => { if (k in campos) permitido[k] = campos[k]; });
          return checar(await sb.from('contas').update(permitido).eq('id', uid).select().single());
        },
      },
      empresas: {
        async listar() { await uidAtual(); return checar(await sb.from('empresas').select('*').order('nome')); },
        async obter(id) { await uidAtual(); return checar(await sb.from('empresas').select('*').eq('id', id).maybeSingle()); },
        async salvar(emp) {
          await uidAtual();
          const campos = {};
          ['nome', 'cnpj', 'regime', 'setor', 'faturamento', 'obs'].forEach((k) => { if (k in emp) campos[k] = emp[k]; });
          if (emp.id) return checar(await sb.from('empresas').update(campos).eq('id', emp.id).select().single());
          return checar(await sb.from('empresas').insert(campos).select().single());
        },
        async excluir(id) { await uidAtual(); checar(await sb.from('empresas').delete().eq('id', id)); },
      },
      simulacoes: {
        async listar(empresaId) {
          await uidAtual();
          let q = sb.from('simulacoes').select('*').order('criado_em', { ascending: false }).limit(100);
          if (empresaId !== undefined) q = empresaId === null ? q.is('empresa_id', null) : q.eq('empresa_id', empresaId);
          return checar(await q);
        },
        async obter(id) { await uidAtual(); return checar(await sb.from('simulacoes').select('*').eq('id', id).maybeSingle()); },
        async salvar(sim) {
          await uidAtual();
          return checar(await sb.from('simulacoes').insert({ empresa_id: sim.empresa_id || null, titulo: sim.titulo, dados: sim.dados, resultado: sim.resultado }).select().single());
        },
        async excluir(id) { await uidAtual(); checar(await sb.from('simulacoes').delete().eq('id', id)); },
      },
    };
  }

  const querNuvem = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY);
  let store;
  if (querNuvem && window.supabase && window.supabase.createClient) store = criarSupabase();
  else if (querNuvem) store = criarLocal('Não foi possível carregar a conexão com o servidor. O app abriu em modo demonstração.');
  else store = criarLocal();

  window.LeaoStore = store;
  window.LeaoPlanos = { recursos, planos: PLANOS, hoje };
})();
