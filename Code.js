/**
 * ERP FINANCIAL ENGINE - ENTERPRISE ARCHITECTURE (Version 7.2 - Robust)
 * Fixes: Sheet Creation Crash, Auto-Generation of all System Sheets, 
 *        Safe Clear Operations, Comprehensive Environment Setup.
 */

const CONFIG = {
  VERSION: "Enterprise-7.2",
  TOLERANCE: 1e-6,
  ROUND_QTY: 4,
  ROUND_MONEY: 2,
  MAX_BOM_DEPTH: 50,
  SHEETS: {
    // Input Sheets (User Data)
    ITEMS: 'ITEMS',
    RECIPES: 'RECIPES',
    CONVERSIONS: 'CONVERSIONS',
    PURCHASES: 'PURCHASES',
    PRODUCTION: 'PRODUCTION',    
    SALES: 'SALES',              
    WASTE: 'WASTE',
    STOCK: 'STOCK_TAKE',
    
    // System & Output Sheets
    OPENING: 'OPENING_BALANCES', 
    REPORT_INV: 'INVENTORY_FINAL',
    REPORT_DAILY: 'DAILY_DASHBOARD',
    SUSPENSE: 'SUSPENSE_ACCOUNT',
    BOM_CACHE: 'BOM_CACHE',      
    ERRORS: 'ERRORS_LOG'
  },
  TXN_ORDER: { 
    'OPENING': 0, 
    'PURCHASE': 1, 
    'PRODUCTION_CONSUME': 2, 
    'PRODUCTION_ADD': 3,     
    'STOCK_ADJUST': 4, 
    'WASTE': 5, 
    'SALE': 6 
  }
};

/* ==========================================
   1. UI & INITIALIZATION
   ========================================== */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('💎 سیستم جامع مالی ۷.۲ (Enterprise)')
    .addItem('🚀 اجرای کامل محاسبات روزانه', 'runFinancialEngine')
    .addItem('⚙️ به‌روزرسانی کش فرمول ساخت (BOM)', 'updateBOMCache')
    .addSeparator()
    .addItem('🛠 ایجاد/بازسازی تمام شیت‌های سیستم', 'setupEnvironment')
    .addToUi();
}

// FIX: تابع کمکی برای تضمین وجود شیت
function getOrCreateSheet(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  return sh;
}

function setupEnvironment() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // تعریف تمام شیت‌ها با هدرهای استاندارد
  const allSheets = [
    // Input Sheets
    { n: CONFIG.SHEETS.ITEMS, h: ['itemCode', 'itemName', 'baseUnit'] },
    { n: CONFIG.SHEETS.RECIPES, h: ['menuCode', 'ingCode', 'qty', 'unit', 'yield'] },
    { n: CONFIG.SHEETS.CONVERSIONS, h: ['fromUnit', 'toUnit', 'factor'] },
    { n: CONFIG.SHEETS.PURCHASES, h: ['date', 'itemCode', 'qty', 'unit', 'totalCost'] },
    { n: CONFIG.SHEETS.PRODUCTION, h: ['date', 'menuCode', 'qtyProduced'] },
    { n: CONFIG.SHEETS.SALES, h: ['date', 'itemCode', 'qty'] },
    { n: CONFIG.SHEETS.WASTE, h: ['date', 'itemCode', 'qty', 'unit'] },
    { n: CONFIG.SHEETS.STOCK, h: ['date', 'itemCode', 'qty', 'unit'] },
    
    // System Sheets
    { n: CONFIG.SHEETS.OPENING, h: ['itemCode', 'qty', 'wac', 'val'] },
    { n: CONFIG.SHEETS.BOM_CACHE, h: ['menuCode', 'ingCode', 'qtyNeeded'] },
    { n: CONFIG.SHEETS.SUSPENSE, h: ['date', 'itemCode', 'deficitQty', 'type', 'rowReference'] },
    { n: CONFIG.SHEETS.REPORT_INV, h: ['کد کالا', 'نام کالا', 'واحد', 'موجودی', 'WAC', 'ارزش دفتری'] },
    { n: CONFIG.SHEETS.REPORT_DAILY, h: ['تاریخ هدف', 'خرید روز', 'بهای تمام شده فروش (COGS)', 'هزینه تولید روز', 'ارزش ضایعات'] },
    { n: CONFIG.SHEETS.ERRORS, h: ['لاگ خطاها و هشدارها'] }
  ];

  let createdCount = 0;
  allSheets.forEach(s => {
    let sh = ss.getSheetByName(s.n);
    if (!sh) {
      sh = ss.insertSheet(s.n);
      createdCount++;
    }
    
    // فقط اگر شیت کاملاً خالی است، هدر را بنویس
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, s.h.length).setValues([s.h]).setFontWeight('bold').setBackground('#efefef');
      sh.setFrozenRows(1); // فریز کردن هدر
    }
  });
  
  // حذف شیت پیش‌فرض Sheet1 اگر وجود دارد و خالی است
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && defaultSheet.getLastRow() === 0 && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  SpreadsheetApp.getUi().alert(`✅ محیط سیستم با موفقیت آماده شد.\n${createdCount} شیت جدید ایجاد شد.`);
}

