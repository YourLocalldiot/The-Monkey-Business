// Paper-trading simulator. Deliberately uses its own localStorage-backed
// "banana-coins" balance, separate from the real profiles.coins earned by
// lessons/streaks in the rest of the app. Two reasons: (1) this is meant
// to be a zero-risk sandbox, and (2) the real coins column is locked down
// by a database trigger (see docs/supabase-sql.md) so users can't self-edit
// it — a trading game that freely adds/subtracts coins has to live outside
// that column entirely, not poke a hole in it.
(function () {
  var STORAGE_KEY = 'tmb_simulation_v1';
  var STARTING_CASH = 10000;
  var HISTORY_LIMIT = 24;

  var STOCKS = [
    { ticker: 'VNM', name: 'Vinamilk', startPrice: 640 },
    { ticker: 'FPT', name: 'FPT Corp', startPrice: 1180 },
    { ticker: 'HPG', name: 'Hoa Phat', startPrice: 275 },
    { ticker: 'MWG', name: 'Mobile World', startPrice: 620 }
  ];

  function freshState() {
    var prices = {};
    var history = {};
    STOCKS.forEach(function (s) {
      prices[s.ticker] = s.startPrice;
      history[s.ticker] = [s.startPrice];
    });
    return { day: 1, cash: STARTING_CASH, holdings: {}, prices: prices, history: history };
  }

  function isValidState(s) {
    return s && typeof s.cash === 'number' && s.prices && s.history && s.holdings &&
      STOCKS.every(function (stock) { return typeof s.prices[stock.ticker] === 'number'; });
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return freshState();
      var parsed = JSON.parse(raw);
      return isValidState(parsed) ? parsed : freshState();
    } catch (e) {
      return freshState();
    }
  }

  var state = loadState();

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function fmt(n) {
    return Math.round(n).toLocaleString('en-US');
  }

  function showMessage(text, isError) {
    var el = document.getElementById('simMessage');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    el.classList.toggle('is-error', !!isError);
  }

  function clearMessage() {
    var el = document.getElementById('simMessage');
    if (el) el.hidden = true;
  }

  // Sum of three uniforms centered on zero for a mild bell-curve feel,
  // scaled to roughly ±8% and floored so a stock can't crater to nothing.
  function randomChangePct() {
    var r = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    return r * 0.08;
  }

  function tickDay() {
    state.day += 1;
    STOCKS.forEach(function (s) {
      var pct = randomChangePct();
      var next = Math.max(1, Math.round(state.prices[s.ticker] * (1 + pct)));
      state.prices[s.ticker] = next;
      var h = state.history[s.ticker];
      h.push(next);
      if (h.length > HISTORY_LIMIT) h.shift();
    });
    clearMessage();
    saveState();
    render();
  }

  function portfolioValue() {
    var total = 0;
    Object.keys(state.holdings).forEach(function (t) {
      total += state.holdings[t].qty * state.prices[t];
    });
    return total;
  }

  function netWorth() {
    return state.cash + portfolioValue();
  }

  function buy(ticker, qty) {
    qty = Math.max(1, Math.floor(qty) || 0);
    var price = state.prices[ticker];
    var cost = price * qty;
    if (cost > state.cash) {
      return { ok: false, message: "Not enough banana-coins for " + qty + " shares of " + ticker + "." };
    }
    var h = state.holdings[ticker] || { qty: 0, avgCost: 0 };
    var newQty = h.qty + qty;
    h.avgCost = (h.avgCost * h.qty + cost) / newQty;
    h.qty = newQty;
    state.holdings[ticker] = h;
    state.cash -= cost;
    saveState();
    return { ok: true };
  }

  function sell(ticker, qty) {
    qty = Math.max(1, Math.floor(qty) || 0);
    var h = state.holdings[ticker];
    if (!h || h.qty < qty) {
      return { ok: false, message: "You don't own " + qty + " shares of " + ticker + " to sell." };
    }
    var price = state.prices[ticker];
    h.qty -= qty;
    state.cash += price * qty;
    if (h.qty === 0) delete state.holdings[ticker];
    saveState();
    return { ok: true };
  }

  function resetSim() {
    state = freshState();
    clearMessage();
    saveState();
    render();
  }

  function sparklinePoints(history, w, h) {
    if (history.length < 2) return '';
    var min = Math.min.apply(null, history);
    var max = Math.max.apply(null, history);
    var range = max - min || 1;
    return history.map(function (v, i) {
      var x = (i / (history.length - 1)) * w;
      var y = h - ((v - min) / range) * h;
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
  }

  function renderStockRow(s) {
    var price = state.prices[s.ticker];
    var hist = state.history[s.ticker];
    var prevPrice = hist.length > 1 ? hist[hist.length - 2] : price;
    var changePct = prevPrice ? ((price - prevPrice) / prevPrice) * 100 : 0;
    var up = changePct >= 0;
    var holding = state.holdings[s.ticker];

    var row = document.createElement('div');
    row.className = 'sim-row';

    row.innerHTML =
      '<div class="sim-id">' +
        '<div class="sim-name">' + s.name + ' <span class="sim-ticker">' + s.ticker + '</span></div>' +
        '<div class="sim-holding' + (holding ? '' : ' muted') + '">' +
          (holding ? 'You own ' + holding.qty + ' · avg 🍌' + fmt(holding.avgCost) : 'Not owned') +
        '</div>' +
      '</div>' +
      '<svg class="sim-spark" viewBox="0 0 70 24" preserveAspectRatio="none" aria-hidden="true">' +
        '<polyline points="' + sparklinePoints(hist, 70, 24) + '" fill="none" ' +
        'stroke="' + (up ? 'var(--good)' : 'var(--bad)') + '" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>' +
      '<div class="sim-price-block">' +
        '<div class="tnum sim-price-num">🍌' + fmt(price) + '</div>' +
        '<div class="sim-change ' + (up ? 'up' : 'down') + '">' + (up ? '+' : '') + changePct.toFixed(1) + '%</div>' +
      '</div>' +
      '<div class="sim-trade">' +
        '<input type="number" class="sim-qty" min="1" step="1" value="1" aria-label="Shares of ' + s.ticker + '">' +
        '<button type="button" class="sim-btn buy">Buy</button>' +
        '<button type="button" class="sim-btn sell"' + (!holding ? ' disabled' : '') + '>Sell</button>' +
      '</div>';

    var qtyInput = row.querySelector('.sim-qty');

    row.querySelector('.buy').addEventListener('click', function () {
      var res = buy(s.ticker, parseInt(qtyInput.value, 10));
      if (!res.ok) { showMessage(res.message, true); return; }
      clearMessage();
      render();
    });

    row.querySelector('.sell').addEventListener('click', function () {
      var res = sell(s.ticker, parseInt(qtyInput.value, 10));
      if (!res.ok) { showMessage(res.message, true); return; }
      clearMessage();
      render();
    });

    return row;
  }

  function render() {
    document.getElementById('simDay').textContent = state.day;
    document.getElementById('simCash').textContent = fmt(state.cash);

    var nw = netWorth();
    document.getElementById('simNetWorth').textContent = '🍌' + fmt(nw);

    var pnl = nw - STARTING_CASH;
    var pnlPct = (pnl / STARTING_CASH) * 100;
    var sign = pnl >= 0 ? '+' : '';
    var pnlEl = document.getElementById('simPnl');
    pnlEl.textContent = sign + fmt(pnl) + ' (' + sign + pnlPct.toFixed(1) + '%)';

    var pnlChip = document.getElementById('simPnlChip');
    pnlChip.classList.toggle('up', pnl >= 0);
    pnlChip.classList.toggle('down', pnl < 0);

    var listEl = document.getElementById('stockList');
    listEl.innerHTML = '';
    STOCKS.forEach(function (s) {
      listEl.appendChild(renderStockRow(s));
    });

    var holdingsEl = document.getElementById('holdingsList');
    var tickers = Object.keys(state.holdings);
    if (tickers.length === 0) {
      holdingsEl.innerHTML = '<p class="goal-caption">No positions yet — buy a stock to get started.</p>';
    } else {
      holdingsEl.innerHTML = tickers.map(function (t) {
        var h = state.holdings[t];
        var price = state.prices[t];
        var value = h.qty * price;
        var cost = h.qty * h.avgCost;
        var pnlH = value - cost;
        var pnlPctH = cost ? (pnlH / cost) * 100 : 0;
        var upH = pnlH >= 0;
        var signH = upH ? '+' : '';
        return (
          '<div class="story-row"><div style="flex:1;">' +
            '<div class="story-title">' + t + ' · ' + h.qty + ' sh</div>' +
            '<div class="story-meta">Value 🍌' + fmt(value) + ' · ' +
              '<span class="' + (upH ? 'up' : 'down') + '">' + signH + fmt(pnlH) + ' (' + signH + pnlPctH.toFixed(1) + '%)</span>' +
            '</div>' +
          '</div></div>'
        );
      }).join('');
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('nextDayBtn').addEventListener('click', tickDay);
    document.getElementById('resetBtn').addEventListener('click', resetSim);
    render();
  });
})();
