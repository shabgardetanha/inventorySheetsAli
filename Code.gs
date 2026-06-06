/**
 * ERP FINANCIAL ENGINE & DAILY AUDIT - PRODUCTION READY (Version 6.0)
 * Role: Senior Financial Architect
 * Focus: Perpetual WAC, Daily KPI Dashboards, Financial Reconciliation, Hard-stops.
 */

const CONFIG = {
  VERSION: "Production-Final-6.0",
  TOLERANCE: 1e-8,
  ROUND_QTY: 4,
  ROUND_MONEY: 2,
  MAX_BOM_DEPTH: 50,
  SHEETS: {
    ITEMS: 'ITEMS',
    RECIPES: 'RECIPES',
    CONVERSIONS: 'CONVERSIONS',
    PURCHASES: 'PURCHASES',
    SALES: 'SALES', // Canonical sales for inventory
    WASTE: 'WASTE',
    STOCK: 'STOCK_TAKE',
    REPORT_INV: 'INVENTORY_FINAL',
    REPORT_DAILY: 'DAILY_DASHBOARD',
    ERRORS: 'ERRORS_LOG'
  },
  TXN_ORDER: { 'PURCHASE': 1, 'STOCK_ADJUST': 2, 'WASTE': 3, 'SALE': 4 }
};

/* ==========================================
   1. UI & INITIALIZATION
   ========================================== */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('💎 سیستم جامع مالی ۶.۰')
    .addItem('🚀 اجرای کامل محاسبات و گزارش روزانه', 'runFinancialEngine')
    .addItem('🛠 پیکربندی شیت‌های پایه', 'setupEnvironment')
    .addToUi();
}

function setupEnvironment() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = [
    { n: CONFIG.SHEETS.ITEMS, h: ['itemCode', 'itemName', 'baseUnit'] },
    { n: CONFIG.SHEETS.RECIPES, h: ['menuCode', 'ingCode', 'qty', 'unit', 'yield'] },
    { n: CONFIG.SHEETS.CONVERSIONS, h: ['fromUnit', 'toUnit', 'factor'] },
    { n: CONFIG.SHEETS.PURCHASES, h: ['date', 'itemCode', 'qty', 'unit', 'totalCost'] },
    { n: CONFIG.SHEETS.SALES, h: ['date', 'itemCode', 'qty'] },
    { n: CONFIG.SHEETS.WASTE, h: ['date', 'itemCode', 'qty', 'unit'] },
    { n: CONFIG.SHEETS.STOCK, h: ['date', 'itemCode', 'qty', 'unit'] }
  ];
  sheets.forEach(s => {
    let sh = ss.getSheetByName(s.n) || ss.insertSheet(s.n);
    if (sh.getLastRow() === 0) sh.appendRow(s.h).getRange(1, 1, 1, s.h.length).setFontWeight('bold').setBackground('#efefef');
  });
  SpreadsheetApp.getUi().alert('✅ ساختار شیت‌های پایه آماده شد.');
}

/* ==========================================
   2. MAIN ORCHESTRATOR
   ========================================== */

function runFinancialEngine() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const errorLog = [];

  try {
    // 1. Ingest Raw Data (ETL)
    ingestImportSheets(ss, errorLog);

    // 2. Load Core Data
    const rawData = loadAllData(ss, errorLog);
    const convGraph = buildConversionGraph(rawData.CONVERSIONS, errorLog);
    const itemsMap = buildItemsMap(rawData.ITEMS, errorLog);

    // 3. Process BOM
    const flatBOM = buildFlatBOM(rawData.RECIPES, itemsMap, convGraph, errorLog);
    
    // 4. Build Unified Ledger
    const ledger = buildUnifiedLedger(rawData, itemsMap, flatBOM, convGraph, errorLog);
    
    // 5. Run WAC Engine & Daily Audit Extraction
    const { inventory, dailyMetrics } = processLedgerAndAudit(ss, ledger, itemsMap, errorLog);

    // 6. Output Reports
    flushReports(ss, inventory, dailyMetrics, errorLog);
    
  } catch (e) {
    const es = ss.getSheetByName(CONFIG.SHEETS.ERRORS) || ss.insertSheet(CONFIG.SHEETS.ERRORS);
    es.clear();
    es.getRange(1, 1).setValue('Critical system failure: ' + (e && e.message ? e.message : String(e)));
    SpreadsheetApp.getUi().alert('❌ خطای متوقف‌کننده سیستمی رخ داد.');
  }
}

