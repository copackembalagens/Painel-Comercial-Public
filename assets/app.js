/* Painel Comercial Copack - Camada 3 (Apresentacao)
 * Le APENAS a base consolidada (../dados/consolidado_<area>.json - um
 * arquivo por area, ja filtrado por vendedor pelo calc/consolidar.py),
 * gerada pela Camada 2 no repo privado e publicada aqui pelo job das 02h.
 * Nenhum calculo de comissao/meta/etc acontece nesta tela.
 *
 * Acesso: senha por painel (GitHub Pages nao tem controle de acesso por
 * e-mail como o Cloudflare Access, entao usamos uma senha por area,
 * comparada por hash SHA-256 no navegador). AVISO DE SEGURANCA HONESTO:
 * isso NAO e autenticacao real - e uma barreira de conveniencia contra
 * acesso casual. Por isso o arquivo de dados de cada area (consolidado_
 * eduardo.json etc.) ja vem filtrado so com a comissao daquela pessoa -
 * mesmo que alguem pule a tela de senha e busque o JSON direto pela URL,
 * nao ve a comissao dos colegas (ver calc/consolidar.py, gravar_
 * arquivos_por_area). O painel Gerencial continua sendo o unico com
 * visao de todo mundo.
 */

const ESTADO = { mes: null, vendedor: null, ordenacao: {} };
let CONSOLIDADO = null;

const LABEL_ABA = {
  comissao: "Comissão e Bonificação",
  metas: "Metas",
  kommo: "Performance Kommo",
  retencao: "Retenção",
  reativacao: "Reativação",
  gratificacao: "Gratificação",
};