/* ==========================================
   2. MAIN ORCHESTRATOR
   ========================================== */

function runFinancialEngine() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const errorLog = [];
  const suspenseLog = [];

  try {
    // 1. Load Core Data
    const rawData = loadAllData(ss, errorLog);
    const itemsMap = buildItemsMap(rawData.ITEMS, errorLog);
    
    // 2. Load Cached BOM
    const cachedBOM = loadCachedBOM(ss);
    if (Object.keys(cachedBOM).length === 0 && rawData.PRODUCTION.length > 0) {
      throw new Error('کش BOM خالی است اما دستور تولید وجود دارد. لطفاً ابتدا کش را به‌روزرسانی کنید.');
    }

    // 3. Build Unified Ledger
    const ledger = buildUnifiedLedger(rawData, cachedBOM, errorLog);
    
    // 4. Run WAC Engine
    const { inventory, dailyMetrics } = processLedgerAndAudit(ledger, itemsMap, suspenseLog, errorLog);

    // 5. Output Reports
    flushReports(ss, inventory, dailyMetrics, suspenseLog, errorLog);
    
    SpreadsheetApp.getUi().alert(`✅ محاسبات مالی (نسخه ${CONFIG.VERSION}) با موفقیت انجام شد.\nتاریخ هدف: ${dailyMetrics.targetDate}`);
    
  } catch (e) {
    logCriticalError(ss, e);
  }
}

/* ==========================================
   3. BOM CACHING SYSTEM
   ========================================== */

function updateBOMCache() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const errorLog = [];
  try {
    const rawData = {
      RECIPES: getSheetSafe(ss, CONFIG.SHEETS.RECIPES, ['menuCode', 'ingCode', 'qty', 'unit', 'yield'], 'menuCode'),
      CONVERSIONS: getSheetSafe(ss, CONFIG.SHEETS.CONVERSIONS, ['fromUnit', 'toUnit', 'factor'], 'fromUnit'),
      ITEMS: getSheetSafe(ss, CONFIG.SHEETS.ITEMS, ['itemCode', 'itemName', 'baseUnit'], 'itemCode')
    };
    
    const itemsMap = buildItemsMap(rawData.ITEMS, errorLog);
    const convGraph = buildConversionGraph(rawData.CONVERSIONS);
    const flatBOM = buildFlatBOM(rawData.RECIPES, itemsMap, convGraph, errorLog);
    
    const cacheSh = getOrCreateSheet(ss, CONFIG.SHEETS.BOM_CACHE);
    cacheSh.clear();
    cacheSh.appendRow(['menuCode', 'ingCode', 'qtyNeeded']).setFontWeight('bold');
    
    const output = [];
    Object.keys(flatBOM.map).forEach(menu => {
      const ings = flatBOM.map[menu];
      Object.keys(ings).forEach(ing => {
        output.push([menu, ing, ings[ing]]);
      });
    });
    
    if(output.length) cacheSh.getRange(2, 1, output.length, 3).setValues(output);
    SpreadsheetApp.getUi().alert('✅ فرمول‌های ساخت با موفقیت پردازش و کش شدند.');
    
  } catch(e) { logCriticalError(ss, e); }
}