/* ==========================================
   3. AUTO-INGESTION (ETL LAYER)
   ========================================== */

function ingestImportSheets(ss, errorLog) {
  const findSheet = (name) => ss.getSheets().find(s => s.getName().toLowerCase() === name.toLowerCase());
  const importItemsSh = findSheet('import_items');
  const importSalesSh = findSheet('import_sales');
  
  if (!importItemsSh || !importSalesSh) return;

  const buildMap = (row) => {
    const map = {};
    row.forEach((h, i) => { map[String(h || '').trim().replace(/\s+/g, '').replace(/[_\-\u200c]/g, '').toLowerCase()] = i; });
    return map;
  };

  const toObjects = (sh) => {
    const values = sh.getDataRange().getValues();
    if (values.length < 2) return { rows: [], headMap: {} };
    const map = buildMap(values[0]);
    return { 
      headMap: map, 
      rows: values.slice(1).map((r, idx) => {
        const obj = { _sourceRow: idx + 2 };
        for (const k in map) obj[k] = r[map[k]];
        return obj;
      }) 
    };
  };

  const itemsData = toObjects(importItemsSh);
  const salesData = toObjects(importSalesSh);
  if (!itemsData.rows.length || !salesData.rows.length) return;

  const findKey = (map, candidates) => {
    for (let c of candidates) {
      const norm = String(c).trim().replace(/\s+/g,'').replace(/[_\-\u200c]/g,'').toLowerCase();
      if (map[norm] !== undefined) return norm;
    }
    return null;
  };

  const iMap = itemsData.headMap;
  const sMap = salesData.headMap;
  
  const hItemCode = findKey(iMap, ['کدکالا','itemcode']) || Object.keys(iMap)[0];
  const hItemName = findKey(iMap, ['نامکالا','itemname']) || Object.keys(iMap)[1];
  const hQty = findKey(iMap, ['تعداد','qty']);
  const hUnit = findKey(iMap, ['نامواحد','unit']);
  const hInvItems = findKey(iMap, ['شمارهفاکتور','شمارهپيوست']);
  const hInvSales = findKey(sMap, ['شفاكتور','شمارهفاکتور','پيوست']);
  const hDateSales = findKey(sMap, ['تاريخ','date']);

  // Extract Master Data
  const itemsRegistry = {};
  itemsData.rows.forEach(r => {
    const code = String(r[hItemCode] || '').trim();
    if (code && !itemsRegistry[code]) itemsRegistry[code] = { itemName: String(r[hItemName]||code).trim(), baseUnit: String(r[hUnit]||'عدد').trim() };
  });

  let itemsSh = ss.getSheetByName(CONFIG.SHEETS.ITEMS) || ss.insertSheet(CONFIG.SHEETS.ITEMS);
  toObjects(itemsSh).rows.forEach(r => {
     const c = String(r['itemcode']||'').trim();
     if(c) itemsRegistry[c] = { itemName: r['itemname'], baseUnit: r['baseunit'] };
  });

  itemsSh.clear();
  const iHeaders = ['itemCode', 'itemName', 'baseUnit'];
  itemsSh.getRange(1, 1, 1, 3).setValues([iHeaders]).setFontWeight('bold');
  const iRows = Object.keys(itemsRegistry).map(c => [c, itemsRegistry[c].itemName, itemsRegistry[c].baseUnit]);
  if (iRows.length) itemsSh.getRange(2, 1, iRows.length, 3).setValues(iRows);

  // Join Sales for Inventory processing
  const invDateMap = {};
  salesData.rows.forEach(r => {
    const key = String(r[hInvSales] || '').trim();
    if (key) invDateMap[key] = parseDateStrict(r[hDateSales]);
  });

  const salesRowsCanon = [];
  itemsData.rows.forEach(r => {
    const inv = String(r[hInvItems] || '').trim();
    const itemCode = String(r[hItemCode] || '').trim();
    const qty = parseNumber(r[hQty]);
    if (!itemCode || qty <= 0) return;
    
    let dateNum = invDateMap[inv] || (iMap['تاريخ'] ? parseDateStrict(r[findKey(iMap, ['تاريخ'])]) : null);
    if (!dateNum) return;
    salesRowsCanon.push({ date: new Date(dateNum), itemCode: itemCode, qty: qty });
  });

  let salesShCanon = ss.getSheetByName(CONFIG.SHEETS.SALES) || ss.insertSheet(CONFIG.SHEETS.SALES);
  salesShCanon.clear();
  salesShCanon.getRange(1, 1, 1, 3).setValues([['date', 'itemCode', 'qty']]).setFontWeight('bold');
  const wRows = salesRowsCanon.map(r => [r.date, r.itemCode, r.qty]);
  if (wRows.length) salesShCanon.getRange(2, 1, wRows.length, 3).setValues(wRows);
}