function fmtMoeda(v) {
  return (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtData(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

async function carregarDados() {
  const arquivo = window.AREA_CONFIG.arquivoDados || "gerencial";
  const resp = await fetch(`../dados/consolidado_${arquivo}.json`, { cache: "no-store" });
  if (!resp.ok) throw new Error("Nao foi possivel carregar os dados (" + resp.status + ")");
  return resp.json();
}

async function sha256Hex(texto) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function chaveSessao() {
  return `painel-copack-auth-${window.AREA_CONFIG.arquivoDados}`;
}

function jaAutenticado() {
  return sessionStorage.getItem(chaveSessao()) === "ok";
}

function montarTelaLogin() {
  const cfg = window.AREA_CONFIG;
  document.body.innerHTML = `
    <div class="login-box">
      <div class="folha-grande"></div>
      <h1 style="color:#7A7021;margin-bottom:0.25rem;">Painel Comercial Copack</h1>
      <p style="color:#555;margin-bottom:0;">Área: <strong>${cfg.nomeExibicao}</strong></p>
      <input type="password" id="campo-senha" placeholder="Senha desta área"
             style="width:100%;padding:0.6rem;border-radius:6px;border:1px solid #E0DFD8;font-family:inherit;font-size:0.95rem;margin-top:1rem;box-sizing:border-box;">
      <button id="btn-entrar" class="btn-exportar" style="width:100%;margin-top:0.75rem;padding:0.6rem;">Entrar</button>
      <p id="erro-senha" style="color:#C62828;font-size:0.85rem;min-height:1.2em;margin-top:0.5rem;"></p>
      <p class="aviso">Acesso restrito à equipe Copack. Fale com a gerência se não souber a senha.</p>
    </div>`;

  const campo = document.getElementById("campo-senha");
  const erro = document.getElementById("erro-senha");
  const tentar = async () => {
    const hash = await sha256Hex(campo.value);
    if (hash === cfg.senhaHash) {
      sessionStorage.setItem(chaveSessao(), "ok");
      iniciarPainel();
    } else {
      erro.textContent = "Senha incorreta.";
    }
  };
  document.getElementById("btn-entrar").addEventListener("click", tentar);
  campo.addEventListener("keydown", e => { if (e.key === "Enter") tentar(); });
  campo.focus();
}

function badgeAtingimento(pct) {
  if (pct >= 100) return `<span class="badge ok">${pct}%</span>`;
  if (pct >= 70) return `<span class="badge atencao">${pct}%</span>`;
  return `<span class="badge critico">${pct}%</span>`;
}

/* ---------- tabela ordenavel + exportavel ---------- */
function renderTabela(container, opts) {
  const { id, titulo, colunas, linhas } = opts;
  const chaveOrd = ESTADO.ordenacao[id] || { col: null, dir: 1 };
  let dados = linhas.slice();
  if (chaveOrd.col) {
    dados.sort((a, b) => {
      const va = a[chaveOrd.col], vb = b[chaveOrd.col];
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * chaveOrd.dir;
      return String(va ?? "").localeCompare(String(vb ?? "")) * chaveOrd.dir;
    });
  }

  const thead = colunas.map(c => {
    const seta = chaveOrd.col === c.chave ? (chaveOrd.dir === 1 ? "▲" : "▼") : "";
    return `<th data-col="${c.chave}">${c.rotulo}${seta ? `<span class="seta">${seta}</span>` : ""}</th>`;
  }).join("");

  const tbody = dados.map(row => {
    return "<tr>" + colunas.map(c => `<td>${c.render ? c.render(row) : (row[c.chave] ?? "-")}</td>`).join("") + "</tr>";
  }).join("");

  const el = document.createElement("div");
  el.className = "painel-tabela";
  // Tabelas com muitas colunas (ex.: Metas com o detalhamento
  // novos/recorrentes, secao 4.8) sao mais largas que o cartao - sem um
  // wrapper com scroll proprio, o navegador empurra a tabela inteira pra
  // fora da margem da pagina em vez de dar scroll (bug reportado pelo
  // usuario, 13/08/2026: coluna "Atingimento total" ficava fora da
  // margem). O wrapper .tabela-scroll isola o scroll horizontal so na
  // tabela - o titulo e o botao de exportar continuam fixos.
  el.innerHTML = `
    <div class="cabecalho-tabela">
      <h3>${titulo}</h3>
      <button class="btn-exportar" data-export="${id}">Exportar Excel</button>
    </div>
    <div class="tabela-scroll">
      <table class="dados" data-tabela="${id}">
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody || `<tr><td colspan="${colunas.length}">Sem dados para o filtro atual.</td></tr>`}</tbody>
      </table>
    </div>`;
  container.appendChild(el);

  el.querySelectorAll("th[data-col]").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.dataset.col;
      const atual = ESTADO.ordenacao[id] || { col: null, dir: 1 };
      ESTADO.ordenacao[id] = { col, dir: atual.col === col ? -atual.dir : 1 };
      renderAbaAtiva();
    });
  });

  el.querySelector("[data-export]").addEventListener("click", () => {
    const ws = XLSX.utils.json_to_sheet(dados.map(row => {
      const out = {};
      colunas.forEach(c => { out[c.rotulo] = row[c.chave]; });
      return out;
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, titulo.slice(0, 31));
    XLSX.writeFile(wb, `${id}.xlsx`);
  });
}

function renderPendente(container, info) {
  const el = document.createElement("div");
  el.className = "pendente";
  el.innerHTML = `<strong>Ainda não disponível</strong>${info?.motivo || "Este dado depende de uma etapa do pipeline que ainda não foi implementada."}`;
  container.appendChild(el);
}

function renderCards(container, cards) {
  const el = document.createElement("div");
  el.className = "cards";
  el.innerHTML = cards.map(c => `
    <div class="card">
      <div class="rotulo">${c.rotulo}</div>
      <div class="valor ${c.classe || ""}">${c.valor}</div>
    </div>`).join("");
  container.appendChild(el);
}

/* ---------- abas ---------- */
function linhasComissaoFiltradas() {
  let linhas = (CONSOLIDADO.comissao.linhas || []).slice();
  if (window.AREA_CONFIG.vendedorFiltro) {
    linhas = linhas.filter(l => l.vendedor === window.AREA_CONFIG.vendedorFiltro);
  }
  if (ESTADO.vendedor) linhas = linhas.filter(l => l.vendedor === ESTADO.vendedor);
  if (ESTADO.mes) linhas = linhas.filter(l => l.mes === ESTADO.mes);
  return linhas;
}

function abaComissao(container) {
  const linhas = linhasComissaoFiltradas();
  const ultimoMes = linhas.map(l => l.mes).sort().pop();
  const doMes = linhas.filter(l => l.mes === ultimoMes);
  const totalComissaoMes = doMes.reduce((s, l) => s + l.comissao, 0);
  const totalRecebidoMes = doMes.reduce((s, l) => s + l.recebido, 0);

  renderCards(container, [
    { rotulo: `Recebido em ${ultimoMes || "-"}`, valor: fmtMoeda(totalRecebidoMes) },
    { rotulo: `Comissão em ${ultimoMes || "-"}`, valor: fmtMoeda(totalComissaoMes), classe: "ok" },
    { rotulo: "Linhas sem data de pagamento válida", valor: CONSOLIDADO.comissao.meta.linhas_sem_data_valida.length, classe: CONSOLIDADO.comissao.meta.linhas_sem_data_valida.length ? "atencao" : "ok" },
  ]);

  // Piso aplicado (R$150k) so existe para a Kenia, que nao tem painel
  // individual - so aparece na visao Gerencial (vendedorFiltro null). Nos
  // paineis individuais (Joice/Rubs/Eduardo) essa coluna nao se aplica.
  const colunasComissao = [
    { chave: "vendedor", rotulo: "Vendedor" },
    { chave: "mes", rotulo: "Mês" },
    { chave: "recebido", rotulo: "Recebido (corrigido)", render: r => fmtMoeda(r.recebido) },
  ];
  if (!window.AREA_CONFIG.vendedorFiltro) {
    colunasComissao.push({ chave: "piso_aplicado", rotulo: "Piso aplicado", render: r => fmtMoeda(r.piso_aplicado) });
  }
  colunasComissao.push(
    { chave: "base_comissao", rotulo: "Base de cálculo", render: r => fmtMoeda(r.base_comissao) },
    { chave: "comissao", rotulo: "Comissão (1%)", render: r => fmtMoeda(r.comissao) },
  );

  renderTabela(container, {
    id: "comissao", titulo: "Extrato de comissão por mês",
    colunas: colunasComissao,
    linhas,
  });

  // Bonus de clientes novos (secao 4.5): CONSOLIDADO.bonus_clientes_novos e
  // sempre {vendedor: [{mes, faturamento_clientes_novos, bonus}]} - no
  // painel individual so vem a chave do proprio vendedor; no Gerencial vem
  // todo mundo (Eduardo/Joice/Rubs/Kenia).
  const bonusPorVendedor = CONSOLIDADO.bonus_clientes_novos || {};
  let linhasBonus = Object.entries(bonusPorVendedor).flatMap(
    ([vendedor, lista]) => lista.map(l => ({ vendedor, ...l }))
  );
  if (ESTADO.mes) linhasBonus = linhasBonus.filter(l => l.mes === ESTADO.mes);
  if (linhasBonus.length) {
    // bonus_clientes_novos/bonus_seladora/bonus_total: campos novos
    // (13/08/2026). Fallback pro campo antigo "bonus" (pre-seladora) so
    // por seguranca, caso algum dado publicado ainda nao tenha sido
    // reprocessado com o formato novo.
    const totalUltimoMes = (campo) => {
      const ultimoMesBonus = linhasBonus.map(l => l.mes).sort().pop();
      return linhasBonus.filter(l => l.mes === ultimoMesBonus).reduce((s, l) => s + (l[campo] ?? l.bonus ?? 0), 0);
    };
    const totalNovosMes = totalUltimoMes("bonus_clientes_novos");
    const totalSeladoraMes = totalUltimoMes("bonus_seladora");
    const totalGeralMes = linhasBonus.some(l => "bonus_total" in l) ? totalUltimoMes("bonus_total") : totalNovosMes;
    renderCards(container, [
      { rotulo: "Bônus clientes novos (último mês)", valor: fmtMoeda(totalNovosMes), classe: totalNovosMes ? "ok" : "" },
      { rotulo: "Bônus seladora (último mês)", valor: fmtMoeda(totalSeladoraMes), classe: totalSeladoraMes ? "ok" : "" },
      { rotulo: "Bônus total (último mês)", valor: fmtMoeda(totalGeralMes), classe: totalGeralMes ? "ok" : "" },
    ]);
    renderTabela(container, {
      id: "bonus-clientes-novos", titulo: "Bônus por mês (clientes novos + seladora)",
      colunas: [
        ...(window.AREA_CONFIG.vendedorFiltro ? [] : [{ chave: "vendedor", rotulo: "Vendedor" }]),
        { chave: "mes", rotulo: "Mês" },
        { chave: "faturamento_clientes_novos", rotulo: "Faturamento clientes novos", render: r => fmtMoeda(r.faturamento_clientes_novos) },
        { chave: "bonus_clientes_novos", rotulo: "Bônus clientes novos", render: r => fmtMoeda(r.bonus_clientes_novos ?? r.bonus ?? 0) },
        { chave: "qtd_seladoras", rotulo: "Seladoras vendidas", render: r => r.qtd_seladoras ?? 0 },
        { chave: "bonus_seladora", rotulo: "Bônus seladora", render: r => fmtMoeda(r.bonus_seladora ?? 0) },
        { chave: "bonus_total", rotulo: "Bônus total", render: r => fmtMoeda(r.bonus_total ?? r.bonus ?? 0) },
      ],
      linhas: linhasBonus,
    });
  }

  // Auditoria "cliente marcado como novo mas é recorrente" (secao 4.3(a)
  // do documento do projeto - pedido explicito do usuario, 13/08/2026):
  // vendas lancadas no OMIE sob um codigo de vendedor "- Clientes Novos"
  // que a auditoria por CNPJ/CPF desconfirma (o cliente ja tinha comprado
  // antes). Essas vendas NAO entram no calculo de bonus (o bonus so usa a
  // classificacao real auditada) - esta tabela existe so para o vendedor
  // enxergar QUAIS vendas foram lancadas errado no OMIE e corrigir na
  // origem, e para explicar por que o faturamento de "clientes novos"
  // pode estar mais baixo do que ele esperava.
  const auditoriaNovoIncorreto = CONSOLIDADO.auditoria_novo_incorreto || {};
  let linhasAuditoriaNovo = Object.entries(auditoriaNovoIncorreto).flatMap(
    ([vendedor, casos]) => casos.map(c => ({ vendedor, ...c }))
  );
  if (linhasAuditoriaNovo.length) {
    renderCards(container, [
      { rotulo: 'Vendas marcadas "cliente novo" que a auditoria não confirma', valor: linhasAuditoriaNovo.length, classe: "atencao" },
    ]);
    renderTabela(container, {
      id: "auditoria-novo-incorreto", titulo: "Auditoria: clientes marcados como novos mas são recorrentes (CNPJ/CPF já tinha comprado antes)",
      colunas: [
        ...(window.AREA_CONFIG.vendedorFiltro ? [] : [{ chave: "vendedor", rotulo: "Vendedor" }]),
        { chave: "numero_nf", rotulo: "NF/OS" },
        { chave: "data_emissao", rotulo: "Data" },
        { chave: "razao_social_cliente", rotulo: "Cliente" },
        { chave: "cnpj_cliente", rotulo: "CNPJ/CPF" },
        { chave: "faturamento_real", rotulo: "Faturamento", render: r => fmtMoeda(r.faturamento_real) },
        { chave: "dono_cliente", rotulo: "Dono real do cliente (1ª compra)" },
        { chave: "classificacao_informada", rotulo: "Lançado como" },
        { chave: "classificacao_real", rotulo: "Auditoria (CNPJ/CPF) mostra" },
      ],
      linhas: linhasAuditoriaNovo,
    });
  }
}

function abaMetas(container) {
  // No painel individual (Joice/Rubs/Eduardo), CONSOLIDADO.metas ja vem
  // filtrado do backend (consolidar.gravar_arquivos_por_area) so com a
  // meta e as vendas do proprio vendedor - o painel nao faz nenhum
  // filtro extra aqui, so escolhe os rotulos certos.
  const individual = !!window.AREA_CONFIG.vendedorFiltro;
  let metas = CONSOLIDADO.metas.slice();
  if (ESTADO.mes) metas = metas.filter(m => m.mes === ESTADO.mes);
  const ultimo = metas.slice(-1)[0];
  if (ultimo) {
    renderCards(container, [
      { rotulo: `${individual ? "Minha meta" : "Meta do canal"} (${ultimo.mes})`, valor: fmtMoeda(ultimo.meta_canal) },
      { rotulo: "Realizado", valor: fmtMoeda(ultimo.realizado_canal) },
      { rotulo: "Atingimento", valor: badgeAtingimento(ultimo.atingimento_pct) },
      { rotulo: "Mix clientes novos", valor: `${ultimo.mix_novos_pct ?? 0}%` },
    ]);
  }
  renderTabela(container, {
    id: "metas", titulo: individual ? "Minhas metas por mês" : "Metas por mês (canal online)",
    colunas: [
      { chave: "mes", rotulo: "Mês" },
      { chave: "meta_canal", rotulo: individual ? "Meta" : "Meta do canal", render: r => fmtMoeda(r.meta_canal) },
      { chave: "realizado_canal", rotulo: "Realizado", render: r => fmtMoeda(r.realizado_canal) },
      // meta_novos/meta_recorrentes/atingimento_*_pct (4.8: mix da meta
      // 25%/75% e a propria meta dividida nessa proporcao, nao so o mix
      // do que foi realizado - ver consolidar.monta_lista_metas).
      { chave: "realizado_novos", rotulo: "Clientes novos", render: r => fmtMoeda(r.realizado_novos) },
      { chave: "meta_novos", rotulo: "Meta clientes novos (25%)", render: r => fmtMoeda(r.meta_novos ?? 0) },
      { chave: "atingimento_novos_pct", rotulo: "Ating. novos", render: r => badgeAtingimento(r.atingimento_novos_pct) },
      { chave: "realizado_recorrentes", rotulo: "Clientes recorrentes", render: r => fmtMoeda(r.realizado_recorrentes) },
      { chave: "meta_recorrentes", rotulo: "Meta recorrentes (75%)", render: r => fmtMoeda(r.meta_recorrentes ?? 0) },
      { chave: "atingimento_recorrentes_pct", rotulo: "Ating. recorrentes", render: r => badgeAtingimento(r.atingimento_recorrentes_pct) },
      { chave: "atingimento_pct", rotulo: "Atingimento total", render: r => badgeAtingimento(r.atingimento_pct) },
    ],
    linhas: metas,
  });
  const algumNaoAuditado = metas.some(m => (m.realizado_nao_auditado || 0) > 0);
  if (algumNaoAuditado) {
    const nota = document.createElement("p");
    nota.className = "pendente";
    nota.innerHTML = "<strong>Observação:</strong> parte do faturamento (ordens de serviço, que não trazem CNPJ do cliente na API do OMIE) entra no valor \"Realizado\" mas não é classificado como novo/recorrente — a soma de \"Clientes novos\" + \"Clientes recorrentes\" pode ficar um pouco abaixo do Realizado por esse motivo.";
    container.appendChild(nota);
  }
}

function abaKommo(container) {
  const perf = CONSOLIDADO.performance_kommo;
  // Filtro de mes (4.11: responsivo a tudo, nao so cards de resumo) - usa
  // o recorte por mes que consolidar.calcular_performance_kommo ja gera.
  // Sem leads naquele mes -> estrutura vazia (nao cai pro total geral, que
  // enganaria o filtro selecionado).
  const vazio = { por_funil: [], motivos_perda: [], total_leads: 0, total_pipelines: perf.total_pipelines };
  const dados = ESTADO.mes ? ((perf.por_mes && perf.por_mes[ESTADO.mes]) || vazio) : perf;

  renderCards(container, [
    { rotulo: `Total de leads${ESTADO.mes ? " em " + ESTADO.mes : ""}`, valor: dados.total_leads.toLocaleString("pt-BR") },
    { rotulo: "Funis monitorados", valor: dados.total_pipelines },
  ]);
  renderTabela(container, {
    id: "kommo-funis", titulo: "Ganhas / perdidas por funil",
    colunas: [
      { chave: "funil", rotulo: "Funil" },
      { chave: "ganhas", rotulo: "Ganhas" },
      { chave: "perdidas", rotulo: "Perdidas" },
      { chave: "em_aberto", rotulo: "Em aberto" },
      { chave: "taxa_conversao_pct", rotulo: "Conversão", render: r => r.taxa_conversao_pct != null ? r.taxa_conversao_pct + "%" : "-" },
      { chave: "valor_ganho", rotulo: "Valor ganho", render: r => fmtMoeda(r.valor_ganho) },
    ],
    linhas: dados.por_funil,
  });
  renderTabela(container, {
    id: "kommo-motivos", titulo: "Motivos de perda",
    colunas: [
      { chave: "motivo", rotulo: "Motivo" },
      { chave: "qtd", rotulo: "Quantidade" },
      { chave: "valor", rotulo: "Valor perdido", render: r => fmtMoeda(r.valor) },
    ],
    linhas: dados.motivos_perda,
  });
}

function abaGratificacao(container) {
  // Tabela B (secao 4.5): valor unico do canal, mesmo pra Francyne e
  // Geovana (a regra e sobre o faturamento total do canal, nao por
  // pessoa) - ver calc/consolidar.calcular_gratificacao.
  let linhas = (CONSOLIDADO.gratificacao || []).slice();
  if (ESTADO.mes) linhas = linhas.filter(l => l.mes === ESTADO.mes);
  const ultimo = linhas.slice(-1)[0];
  if (ultimo) {
    renderCards(container, [
      { rotulo: `Faturamento do canal (${ultimo.mes})`, valor: fmtMoeda(ultimo.faturamento_canal) },
      { rotulo: "Gratificação", valor: fmtMoeda(ultimo.gratificacao), classe: ultimo.gratificacao ? "ok" : "" },
    ]);
  }
  renderTabela(container, {
    id: "gratificacao", titulo: "Gratificação por mês (canal online)",
    colunas: [
      { chave: "mes", rotulo: "Mês" },
      { chave: "faturamento_canal", rotulo: "Faturamento do canal (base)", render: r => fmtMoeda(r.faturamento_canal) },
      { chave: "gratificacao", rotulo: "Gratificação", render: r => fmtMoeda(r.gratificacao) },
    ],
    linhas,
  });
}

function tabelaClientesRisco(container, id, titulo, linhas) {
  renderTabela(container, {
    id, titulo,
    colunas: [
      { chave: "razao_social_cliente", rotulo: "Cliente", render: r => r.razao_social_cliente || r.cnpj_cliente },
      { chave: "vendedor", rotulo: "Vendedor" },
      { chave: "ultima_compra", rotulo: "Última compra" },
      { chave: "dias_desde_ultima_compra", rotulo: "Dias sem comprar" },
      { chave: "intervalo_medio_dias", rotulo: "Intervalo médio (dias)", render: r => r.intervalo_medio_dias ?? "-" },
      { chave: "score_risco", rotulo: "Score de risco", render: r => r.score_risco != null ? `${r.score_risco}x` : "-" },
      { chave: "valor_total_historico", rotulo: "Valor histórico", render: r => fmtMoeda(r.valor_total_historico) },
    ],
    linhas,
  });
}

// Retencao/Reativacao (secao 4.9) sao um retrato do estado ATUAL da
// carteira (score de risco calculado com base em "hoje") - nao uma serie
// mensal como Comissao/Metas/Kommo, entao o filtro de mes nao se aplica
// aqui por natureza do dado (nao ha "retencao de fevereiro").
function abaRetencao(container) {
  const ret = CONSOLIDADO.retencao;
  renderCards(container, [
    { rotulo: "Clientes na carteira", valor: ret.carteira_tamanho },
    { rotulo: "Clientes em risco", valor: ret.qtd_clientes_em_risco, classe: ret.qtd_clientes_em_risco ? "atencao" : "ok" },
    { rotulo: "Valor total em risco", valor: fmtMoeda(ret.valor_total_em_risco) },
    // comissao_projetada (4.9 - campo que faltava): quanto de comissao
    // fica em risco se esses clientes nao voltarem a comprar.
    { rotulo: "Comissão projetada em risco", valor: fmtMoeda(ret.comissao_projetada ?? 0), classe: (ret.comissao_projetada ?? 0) ? "atencao" : "" },
  ]);
  tabelaClientesRisco(container, "retencao-top10", "Top 10 maiores clientes em risco", ret.top10_maiores_em_risco);
  tabelaClientesRisco(container, "retencao-acao", "Lista de ação priorizada", ret.lista_acao_priorizada);

  const casos = (CONSOLIDADO.auditoria_cliente_novo || {}).casos_tomada_cliente || [];
  if (casos.length) {
    renderTabela(container, {
      id: "tomada-cliente", titulo: "Casos de tomada de cliente",
      colunas: [
        { chave: "razao_social_cliente", rotulo: "Cliente", render: r => r.razao_social_cliente || r.cnpj_cliente },
        { chave: "vendedor_original", rotulo: "Vendedor original" },
        { chave: "vendedor_atual", rotulo: "Vendedor atual" },
        { chave: "data_primeira_venda", rotulo: "Data 1ª venda" },
        { chave: "data_mudanca", rotulo: "Data da mudança" },
      ],
      linhas: casos,
    });
  }
  if (ret.clientes_sem_historico_suficiente) {
    const nota = document.createElement("p");
    nota.className = "pendente";
    nota.innerHTML = `<strong>Observação:</strong> ${ret.clientes_sem_historico_suficiente} cliente(s) com apenas 1 compra no histórico não entram no score de risco (é preciso pelo menos 2 compras para calcular o intervalo médio do próprio cliente).`;
    container.appendChild(nota);
  }
}

function abaReativacao(container) {
  const ret = CONSOLIDADO.retencao;
  renderCards(container, [
    { rotulo: "Clientes a reativar", valor: ret.clientes_a_reativar.length },
    { rotulo: "Taxa de reativação histórica", valor: ret.taxa_reativacao_pct != null ? ret.taxa_reativacao_pct + "%" : "-" },
  ]);
  tabelaClientesRisco(container, "reativacao-lista", "Clientes a reativar (ordenado por score de risco)", ret.clientes_a_reativar);
  const nota = document.createElement("p");
  nota.className = "pendente";
  nota.innerHTML = "<strong>Sobre a taxa de reativação:</strong> é uma estimativa a partir do histórico de compras (episódios em que o cliente ficou acima do próprio padrão e depois voltou a comprar) - não vem de um registro de contato/campanha de reativação.";
  container.appendChild(nota);
}

const RENDER_ABA = {
  comissao: abaComissao,
  metas: abaMetas,
  kommo: abaKommo,
  retencao: abaRetencao,
  reativacao: abaReativacao,
  gratificacao: abaGratificacao,
};

/* ---------- filtros ---------- */
function mesesDisponiveis() {
  const s = new Set();
  (CONSOLIDADO.comissao.linhas || []).forEach(l => s.add(l.mes));
  (CONSOLIDADO.metas || []).forEach(m => s.add(m.mes));
  (CONSOLIDADO.gratificacao || []).forEach(g => s.add(g.mes));
  Object.values(CONSOLIDADO.bonus_clientes_novos || {}).forEach(lista => lista.forEach(l => s.add(l.mes)));
  const perf = CONSOLIDADO.performance_kommo;
  if (perf && perf.por_mes) Object.keys(perf.por_mes).forEach(m => s.add(m));
  return Array.from(s).filter(Boolean).sort();
}

function vendedoresDisponiveis() {
  const s = new Set();
  (CONSOLIDADO.comissao.linhas || []).forEach(l => s.add(l.vendedor));
  return Array.from(s).sort();
}

function renderFiltros() {
  const box = document.getElementById("filtros");
  box.innerHTML = "";

  const selMes = document.createElement("label");
  selMes.innerHTML = "Mês";
  const mesEl = document.createElement("select");
  mesEl.innerHTML = `<option value="">Todos</option>` + mesesDisponiveis().map(m => `<option value="${m}">${m}</option>`).join("");
  mesEl.addEventListener("change", () => { ESTADO.mes = mesEl.value || null; renderAbaAtiva(); });
  selMes.appendChild(mesEl);
  box.appendChild(selMes);

  if (window.AREA_CONFIG.mostrarFiltroVendedor) {
    const selVend = document.createElement("label");
    selVend.innerHTML = "Vendedor";
    const vendEl = document.createElement("select");
    vendEl.innerHTML = `<option value="">Todos</option>` + vendedoresDisponiveis().map(v => `<option value="${v}">${v}</option>`).join("");
    vendEl.addEventListener("change", () => { ESTADO.vendedor = vendEl.value || null; renderAbaAtiva(); });
    selVend.appendChild(vendEl);
    box.appendChild(selVend);
  }
}

/* ---------- shell ---------- */
let abaAtiva = null;

function renderAbaAtiva() {
  const container = document.getElementById("conteudo");
  container.innerHTML = "";
  (RENDER_ABA[abaAtiva] || (() => {}))(container);
}

function montarShell() {
  const cfg = window.AREA_CONFIG;
  document.getElementById("area-atual").textContent = cfg.nomeExibicao;
  // 6.6/4.2: distingue o horario do job automatico (OMIE/Kommo, sempre
  // "hoje") da data da ULTIMA planilha de Comissao/Frete enviada (pode
  // ser bem mais antiga) - antes so mostrava um "atualizado em" so, que
  // dava a falsa impressao de que a comissao tambem era de hoje.
  const metaComissao = CONSOLIDADO.comissao && CONSOLIDADO.comissao.meta;
  const planilhasDatas = metaComissao
    ? [metaComissao.planilha_comissao_atualizada_em_utc, metaComissao.planilha_frete_atualizada_em_utc]
        .filter(Boolean)
    : [];
  const planilhaMaisAntiga = planilhasDatas.length
    ? planilhasDatas.reduce((a, b) => (a < b ? a : b))
    : null;
  document.getElementById("atualizado-em").innerHTML =
    `Dados automáticos (OMIE/Kommo) atualizados em: ${fmtData(CONSOLIDADO.gerado_em_utc)}` +
    (planilhaMaisAntiga
      ? `<br>Planilha de Comissão/Frete atualizada em: ${fmtData(planilhaMaisAntiga)}`
      : "");

  const nav = document.getElementById("tabs");
  nav.innerHTML = "";
  cfg.abas.forEach((abaId, i) => {
    const btn = document.createElement("button");
    btn.textContent = LABEL_ABA[abaId] || abaId;
    btn.className = i === 0 ? "ativa" : "";
    btn.addEventListener("click", () => {
      nav.querySelectorAll("button").forEach(b => b.classList.remove("ativa"));
      btn.classList.add("ativa");
      abaAtiva = abaId;
      renderAbaAtiva();
    });
    nav.appendChild(btn);
  });
  abaAtiva = cfg.abas[0];
  renderFiltros();
  renderAbaAtiva();
}

function montarEsqueletoDOM() {
  document.body.innerHTML = `
    <header class="app-header">
      <div class="marca"><span class="folha"></span> Painel Comercial Copack <span class="area-atual" id="area-atual"></span></div>
      <div class="atualizado-em" id="atualizado-em"></div>
    </header>
    <nav class="tabs" id="tabs"></nav>
    <main>
      <div class="filtros" id="filtros"></div>
      <div id="conteudo"></div>
    </main>`;
}

async function iniciarPainel() {
  montarEsqueletoDOM();
  try {
    CONSOLIDADO = await carregarDados();
    montarShell();
  } catch (e) {
    document.getElementById("conteudo").innerHTML =
      `<div class="pendente"><strong>Não foi possível carregar os dados</strong>${e.message}. Tente recarregar a página em alguns minutos.</div>`;
  }
}

(function init() {
  if (jaAutenticado()) {
    iniciarPainel();
  } else {
    montarTelaLogin();
  }
})();