function loadCachedBOM(ss) {
  const sh = ss.getSheetByName(CONFIG.SHEETS.BOM_CACHE);
  if(!sh) return {};
  const vals = sh.getDataRange().getValues();
  if(vals.length < 2) return {};
  
  const cache = {};
  vals.slice(1).forEach(r => {
    const [m, i, q] = [String(r[0]), String(r[1]), parseNumber(r[2])];
    if(!cache[m]) cache[m] = {};
    cache[m][i] = q;
  });
  return cache;
}

/* ==========================================
   4. DATA LOADERS & PARSERS
   ========================================== */

function loadAllData(ss, errorLog) {
  return {
    ITEMS: getSheetSafe(ss, CONFIG.SHEETS.ITEMS, ['itemCode', 'itemName', 'baseUnit'], 'itemCode'),
    OPENING: getSheetSafe(ss, CONFIG.SHEETS.OPENING, ['itemCode', 'qty', 'wac', 'val'], 'itemCode'),
    PURCHASES: getSheetSafe(ss, CONFIG.SHEETS.PURCHASES, ['date', 'itemCode', 'qty', 'unit', 'totalCost'], 'itemCode'),
    PRODUCTION: getSheetSafe(ss, CONFIG.SHEETS.PRODUCTION, ['date', 'menuCode', 'qtyProduced'], 'menuCode'),
    SALES: getSheetSafe(ss, CONFIG.SHEETS.SALES, ['date', 'itemCode', 'qty'], 'itemCode'),
    WASTE: getSheetSafe(ss, CONFIG.SHEETS.WASTE, ['date', 'itemCode', 'qty', 'unit'], 'itemCode'),
    STOCK: getSheetSafe(ss, CONFIG.SHEETS.STOCK, ['date', 'itemCode', 'qty', 'unit'], 'itemCode')
  };
}

function parseNumber(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  let str = String(v);
  str = str.replace(/[٬،\s\u00A0]/g, '');
  str = str.replace(/٫/g, '.');
  str = str.replace(/[^\d.\-]/g, '');
  
  const parts = str.split('.');
  if (parts.length > 2) {
      str = parts[0] + '.' + parts.slice(1).join('');
  }
  
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

function parseDateStrict(v) {
  if (!v) return null;
  const p = new Date(v); 
  return isNaN(p.getTime()) ? null : p.setHours(0,0,0,0);
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
    if (obj.qtyProduced !== undefined) obj.qtyProduced = parseNumber(obj.qtyProduced);
    if (obj.totalCost !== undefined) obj.totalCost = parseNumber(obj.totalCost);
    if (obj.wac !== undefined) obj.wac = parseNumber(obj.wac);
    if (obj.val !== undefined) obj.val = parseNumber(obj.val);
    
    return obj;
  }).filter(o => o[pKey] !== '' && o[pKey] !== null && o[pKey] !== undefined);
}

function buildItemsMap(rows) {
  const map = {};
  rows.forEach(r => map[String(r.itemCode)] = { itemName: r.itemName||'بدون نام', baseUnit: r.baseUnit||'' });
  return map;
}

function buildConversionGraph(rows) {
  const g = {};
  rows.forEach(r => {
    const f = parseNumber(r.factor);
    if(!g[r.fromUnit]) g[r.fromUnit]={}; 
    if(!g[r.toUnit]) g[r.toUnit]={};
    g[r.fromUnit][r.toUnit] = f; 
    g[r.toUnit][r.fromUnit] = 1/f;
  });
  return g;
}