/* ==========================================
   4. DATA PARSERS & LOADERS
   ========================================== */

function loadAllData(ss, errorLog) {
  return {
    ITEMS: getSheetSafe(ss, CONFIG.SHEETS.ITEMS, ['itemCode', 'itemName', 'baseUnit'], 'itemCode'),
    RECIPES: getSheetSafe(ss, CONFIG.SHEETS.RECIPES, ['menuCode', 'ingCode', 'qty', 'unit', 'yield'], 'menuCode'),
    CONVERSIONS: getSheetSafe(ss, CONFIG.SHEETS.CONVERSIONS, ['fromUnit', 'toUnit', 'factor'], 'fromUnit'),
    PURCHASES: getSheetSafe(ss, CONFIG.SHEETS.PURCHASES, ['date', 'itemCode', 'qty', 'unit', 'totalCost'], 'itemCode'),
    SALES: getSheetSafe(ss, CONFIG.SHEETS.SALES, ['date', 'itemCode', 'qty'], 'itemCode'),
    WASTE: getSheetSafe(ss, CONFIG.SHEETS.WASTE, ['date', 'itemCode', 'qty', 'unit'], 'itemCode'),
    STOCK: getSheetSafe(ss, CONFIG.SHEETS.STOCK, ['date', 'itemCode', 'qty', 'unit'], 'itemCode')
  };
}

function getSheetSafe(ss, name, headers, pKey) {
  const sh = ss.getSheetByName(name);
  if (!sh) return [];
  const vals = sh.getDataRange().getValues();
  if (vals.length < 2) return [];
  const norm = h => String(h||'').replace(/\s+/g,'').replace(/[_\-\u200c]/g,'').toLowerCase();
  const headRow = vals[0].map(norm);
  const cIdx = headers.map(h => headRow.indexOf(norm(h)));

  return vals.slice(1).map((r, i) => {
    const obj = { _sourceRow: i + 2, _sheetName: name };
    headers.forEach((h, j) => {
      const v = (cIdx[j] >= 0 && cIdx[j] < r.length) ? r[cIdx[j]] : '';
      obj[h] = typeof v === 'string' ? v.trim() : v;
    });
    if (obj.qty !== undefined) obj.qty = parseNumber(obj.qty);
    if (obj.factor !== undefined) obj.factor = parseNumber(obj.factor);
    if (obj.totalCost !== undefined) obj.totalCost = parseNumber(obj.totalCost);
    return obj;
  }).filter(o => o[pKey] !== '' && o[pKey] !== null && o[pKey] !== undefined);
}

