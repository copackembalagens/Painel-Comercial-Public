/* Painel Comercial Copack - Camada 3 (Apresentacao)
 * Le APENAS a base consolidada (../dados/consolidado.json), gerada pela
 * Camada 2 (calc/consolidar.py) no repo privado e publicada aqui pelo job
 * das 02h. Nenhum calculo de comissao/meta/etc acontece nesta tela -
 * evita divergencia entre as 6 areas (regra da secao 7 do projeto).
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
  const resp = await fetch("../dados/consolidado.json", { cache: "no-store" });
  if (!resp.ok) throw new Error("Nao foi possivel carregar os dados (" + resp.status + ")");
  return resp.json();
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
  el.innerHTML = `
    <div class="cabecalho-tabela">
      <h3>${titulo}</h3>
      <button class="btn-exportar" data-export="${id}">Exportar Excel</button>
    </div>
    <table class="dados" data-tabela="${id}">
      <thead><tr>${thead}</tr></thead>
      <tbody>${tbody || `<tr><td colspan="${colunas.length}">Sem dados para o filtro atual.</td></tr>`}</tbody>
    </table>`;
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

  renderTabela(container, {
    id: "comissao", titulo: "Extrato de comissão por mês",
    colunas: [
      { chave: "vendedor", rotulo: "Vendedor" },
      { chave: "mes", rotulo: "Mês" },
      { chave: "recebido", rotulo: "Recebido (corrigido)", render: r => fmtMoeda(r.recebido) },
      { chave: "piso_aplicado", rotulo: "Piso aplicado", render: r => fmtMoeda(r.piso_aplicado) },
      { chave: "base_comissao", rotulo: "Base de cálculo", render: r => fmtMoeda(r.base_comissao) },
      { chave: "comissao", rotulo: "Comissão (1%)", render: r => fmtMoeda(r.comissao) },
    ],
    linhas,
  });
}

function abaMetas(container) {
  let metas = CONSOLIDADO.metas.slice();
  if (ESTADO.mes) metas = metas.filter(m => m.mes === ESTADO.mes);
  const ultimo = metas.slice(-1)[0];
  if (ultimo) {
    renderCards(container, [
      { rotulo: `Meta do canal (${ultimo.mes})`, valor: fmtMoeda(ultimo.meta_canal) },
      { rotulo: "Realizado", valor: fmtMoeda(ultimo.realizado_canal) },
      { rotulo: "Atingimento", valor: badgeAtingimento(ultimo.atingimento_pct) },
    ]);
  }
  renderTabela(container, {
    id: "metas", titulo: "Metas por mês (canal online)",
    colunas: [
      { chave: "mes", rotulo: "Mês" },
      { chave: "meta_canal", rotulo: "Meta", render: r => fmtMoeda(r.meta_canal) },
      { chave: "realizado_canal", rotulo: "Realizado", render: r => fmtMoeda(r.realizado_canal) },
      { chave: "atingimento_pct", rotulo: "Atingimento", render: r => badgeAtingimento(r.atingimento_pct) },
    ],
    linhas: metas,
  });
  const nota = document.createElement("p");
  nota.className = "pendente";
  nota.innerHTML = "<strong>Mix 25% novos / 75% recorrentes</strong>ainda não é exibido por mês/vendedor — depende da auditoria de cliente novo (próxima iteração).";
  container.appendChild(nota);
}

function abaKommo(container) {
  const perf = CONSOLIDADO.performance_kommo;
  renderCards(container, [
    { rotulo: "Total de leads (2026)", valor: perf.total_leads.toLocaleString("pt-BR") },
    { rotulo: "Funis monitorados", valor: perf.total_pipelines },
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
    linhas: perf.por_funil,
  });
  renderTabela(container, {
    id: "kommo-motivos", titulo: "Motivos de perda",
    colunas: [
      { chave: "motivo", rotulo: "Motivo" },
      { chave: "qtd", rotulo: "Quantidade" },
      { chave: "valor", rotulo: "Valor perdido", render: r => fmtMoeda(r.valor) },
    ],
    linhas: perf.motivos_perda,
  });
}

const RENDER_ABA = {
  comissao: abaComissao,
  metas: abaMetas,
  kommo: abaKommo,
  retencao: c => renderPendente(c, CONSOLIDADO.retencao),
  reativacao: c => renderPendente(c, CONSOLIDADO.retencao),
  gratificacao: c => renderPendente(c, CONSOLIDADO.gratificacao),
};

/* ---------- filtros ---------- */
function mesesDisponiveis() {
  const s = new Set();
  (CONSOLIDADO.comissao.linhas || []).forEach(l => s.add(l.mes));
  (CONSOLIDADO.metas || []).forEach(m => s.add(m.mes));
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
  document.getElementById("atualizado-em").textContent =
    "Dados atualizados em: " + fmtData(CONSOLIDADO.gerado_em_utc);

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

(async function init() {
  try {
    CONSOLIDADO = await carregarDados();
    montarShell();
  } catch (e) {
    document.getElementById("conteudo").innerHTML =
      `<div class="pendente"><strong>Não foi possível carregar os dados</strong>${e.message}. Tente recarregar a página em alguns minutos.</div>`;
  }
})();