function getConversion(g, from, to) {
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
    
    if (!ings.length) { 
        res[code] = (res[code] || 0) + mult; 
        return true; 
    }
    
    for (let ing of ings) {
      const iCode = String(ing.ingCode);
      const tUnit = itemsMap[iCode] ? itemsMap[iCode].baseUnit : '';
      const conv = getConversion(convGraph, String(ing.unit), tUnit || String(ing.unit));
      
      if (!conv) { 
          errorLog.push(`[BOM Error] تبدیل واحد ${ing.unit} به ${tUnit} برای ${iCode} یافت نشد.`); 
          return false; 
      }
      
      const yF = (parseNumber(ing.yield) > 0) ? (parseNumber(ing.yield)/100) : 1;
      const eQty = (parseNumber(ing.qty) * conv.factor * mult) / yF;
      
      if (!resolve(iCode, eQty, res, [...path, code], depth + 1)) return false;
    }
    return true;
  };
  
  menus.forEach(m => { 
      const c = {}; 
      if(resolve(m, 1, c, [], 0)) map[m] = c; 
      else inv.add(m); 
  });
  
  return { map, invalidMenus: inv };
}

/* ==========================================
   5. LEDGER BUILDER
   ========================================== */

function buildUnifiedLedger(data, cachedBOM, errorLog) {
  const ledger = [];
  let prodCounter = 0;
  
  const validate = (r, t) => {
    const d = parseDateStrict(r.date);
    if (!d && t !== 'OPENING') return null; 
    return { 
        date: d || 0, 
        _row: r._sourceRow, 
        type: t, 
        itemCode: String(r.itemCode||r.menuCode), 
        qty: parseNumber(r.qty||r.qtyProduced) 
    };
  };

  data.OPENING.forEach(o => {
    const qty = parseNumber(o.qty);
    const val = parseNumber(o.val);
    const wac = qty > CONFIG.TOLERANCE ? (val / qty) : parseNumber(o.wac);
    ledger.push({ date: 0, _row: o._sourceRow, type: 'OPENING', itemCode: String(o.itemCode), qty: qty, wac: wac, val: val });
  });

  data.PURCHASES.forEach(p => {
    const b = validate(p, 'PURCHASE'); 
    if(b) ledger.push({ ...b, totalCost: parseNumber(p.totalCost) });
  });

  data.PRODUCTION.forEach(pr => {
    const b = validate(pr, 'PRODUCTION_ADD'); 
    if(!b) return;
    
    prodCounter++;
    const prodId = 'PROD_' + prodCounter + '_' + b.date;
    b.productionId = prodId;
    ledger.push(b);
    
    const comps = cachedBOM[b.itemCode];
    if (comps) {
      for (let i in comps) {
        ledger.push({ 
            date: b.date, 
            _row: b._row, 
            type: 'PRODUCTION_CONSUME', 
            itemCode: i, 
            qty: comps[i] * b.qty,
            productionId: prodId
        });
      }
    } else {
      errorLog.push(`[هشدار تولید] فرمول ساخت برای ${b.itemCode} یافت نشد.`);
    }
  });

  data.SALES.forEach(s => {
    const b = validate(s, 'SALE'); if(b) ledger.push(b);
  });

  data.WASTE.forEach(w => {
    const b = validate(w, 'WASTE'); if(b) ledger.push(b);
  });

  data.STOCK.forEach(s => {
    const b = validate(s, 'STOCK_ADJUST'); 
    if(b) ledger.push(b);
  });

  return ledger.sort((a, b) => 
      (a.date - b.date) || 
      ((CONFIG.TXN_ORDER[a.type]||99) - (CONFIG.TXN_ORDER[b.type]||99)) || 
      (a._row - b._row)
  );
}

/* ==========================================
   6. WAC ENGINE & SOFT-STOPS
   ========================================== */