function parseNumber(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/[٬،\s\u00A0]/g, '').replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function parseDateStrict(v) {
  if (!v) return null;
  if (v instanceof Date) { const d = new Date(v.getTime()); d.setHours(0,0,0,0); return d.getTime(); }
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400 * 1000)).setHours(0,0,0,0);
  const s = String(v).replace(/\s/g, '');
  if (/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split(/[\/\-]/).map(Number);
    if (y < 1700) {
      let jy = y-979, jm = m-1, jd = d-1;
      let jdn = 365*jy + Math.floor(jy/33)*8 + Math.floor((jy%33+3)/4);
      for (let i=0; i<jm; ++i) jdn += (i<6)?31:30;
      jdn += jd;
      let gdn = jdn + 79;
      let gy = 1600 + 400 * Math.floor(gdn/146097); gdn %= 146097;
      let leap = true;
      if (gdn >= 36525) { gdn--; gy += 100*Math.floor(gdn/36524); gdn %= 36524; if(gdn>=365) gdn++; else leap=false; }
      gy += 4*Math.floor(gdn/1461); gdn %= 1461;
      if (gdn >= 366) { leap=false; gdn-=366; gy+=Math.floor(gdn/365); gdn%=365; }
      let gd = gdn+1, sal = [0,31,leap?29:28,31,30,31,30,31,31,30,31,30,31], gm = 0;
      for (let i=0; i<13; i++) { if (gd>sal[i]) gd-=sal[i]; else {gm=i; break;} }
      return new Date(gy, gm-1, gd).getTime();
    }
    return new Date(y, m-1, d).getTime();
  }
  const p = new Date(s); return isNaN(p.getTime()) ? null : p.setHours(0,0,0,0);
}

/* ==========================================
   5. GRAPHS & BOM ENGINE
   ========================================== */

function buildItemsMap(rows, errorLog) {
  const map = {};
  rows.forEach(r => map[String(r.itemCode)] = { itemName: r.itemName||'بدون نام', baseUnit: r.baseUnit||'' });
  return map;
}

function buildConversionGraph(rows) {
  const g = {};
  rows.forEach(r => {
    const f = parseNumber(r.factor);
    if (f<=0 || !r.fromUnit || !r.toUnit) return;
    if(!g[r.fromUnit]) g[r.fromUnit]={}; if(!g[r.toUnit]) g[r.toUnit]={};
    g[r.fromUnit][r.toUnit] = f; g[r.toUnit][r.fromUnit] = 1/f;
  });
  return g;
}

function getConversion(g, from, to) {
  if (!from || !to) return null;
  if (from === to) return { factor: 1 };
  if (!g[from]) return null;
  const q = [[from, 1]], vis = new Set();
  while (q.length > 0) {
    const [c, f] = q.shift();
    if (c === to) return { factor: f };
    vis.add(c);
    for (const nb in g[c]) if (!vis.has(nb)) q.push([nb, f * g[c][nb]]);
  }
  return null;
}

function buildFlatBOM(recipes, itemsMap, convGraph, errorLog) {
  const map = {}, inv = new Set(), menus = [...new Set(recipes.map(r => String(r.menuCode)))];
  
  const resolve = (code, mult, res, path, depth) => {
    if (depth > CONFIG.MAX_BOM_DEPTH || path.includes(code)) return false;
    const ings = recipes.filter(r => String(r.menuCode) === String(code));
    if (!ings.length) { res[code] = (res[code] || 0) + mult; return true; }
    
    for (let ing of ings) {
      const iCode = String(ing.ingCode);
      const tUnit = itemsMap[iCode] ? itemsMap[iCode].baseUnit : '';
      const conv = getConversion(convGraph, String(ing.unit), tUnit || String(ing.unit));
      if (!conv) { errorLog.push(`[خطای BOM] ابطال فرمول ${path[0]||code}: تبدیل واحد جزء ${iCode} یافت نشد.`); return false; }
      const yF = (parseNumber(ing.yield) > 0) ? (parseNumber(ing.yield)/100) : 1;
      const eQty = (parseNumber(ing.qty) * conv.factor * mult) / yF;
      if (!resolve(iCode, eQty, res, [...path, code], depth + 1)) return false;
    }
    return true;
  };

  menus.forEach(m => { const c = {}; if(resolve(m, 1, c, [], 0)) map[m] = c; else inv.add(m); });
  return { map, invalidMenus: inv };
}

