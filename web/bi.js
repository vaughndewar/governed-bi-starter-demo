// Governed BI starter demo. Reads report.json (made-up data) and draws the page.
// Nothing is calculated here except formatting and month-to-month differences.
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var data, month;
  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function svg(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]); });
    return n;
  }
  function $(id) { return document.getElementById(id); }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  function monthName(ym, short) {
    var name = MONTH_NAMES[parseInt(ym.slice(5), 10) - 1];
    return short ? name.slice(0, 3) : name + ' ' + ym.slice(0, 4);
  }
  function moneyFull(v) { return '$' + Math.round(v).toLocaleString('en-CA'); }
  function moneyShort(v) { return v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : '$' + Math.round(v / 1000) + 'K'; }
  function pct(v) { return (v * 100).toFixed(1) + '%'; }
  function fmt(unit, v, full) { return unit === 'percent' ? pct(v) : (full ? moneyFull(v) : moneyShort(v)); }
  function prevMonth(ym) { var i = data.months.indexOf(ym); return i > 0 ? data.months[i - 1] : null; }

  function setMonthText() {
    var n = monthName(month);
    Array.prototype.forEach.call(document.querySelectorAll('.js-month'), function (s) { s.textContent = n; });
    $('status').textContent = 'Showing ' + n + '. Made-up data.';
  }

  function table(caption, head, rows, opts) {
    var t = el('table', { 'class': 'data' + (opts ? ' ' + opts : '') });
    if (caption) t.appendChild(el('caption', { text: caption }));
    var tr = el('tr');
    head.forEach(function (h) { tr.appendChild(el('th', { scope: 'col', 'class': h.num ? 'num' : '', text: h.label })); });
    t.appendChild(el('thead', {}, [tr]));
    var tb = el('tbody');
    rows.forEach(function (r) {
      var row = el('tr', r.cls ? { 'class': r.cls } : {});
      r.cells.forEach(function (c, i) {
        var isHead = i === 0;
        var cell = el(isHead ? 'th' : 'td', Object.assign({}, isHead ? { scope: 'row' } : {}, head[i].num ? { 'class': 'num' } : {}));
        if (c && c.nodeType) cell.appendChild(c); else cell.textContent = c;
        row.appendChild(cell);
      });
      tb.appendChild(row);
    });
    t.appendChild(tb);
    return t;
  }

  function renderThreeWays() {
    var w = data.three_ways[month], host = $('three-ways'), net = w.net;
    function diff(v) {
      if (Math.abs(v - net) < 0.5) return 'the governed figure';
      var d = v - net;
      return (d > 0 ? '+' : '−') + moneyFull(Math.abs(d)) + ' (' + (d > 0 ? '+' : '−') + Math.abs(d / net * 100).toFixed(1) + '%)';
    }
    var alt = {};
    data.alternatives.forEach(function (a) { alt[a.id] = a; });
    var rows = [
      { cells: [alt.booked.name, alt.booked.definition, el('span', { 'class': 'tag', text: 'Not certified' }), moneyFull(w.booked), diff(w.booked)] },
      { cells: [alt.invoiced.name, alt.invoiced.definition, el('span', { 'class': 'tag', text: 'Not certified' }), moneyFull(w.invoiced), diff(w.invoiced)] },
      { cls: 'governed', cells: ['Net revenue', data.measures[0].definition, el('span', { 'class': 'tag ok', text: '✓ Certified' }), moneyFull(w.net), diff(w.net)] }
    ];
    var head = [{ label: 'Version' }, { label: 'What it counts' }, { label: 'Status' }, { label: 'Amount', num: 1 }, { label: 'Compared with certified', num: 1 }];
    clear(host);
    host.appendChild(table('Revenue for ' + monthName(month) + ', three ways', head, rows, 'wide'));
    var spread = Math.max(w.booked, w.invoiced, w.net) - Math.min(w.booked, w.invoiced, w.net);
    $('three-note').textContent = 'In ' + monthName(month) + ' the highest and lowest answers are ' + moneyFull(spread) + ' apart. None of them is wrong; they answer different questions. The shared model picks one, names it, and says who owns it.';
  }

  function renderMeasures() {
    var host = $('measures');
    clear(host);
    data.measures.forEach(function (m) {
      var pre = el('pre', { 'class': 'sql', tabindex: '0' });
      pre.appendChild(el('code', { text: m.sql }));
      host.appendChild(el('div', { 'class': 'card measure', id: 'm-' + m.id }, [
        el('h3', {}, [m.name, el('span', { 'class': 'tag ok', text: '✓ ' + m.status })]),
        el('p', { 'class': 'owner', text: 'Owner: ' + m.owner }),
        el('p', { text: m.definition }),
        el('details', {}, [el('summary', { text: 'Show the SQL' }), pre])
      ]));
    });
  }

  function delta(m, cur, prev) {
    if (!prev) return 'First month in this demo';
    var a = data.values[m.id][cur].all, b = data.values[m.id][prev].all, name = monthName(prev, true);
    if (m.unit === 'percent') {
      var pts = (a - b) * 100;
      return (Math.abs(pts) < 0.05 ? '▬ no change' : (pts > 0 ? '▲ +' : '▼ −') + Math.abs(pts).toFixed(1) + ' pts') + ' vs ' + name;
    }
    var p = (a - b) / b * 100;
    return (Math.abs(p) < 0.05 ? '▬ no change' : (p > 0 ? '▲ +' : '▼ −') + Math.abs(p).toFixed(1) + '%') + ' vs ' + name;
  }

  function renderTiles() {
    var host = $('tiles'), prev = prevMonth(month);
    clear(host);
    data.measures.forEach(function (m) {
      host.appendChild(el('div', { 'class': 'tile' }, [
        el('b', { text: fmt(m.unit, data.values[m.id][month].all) }),
        el('span', { 'class': 'label' }, [el('a', { href: '#m-' + m.id, text: m.name })]),
        el('span', { 'class': 'delta', text: delta(m, month, prev) })
      ]));
    });
  }

  function renderChart() {
    var vals = data.months.map(function (ym) { return data.values.net_revenue[ym].all; });
    var max = Math.ceil(Math.max.apply(null, vals) / 500000) * 500000;
    var W = 720, H = 270, L = 56, R = 8, T = 28, B = 30, pw = W - L - R, ph = H - T - B;
    var bw = pw / vals.length;
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Bar chart of net revenue by month for 2025. ' + monthName(month) + ' is highlighted at ' + moneyFull(data.values.net_revenue[month].all) + '. The same figures are in the table below the chart.' });
    for (var g = 0; g <= max; g += 500000) {
      var y = T + ph - (g / max) * ph;
      s.appendChild(svg('line', { 'class': 'grid-line', x1: L, x2: W - R, y1: y, y2: y }));
      s.appendChild(svg('text', { 'class': 'axis-text', x: L - 8, y: y + 4, 'text-anchor': 'end', text: g === 0 ? '$0' : moneyShort(g) }));
    }
    vals.forEach(function (v, i) {
      var ym = data.months[i], h = (v / max) * ph, x = L + i * bw + bw * 0.18, w = bw * 0.64, y = T + ph - h, sel = ym === month;
      s.appendChild(svg('rect', { 'class': 'bar' + (sel ? ' sel' : ''), x: x, y: y, width: w, height: h }));
      s.appendChild(svg('text', { 'class': 'axis-text', x: x + w / 2, y: H - 10, 'text-anchor': 'middle', text: monthName(ym, true) }));
      if (sel) s.appendChild(svg('text', { 'class': 'val', x: x + w / 2, y: y - 7, 'text-anchor': 'middle', text: moneyShort(v) }));
    });
    var host = $('chart');
    clear(host);
    host.appendChild(s);

    var rows = data.months.map(function (ym) {
      return { cls: ym === month ? 'governed' : '', cells: [monthName(ym) + (ym === month ? ' (selected)' : ''), moneyFull(data.values.net_revenue[ym].all)] };
    });
    var mt = $('month-table');
    clear(mt);
    mt.appendChild(table('', [{ label: 'Month' }, { label: 'Net revenue', num: 1 }], rows));
  }

  function renderRegions() {
    var cols = data.measures, regions = data.regions.concat(['all']);
    var head = [{ label: 'Region' }].concat(cols.map(function (m) { return { label: m.name, num: 1 }; }));
    var rows = regions.map(function (r) {
      return {
        cls: r === 'all' ? 'total' : '',
        cells: [r === 'all' ? 'Company' : r].concat(cols.map(function (m) { return fmt(m.unit, data.values[m.id][month][r], true); }))
      };
    });
    var host = $('region-table');
    clear(host);
    host.appendChild(table('Measures by region, ' + monthName(month), head, rows, 'mid'));
    $('region-note').textContent = 'Net revenue and open orders add up across regions to the company row (see the first check below). Margin and on-time delivery are recalculated from the underlying lines, not averaged.';
  }

  function renderChecks() {
    var host = $('check-list');
    clear(host);
    data.checks.forEach(function (c) {
      host.appendChild(el('li', {}, [
        el('div', { 'class': 't' }, [c.title, el('span', { 'class': 'tag ' + (c.passed ? 'ok' : ''), text: c.passed ? '✓ Pass' : '✗ Fail' })]),
        el('p', { 'class': 'd', text: c.detail }),
        el('p', { 'class': 'o', text: 'Result: ' + c.observed })
      ]));
    });
    var rc = data.row_counts;
    $('check-note').textContent = 'Run on ' + rc.sales_lines.toLocaleString('en-CA') + ' made-up order lines, ' + rc.customers + ' customers and ' + rc.products + ' products.';
  }

  function renderMonthDependent() {
    setMonthText();
    renderThreeWays();
    renderTiles();
    renderChart();
    renderRegions();
  }

  function init() {
    var sel = $('month');
    data.months.forEach(function (ym) { sel.appendChild(el('option', { value: ym, text: monthName(ym) })); });
    month = '2025-06'; // a month where the three answers differ clearly
    if (data.months.indexOf(month) < 0) month = data.featured_month;
    sel.value = month;
    sel.addEventListener('change', function () { month = sel.value; renderMonthDependent(); });
    renderMeasures();
    renderChecks();
    renderMonthDependent();
  }

  fetch('report.json').then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function (d) { data = d; init(); }).catch(function () {
    $('status').textContent = 'The demo data could not be loaded. Please try again later.';
  });
})();