function processLedgerAndAudit(ledger, itemsMap, suspenseLog, errorLog) {
  const inv = {};
  Object.keys(itemsMap).forEach(c => inv[c] = { qty:0, wac:0, val:0, name:itemsMap[c].itemName, unit:itemsMap[c].baseUnit });

  let maxTime = 0;
  ledger.forEach(t => { if(t.date > maxTime) maxTime = t.date; });
  
  let daily_cogs = 0, daily_purchases = 0, daily_wasteVal = 0, daily_prodCost = 0;
  const productionCosts = {};

  ledger.forEach(txn => {
    if (!inv[txn.itemCode]) inv[txn.itemCode] = { qty:0, wac:0, val:0, name:txn.itemCode, unit:'' };
    const e = inv[txn.itemCode];
    
    const isTargetDate = (maxTime > 0 && txn.date === maxTime);

    if (txn.type === 'OPENING') {
      e.qty = txn.qty; 
      e.wac = txn.wac; 
      e.val = txn.val;
    }
    else if (txn.type === 'PURCHASE') {
      e.qty += txn.qty; 
      e.val += txn.totalCost;
      if (e.qty > CONFIG.TOLERANCE) e.wac = e.val / e.qty;
      if (isTargetDate) daily_purchases += txn.totalCost;
    } 
    else if (txn.type === 'PRODUCTION_CONSUME') {
      checkSuspense(e, txn, suspenseLog);
      const cost = txn.qty * e.wac;
      e.qty -= txn.qty; 
      e.val -= cost;
      
      if(txn.productionId) {
          productionCosts[txn.productionId] = (productionCosts[txn.productionId] || 0) + cost;
      }
      
      if (isTargetDate) daily_prodCost += cost;
    }
    else if (txn.type === 'PRODUCTION_ADD') {
      e.qty += txn.qty; 
      const consumedCost = productionCosts[txn.productionId] || 0;
      e.val += consumedCost;
      
      if (e.qty > CONFIG.TOLERANCE) {
          e.wac = e.val / e.qty;
      }
    }
    else if (txn.type === 'SALE' || txn.type === 'WASTE') {
      checkSuspense(e, txn, suspenseLog);
      const cost = txn.qty * e.wac;
      e.qty -= txn.qty; 
      e.val -= cost;
      
      if (isTargetDate) {
        if (txn.type === 'SALE') daily_cogs += cost;
        else daily_wasteVal += cost;
      }
    }
    else if (txn.type === 'STOCK_ADJUST') {
        if (txn.qty > 0) {
            e.qty += txn.qty;
            e.val += txn.qty * e.wac;
            if (e.qty > CONFIG.TOLERANCE) e.wac = e.val / e.qty;
        } else {
            const absQty = Math.abs(txn.qty);
            checkSuspense(e, { ...txn, qty: absQty }, suspenseLog);
            const cost = absQty * e.wac;
            e.qty += txn.qty; 
            e.val -= cost;
        }
    }
    
    if (Math.abs(e.qty) < CONFIG.TOLERANCE) { 
        e.qty = 0; 
        e.val = 0; 
    }
  });

  const metrics = { 
      targetDate: maxTime > 0 ? new Date(maxTime).toLocaleDateString('fa-IR') : 'نامشخص', 
      estCogs: daily_cogs, 
      purchases: daily_purchases,
      prodCost: daily_prodCost,
      wasteVal: daily_wasteVal
  };
  
  return { inventory: inv, dailyMetrics: metrics };
}

function checkSuspense(e, txn, suspenseLog) {
  const remainingQty = e.qty - txn.qty;
  if (remainingQty < -CONFIG.TOLERANCE) {
    suspenseLog.push([
      txn.date ? new Date(txn.date).toLocaleDateString('fa-IR') : '-',
      txn.itemCode,
      Number((-remainingQty).toFixed(CONFIG.ROUND_QTY)),
      txn.type,
      txn._row
    ]);
  }
}