/* ==========================================
   6. LEDGER & DAILY AUDIT PROCESSOR
   ========================================== */

function buildUnifiedLedger(data, itemsMap, flatBOM, convGraph, errorLog) {
  const ledger = [];
  const validate = (r, t) => {
    const d = parseDateStrict(r.date);
    if (!d || parseNumber(r.qty) <= 0 || !r.itemCode) return null;
    return { date: d, _row: r._sourceRow, type: t, itemCode: String(r.itemCode), qty: parseNumber(r.qty), unit: r.unit };
  };

  data.PURCHASES.forEach(p => {
    const b = validate(p, 'PURCHASE'); if(!b) return;
    const c = getConversion(convGraph, b.unit, itemsMap[b.itemCode]?.baseUnit || b.unit);
    if(c) ledger.push({ ...b, qty: b.qty * c.factor, totalCost: parseNumber(p.totalCost) });
  });

  data.SALES.forEach(s => {
    const b = validate(s, 'SALE'); if(!b) return;
    if (flatBOM.invalidMenus.has(b.itemCode)) return;
    const comps = flatBOM.map[b.itemCode];
    if (comps) for (let i in comps) ledger.push({ ...b, itemCode: i, qty: comps[i] * b.qty });
    else ledger.push(b);
  });

  data.WASTE.forEach(w => {
    const b = validate(w, 'WASTE'); if(!b) return;
    const c = getConversion(convGraph, b.unit, itemsMap[b.itemCode]?.baseUnit || b.unit);
    if(c) ledger.push({ ...b, qty: b.qty * c.factor });
  });

  data.STOCK.forEach(st => {
    const b = validate(st, 'STOCK_ADJUST'); if(!b) return;
    const c = getConversion(convGraph, b.unit, itemsMap[b.itemCode]?.baseUnit || b.unit);
    if(c) ledger.push({ ...b, qty: b.qty * c.factor });
  });

  return ledger.sort((a, b) => (a.date - b.date) || ((CONFIG.TXN_ORDER[a.type]||99) - (CONFIG.TXN_ORDER[b.type]||99)) || (a._row - b._row));
}

