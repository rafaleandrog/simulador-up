// ========== CONFIGURAÇÕES ==========
const CONFIG = {
  API_URL: './api.php',
  JUROS_MENSAL: 0.948879293458305 / 100,

  // Lote grande — Regularização Padrão
  LIMIAR_LOTE_GRANDE: 600,
  DESCONTO_LOTE_GRANDE: 0.30,

  // Lote grande — Campanha X
  LIMIAR_CAMPANHA: 500,
  DESCONTO_CAMPANHA: 0.40
};

const DESCONTO_POR_FORMA = {
  vista: 15,
  '6x':  10,
  '12x':  5,
  mais:   0,
  '':     0
};

// ========== FORMATAÇÃO ==========
function parseBR(str) {
  if (str === null || str === undefined || str === '') return null;
  let s = str.toString().trim()
    .replace(/R\$/g, '')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && !isNaN(n) ? n : null;
}

function fmtBRL(n) {
  return 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNumber(n) {
  return (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ========== ELEMENTOS DOM ==========
const DOM = {
  loading:          document.getElementById('loadingEl'),
  error:            document.getElementById('errorEl'),
  content:          document.getElementById('content'),
  tipoSimulacao:    document.getElementById('tipoSimulacao'),
  formaPagamento:   document.getElementById('formaPagamento'),
  area:             document.getElementById('area'),
  preco:            document.getElementById('preco'),
  prazo:            document.getElementById('prazo'),
  sinal:            document.getElementById('sinal'),
  carencia:         document.getElementById('carencia'),
  desconto:         document.getElementById('desconto'),
  jic:              document.getElementById('jic'),
  dataContratacao:  document.getElementById('dataContratacao'),
  loteGrandeInfo:   document.getElementById('loteGrandeInfo'),
  valorLote:        document.getElementById('valorLote'),
  novoSaldo:        document.getElementById('novoSaldo'),
  percentualSinal:  document.getElementById('percentualSinal'),
  descontoInfo:     document.getElementById('descontoInfo'),
  btnCalc:          document.getElementById('calcular'),
  disclaimer:       document.getElementById('disclaimer'),
  fluxo:            document.getElementById('fluxoParcelas'),
  tabelaFluxo:      document.getElementById('tabelaFluxo'),
  btnFluxoCompleto: document.getElementById('btnFluxoCompleto'),
  btnFluxoResumido: document.getElementById('btnFluxoResumido')
};

// ========== ESTADO ==========
const state = {
  tipoSimulacao: 'padrao',  // 'padrao' | 'campanha'
  formaPagamento: '',
  area:    0,
  preco:   0,
  prazo:   0,
  sinal:   0,
  carencia: 0,   // meses de carência (editável em tela)
  jic:     0,    // 1 = carência total (capitaliza juros) | 0 = paga só juros
  dataContratacao: '',
  desconto: 0,   // % de desconto — determinado pela forma de pagamento

  // Resultado do cálculo
  parcelasPRICE: [],
  parcelasSAC:   [],
  mesesCarencia: []
};

// ========== CARREGAMENTO ==========
async function carregarDados() {
  const urlParams = new URLSearchParams(window.location.search);
  const simId = urlParams.get('sim');

  if (simId) {
    DOM.loading.style.display = 'flex';
    try {
      const response = await fetch(`${CONFIG.API_URL}?id=${simId}`);
      if (!response.ok) throw new Error('Simulação não encontrada');
      const dados = await response.json();
      if (dados.error) throw new Error(dados.error);
      preencherDados(dados, true);
      DOM.loading.style.display = 'none';
    } catch (error) {
      mostrarErro('Erro ao carregar simulação: ' + error.message);
    }
  } else if (urlParams.has('area') || urlParams.has('preco')) {
    const dados = {
      area:     parseBR(urlParams.get('area')),
      preco:    parseBR(urlParams.get('preco')),
      prazo:    parseBR(urlParams.get('prazo')),
      sinal:    parseBR(urlParams.get('sinal')),
      carencia: parseBR(urlParams.get('carencia')),
      jic:      parseBR(urlParams.get('jic')),
      desconto: parseBR(urlParams.get('desconto'))
    };
    preencherDados(dados, true);
  }

  configurarEventListeners();
  atualizarValorLote();
  calcularPercentualSinal();
}

/**
 * Preenche os campos com dados recebidos (URL ou API).
 * Se bloquear=true, deixa os campos read-only / disabled.
 */
function preencherDados(dados, bloquear) {
  if (dados.area != null) {
    state.area = dados.area;
    DOM.area.value = fmtNumber(dados.area);
    if (bloquear) DOM.area.readOnly = true;
  }
  if (dados.preco != null) {
    state.preco = dados.preco;
    DOM.preco.value = fmtNumber(dados.preco);
    if (bloquear) DOM.preco.readOnly = true;
  }
  if (dados.prazo != null) {
    state.prazo = Math.trunc(dados.prazo);
    DOM.prazo.value = String(state.prazo);
    if (bloquear) DOM.prazo.readOnly = true;
  }
  if (dados.sinal != null) {
    state.sinal = dados.sinal;
    DOM.sinal.value = fmtNumber(dados.sinal);
    if (bloquear) DOM.sinal.readOnly = true;
  }

  // Carência
  if (dados.carencia != null) {
    state.carencia = Math.trunc(dados.carencia);
    DOM.carencia.value = String(state.carencia);
    if (bloquear) DOM.carencia.readOnly = true;
  }

  // JIC — 1 = carência total, 0 = só juros
  if (dados.jic != null) {
    state.jic = dados.jic === 1 ? 1 : 0;
    DOM.jic.checked = state.jic === 1;
    if (bloquear) DOM.jic.disabled = true;
  }

  if (dados.dataContratacao != null) {
    state.dataContratacao = dados.dataContratacao;
    DOM.dataContratacao.value = dados.dataContratacao;
    if (bloquear) DOM.dataContratacao.readOnly = true;
  }

  // Desconto sobre saldo (display-only, driven by formaPagamento)
  if (dados.desconto != null) {
    state.desconto = dados.desconto;
    DOM.desconto.textContent = fmtNumber(dados.desconto) + '%';
  }
}

function mostrarErro(mensagem) {
  DOM.loading.style.display = 'none';
  DOM.error.textContent = mensagem;
  DOM.error.style.display = 'block';
}

// ========== EVENT LISTENERS ==========
function bindInput(el, stateKey, transform) {
  el.addEventListener('input', () => {
    const val = parseBR(el.value);
    if (val !== null) state[stateKey] = transform ? transform(val) : val;
    onInputChange();
  });
  el.addEventListener('blur', () => {
    const val = parseBR(el.value);
    state[stateKey] = val != null ? (transform ? transform(val) : val) : 0;
    el.value = val != null ? fmtNumber(val) : '';
    onInputChange();
  });
}

function atualizarDesconto() {
  const perc = DESCONTO_POR_FORMA[state.formaPagamento] ?? 0;
  state.desconto = perc;
  DOM.desconto.textContent = fmtNumber(perc) + '%';
}

function configurarEventListeners() {
  DOM.tipoSimulacao.addEventListener('change', () => {
    state.tipoSimulacao = DOM.tipoSimulacao.value;
    atualizarValorLote();
    calcularPercentualSinal();
  });

  DOM.formaPagamento.addEventListener('change', () => {
    state.formaPagamento = DOM.formaPagamento.value;
    atualizarDesconto();
  });

  DOM.area.addEventListener('input', () => {
    const val = parseBR(DOM.area.value);
    if (val !== null) state.area = val;
    atualizarValorLote();
    calcularPercentualSinal();
  });
  DOM.area.addEventListener('blur', () => {
    const val = parseBR(DOM.area.value);
    state.area = val || 0;
    DOM.area.value = val ? fmtNumber(val) : '';
    atualizarValorLote();
    calcularPercentualSinal();
  });

  DOM.preco.addEventListener('input', () => {
    const val = parseBR(DOM.preco.value);
    if (val !== null) state.preco = val;
    atualizarValorLote();
    calcularPercentualSinal();
  });
  DOM.preco.addEventListener('blur', () => {
    const val = parseBR(DOM.preco.value);
    state.preco = val || 0;
    DOM.preco.value = val ? fmtNumber(val) : '';
    atualizarValorLote();
    calcularPercentualSinal();
  });

  DOM.prazo.addEventListener('input', () => {
    const val = parseBR(DOM.prazo.value);
    if (val !== null) state.prazo = Math.trunc(val);
  });
  DOM.prazo.addEventListener('blur', () => {
    const val = parseBR(DOM.prazo.value);
    state.prazo = val ? Math.trunc(val) : 0;
    DOM.prazo.value = state.prazo ? String(state.prazo) : '';
  });

  DOM.carencia.addEventListener('input', () => {
    const val = parseBR(DOM.carencia.value);
    if (val !== null) state.carencia = Math.trunc(val);
  });
  DOM.carencia.addEventListener('blur', () => {
    const val = parseBR(DOM.carencia.value);
    state.carencia = val ? Math.trunc(val) : 0;
    DOM.carencia.value = state.carencia ? String(state.carencia) : '';
  });

  DOM.jic.addEventListener('change', () => {
    state.jic = DOM.jic.checked ? 1 : 0;
  });

  DOM.dataContratacao.addEventListener('input', (e) => {
    let raw = e.target.value.replace(/\D/g, '');
    if (raw.length > 6) raw = raw.slice(0, 6);
    const formatted = raw.length > 2 ? raw.slice(0, 2) + '/' + raw.slice(2) : raw;
    e.target.value = formatted;
    state.dataContratacao = formatted;
  });
  DOM.dataContratacao.addEventListener('blur', () => {
    state.dataContratacao = DOM.dataContratacao.value.trim();
  });

  DOM.sinal.addEventListener('input', () => {
    const val = parseBR(DOM.sinal.value);
    if (val !== null) state.sinal = val;
    calcularPercentualSinal();
  });
  DOM.sinal.addEventListener('blur', () => {
    const val = parseBR(DOM.sinal.value);
    state.sinal = val || 0;
    DOM.sinal.value = val ? fmtNumber(val) : '';
    calcularPercentualSinal();
  });

  DOM.btnCalc.addEventListener('click', calcularFinanciamento);
  DOM.btnFluxoCompleto.addEventListener('click', () => renderizarFluxo(true));
  DOM.btnFluxoResumido.addEventListener('click', () => renderizarFluxo(false));
}

function onInputChange() {
  atualizarValorLote();
  calcularPercentualSinal();
}

// ========== CÁLCULO DO VALOR DO LOTE ==========
function limiarAtual()  { return state.tipoSimulacao === 'campanha' ? CONFIG.LIMIAR_CAMPANHA  : CONFIG.LIMIAR_LOTE_GRANDE; }
function descontoLGAtual() { return state.tipoSimulacao === 'campanha' ? CONFIG.DESCONTO_CAMPANHA : CONFIG.DESCONTO_LOTE_GRANDE; }

function calcularValorLote() {
  const { area, preco } = state;
  const limiar = limiarAtual();
  const descLG = descontoLGAtual();

  let val;
  if (area > limiar) {
    val = limiar * preco + (area - limiar) * preco * (1 - descLG);
  } else {
    val = area * preco;
  }
  return Math.max(0, val);
}

function atualizarValorLote() {
  const val    = calcularValorLote();
  const limiar = limiarAtual();
  const pct    = Math.round(descontoLGAtual() * 100);
  DOM.valorLote.textContent = fmtBRL(val);

  if (state.area > limiar) {
    DOM.loteGrandeInfo.textContent =
      `⬆ Lote acima de ${limiar} m² — área excedente com ${pct}% de desconto por metro quadrado`;
    DOM.loteGrandeInfo.style.display = 'block';
  } else {
    DOM.loteGrandeInfo.style.display = 'none';
  }
}

function calcularPercentualSinal() {
  const valorLote = calcularValorLote();
  const perc = valorLote > 0 ? (state.sinal / valorLote) * 100 : 0;
  DOM.percentualSinal.textContent = `(${fmtNumber(perc)}%)`;
}

function calcularSaldoFinanciadoExibicao(saldoBase) {
  if (state.jic === 1 && state.carencia > 0) {
    return saldoBase * Math.pow(1 + CONFIG.JUROS_MENSAL, state.carencia);
  }
  return saldoBase;
}

// ========== CÁLCULO DO FINANCIAMENTO ==========
/**
 * Fluxo com carência:
 *
 * JIC = 0 (carência parcial — pagamento de juros):
 *   Durante os meses de carência, o cliente paga apenas os juros sobre o saldo devedor.
 *   O saldo não se altera; a amortização começa após a carência.
 *   parcelaCarencia = saldo × taxa_mensal  (igual para PRICE e SAC)
 *
 * JIC = 1 (carência total — capitalização):
 *   Durante os meses de carência, nenhum pagamento é feito.
 *   Os juros são incorporados ao saldo: saldo = saldo × (1 + taxa)^n_carencia
 *   O saldo maior é então base para o cálculo das parcelas de PRICE e SAC.
 *   parcelaCarencia = 0
 */
function calcularFinanciamento() {
  // ---- Validação de campos obrigatórios ----
  let valido = true;
  [['area', DOM.area], ['preco', DOM.preco], ['prazo', DOM.prazo]].forEach(([k, el]) => {
    if (!state[k]) { el.classList.add('input-error'); valido = false; }
    else el.classList.remove('input-error');
  });
  if (!valido) return;
  if (!/^\d{2}\/\d{4}$/.test(state.dataContratacao)) {
    DOM.dataContratacao.classList.add('input-error');
    valido = false;
  } else {
    DOM.dataContratacao.classList.remove('input-error');
  }
  if (!valido) return;

  const valorLote   = calcularValorLote();
  const saldoInicial = Math.max(0, valorLote - state.sinal);

  // Aplica desconto percentual sobre o saldo (após entrada)
  const novoSaldo = saldoInicial * (1 - state.desconto / 100);
  const valorDescontoAplicado  = saldoInicial - novoSaldo;
  const percentualDescontoReal = saldoInicial > 0
    ? (valorDescontoAplicado / saldoInicial) * 100 : 0;

  if (Math.abs(valorDescontoAplicado) > 0.01) {
    DOM.descontoInfo.style.display = 'block';
    DOM.descontoInfo.innerHTML =
      `✔ Desconto aplicado: <strong>${fmtBRL(valorDescontoAplicado)}</strong> ` +
      `(${fmtNumber(percentualDescontoReal)}% do saldo)`;
  } else {
    DOM.descontoInfo.style.display = 'none';
  }

  state.parcelasPRICE = [];
  state.parcelasSAC   = [];
  state.mesesCarencia = [];

  if (state.prazo <= 0 || novoSaldo <= 0) {
    DOM.novoSaldo.textContent = fmtBRL(novoSaldo);
    return;
  }

  const taxa       = CONFIG.JUROS_MENSAL;
  const carencia = state.jic === 1
    ? state.carencia
    : Math.min(state.carencia, state.prazo - 1);
  let saldoCalculo = novoSaldo;

  // ---- Período de carência ----
  if (carencia > 0) {
    if (state.jic === 1) {
      // Carência TOTAL: sem pagamento, juros capitalizam
      for (let m = 1; m <= carencia; m++) {
        state.mesesCarencia.push(m);
        state.parcelasPRICE.push(0);
        state.parcelasSAC.push(0);
        saldoCalculo *= (1 + taxa);
      }
      // Arredonda para evitar ruído de ponto flutuante
      saldoCalculo = Math.round(saldoCalculo * 100) / 100;
      DOM.novoSaldo.textContent = fmtBRL(saldoCalculo);
    } else {
      // Carência PARCIAL: paga só juros, saldo não muda
      for (let m = 1; m <= carencia; m++) {
        state.mesesCarencia.push(m);
        const jurosCarencia = saldoCalculo * taxa;
        state.parcelasPRICE.push(jurosCarencia);
        state.parcelasSAC.push(jurosCarencia);
      }
      DOM.novoSaldo.textContent = fmtBRL(saldoCalculo);
    }
  } else {
    DOM.novoSaldo.textContent = fmtBRL(novoSaldo);
  }

  // ---- Período de amortização ----
  // JIC=1 (carência total): prazo total = prazo + carência, amortização = prazo completo
  // JIC=0 (só juros): amortização = prazo - carência (como antes)
  const mesesPagamento = (state.jic === 1 && carencia > 0) ? state.prazo : state.prazo - carencia;

  // PRICE: parcela constante
  const parcelaPrice = saldoCalculo * taxa /
    (1 - Math.pow(1 + taxa, -mesesPagamento));

  for (let m = 1; m <= mesesPagamento; m++) {
    state.parcelasPRICE.push(parcelaPrice);
  }

  // SAC: amortização constante, juros decrescentes
  const amortizacaoFixa = saldoCalculo / mesesPagamento;
  let saldoAtualSAC = saldoCalculo;

  for (let m = 1; m <= mesesPagamento; m++) {
    const juros = saldoAtualSAC * taxa;
    state.parcelasSAC.push(amortizacaoFixa + juros);
    saldoAtualSAC -= amortizacaoFixa;
  }

  renderizarFluxo(true);
  DOM.disclaimer.style.display = 'block';

  // Mostra botão de relatório
  document.getElementById('btnRelatorio').style.display = 'block';
}

// ========== RENDERIZAÇÃO DO FLUXO ==========
function mesAnoParaParcela(index) {
  const s = state.dataContratacao;
  if (!s || !/^\d{2}\/\d{4}$/.test(s)) return '';
  const [mmStr, aaaaStr] = s.split('/');
  const base = (parseInt(aaaaStr, 10) - 1) * 12 + parseInt(mmStr, 10);
  const total = base + index;
  const mes = ((total - 1) % 12) + 1;
  const ano = Math.floor((total - 1) / 12) + 1;
  return String(mes).padStart(2, '0') + '/' + ano;
}

function renderizarFluxo(completo) {
  const totalMeses = state.parcelasPRICE.length;
  if (totalMeses === 0) return;

  const showDate = /^\d{2}\/\d{4}$/.test(state.dataContratacao);
  let rows = '';

  if (completo) {
    for (let m = 1; m <= totalMeses; m++) {
      const isCarencia = state.mesesCarencia.includes(m);
      const cls = isCarencia ? ' class="carencia-row"' : '';
      rows += `<tr${cls}>
        <td>${m}${isCarencia ? ' <em>(carência)</em>' : ''}</td>
        ${showDate ? `<td>${mesAnoParaParcela(m)}</td>` : ''}
        <td>${fmtNumber(state.parcelasPRICE[m - 1])}</td>
        <td>${fmtNumber(state.parcelasSAC[m - 1])}</td>
      </tr>`;
    }
  } else {
    let primeiroMes = 1;
    if (state.jic === 1 && state.carencia > 0) {
      primeiroMes = state.carencia + 1;
    }
    const isCarenciaPrimeiro = state.mesesCarencia.includes(primeiroMes);
    const cls = isCarenciaPrimeiro ? ' class="carencia-row"' : '';
    rows += `<tr${cls}>
      <td>${primeiroMes}${isCarenciaPrimeiro ? ' <em>(carência)</em>' : ''}</td>
      ${showDate ? `<td>${mesAnoParaParcela(primeiroMes)}</td>` : ''}
      <td>${fmtNumber(state.parcelasPRICE[primeiroMes - 1])}</td>
      <td>${fmtNumber(state.parcelasSAC[primeiroMes - 1])}</td>
    </tr>`;
    if (totalMeses > primeiroMes) {
      rows += `<tr>
        <td>${totalMeses}</td>
        ${showDate ? `<td>${mesAnoParaParcela(totalMeses)}</td>` : ''}
        <td>${fmtNumber(state.parcelasPRICE[totalMeses - 1])}</td>
        <td>${fmtNumber(state.parcelasSAC[totalMeses - 1])}</td>
      </tr>`;
    }
  }

  const totalPRICE = state.parcelasPRICE.reduce((s, p) => s + p, 0);
  const totalSAC   = state.parcelasSAC.reduce((s, p) => s + p, 0);

  rows += `<tr class="total-row">
    <td>TOTAL</td>
    ${showDate ? '<td></td>' : ''}
    <td>${fmtNumber(totalPRICE)}</td>
    <td>${fmtNumber(totalSAC)}</td>
  </tr>`;

  DOM.tabelaFluxo.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Mês</th>
          ${showDate ? '<th>Mês/Ano</th>' : ''}
          <th>Parcela PRICE</th>
          <th>Parcela SAC</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  DOM.fluxo.style.display = 'block';
}

// ========== INICIALIZAÇÃO ==========
carregarDados();

// ========== RELATÓRIO PDF ==========
function abrirModalRelatorio() {
  document.getElementById('modalRelatorio').classList.add('open');
  document.getElementById('inputMorador').focus();
}

function fecharModalRelatorio() {
  document.getElementById('modalRelatorio').classList.remove('open');
}

// Fecha modal ao clicar fora
document.getElementById('modalRelatorio').addEventListener('click', function(e) {
  if (e.target === this) fecharModalRelatorio();
});

function gerarRelatorio() {
  const morador  = document.getElementById('inputMorador').value.trim();
  const endereco = document.getElementById('inputEndereco').value.trim();

  if (!morador) {
    document.getElementById('inputMorador').focus();
    return;
  }

  fecharModalRelatorio();

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const W      = 210;
  const margin = 18;
  const inner  = W - margin * 2;
  let   y      = 0;

  // ---- Paleta UP ----
  const COR_TOPO    = [55,  72,  84];   // #374854 cinza escuro UP
  const COR_ACENTO  = [242, 101,  34];  // #F26522 laranja UP
  const COR_CINZA   = [84, 98, 112];    // #546270 cinza texto UP
  const COR_LINHA   = [220, 228, 232];
  const COR_CABECALHO_TBL = [237, 250, 250]; // teal-bg
  const COR_TOTAL   = [237, 250, 250];  // teal-bg
  const COR_CARENCIA= [255, 251, 235];  // amber-50
  const COR_VERDE   = [61,  189, 181];  // #3DBDB5 teal UP

  // ---- Helpers ----
  function setFont(size, style, color) {
    doc.setFontSize(size);
    doc.setFont('helvetica', style || 'normal');
    doc.setTextColor(...(color || COR_TOPO));
  }
  function linha(yPos) {
    doc.setDrawColor(...COR_LINHA);
    doc.setLineWidth(0.3);
    doc.line(margin, yPos, W - margin, yPos);
  }
  function retangulo(x, yPos, w, h, cor) {
    doc.setFillColor(...cor);
    doc.rect(x, yPos, w, h, 'F');
  }

  // ---- CABEÇALHO ----
  retangulo(0, 0, W, 32, COR_TOPO);
  setFont(18, 'bold', [255, 255, 255]);
  doc.text('Simulação de Financiamento', margin, 14);
  setFont(9, 'normal', [148, 163, 184]);
  doc.text('Documento gerado automaticamente — valores sujeitos a confirmação contratual', margin, 21);

  // Data no canto direito
  const hoje = new Date();
  const dataFormatada = hoje.toLocaleDateString('pt-BR');
  setFont(9, 'normal', [148, 163, 184]);
  doc.text(dataFormatada, W - margin, 21, { align: 'right' });
  y = 40;

  // ---- IDENTIFICAÇÃO ----
  setFont(7, 'bold', COR_ACENTO);
  doc.text('IDENTIFICAÇÃO', margin, y);
  y += 4;
  linha(y); y += 5;

  function campoInfo(label, valor, yPos) {
    setFont(8, 'normal', COR_CINZA);
    doc.text(label, margin, yPos);
    setFont(10, 'bold', COR_TOPO);
    doc.text(valor || '—', margin, yPos + 5);
    return yPos + 13;
  }

  y = campoInfo('Morador', morador, y);
  y = campoInfo('Endereço', endereco, y);
  y += 2;

  // ---- RESUMO DO LOTE ----
  setFont(7, 'bold', COR_ACENTO);
  doc.text('DADOS DO LOTE', margin, y);
  y += 4;
  linha(y); y += 5;

  const valorLote    = calcularValorLote();
  const saldoInicial = Math.max(0, valorLote - state.sinal);
  const novoSaldo    = saldoInicial * (1 - state.desconto / 100);
  const saldoFinanciadoExibicao = calcularSaldoFinanciadoExibicao(novoSaldo);
  const valorDesc    = saldoInicial - novoSaldo;
  const percSinal    = valorLote > 0 ? (state.sinal / valorLote * 100) : 0;

  // Saldo capitalizado (JIC=1): novoSaldo × (1+taxa)^carência
  const carenciaCalcPDF = state.jic === 1 ? state.carencia : Math.min(state.carencia, state.prazo - 1);
  const saldoFinanciadoPDF = (state.jic === 1 && carenciaCalcPDF > 0)
    ? Math.round(novoSaldo * Math.pow(1 + CONFIG.JUROS_MENSAL, carenciaCalcPDF) * 100) / 100
    : novoSaldo;

  // Grid de 3 colunas
  function colX(col) { return margin + col * (inner / 3); }

  function celula(label, valor, col, yPos, destaque) {
    const x = colX(col);
    setFont(7.5, 'normal', COR_CINZA);
    doc.text(label, x, yPos);
    setFont(10, 'bold', destaque ? COR_ACENTO : COR_TOPO);
    doc.text(valor, x, yPos + 5);
  }

  celula('Área', fmtNumber(state.area) + ' m²',   0, y);
  celula('Preço/m²', 'R$ ' + fmtNumber(state.preco), 1, y);
  celula('Valor do Lote', 'R$ ' + fmtNumber(valorLote), 2, y, true);
  y += 14;

  celula('Sinal', 'R$ ' + fmtNumber(state.sinal) + ' (' + fmtNumber(percSinal) + '%)', 0, y);

  if (Math.abs(valorDesc) > 0.01) {
    celula('Desconto', fmtNumber(state.desconto) + '% = R$ ' + fmtNumber(valorDesc), 1, y);
  } else {
    celula('Desconto', 'Nenhum', 1, y);
  }

  celula('Saldo Financiado', 'R$ ' + fmtNumber(saldoFinanciadoPDF), 2, y, true);
  y += 16;

  // ---- CONDIÇÕES ----
  setFont(7, 'bold', COR_ACENTO);
  doc.text('CONDIÇÕES DO FINANCIAMENTO', margin, y);
  y += 4;
  linha(y); y += 5;

  const carenciaLabel = state.carencia > 0
    ? state.carencia + ' mes' + (state.carencia > 1 ? 'es' : '') +
      ' (' + (state.jic === 1 ? 'carência total' : 'pagamento de juros') + ')'
    : 'Sem carência';

  const carenciaCalc = state.jic === 1
    ? state.carencia
    : Math.min(state.carencia, state.prazo - 1);
  const mesesAmort = (state.jic === 1 && carenciaCalc > 0) ? state.prazo : state.prazo - carenciaCalc;
  const prazoTotal = (state.jic === 1 && carenciaCalc > 0) ? state.prazo + carenciaCalc : state.prazo;

  const formaLabel = { vista: 'À Vista', '6x': 'Até 6x', '12x': 'Até 12x', mais: 'Mais Parcelas', '': '—' };
  const tipoLabel  = state.tipoSimulacao === 'campanha' ? 'Campanha X' : 'Regularização Padrão';

  celula('Prazo Total', prazoTotal + ' meses', 0, y);
  celula('Carência', carenciaLabel, 1, y);
  celula('Amortização', mesesAmort + ' meses', 2, y);
  y += 14;

  celula('Tipo de Simulação', tipoLabel, 0, y);
  celula('Forma de Pagamento', formaLabel[state.formaPagamento] || '—', 1, y);
  if (state.dataContratacao) celula('Data de Contratação', state.dataContratacao, 2, y);
  y += 16;

  // ---- TABELA PARCELAS ----
  if (state.parcelasPRICE.length > 0) {
    setFont(7, 'bold', COR_ACENTO);
    doc.text('FLUXO DE PAGAMENTO (COMPLETO)', margin, y);
    y += 4;
    linha(y); y += 3;

    const showDatePDF = /^\d{2}\/\d{4}$/.test(state.dataContratacao);
    const colW = showDatePDF
      ? [15, 22, (inner - 37) / 2, (inner - 37) / 2]
      : [22, (inner - 22) / 2, (inner - 22) / 2];
    const cols = showDatePDF
      ? [margin, margin + 15, margin + 37, margin + 37 + colW[2]]
      : [margin, margin + colW[0], margin + colW[0] + colW[1]];

    function tabelaHeader(yPos) {
      retangulo(margin, yPos, inner, 7, COR_TOPO);
      setFont(8, 'bold', [255, 255, 255]);
      doc.text('Mês', cols[0] + 1, yPos + 5);
      if (showDatePDF) {
        doc.text('Mês/Ano', cols[1] + colW[1] / 2, yPos + 5, { align: 'center' });
        doc.text('PRICE (R$)', cols[2] + colW[2] / 2, yPos + 5, { align: 'center' });
        doc.text('SAC (R$)',   cols[3] + colW[3] / 2, yPos + 5, { align: 'center' });
      } else {
        doc.text('PRICE (R$)', cols[1] + colW[1] / 2, yPos + 5, { align: 'center' });
        doc.text('SAC (R$)',   cols[2] + colW[2] / 2, yPos + 5, { align: 'center' });
      }
      return yPos + 7;
    }

    function tabelaLinha(yPos, mes, price, sac, tipo, mesAno) {
      const bg = tipo === 'total'    ? COR_TOTAL
               : tipo === 'carencia' ? COR_CARENCIA
               : (mes % 2 === 0 ? [248, 250, 252] : [255, 255, 255]);
      retangulo(margin, yPos, inner, 7, bg);

      const cor = tipo === 'total' ? COR_ACENTO : COR_TOPO;
      const estilo = tipo === 'total' ? 'bold' : 'normal';

      setFont(8.5, estilo, cor);
      doc.text(String(mes), cols[0] + 1, yPos + 5);
      if (showDatePDF) {
        doc.text(mesAno || '', cols[1] + colW[1] / 2, yPos + 5, { align: 'center' });
        doc.text(fmtNumber(price), cols[2] + colW[2] - 1, yPos + 5, { align: 'right' });
        doc.text(fmtNumber(sac),   cols[3] + colW[3] - 1, yPos + 5, { align: 'right' });
      } else {
        doc.text(fmtNumber(price), cols[1] + colW[1] - 1, yPos + 5, { align: 'right' });
        doc.text(fmtNumber(sac),   cols[2] + colW[2] - 1, yPos + 5, { align: 'right' });
      }
      return yPos + 7;
    }

    y = tabelaHeader(y);

    const total = state.parcelasPRICE.length;

    for (let m = 1; m <= total; m++) {
      // Nova página se necessário (deixa 20mm de margem inferior)
      if (y > 267) {
        doc.addPage();
        y = 20;
        y = tabelaHeader(y);
      }

      const tipo = state.mesesCarencia.includes(m) ? 'carencia' : 'normal';
      y = tabelaLinha(y, m,
        state.parcelasPRICE[m - 1],
        state.parcelasSAC[m - 1],
        tipo,
        showDatePDF ? mesAnoParaParcela(m) : '');
    }

    // Nova página se linha de total não couber
    if (y > 267) { doc.addPage(); y = 20; }

    const totalPRICE = state.parcelasPRICE.reduce((s, p) => s + p, 0);
    const totalSAC   = state.parcelasSAC.reduce((s, p) => s + p, 0);
    y = tabelaLinha(y, 'TOTAL', totalPRICE, totalSAC, 'total', '');
    y += 6;
  }

  // ---- OBSERVAÇÕES ----
  if (y > 230) { doc.addPage(); y = 20; }

  setFont(7, 'bold', COR_ACENTO);
  doc.text('OBSERVAÇÕES IMPORTANTES', margin, y);
  y += 4;
  linha(y); y += 4;

  const obs = [
    'Os valores apresentados acima não representam garantias ou propostas por parte da UP, não sendo oponíveis, em nenhuma hipótese.',
    'Os pagamentos devidos à UP serão determinados na forma regulada em seu contrato e/ou escritura, ainda que haja divergências em relação ao cálculo simulado nesta página.',
    'Os financiamentos pelo(a) UP não incorporam ITBI e custos cartoriais, que devem estar quitadas pelo morador no ato da escritura.',
    'Imóvel será alienado fiduciariamente em favor do credor até a quitação, como garantia.',
    'Não deixe de considerar a opção de pagamento à vista, em que você não precisa pagar pelo registro da alienação fiduciária do imóvel nem pela baixa da alienação no final do financiamento, além do seu lote não ficar bloqueado durante o financiamento.',
    'As parcelas do financiamento apresentadas já contemplam os juros de 12% a.a. + correção monetária, calculada com base no IPCA ou IGPM, no ato do vencimento.'
  ];

  obs.forEach(o => {
    setFont(7.5, 'normal', COR_CINZA);
    doc.text('• ' + o, margin + 2, y, { maxWidth: inner - 4 });
    y += 6;
  });

  // ---- RODAPÉ ----
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    retangulo(0, 287, W, 10, [248, 250, 252]);
    doc.setDrawColor(...COR_LINHA);
    doc.setLineWidth(0.3);
    doc.line(0, 287, W, 287);
    setFont(7, 'normal', COR_CINZA);
    doc.text('Simulador de Financiamento UP', margin, 293);
    doc.text(`Página ${i} de ${totalPages}`, W - margin, 293, { align: 'right' });
  }

  // ---- NOME DO ARQUIVO ----
  const dd   = String(hoje.getDate()).padStart(2, '0');
  const mm   = String(hoje.getMonth() + 1).padStart(2, '0');
  const aaaa = hoje.getFullYear();
  const nomeArquivo = `Simulação - ${morador} - ${dd}.${mm}.${aaaa}.pdf`;

  doc.save(nomeArquivo);
}