/* ==========================================
   7. REPORTS EXPORTER (FIXED)
   ========================================== */

function flushReports(ss, inv, metrics, suspenseLog, errorLog) {
  // 1. Inventory Report
  const rSh = getOrCreateSheet(ss, CONFIG.SHEETS.REPORT_INV);
  rSh.clear();
  const h = ['کد کالا', 'نام کالا', 'واحد', 'موجودی', 'WAC', 'ارزش دفتری'];
  rSh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
  
  const rows = Object.keys(inv).map(c => [
      c, 
      inv[c].name, 
      inv[c].unit, 
      Number(inv[c].qty.toFixed(CONFIG.ROUND_QTY)), 
      Number(inv[c].wac.toFixed(CONFIG.ROUND_MONEY)), 
      Number(inv[c].val.toFixed(CONFIG.ROUND_MONEY))
  ]);
  
  if (rows.length) rSh.getRange(2, 1, rows.length, h.length).setValues(rows);

  // 2. Suspense Account
  const sSh = getOrCreateSheet(ss, CONFIG.SHEETS.SUSPENSE);
  sSh.clear();
  const sHead = ['تاریخ خطا', 'کد کالا', 'کسری موجودی موقت', 'نوع عملیات', 'ردیف منبع'];
  sSh.getRange(1, 1, 1, sHead.length).setValues([sHead]).setBackground('#ffeb3b');
  if(suspenseLog.length) sSh.getRange(2, 1, suspenseLog.length, sHead.length).setValues(suspenseLog);

  // 3. Daily Dashboard
  const dSh = getOrCreateSheet(ss, CONFIG.SHEETS.REPORT_DAILY);
  dSh.clear();
  const dHead = ['تاریخ هدف', 'خرید روز', 'بهای تمام شده فروش (COGS)', 'هزینه تولید روز', 'ارزش ضایعات'];
  dSh.getRange(1, 1, 1, dHead.length).setValues([dHead]).setFontWeight('bold').setBackground('#e0f7fa');
  dSh.getRange(2, 1, 1, dHead.length).setValues([[
      metrics.targetDate, 
      Number(metrics.purchases.toFixed(CONFIG.ROUND_MONEY)), 
      Number(metrics.estCogs.toFixed(CONFIG.ROUND_MONEY)), 
      Number(metrics.prodCost.toFixed(CONFIG.ROUND_MONEY)),
      Number(metrics.wasteVal.toFixed(CONFIG.ROUND_MONEY))
  ]]);

  // 4. Errors Log
  const eSh = getOrCreateSheet(ss, CONFIG.SHEETS.ERRORS);
  eSh.clear();
  eSh.getRange(1, 1, 1, 1).setValues([['لاگ خطاها و هشدارها']]).setFontWeight('bold');
  if (errorLog.length) {
      const uniqueErrors = [...new Set(errorLog)].map(e => [e]);
      eSh.getRange(2, 1, uniqueErrors.length, 1).setValues(uniqueErrors);
  }
}

function logCriticalError(ss, e) {
  const es = getOrCreateSheet(ss, CONFIG.SHEETS.ERRORS);
  es.clear();
  es.getRange(1, 1).setValue('Critical Crash: ' + (e && e.message ? e.message : String(e)));
  SpreadsheetApp.getUi().alert('❌ خطای پردازشی رخ داد. بخش ERRORS_LOG را بررسی کنید.');
}



/* ==========================================
   8. WEB APP INTEGRATION (Standalone UI)
   ========================================== */

// این تابع حیاتی است: وقتی کسی لینک وب‌اپ را باز می‌کند، این تابع اجرا می‌شود
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('DataEntryForm')
    .setTitle('پنل ثبت عملیات ERP')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// دریافت پیکربندی فرم و لیست کالاها (همان کد قبلی با کمی بهینه‌سازی)