function processLedgerAndAudit(ss, ledger, itemsMap, errorLog) {
  const inv = {};
  Object.keys(itemsMap).forEach(c => inv[c] = { qty:0, wac:0, val:0, name:itemsMap[c].itemName, unit:itemsMap[c].baseUnit });

  // 1. Find "Target Date" for Daily Audit (Latest date in ledger or sales)
  let maxTime = 0;
  ledger.forEach(t => { if(t.date > maxTime) maxTime = t.date; });
  
  // Daily Metrics Variables
  let daily_cogs = 0, daily_purchases = 0, daily_wasteVal = 0, daily_invVarianceVal = 0;

  ledger.forEach(txn => {
    if (!inv[txn.itemCode]) inv[txn.itemCode] = { qty:0, wac:0, val:0, name:txn.itemCode, unit:'' };
    const e = inv[txn.itemCode];
    const isTargetDate = (txn.date === maxTime);

    if (txn.type === 'PURCHASE') {
      e.qty += txn.qty; e.val += txn.totalCost;
      if (e.qty > CONFIG.TOLERANCE) e.wac = e.val / e.qty;
      if (isTargetDate) daily_purchases += txn.totalCost;
    } 
    else if (txn.type === 'SALE' || txn.type === 'WASTE') {
      if (e.qty - txn.qty < -CONFIG.TOLERANCE) {
        errorLog.push(`[توقف سخت] کالا ${txn.itemCode} ردیف ${txn._row}: موجودی منفی. تراکنش باطل شد.`);
        return;
      }
      const cost = txn.qty * e.wac;
      e.qty -= txn.qty; e.val -= cost;
      if (isTargetDate) {
        if (txn.type === 'SALE') daily_cogs += cost;
        else daily_wasteVal += cost;
      }
    }
    else if (txn.type === 'STOCK_ADJUST') {
      // Physical vs Theoretical comparison
      const varianceQty = txn.qty - e.qty;
      const varianceVal = varianceQty * e.wac;
      e.qty = txn.qty; e.val = e.qty * e.wac;
      if (isTargetDate) daily_invVarianceVal += varianceVal; // Negative means missing stock
    }
    if (Math.abs(e.qty) < CONFIG.TOLERANCE) { e.qty = 0; e.val = 0; }
  });

  // 2. Extract Raw Financial Data for Target Date
  let daily_netSales = 0, daily_invoices = new Set(), daily_guests = 0, daily_cashDiff = 0;
  
  const salesSh = ss.getSheets().find(s => s.getName().toLowerCase() === 'import_sales');
  if (salesSh) {
    const vals = salesSh.getDataRange().getValues();
    if (vals.length > 1) {
      const hMap = {}; vals[0].forEach((h,i) => hMap[String(h).trim().replace(/\s+/g,'').toLowerCase()] = i);
      const hDate = hMap['تاريخ'] || hMap['date'];
      const hInv = hMap['شفاكتور'] || hMap['شمارهفاکتور'] || hMap['پيوست'];
      const hGuest = hMap['تعدادنفرات'];
      const hNet = hMap['قابلپرداخت'] || hMap['مبلغگرد'];

      vals.slice(1).forEach(r => {
        const d = parseDateStrict(r[hDate]);
        if (d === maxTime) {
          if (r[hInv]) daily_invoices.add(String(r[hInv]));
          if (hGuest !== undefined) daily_guests += parseNumber(r[hGuest]);
          if (hNet !== undefined) daily_netSales += parseNumber(r[hNet]);
        }
      });
    }
  }

  const cashSh = ss.getSheets().find(s => s.getName().toLowerCase() === 'import_cash');
  if (cashSh) {
    const vals = cashSh.getDataRange().getValues();
    if (vals.length > 1) {
      const hMap = {}; vals[0].forEach((h,i) => hMap[String(h).trim().replace(/\s+/g,'').toLowerCase()] = i);
      const hDate = hMap['تاریخمیلادی'] || hMap['date'];
      const hGross = hMap['فروشصندوقجمعناخالص'];
      // standard pos columns
      const posCols = ['پوزنقرهای', 'پوزمشکی', 'کارتدی', 'کارتبلو', 'نقدی'].map(c => hMap[c]).filter(c => c !== undefined);
      
      vals.slice(1).forEach(r => {
        const d = parseDateStrict(r[hDate]);
        if (d === maxTime) {
          const sysExpected = parseNumber(r[hGross]);
          let actualFound = 0;
          posCols.forEach(idx => actualFound += parseNumber(r[idx]));
          daily_cashDiff += (actualFound - sysExpected); // Negative means missing cash
        }
      });
    }
  }

  // Actual Consumption = COGS + Waste - Inventory Variance (shortage increases cost)
  const daily_actualCost = daily_cogs + daily_wasteVal - daily_invVarianceVal;
  const daily_costVariance = daily_actualCost - daily_cogs;

const metrics = {
    targetDate: maxTime ? new Date(maxTime).toLocaleDateString('fa-IR') : 'نامشخص',
    netSales: daily_netSales,
    invoiceCount: daily_invoices.size,
    guests: daily_guests,
    cashDiff: daily_cashDiff,
    invDiffVal: daily_invVarianceVal,
    actualCost: daily_actualCost,
    estCogs: daily_cogs,
    costVariance: daily_costVariance,
    purchases: daily_purchases,
    wasteCost: daily_wasteVal
  };

  return { inventory: inv, dailyMetrics: metrics };
}

