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
  // title com o valor exato (13/08/2026, pedido do usuario: "legenda com
  // o valor quando passar o mouse") - cards que passam `tooltip` mostram
  // esse texto ao passar o mouse, alem do valor ja visivel.
  el.innerHTML = cards.map(c => `
    <div class="card" ${c.tooltip ? `title="${c.tooltip}"` : ""}>
      <div class="rotulo">${c.rotulo}</div>
      <div class="valor ${c.classe || ""}">${c.valor}</div>
    </div>`).join("");
  container.appendChild(el);
}

// Card de "analises rapidas" (secao 4.7 do documento do projeto - "Metas
// e analises rapidas" pros vendedores, "analises rapidas para feedback
// individual e de equipe" no Gerencial - pedido explicito do usuario,
// 13/08/2026, pra deixar isso visivel em toda aba). So insights de texto
// computados a partir do que ja esta no JSON, sem calculo novo nenhum -
// se `itens` vier vazio, a funcao nao renderiza nada (nunca mostra um
// card vazio/quebrado).
function renderAnalisesRapidas(container, itens) {
  const validos = (itens || []).filter(Boolean);
  if (!validos.length) return;
  const el = document.createElement("div");
  el.className = "painel-tabela analises-rapidas";
  el.innerHTML = `
    <div class="cabecalho-tabela"><h3>Análises rápidas</h3></div>
    <ul>${validos.map(txt => `<li>${txt}</li>`).join("")}</ul>`;
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

function somaCampo(linhas, campo, alt) {
  return linhas.reduce((s, l) => s + (l[campo] ?? (alt ? l[alt] : 0) ?? 0), 0);
}

// Rotulo de periodo pros cards de totais: quando ha um mes especifico
// selecionado no filtro, mostra o mes; quando o filtro esta em "Todos"
// (ESTADO.mes null), soma TUDO que sobrou apos os outros filtros e avisa
// que e um total de varios meses - antes disso os cards sempre mostravam
// so o ultimo mes presente nos dados, MESMO com "Todos" selecionado, o
// que fazia parecer que o filtro "Todos" nao tinha efeito nenhum (bug
// reportado pelo usuario, 13/08/2026).
function rotuloPeriodo(linhas) {
  if (ESTADO.mes) return ESTADO.mes;
  const meses = Array.from(new Set(linhas.map(l => l.mes))).filter(Boolean).sort();
  if (meses.length <= 1) return meses[0] || "-";
  return `todos os meses: ${meses[0]} a ${meses[meses.length - 1]}`;
}

// Pessoas que aparecem no card de totais (13/08/2026, pedido do usuario):
// consultores (tem painel/funil proprio), supervisao (Kenia, comissiona e
// tem bonus mas nao tem painel individual) e backoffice (Francyne/Geovana,
// so tem Gratificacao - nao vendem, entao comissao/bonus/seladora ficam
// sempre zero pra elas, mas aparecem na mesma tabela pra comparacao).
const PESSOAS_RESUMO = [
  { vendedor: "Eduardo Santiago", papel: "Consultor" },
  { vendedor: "Joice", papel: "Consultor" },
  { vendedor: "Rubs", papel: "Consultor" },
  { vendedor: "Kenia", papel: "Supervisão" },
  { vendedor: "Francyne", papel: "Backoffice" },
  { vendedor: "Geovana", papel: "Backoffice" },
];

function totaisPorPessoa() {
  // Ignora ESTADO.vendedor de proposito (esse card e uma comparacao entre
  // TODAS as pessoas ao mesmo tempo - selecionar um vendedor especifico no
  // filtro nao faz sentido reduzir essa tabela a 1 linha). Respeita
  // ESTADO.mes normalmente.
  const comissaoLinhas = (CONSOLIDADO.comissao.linhas || []).filter(l => !ESTADO.mes || l.mes === ESTADO.mes);
  const bonusPorVendedor = CONSOLIDADO.bonus_clientes_novos || {};
  const gratLinhas = (CONSOLIDADO.gratificacao || []).filter(l => !ESTADO.mes || l.mes === ESTADO.mes);
  const totalGratificacao = somaCampo(gratLinhas, "gratificacao");

  return PESSOAS_RESUMO.map(p => {
    const comissao = somaCampo(comissaoLinhas.filter(l => l.vendedor === p.vendedor), "comissao");
    const bonusLista = (bonusPorVendedor[p.vendedor] || []).filter(l => !ESTADO.mes || l.mes === ESTADO.mes);
    const bonus = somaCampo(bonusLista, "bonus_clientes_novos", "bonus");
    const seladora = somaCampo(bonusLista, "bonus_seladora");
    const gratificacao = p.papel === "Backoffice" ? totalGratificacao : 0;
    return {
      vendedor: p.vendedor, papel: p.papel, comissao, bonus, seladora, gratificacao,
      total: comissao + bonus + seladora + gratificacao,
    };
  });
}

// Analises rapidas da aba Comissao (secao 4.7 - pedido do usuario,
// 13/08/2026): so texto derivado do que ja esta calculado, sem nenhuma
// conta nova. Defensivo com dados vazios (nunca quebra a tela).
function renderAnalisesComissao(container, linhas, linhasBonus, periodo) {
  const itens = [];
  const individual = !!window.AREA_CONFIG.vendedorFiltro;

  if (!individual && linhas.length) {
    const porPessoa = {};
    linhas.forEach(l => { porPessoa[l.vendedor] = (porPessoa[l.vendedor] || 0) + (l.comissao || 0); });
    const ranking = Object.entries(porPessoa).sort((a, b) => b[1] - a[1]);
    if (ranking.length && ranking[0][1] > 0) {
      itens.push(`Maior comissão do período (${periodo}): <strong>${ranking[0][0]}</strong>, ${fmtMoeda(ranking[0][1])}.`);
    }
  }

  if (individual && linhas.length) {
    const meses = Array.from(new Set(linhas.map(l => l.mes))).sort();
    if (meses.length >= 2) {
      const primeiro = linhas.filter(l => l.mes === meses[0]).reduce((s, l) => s + l.comissao, 0);
      const ultimoV = linhas.filter(l => l.mes === meses[meses.length - 1]).reduce((s, l) => s + l.comissao, 0);
      if (primeiro > 0) {
        const variacao = ((ultimoV - primeiro) / primeiro) * 100;
        itens.push(`Comissão em ${meses[meses.length - 1]} ${variacao >= 0 ? "cresceu" : "caiu"} ${Math.abs(variacao).toFixed(1)}% em relação a ${meses[0]}.`);
      }
    }
  }

  if (linhasBonus.length) {
    const qtdComBonus = new Set(linhasBonus.filter(l => (l.bonus_clientes_novos ?? l.bonus ?? 0) > 0).map(l => l.vendedor)).size;
    const qtdTotal = new Set(linhasBonus.map(l => l.vendedor)).size;
    if (qtdTotal > 1) {
      itens.push(`${qtdComBonus} de ${qtdTotal} pessoas bateram o primeiro degrau do bônus de clientes novos (R$ 100 mil) em algum mês do período (${periodo}).`);
    } else if (qtdComBonus > 0) {
      itens.push(`Bônus de clientes novos batido em pelo menos 1 mês do período selecionado.`);
    }
  }

  renderAnalisesRapidas(container, itens);
}

function abaComissao(container) {
  const linhas = linhasComissaoFiltradas();
  const periodo = rotuloPeriodo(linhas);
  const totalComissaoPeriodo = somaCampo(linhas, "comissao");
  const totalRecebidoPeriodo = somaCampo(linhas, "recebido");

  // Card de totais por pessoa (pedido do usuario, 13/08/2026): so faz
  // sentido no Gerencial - so ele tem visao de todo mundo (comissao.linhas
  // e bonus_clientes_novos dos paineis individuais ja vem filtrados so com
  // a propria pessoa, ver calc/consolidar.gravar_arquivos_por_area).
  if (!window.AREA_CONFIG.vendedorFiltro) {
    renderTabela(container, {
      id: "totais-por-pessoa", titulo: `Totais por pessoa (${rotuloPeriodo(CONSOLIDADO.comissao.linhas || [])})`,
      colunas: [
        { chave: "vendedor", rotulo: "Pessoa" },
        { chave: "papel", rotulo: "Papel" },
        { chave: "comissao", rotulo: "Comissão", render: r => fmtMoeda(r.comissao) },
        { chave: "bonus", rotulo: "Bônus", render: r => fmtMoeda(r.bonus) },
        { chave: "seladora", rotulo: "Seladora", render: r => fmtMoeda(r.seladora) },
        { chave: "gratificacao", rotulo: "Gratificação", render: r => fmtMoeda(r.gratificacao) },
        { chave: "total", rotulo: "Total", render: r => fmtMoeda(r.total) },
      ],
      linhas: totaisPorPessoa(),
    });
  }

  renderCards(container, [
    { rotulo: `Recebido (${periodo})`, valor: fmtMoeda(totalRecebidoPeriodo) },
    { rotulo: `Comissão (${periodo})`, valor: fmtMoeda(totalComissaoPeriodo), classe: "ok" },
    { rotulo: "Linhas sem data de pagamento válida", valor: CONSOLIDADO.comissao.meta.linhas_sem_data_valida.length, classe: CONSOLIDADO.comissao.meta.linhas_sem_data_valida.length ? "atencao" : "ok" },
  ]);

  // Bonus de clientes novos (secao 4.5): CONSOLIDADO.bonus_clientes_novos e
  // sempre {vendedor: [{mes, faturamento_clientes_novos, bonus}]} - no
  // painel individual so vem a chave do proprio vendedor; no Gerencial vem
  // todo mundo (Eduardo/Joice/Rubs/Kenia).
  const bonusPorVendedor = CONSOLIDADO.bonus_clientes_novos || {};
  let linhasBonus = Object.entries(bonusPorVendedor).flatMap(
    ([vendedor, lista]) => lista.map(l => ({ vendedor, ...l }))
  );
  // Responsivo aos dois filtros (mes E vendedor) - antes so filtrava por
  // mes, entao no Gerencial o filtro de Vendedor nao tinha efeito nenhum
  // sobre o bonus (mesma familia do bug reportado pelo usuario em
  // "Recebido em"/"Comissao em", 13/08/2026).
  if (ESTADO.vendedor) linhasBonus = linhasBonus.filter(l => l.vendedor === ESTADO.vendedor);
  if (ESTADO.mes) linhasBonus = linhasBonus.filter(l => l.mes === ESTADO.mes);
  if (linhasBonus.length) {
    // bonus_clientes_novos/bonus_seladora/bonus_total: campos novos
    // (13/08/2026). Fallback pro campo antigo "bonus" (pre-seladora) so
    // por seguranca, caso algum dado publicado ainda nao tenha sido
    // reprocessado com o formato novo.
    const periodoBonus = rotuloPeriodo(linhasBonus);
    const totalNovosMes = somaCampo(linhasBonus, "bonus_clientes_novos", "bonus");
    const totalSeladoraMes = somaCampo(linhasBonus, "bonus_seladora");
    const totalGeralMes = linhasBonus.some(l => "bonus_total" in l) ? somaCampo(linhasBonus, "bonus_total") : totalNovosMes;
    renderCards(container, [
      { rotulo: `Bônus clientes novos (${periodoBonus})`, valor: fmtMoeda(totalNovosMes), classe: totalNovosMes ? "ok" : "" },
      { rotulo: `Bônus seladora (${periodoBonus})`, valor: fmtMoeda(totalSeladoraMes), classe: totalSeladoraMes ? "ok" : "" },
      { rotulo: `Bônus total (${periodoBonus})`, valor: fmtMoeda(totalGeralMes), classe: totalGeralMes ? "ok" : "" },
    ]);
  }

  // Extrato detalhado com toggle (pedido do usuario, 13/08/2026): antes
  // as duas tabelas (comissao e bonus) ficavam sempre visiveis ao mesmo
  // tempo; agora um botao deixa o consultor escolher qual ver, reduzindo
  // a poluicao visual. ESTADO.extratoView persiste entre trocas de aba/
  // filtro (so reseta ao recarregar a pagina) e e responsivo aos mesmos
  // filtros de mes/vendedor que ja alimentam `linhas`/`linhasBonus` acima.
  if (!ESTADO.extratoView) ESTADO.extratoView = "comissao";
  const toggle = document.createElement("div");
  toggle.className = "toggle-extrato";
  toggle.innerHTML = `
    <button type="button" data-view="comissao" class="${ESTADO.extratoView === "comissao" ? "ativa" : ""}">Extrato de comissão</button>
    <button type="button" data-view="bonificacao" class="${ESTADO.extratoView === "bonificacao" ? "ativa" : ""}">Extrato de bonificação</button>
  `;
  container.appendChild(toggle);
  toggle.querySelectorAll("[data-view]").forEach(btn => {
    btn.addEventListener("click", () => { ESTADO.extratoView = btn.dataset.view; renderAbaAtiva(); });
  });

  if (ESTADO.extratoView === "comissao") {
    // Piso aplicado (R$150k) so existe para a Kenia, que nao tem painel
    // individual - so aparece na visao Gerencial (vendedorFiltro null).
    // Nos paineis individuais (Joice/Rubs/Eduardo) essa coluna nao se
    // aplica.
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
      id: "comissao", titulo: `Extrato de comissão por mês (${periodo})`,
      colunas: colunasComissao,
      linhas,
    });
  } else {
    renderTabela(container, {
      id: "bonus-clientes-novos", titulo: `Extrato de bonificação por mês (clientes novos + seladora) (${rotuloPeriodo(linhasBonus)})`,
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

  renderAnalisesComissao(container, linhas, linhasBonus, periodo);
}

// Grafico de pizza em SVG puro (sem biblioteca externa - jsdom nao tem
// canvas 2D, entao Chart.js quebraria nos testes locais; SVG e nativo e
// testavel). <title> dentro do <path> da o tooltip nativo do navegador ao
// passar o mouse em cada fatia - "legenda com o valor ao passar o mouse"
// (pedido do usuario, 13/08/2026), alem da legenda sempre visivel ao lado.
const CORES_PIZZA = ["#ABAD00", "#7A7021", "#607D8B", "#F9A825", "#C62828", "#455A64"];

function svgPizza(fatias) {
  const raio = 80;
  const validas = fatias.filter(f => f.valor > 0);
  const total = validas.reduce((s, f) => s + f.valor, 0);
  if (!total) return '<p class="pendente-inline">Sem dados para o período selecionado.</p>';
  const cx = raio, cy = raio;
  let angulo = -Math.PI / 2;
  const paths = validas.map((f, i) => {
    const fracao = f.valor / total;
    const anguloFim = angulo + fracao * 2 * Math.PI;
    const x1 = (cx + raio * Math.cos(angulo)).toFixed(2), y1 = (cy + raio * Math.sin(angulo)).toFixed(2);
    const x2 = (cx + raio * Math.cos(anguloFim)).toFixed(2), y2 = (cy + raio * Math.sin(anguloFim)).toFixed(2);
    const largeArc = (anguloFim - angulo) > Math.PI ? 1 : 0;
    const cor = f.cor || CORES_PIZZA[i % CORES_PIZZA.length];
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${raio} ${raio} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    angulo = anguloFim;
    return `<path d="${d}" fill="${cor}" stroke="#fff" stroke-width="1"><title>${f.rotulo}: ${fmtMoeda(f.valor)} (${(fracao * 100).toFixed(1)}%)</title></path>`;
  }).join("");
  const legendas = validas.map((f, i) => `
    <div class="legenda-item">
      <span class="legenda-cor" style="background:${f.cor || CORES_PIZZA[i % CORES_PIZZA.length]}"></span>
      <span>${f.rotulo}: ${fmtMoeda(f.valor)} (${(100 * f.valor / total).toFixed(1)}%)</span>
    </div>`).join("");
  return `
    <div class="pizza-wrap">
      <svg viewBox="0 0 ${raio * 2} ${raio * 2}" width="${raio * 2}" height="${raio * 2}">${paths}</svg>
      <div class="pizza-legenda">${legendas}</div>
    </div>`;
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

  // Card "faturamento total da empresa" (pedido do usuario, 13/08/2026):
  // CONSOLIDADO.metas_empresa e a mesma serie canal-wide (so canal
  // online, apos a correcao de 13/08/2026 - ver calc/consolidar.
  // calcular_metas_e_bonus) mas SEM o filtro por vendedor que "metas" ja
  // leva no painel individual - assim todo mundo (nao so o Gerencial)
  // consegue ver "quanto a empresa faturou no mes", nao so a propria
  // carteira. Os cards tem tooltip (title) com o valor e o % do total,
  // ao passar o mouse.
  let metasEmpresa = (CONSOLIDADO.metas_empresa || []).slice();
  if (ESTADO.mes) metasEmpresa = metasEmpresa.filter(m => m.mes === ESTADO.mes);
  const ultimoEmpresa = metasEmpresa.slice(-1)[0];
  if (ultimoEmpresa) {
    const totalRealizado = ultimoEmpresa.realizado_canal || 0;
    const pctNovos = totalRealizado ? (100 * ultimoEmpresa.realizado_novos / totalRealizado) : 0;
    const pctRecorrentes = totalRealizado ? (100 * ultimoEmpresa.realizado_recorrentes / totalRealizado) : 0;
    renderCards(container, [
      {
        rotulo: `Faturamento total da empresa (${ultimoEmpresa.mes})`,
        valor: fmtMoeda(totalRealizado),
        tooltip: `Canal online (Eduardo, Joice, Rubs, Atendimento, iSet, Kênia, Seladora) em ${ultimoEmpresa.mes}: ${fmtMoeda(totalRealizado)}`,
      },
      {
        rotulo: "Clientes novos",
        valor: fmtMoeda(ultimoEmpresa.realizado_novos),
        tooltip: `${fmtMoeda(ultimoEmpresa.realizado_novos)} (${pctNovos.toFixed(1)}% do total faturado no mês)`,
      },
      {
        rotulo: "Clientes recorrentes",
        valor: fmtMoeda(ultimoEmpresa.realizado_recorrentes),
        tooltip: `${fmtMoeda(ultimoEmpresa.realizado_recorrentes)} (${pctRecorrentes.toFixed(1)}% do total faturado no mês)`,
      },
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

  // Canal online x offline + valores por empresa, em pizza (pedido
  // explicito do usuario, 13/08/2026): "considere que o canal online sao
  // apenas as vendas dos vendedores Rubs, Eduardo, Joice, Atendimento,
  // Iset, Kenia, Seladora, os demais vendedores sao do canal offline
  // atendidos pelo outro canal". So no Gerencial - e o unico painel com
  // visao de todo o faturamento (individual so ve a propria carteira).
  if (!individual) {
    let canalEmpresa = (CONSOLIDADO.canal_empresa || []).slice();
    if (ESTADO.mes) canalEmpresa = canalEmpresa.filter(c => c.mes === ESTADO.mes);
    const ultimoCanal = canalEmpresa.slice(-1)[0];
    if (ultimoCanal) {
      const totalGeral = ultimoCanal.realizado_total || 0;
      const pctOnline = totalGeral ? (100 * ultimoCanal.realizado_online / totalGeral) : 0;
      renderCards(container, [
        {
          rotulo: `Canal online (${ultimoCanal.mes})`,
          valor: fmtMoeda(ultimoCanal.realizado_online),
          tooltip: `Rubs, Eduardo, Joice, Atendimento, iSet, Kênia e Seladora: ${fmtMoeda(ultimoCanal.realizado_online)} (${pctOnline.toFixed(1)}% do total)`,
          classe: "ok",
        },
        {
          rotulo: `Canal offline (${ultimoCanal.mes})`,
          valor: fmtMoeda(ultimoCanal.realizado_offline),
          tooltip: `Demais vendedores (atendidos pelo outro canal, ex.: Canudos/Centroeste presencial): ${fmtMoeda(ultimoCanal.realizado_offline)} (${(100 - pctOnline).toFixed(1)}% do total)`,
        },
      ]);

      const porEmpresa = ultimoCanal.por_empresa || {};
      const NOME_EMPRESA = { ecommerce: "Ecommerce", canudos: "Canudos", centroeste: "Centroeste" };
      const fatias = Object.entries(porEmpresa).map(([chave, valor]) => ({
        rotulo: NOME_EMPRESA[chave] || chave, valor,
      }));
      const el = document.createElement("div");
      el.className = "painel-tabela";
      el.innerHTML = `
        <div class="cabecalho-tabela"><h3>Faturamento por empresa (${ultimoCanal.mes})</h3></div>
        ${svgPizza(fatias)}`;
      container.appendChild(el);
    }
  }

  // Analises rapidas (secao 4.7 - pedido do usuario, 13/08/2026).
  const itensAnalise = [];
  if (ultimo) {
    const faltaMeta = (ultimo.meta_canal || 0) - (ultimo.realizado_canal || 0);
    if (faltaMeta > 0) {
      itensAnalise.push(`Faltam ${fmtMoeda(faltaMeta)} para bater a meta de ${ultimo.mes} (atingimento atual: ${ultimo.atingimento_pct ?? 0}%).`);
    } else {
      itensAnalise.push(`Meta de ${ultimo.mes} batida - ${ultimo.atingimento_pct ?? 0}% de atingimento.`);
    }
    if (ultimo.mix_novos_pct != null) {
      const diffMix = ultimo.mix_novos_pct - 25;
      itensAnalise.push(`Mix de clientes novos em ${ultimo.mes}: ${ultimo.mix_novos_pct}% (meta do mix: 25%) - ${diffMix >= 0 ? "acima" : "abaixo"} do alvo em ${Math.abs(diffMix).toFixed(1)} p.p.`);
    }
  }
  if (metas.length >= 2) {
    const anterior = metas[metas.length - 2];
    if (ultimo && anterior && anterior.realizado_canal) {
      const variacao = ((ultimo.realizado_canal - anterior.realizado_canal) / anterior.realizado_canal) * 100;
      itensAnalise.push(`Realizado ${variacao >= 0 ? "cresceu" : "caiu"} ${Math.abs(variacao).toFixed(1)}% em relação a ${anterior.mes}.`);
    }
  }
  renderAnalisesRapidas(container, itensAnalise);
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

  const itensAnalise = [];
  const funilTop = dados.por_funil.slice().filter(f => f.taxa_conversao_pct != null).sort((a, b) => b.taxa_conversao_pct - a.taxa_conversao_pct)[0];
  if (funilTop) {
    itensAnalise.push(`Funil com maior conversão: <strong>${funilTop.funil}</strong>, ${funilTop.taxa_conversao_pct}% (${funilTop.ganhas} ganhas de ${funilTop.ganhas + funilTop.perdidas} fechadas).`);
  }
  const motivoTop = dados.motivos_perda.slice().sort((a, b) => b.qtd - a.qtd)[0];
  if (motivoTop) {
    itensAnalise.push(`Principal motivo de perda: <strong>${motivoTop.motivo}</strong> (${motivoTop.qtd} casos, ${fmtMoeda(motivoTop.valor)} perdidos).`);
  }
  renderAnalisesRapidas(container, itensAnalise);
}

function abaGratificacao(container) {
  // Tabela B (secao 4.5): valor unico do canal, mesmo pra Francyne e
  // Geovana (a regra e sobre o faturamento total do canal, nao por
  // pessoa) - ver calc/consolidar.calcular_gratificacao.
  let linhas = (CONSOLIDADO.gratificacao || []).slice();
  if (ESTADO.mes) linhas = linhas.filter(l => l.mes === ESTADO.mes);
  if (linhas.length) {
    // Soma o periodo filtrado em vez de sempre pegar so o ultimo mes -
    // mesma correcao aplicada em Comissao/Bonus (13/08/2026): com "Todos"
    // selecionado, o card precisa refletir a soma de tudo, nao travar no
    // ultimo mes disponivel.
    const periodo = rotuloPeriodo(linhas);
    renderCards(container, [
      { rotulo: `Faturamento do canal (${periodo})`, valor: fmtMoeda(somaCampo(linhas, "faturamento_canal")) },
      { rotulo: `Gratificação (${periodo})`, valor: fmtMoeda(somaCampo(linhas, "gratificacao")), classe: somaCampo(linhas, "gratificacao") ? "ok" : "" },
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

  const itensAnalise = [];
  if (linhas.length) {
    const ultimoG = linhas.slice(-1)[0];
    itensAnalise.push(`Gratificação de ${ultimoG.mes}: ${fmtMoeda(ultimoG.gratificacao)}, sobre faturamento de ${fmtMoeda(ultimoG.faturamento_canal)}.`);
    if (linhas.length >= 2) {
      const anteriorG = linhas[linhas.length - 2];
      if (anteriorG.gratificacao) {
        const variacao = ((ultimoG.gratificacao - anteriorG.gratificacao) / anteriorG.gratificacao) * 100;
        itensAnalise.push(`Gratificação ${variacao >= 0 ? "subiu" : "caiu"} ${Math.abs(variacao).toFixed(1)}% em relação a ${anteriorG.mes}.`);
      }
    }
  }
  renderAnalisesRapidas(container, itensAnalise);
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

  const itensAnalise = [];
  if (ret.carteira_tamanho) {
    const pctRisco = 100 * ret.qtd_clientes_em_risco / ret.carteira_tamanho;
    itensAnalise.push(`${ret.qtd_clientes_em_risco} de ${ret.carteira_tamanho} clientes em risco (${pctRisco.toFixed(1)}% da carteira), somando ${fmtMoeda(ret.valor_total_em_risco)}.`);
  }
  if (ret.top10_maiores_em_risco && ret.top10_maiores_em_risco.length) {
    const maior = ret.top10_maiores_em_risco[0];
    itensAnalise.push(`Maior risco: <strong>${maior.razao_social_cliente || maior.cnpj_cliente}</strong>, ${fmtMoeda(maior.valor_total_historico)} histórico, ${maior.dias_desde_ultima_compra} dias sem comprar.`);
  }
  renderAnalisesRapidas(container, itensAnalise);
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

  const itensAnalise = [];
  if (ret.clientes_a_reativar && ret.clientes_a_reativar.length) {
    const valorTotal = ret.clientes_a_reativar.reduce((s, c) => s + (c.valor_total_historico || 0), 0);
    itensAnalise.push(`${ret.clientes_a_reativar.length} clientes prontos para contato de reativação, somando ${fmtMoeda(valorTotal)} em histórico.`);
  }
  if (ret.taxa_reativacao_pct != null) {
    itensAnalise.push(`Taxa histórica de reativação: ${ret.taxa_reativacao_pct}% dos episódios de risco anteriores resultaram em nova compra.`);
  }
  renderAnalisesRapidas(container, itensAnalise);
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
  // Pedido do usuario (13/08/2026): filtros com botoes "Limpar" e
  // "Aplicar" em vez de aplicar a cada troca de select - os <select>
  // so mudam o valor VISIVEL, o ESTADO (que dispara o re-render das
  // abas) so muda quando o usuario clica em "Aplicar" (ou "Limpar").
  // Isso tambem evita qualquer race condition entre trocar Mes e
  // trocar Vendedor rapido em sequencia - so importa o que os dois
  // selects tem no momento do clique.
  const box = document.getElementById("filtros");
  box.innerHTML = "";

  const selMes = document.createElement("label");
  selMes.innerHTML = "Mês";
  const mesEl = document.createElement("select");
  mesEl.id = "filtro-mes";
  mesEl.innerHTML = `<option value="">Todos</option>` + mesesDisponiveis().map(m => `<option value="${m}" ${ESTADO.mes === m ? "selected" : ""}>${m}</option>`).join("");
  selMes.appendChild(mesEl);
  box.appendChild(selMes);

  let vendEl = null;
  if (window.AREA_CONFIG.mostrarFiltroVendedor) {
    const selVend = document.createElement("label");
    selVend.innerHTML = "Vendedor";
    vendEl = document.createElement("select");
    vendEl.id = "filtro-vendedor";
    vendEl.innerHTML = `<option value="">Todos</option>` + vendedoresDisponiveis().map(v => `<option value="${v}" ${ESTADO.vendedor === v ? "selected" : ""}>${v}</option>`).join("");
    selVend.appendChild(vendEl);
    box.appendChild(selVend);
  }

  const btnAplicar = document.createElement("button");
  btnAplicar.type = "button";
  btnAplicar.className = "btn-filtro btn-aplicar";
  btnAplicar.textContent = "Aplicar";
  btnAplicar.addEventListener("click", () => {
    ESTADO.mes = mesEl.value || null;
    ESTADO.vendedor = vendEl ? (vendEl.value || null) : null;
    renderAbaAtiva();
  });
  box.appendChild(btnAplicar);

  const btnLimpar = document.createElement("button");
  btnLimpar.type = "button";
  btnLimpar.className = "btn-filtro btn-limpar";
  btnLimpar.textContent = "Limpar";
  btnLimpar.addEventListener("click", () => {
    mesEl.value = "";
    if (vendEl) vendEl.value = "";
    ESTADO.mes = null;
    ESTADO.vendedor = null;
    renderAbaAtiva();
  });
  box.appendChild(btnLimpar);
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