function getUiConfig() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const itemsSh = ss.getSheetByName(CONFIG.SHEETS.ITEMS);
  let existingItems = [];
  if (itemsSh && itemsSh.getLastRow() > 1) {
    const vals = itemsSh.getRange(2, 1, itemsSh.getLastRow() - 1, 1).getValues();
    existingItems = vals.map(r => String(r[0])).filter(v => v !== '');
  }

  const forms = {
    'PURCHASE': {
      sheetName: CONFIG.SHEETS.PURCHASES,
      label: '🛒 ثبت خرید',
      fields: [
        { name: 'date', label: 'تاریخ', type: 'date', required: true },
        { name: 'itemCode', label: 'کد کالا', type: 'datalist', required: true },
        { name: 'qty', label: 'تعداد / مقدار', type: 'number', required: true },
        { name: 'unit', label: 'واحد', type: 'text', required: true },
        { name: 'totalCost', label: 'بهای تمام شده کل', type: 'number', required: true }
      ]
    },
    'SALE': {
      sheetName: CONFIG.SHEETS.SALES,
      label: '💰 ثبت فروش',
      fields: [
        { name: 'date', label: 'تاریخ', type: 'date', required: true },
        { name: 'itemCode', label: 'کد کالا', type: 'datalist', required: true },
        { name: 'qty', label: 'تعداد فروش رفته', type: 'number', required: true }
      ]
    },
    'PRODUCTION': {
      sheetName: CONFIG.SHEETS.PRODUCTION,
      label: '🏭 ثبت دستور تولید',
      fields: [
        { name: 'date', label: 'تاریخ', type: 'date', required: true },
        { name: 'menuCode', label: 'کد محصول نهایی', type: 'datalist', required: true },
        { name: 'qtyProduced', label: 'تعداد تولید شده', type: 'number', required: true }
      ]
    },
    'WASTE': {
      sheetName: CONFIG.SHEETS.WASTE,
      label: '🗑️ ثبت ضایعات',
      fields: [
        { name: 'date', label: 'تاریخ', type: 'date', required: true },
        { name: 'itemCode', label: 'کد کالا', type: 'datalist', required: true },
        { name: 'qty', label: 'مقدار ضایعات', type: 'number', required: true },
        { name: 'unit', label: 'واحد', type: 'text', required: true }
      ]
    },
    'STOCK': {
      sheetName: CONFIG.SHEETS.STOCK,
      label: '📊 تعدیل انبار',
      fields: [
        { name: 'date', label: 'تاریخ', type: 'date', required: true },
        { name: 'itemCode', label: 'کد کالا', type: 'datalist', required: true },
        { name: 'qty', label: 'مقدار تعدیل (+ اضافی، - کسری)', type: 'number', required: true },
        { name: 'unit', label: 'واحد', type: 'text', required: true }
      ]
    },
    'NEW_ITEM': {
      sheetName: CONFIG.SHEETS.ITEMS,
      label: '📦 تعریف کالای جدید',
      fields: [
        { name: 'itemCode', label: 'کد کالا (یکتا)', type: 'text', required: true },
        { name: 'itemName', label: 'نام کالا', type: 'text', required: true },
        { name: 'baseUnit', label: 'واحد پایه', type: 'text', required: true }
      ]
    }
  };

  return { forms: forms, items: existingItems };
}

// پردازش داده‌های ارسالی از وب‌اپ
function processFormData(formData) {
  if (!formData || !formData.type) throw new Error('نوع عملیات مشخص نیست.');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(formData.type);
  
  if (!sh) throw new Error(`شیت ${formData.type} یافت نشد.`);

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const newRow = new Array(headers.length).fill('');
  let hasData = false;
  
  for (let key in formData) {
    if (key === 'type') continue;
    const colIndex = headers.indexOf(key);
    if (colIndex !== -1) {
      newRow[colIndex] = formData[key];
      hasData = true;
    }
  }

  if (!hasData) throw new Error('هیچ داده معتبری برای ثبت یافت نشد.');

  sh.appendRow(newRow);
  return true;
}