/* ==========================================
   7.5. DASHBOARD API (for `index.html` frontend)
   ========================================== */

function getDashboardData(startDate, endDate) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const errorLog = [];

  try {
    // 1. Ingest & Load
    ingestImportSheets(ss, errorLog);
    const rawData = loadAllData(ss, errorLog);
    const itemsMap = buildItemsMap(rawData.ITEMS, errorLog);
    const convGraph = buildConversionGraph(rawData.CONVERSIONS, errorLog);
    const flatBOM = buildFlatBOM(rawData.RECIPES, itemsMap, convGraph, errorLog);
    const ledger = buildUnifiedLedger(rawData, itemsMap, flatBOM, convGraph, errorLog);
    const { inventory, dailyMetrics } = processLedgerAndAudit(ss, ledger, itemsMap, errorLog);

    // 2. Build KPIs
    const totalCost = dailyMetrics.actualCost || 0;
    const netSales = dailyMetrics.netSales || 1;
    const kpis = {
      primeCostPct: netSales > 0 ? (totalCost / netSales) * 100 : 0,
      theoFoodCostPct: netSales > 0 ? ((dailyMetrics.estCogs || 0) / netSales) * 100 : 0,
      wasteCost: dailyMetrics.wasteCost || 0,
      purchases: dailyMetrics.purchases || 0
    };
    
    // 2a. Additional reference KPIs from daily metrics
    kpis.primeCost = totalCost;
    kpis.theoFoodCost = dailyMetrics.estCogs || 0;

    // 3. Build BCG Matrix (Menu Engineering)
    const matrix = [];
    const menuSales = {};
    rawData.SALES.forEach(s => {
      const code = String(s.itemCode);
      if (!menuSales[code]) menuSales[code] = 0;
      menuSales[code] += parseNumber(s.qty);
    });

    // Calculate menu item unit contribution margin & popularity
    Object.keys(menuSales).forEach(code => {
      const item = itemsMap[code];
      // Find in ledger for cost
      const comps = flatBOM.map[code];
      let totalCostMenu = 0;
      if (comps) {
        Object.keys(comps).forEach(iCode => {
          if (inventory[iCode]) totalCostMenu += comps[iCode] * inventory[iCode].wac;
        });
      }
      const unitCost = totalCostMenu || (inventory[code] ? inventory[code].wac : 0);
      // Assume a unit price per sale (average from data - default to 1 for safety)
      const avgPrice = netSales / (Object.keys(menuSales).length || 1);
      const unitCM = avgPrice - unitCost;
      const pop = menuSales[code];
      // Compute label
      let label = 'DOG';
      if (pop > 10 && unitCM > 0) label = 'STAR';
      else if (pop > 10 && unitCM <= 0) label = 'PLOWHORSE';
      else if (pop <= 10 && unitCM > 0) label = 'PUZZLE';
      matrix.push({
        name: item ? item.itemName : code,
        pop: Math.min((pop / Math.max(...Object.values(menuSales), 1)) * 100, 100),
        unitCM: Math.max(unitCM, 0),
        label: label
      });
    });

    // 4. Build Inventory with Safety Stock / Smart Order
    const invList = [];
    Object.keys(inventory).forEach(code => {
      const item = inventory[code];
      // Calculate average daily consumption from sales ledger in last 30 days
      const ledgerFiltered = ledger.filter(t => t.itemCode === code && (t.type === 'SALE' || t.type === 'WASTE'));
      let totalConsumed = 0;
      ledgerFiltered.forEach(t => totalConsumed += t.qty);
      const daySpan = 30;
      const avgDaily = totalConsumed / daySpan;
      const safetyStock = avgDaily * 3; // 3 days safety
      const needed = Math.max(0, safetyStock - item.qty);

      invList.push({
        name: item.name || code,
        current: Number(item.qty.toFixed(2)),
        avgDaily: avgDaily,
        unit: item.unit || '',
        needed: needed
      });
    });
    invList.sort((a, b) => b.needed - a.needed);

    return {
      status: 'ok',
      kpis: kpis,
      matrix: matrix,
      inventory: invList,
      errors: errorLog
    };

  } catch (e) {
    return {
      status: 'error',
      message: e && e.message ? e.message : String(e)
    };
  }
}

/* ==========================================
   7. REPORTS EXPORTER
   ========================================== */

function flushReports(ss, inv, metrics, errorLog) {
  // 1. Inventory Report
  const rSh = ss.getSheetByName(CONFIG.SHEETS.REPORT_INV) || ss.insertSheet(CONFIG.SHEETS.REPORT_INV);
  rSh.clear();
  const h = ['کد کالا', 'نام کالا', 'واحد', 'موجودی', 'WAC', 'ارزش دفتری'];
  rSh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#2f4f4f').setFontColor('white');
  const rows = Object.keys(inv).map(c => [c, inv[c].name, inv[c].unit, Number(inv[c].qty.toFixed(CONFIG.ROUND_QTY)), Number(inv[c].wac.toFixed(CONFIG.ROUND_MONEY)), Number(inv[c].val.toFixed(CONFIG.ROUND_MONEY))]);
  if (rows.length) rSh.getRange(2, 1, rows.length, h.length).setValues(rows);

  // 2. Daily Dashboard
  const dSh = ss.getSheetByName(CONFIG.SHEETS.REPORT_DAILY) || ss.insertSheet(CONFIG.SHEETS.REPORT_DAILY);
  dSh.clear();
  const dashData = [
    ['گزارش ممیزی عملیات روزانه (Daily Audit)', ''],
    ['تاریخ گزارش (آخرین روز کاری):', metrics.targetDate],
    ['', ''],
    ['📊 شاخص‌های فروش', 'مقدار / ریال'],
    ['فروش خالص (Net Sales)', metrics.netSales],
    ['تعداد فاکتور صادره', metrics.invoiceCount],
    ['تعداد مهمان (Guest Count)', metrics.guests],
    ['', ''],
    ['💵 شاخص‌های مالی و نقدینگی', 'مغایرت (ریال)'],
    ['مغایرت صندوق (کسری/اضافی فیزیکی نسبت به سیستم)', metrics.cashDiff],
    ['مغایرت انبار (کسری/اضافی فیزیکی شمارش شده)', metrics.invDiffVal],
    ['', ''],
    ['📉 شاخص‌های بهای تمام شده (COGS)', 'ریال'],
    ['بهای تمام شده تئوریک (Estimated COGS)', metrics.estCogs],
    ['هزینه مصرف واقعی مواد (Actual Cost)', metrics.actualCost],
    ['انحراف هزینه (Variance - تفاوت واقعی و تئوریک)', metrics.costVariance],
    ['مجموع خریدهای روز', metrics.purchases]
  ];
  
  dSh.getRange(1, 1, dashData.length, 2).setValues(dashData);
  dSh.getRange(1, 1, 1, 2).setBackground('#000080').setFontColor('white').setFontWeight('bold');
  dSh.getRange(4, 1, 1, 2).setBackground('#e6e6fa').setFontWeight('bold');
  dSh.getRange(9, 1, 1, 2).setBackground('#e6e6fa').setFontWeight('bold');
  dSh.getRange(13, 1, 1, 2).setBackground('#e6e6fa').setFontWeight('bold');
  dSh.setColumnWidth(1, 350);

  // 3. Errors Log
  const eSh = ss.getSheetByName(CONFIG.SHEETS.ERRORS) || ss.insertSheet(CONFIG.SHEETS.ERRORS);
  eSh.clear();
  eSh.getRange(1, 1).setValue(`لاگ ممیزی - ${new Date().toLocaleString()}`).setFontWeight('bold').setBackground('#8b0000').setFontColor('white');
  if (errorLog.length) eSh.getRange(2, 1, errorLog.length, 1).setValues([...new Set(errorLog)].map(e => [e]));
}