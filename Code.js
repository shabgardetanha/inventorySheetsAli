/**
 * ERP FINANCIAL ENGINE - ENTERPRISE ARCHITECTURE (Version 8.0 - Global Standards)
 * New Features: Batch/Lot Tracking, Catch Weight, Multi-Warehouse, FEFO (First Expired, First Out)
 * Aligned with SAP MM/PP and Oracle FMCG/Manufacturing Standards
 */

const CONFIG = {
  VERSION: "Enterprise-8.0",
  TOLERANCE: 1e-6,
  ROUND_QTY: 4,
  ROUND_MONEY: 2,
  MAX_BOM_DEPTH: 50,
  SHEETS: {
    ITEMS: 'ITEMS', RECIPES: 'RECIPES', CONVERSIONS: 'CONVERSIONS',
    PURCHASES: 'PURCHASES', PRODUCTION: 'PRODUCTION', SALES: 'SALES',
    WASTE: 'WASTE', STOCK: 'STOCK_TAKE', OPENING: 'OPENING_BALANCES',
    REPORT_INV: 'INVENTORY_FINAL', REPORT_DAILY: 'DAILY_DASHBOARD',
    SUSPENSE: 'SUSPENSE_ACCOUNT', BOM_CACHE: 'BOM_CACHE', ERRORS: 'ERRORS_LOG'
  },
  TXN_ORDER: { 
    'OPENING': 0, 'PURCHASE': 1, 'PRODUCTION_CONSUME': 2, 'PRODUCTION_ADD': 3,     
    'STOCK_ADJUST': 4, 'WASTE': 5, 'SALE': 6 
  },
  ITEM_TYPES: { RAW: 'RAW', PACKAGED: 'PACKAGED', PRODUCT: 'PRODUCT' }
};

/* ==========================================
   📅 تاریخ جلالی - توابع تبدیل و قالب‌بندی
   ========================================== */
function gregorianToJalali(gy, gm, gd) {
  var g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  var jy, jm, jd, days;
  gy = parseInt(gy); gm = parseInt(gm); gd = parseInt(gd);
  if (gy > 1600) { jy = 979; gy -= 1600; } else { jy = 0; gy -= 621; }
  var gy2 = (gm > 2) ? (gy + 1) : gy;
  days = (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) - 80 + gd + g_d_m[gm - 1];
  jy += 33 * Math.floor(days / 12053); days %= 12053;
  jy += 4 * Math.floor(days / 1461); days %= 1461;
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  if (days < 186) { jm = 1 + Math.floor(days / 31); jd = 1 + (days % 31); } 
  else { jm = 7 + Math.floor((days - 186) / 30); jd = 1 + ((days - 186) % 30); }
  return [jy, jm, jd];
}

function jalaliToGregorian(jy, jm, jd) {
  jy = parseInt(jy); jm = parseInt(jm); jd = parseInt(jd);
  var gy = (jy > 979) ? 1600 : 621; var gm, gd, days;
  if (jy > 979) jy -= 979; else jy -= 0;
  days = (365 * jy) + (Math.floor(jy / 33) * 8) + Math.floor(((jy % 33) + 3) / 4) + 78 + jd + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
  gy += 400 * Math.floor(days / 146097); days %= 146097;
  if (days > 36524) { gy += 100 * Math.floor(--days / 36524); days %= 36524; if (days >= 365) days++; }
  gy += 4 * Math.floor(days / 1461); days %= 1461;
  if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  gd = days + 1;
  var sal_a = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (gm = 0; gm < 13 && gd > sal_a[gm]; gm++) gd -= sal_a[gm];
  return new Date(gy, gm - 1, gd);
}

function formatDateJalali(date, format = 'yyyy/mm/dd') {
  if (!date) return '';
  if (typeof date === 'number') date = new Date(date);
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  const [jy, jm, jd] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
  const pad = (n) => n < 10 ? '0' + n : n;
  return format.replace('yyyy', jy).replace('mm', pad(jm)).replace('dd', pad(jd));
}

function convertJalaliToGregorian(jalaliStr) {
  if (!jalaliStr) return null;
  if (jalaliStr instanceof Date) return isNaN(jalaliStr.getTime()) ? null : jalaliStr;
  jalaliStr = String(jalaliStr).trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const parts = jalaliStr.split(/[\/\-\.،,\s]+/).map(p => parseInt(p, 10));
  if (parts.length < 3 || parts.some(isNaN)) return null;
  const [jy, jm, jd] = parts;
  if (jy < 1300 || jy > 1500 || jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
  try { return jalaliToGregorian(jy, jm, jd); } catch (e) { return null; }
}

/* ==========================================
   1. UI & INITIALIZATION
   ========================================== */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('💎 سیستم جامع مالی ۸.۰ (Enterprise SAP/Oracle)')
    .addItem('🚀 اجرای کامل محاسبات روزانه (FEFO & Multi-WH)', 'runFinancialEngine')
    .addItem('⚙️ به‌روزرسانی کش فرمول ساخت (BOM)', 'updateBOMCache')
    .addItem('📦 تولید خودکار فرمول بسته‌بندی', 'generatePackagingBOM')
    .addItem('🔄 اعمال لیست‌های کشویی هوشمند (Data Validation)', 'setupDataValidation')
    .addSeparator()
    .addItem('🛠 ایجاد/بازسازی تمام شیت‌های سیستم (نسخه ۸)', 'setupEnvironment')
    .addToUi();
}

function getOrCreateSheet(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function setupEnvironment() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const allSheets = [
    { n: CONFIG.SHEETS.ITEMS, h: ['itemCode', 'itemName', 'baseUnit', 'itemType', 'packageSize', 'parentItem', 'isCatchWeight', 'secondaryUnit'] },
    { n: CONFIG.SHEETS.RECIPES, h: ['menuCode', 'ingCode', 'qty', 'unit', 'yield'] },
    { n: CONFIG.SHEETS.CONVERSIONS, h: ['fromUnit', 'toUnit', 'factor'] },
    { n: CONFIG.SHEETS.PURCHASES, h: ['date', 'jalaliDate', 'itemCode', 'qty', 'unit', 'totalCost', 'batchNumber', 'expiryDate', 'warehouseCode', 'catchWeight'] },
    { n: CONFIG.SHEETS.PRODUCTION, h: ['date', 'jalaliDate', 'menuCode', 'qtyProduced', 'batchNumber', 'expiryDate', 'warehouseCode', 'catchWeight'] },
    { n: CONFIG.SHEETS.SALES, h: ['date', 'jalaliDate', 'itemCode', 'qty', 'batchNumber', 'warehouseCode', 'catchWeight'] },
    { n: CONFIG.SHEETS.WASTE, h: ['date', 'jalaliDate', 'itemCode', 'qty', 'unit', 'batchNumber', 'warehouseCode'] },
    { n: CONFIG.SHEETS.STOCK, h: ['date', 'jalaliDate', 'itemCode', 'countedQty', 'unit', 'batchNumber', 'warehouseCode'] },
    { n: CONFIG.SHEETS.OPENING, h: ['itemCode', 'qty', 'wac', 'val', 'batchNumber', 'expiryDate', 'warehouseCode', 'catchWeight'] },
    { n: CONFIG.SHEETS.BOM_CACHE, h: ['menuCode', 'ingCode', 'qtyNeeded'] },
    { n: CONFIG.SHEETS.SUSPENSE, h: ['تاریخ جلالی', 'کد کالا', 'کسری موجودی موقت', 'نوع عملیات', 'ردیف منبع'] },
    { n: CONFIG.SHEETS.REPORT_INV, h: ['انبار', 'کد کالا', 'نام کالا', 'شماره بچ', 'تاریخ انقضا', 'واحد', 'موجودی', 'وزن متغیر', 'WAC', 'ارزش دفتری'] },
    { n: CONFIG.SHEETS.REPORT_DAILY, h: ['تاریخ جلالی', 'خرید روز', 'بهای تمام شده فروش (COGS)', 'هزینه تولید روز', 'ارزش ضایعات'] },
    { n: CONFIG.SHEETS.ERRORS, h: ['لاگ خطاها و هشدارها'] }
  ];

  let createdCount = 0;
  allSheets.forEach(s => {
    let sh = ss.getSheetByName(s.n);
    if (!sh) { sh = ss.insertSheet(s.n); createdCount++; }
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, s.h.length).setValues([s.h]).setFontWeight('bold').setBackground('#efefef');
      sh.setFrozenRows(1);
    }
  });
  
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && defaultSheet.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(defaultSheet);
  SpreadsheetApp.getUi().alert(`✅ محیط سیستم نسخه ۸.۰ آماده شد.\n${createdCount} شیت جدید ایجاد/بروزرسانی شد.`);
}

/* ==========================================
   2. MAIN ORCHESTRATOR
   ========================================== */
function runFinancialEngine() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const errorLog = [], suspenseLog = [];
  try {
    const rawData = loadAllData(ss, errorLog);
    const itemsMap = buildItemsMap(rawData.ITEMS, errorLog);
    const convGraph = buildConversionGraph(rawData.CONVERSIONS);
    generatePackagingBOMInternal(rawData.ITEMS, itemsMap, convGraph, errorLog);
    
    const cachedBOM = loadCachedBOM(ss);
    if (Object.keys(cachedBOM).length === 0 && rawData.PRODUCTION.length > 0) {
      throw new Error('کش BOM خالی است. لطفاً ابتدا کش را به‌روزرسانی کنید.');
    }

    const ledger = buildUnifiedLedger(rawData, cachedBOM, itemsMap, convGraph, errorLog); 
    const { inventory, dailyMetrics } = processLedgerAndAudit(ledger, itemsMap, convGraph, suspenseLog, errorLog);
    flushReports(ss, inventory, dailyMetrics, suspenseLog, errorLog, itemsMap);
    
    SpreadsheetApp.getUi().alert(`✅ محاسبات مالی (نسخه ${CONFIG.VERSION}) با موفقیت انجام شد.\nتاریخ هدف: ${dailyMetrics.targetDate}`);
  } catch (e) { logCriticalError(ss, e); }
}

/* ==========================================
   3. BOM & PACKAGING (حفظ شده از نسخه ۷.۳)
   ========================================== */
function updateBOMCache() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const errorLog = [];
  try {
    const rawData = {
      RECIPES: getSheetSafe(ss, CONFIG.SHEETS.RECIPES, ['menuCode', 'ingCode', 'qty', 'unit', 'yield'], 'menuCode'),
      CONVERSIONS: getSheetSafe(ss, CONFIG.SHEETS.CONVERSIONS, ['fromUnit', 'toUnit', 'factor'], 'fromUnit'),
      ITEMS: getSheetSafe(ss, CONFIG.SHEETS.ITEMS, ['itemCode', 'itemName', 'baseUnit', 'itemType', 'packageSize', 'parentItem', 'isCatchWeight', 'secondaryUnit'], 'itemCode')
    };
    const itemsMap = buildItemsMap(rawData.ITEMS, errorLog);
    const convGraph = buildConversionGraph(rawData.CONVERSIONS);
    generatePackagingBOMInternal(rawData.ITEMS, itemsMap, convGraph, errorLog);
    const flatBOM = buildFlatBOM(rawData.RECIPES, itemsMap, convGraph, errorLog);
    
    const cacheSh = getOrCreateSheet(ss, CONFIG.SHEETS.BOM_CACHE);
    cacheSh.clear();
    cacheSh.appendRow(['menuCode', 'ingCode', 'qtyNeeded']).setFontWeight('bold');
    const output = [];
    Object.keys(flatBOM.map).forEach(menu => {
      const ings = flatBOM.map[menu];
      Object.keys(ings).forEach(ing => output.push([menu, ing, ings[ing]]));
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

function generatePackagingBOM() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const errorLog = [];
  try {
    const rawData = {
      ITEMS: getSheetSafe(ss, CONFIG.SHEETS.ITEMS, ['itemCode', 'itemName', 'baseUnit', 'itemType', 'packageSize', 'parentItem', 'isCatchWeight', 'secondaryUnit'], 'itemCode'),
      CONVERSIONS: getSheetSafe(ss, CONFIG.SHEETS.CONVERSIONS, ['fromUnit', 'toUnit', 'factor'], 'fromUnit')
    };
    const itemsMap = buildItemsMap(rawData.ITEMS, errorLog);
    const convGraph = buildConversionGraph(rawData.CONVERSIONS);
    const generatedCount = generatePackagingBOMInternal(rawData.ITEMS, itemsMap, convGraph, errorLog);
    SpreadsheetApp.getUi().alert(`✅ ${generatedCount} فرمول بسته‌بندی به صورت خودکار تولید شد.`);
  } catch(e) { logCriticalError(ss, e); }
}

function generatePackagingBOMInternal(itemsData, itemsMap, convGraph, errorLog) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const recipesSh = getOrCreateSheet(ss, CONFIG.SHEETS.RECIPES);
  const existingRecipes = new Set();
  if (recipesSh.getLastRow() > 1) {
    const vals = recipesSh.getRange(2, 1, recipesSh.getLastRow() - 1, 2).getValues();
    vals.forEach(row => { if (row[0] && row[1]) existingRecipes.add(`${row[0]}|${row[1]}`); });
  }
  const packagedItems = itemsData.filter(item => String(item.itemType || '').toUpperCase() === CONFIG.ITEM_TYPES.PACKAGED && item.parentItem && item.packageSize);
  if (packagedItems.length === 0) return 0;
  const newRecipes = [];
  let generatedCount = 0;
  packagedItems.forEach(pkgItem => {
    const menuCode = String(pkgItem.itemCode);
    const parentCode = String(pkgItem.parentItem);
    const packageSize = parseNumber(pkgItem.packageSize);
    if (!itemsMap[parentCode]) { errorLog.push(`[خطا] کالای والد ${parentCode} برای ${menuCode} یافت نشد.`); return; }
    const parentUnit = itemsMap[parentCode].baseUnit;
    const pkgUnit = pkgItem.baseUnit || 'package';
    const recipeKey = `${menuCode}|${parentCode}`;
    if (existingRecipes.has(recipeKey)) return;
    let qtyNeeded = packageSize;
    if (pkgUnit.toLowerCase() !== parentUnit.toLowerCase()) {
      const conv = getConversion(convGraph, pkgUnit, parentUnit);
      if (conv) qtyNeeded = packageSize * conv.factor;
      else errorLog.push(`[هشدار] تبدیل ${pkgUnit} به ${parentUnit} یافت نشد.`);
    }
    newRecipes.push([menuCode, parentCode, qtyNeeded, parentUnit, 100]);
    existingRecipes.add(recipeKey);
    generatedCount++;
  });
  if (newRecipes.length > 0) {
    const lastRow = recipesSh.getLastRow();
    const startRow = lastRow === 0 ? 2 : lastRow + 1;
    if (lastRow === 0) {
      recipesSh.getRange(1, 1, 1, 5).setValues([['menuCode', 'ingCode', 'qty', 'unit', 'yield']]).setFontWeight('bold');
      recipesSh.setFrozenRows(1);
    }
    recipesSh.getRange(startRow, 1, newRecipes.length, 5).setValues(newRecipes);
  }
  return generatedCount;
}

/* ==========================================
   4. DATA LOADERS & PARSERS
   ========================================== */
function loadAllData(ss, errorLog) {
  return {
    ITEMS: getSheetSafe(ss, CONFIG.SHEETS.ITEMS, ['itemCode', 'itemName', 'baseUnit', 'itemType', 'packageSize', 'parentItem', 'isCatchWeight', 'secondaryUnit'], 'itemCode'),
    OPENING: getSheetSafe(ss, CONFIG.SHEETS.OPENING, ['itemCode', 'qty', 'wac', 'val', 'batchNumber', 'expiryDate', 'warehouseCode', 'catchWeight'], 'itemCode'),
    PURCHASES: getSheetSafe(ss, CONFIG.SHEETS.PURCHASES, ['date', 'itemCode', 'qty', 'unit', 'totalCost', 'batchNumber', 'expiryDate', 'warehouseCode', 'catchWeight'], 'itemCode'),
    PRODUCTION: getSheetSafe(ss, CONFIG.SHEETS.PRODUCTION, ['date', 'menuCode', 'qtyProduced', 'batchNumber', 'expiryDate', 'warehouseCode', 'catchWeight'], 'menuCode'),
    SALES: getSheetSafe(ss, CONFIG.SHEETS.SALES, ['date', 'itemCode', 'qty', 'batchNumber', 'warehouseCode', 'catchWeight'], 'itemCode'),
    WASTE: getSheetSafe(ss, CONFIG.SHEETS.WASTE, ['date', 'itemCode', 'qty', 'unit', 'batchNumber', 'warehouseCode'], 'itemCode'),
    STOCK: getSheetSafe(ss, CONFIG.SHEETS.STOCK, ['date', 'itemCode', 'countedQty', 'unit', 'batchNumber', 'warehouseCode'], 'itemCode')
  };
}

function parseNumber(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  let str = String(v).match(/\|\s*([^\|]+)$/)?.[1] || String(v);
  str = str.replace(/[٬،\s\u00A0]/g, '').replace(/٫/g, '.').replace(/[^\d.\-]/g, '');
  const parts = str.split('.');
  if (parts.length > 2) str = parts[0] + '.' + parts.slice(1).join('');
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
      let v = (cIdx[j] >= 0 && cIdx[j] < r.length) ? r[cIdx[j]] : '';
      if ((h === 'itemCode' || h === 'menuCode' || h === 'ingCode') && typeof v === 'string') {
        const match = v.match(/\|\s*([^\|]+)$/);
        if (match) v = match[1].trim();
      }
      obj[h] = typeof v === 'string' ? v.trim() : v;
    });
    ['qty', 'qtyProduced', 'totalCost', 'wac', 'val', 'packageSize', 'catchWeight', 'countedQty'].forEach(k => {
      if (obj[k] !== undefined) obj[k] = parseNumber(obj[k]);
    });
    return obj;
  }).filter(o => o[pKey] !== '' && o[pKey] !== null && o[pKey] !== undefined);
}

function buildItemsMap(rows) {
  const map = {};
  rows.forEach(r => {
    map[String(r.itemCode)] = { 
      itemName: r.itemName||'بدون نام', baseUnit: r.baseUnit||'',
      itemType: String(r.itemType || '').toUpperCase(),
      packageSize: parseNumber(r.packageSize), parentItem: String(r.parentItem || ''),
      isCatchWeight: String(r.isCatchWeight || '').toLowerCase() === 'true' || r.isCatchWeight === true,
      secondaryUnit: r.secondaryUnit || ''
    };
  });
  return map;
}

function buildConversionGraph(rows) {
  const g = {};
  rows.forEach(r => {
    const f = parseNumber(r.factor);
    const from = String(r.fromUnit || '').trim().toLowerCase();
    const to = String(r.toUnit || '').trim().toLowerCase();
    if (!from || !to) return;
    if(!g[from]) g[from]={}; if(!g[to]) g[to]={};
    g[from][to] = f; g[to][from] = 1/f;
  });
  return g;
}

function getConversion(g, from, to) {
  from = String(from || '').trim().toLowerCase();
  to = String(to || '').trim().toLowerCase();
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
      if (!conv) { errorLog.push(`[BOM Error] تبدیل واحد ${ing.unit} به ${tUnit} برای ${iCode} یافت نشد.`); return false; }
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
   5. LEDGER BUILDER (پشتیبانی از ابعاد جدید)
   ========================================== */
function buildUnifiedLedger(data, cachedBOM, itemsMap, convGraph, errorLog) {
  const ledger = [];
  let prodCounter = 0;
  
  const validate = (r, t) => {
    const d = parseDateStrict(r.date);
    if (!d && t !== 'OPENING') return null; 
    return { 
        date: d || 0, _row: r._sourceRow, type: t, 
        itemCode: String(r.itemCode||r.menuCode), 
        qty: parseNumber(r.qty||r.qtyProduced),
        unit: String(r.unit || '').trim(),
        batchNumber: String(r.batchNumber || 'AUTO').trim(),
        expiryDate: r.expiryDate ? parseDateStrict(r.expiryDate) : null,
        warehouseCode: String(r.warehouseCode || 'DEFAULT_WH').trim(),
        catchWeight: parseNumber(r.catchWeight)
    };
  };

  const convertToBase = (txn, originalUnit) => {
    const itemBaseUnit = itemsMap[txn.itemCode] ? itemsMap[txn.itemCode].baseUnit : '';
    originalUnit = String(originalUnit || '').trim();
    if (!originalUnit || !itemBaseUnit || originalUnit.toLowerCase() === itemBaseUnit.toLowerCase()) return txn.qty;
    const conv = getConversion(convGraph, originalUnit, itemBaseUnit);
    if (conv) return txn.qty * conv.factor;
    errorLog.push(`[هشدار تبدیل] واحد '${originalUnit}' به '${itemBaseUnit}' برای ${txn.itemCode} یافت نشد.`);
    return txn.qty;
  };

  data.OPENING.forEach(o => {
    const qty = parseNumber(o.qty);
    const val = parseNumber(o.val);
    const wac = qty > CONFIG.TOLERANCE ? (val / qty) : parseNumber(o.wac);
    ledger.push({ 
      date: 0, _row: o._sourceRow, type: 'OPENING', itemCode: String(o.itemCode), 
      qty: qty, wac: wac, val: val,
      batchNumber: String(o.batchNumber || 'OPENING_BATCH').trim(),
      expiryDate: o.expiryDate ? parseDateStrict(o.expiryDate) : null,
      warehouseCode: String(o.warehouseCode || 'DEFAULT_WH').trim(),
      catchWeight: parseNumber(o.catchWeight)
    });
  });

  data.PURCHASES.forEach(p => {
    const b = validate(p, 'PURCHASE'); 
    if(b) {
      b.qty = convertToBase(b, p.unit);
      ledger.push({ ...b, totalCost: parseNumber(p.totalCost) });
    }
  });

  data.PRODUCTION.forEach(pr => {
    const b = validate(pr, 'PRODUCTION_ADD'); 
    if(!b) return;
    prodCounter++;
    const prodId = 'PROD_' + prodCounter + '_' + b.date;
    b.productionId = prodId;
    b.qty = convertToBase(b, pr.unit);
    if(b.batchNumber === 'AUTO') b.batchNumber = 'PROD_' + prodCounter;
    ledger.push(b);
    
    const comps = cachedBOM[b.itemCode];
    if (comps) {
      for (let i in comps) {
        ledger.push({ 
            date: b.date, _row: b._row, type: 'PRODUCTION_CONSUME', 
            itemCode: i, qty: comps[i] * b.qty, productionId: prodId,
            batchNumber: 'AUTO', warehouseCode: b.warehouseCode, catchWeight: 0
        });
      }
    } else {
      errorLog.push(`[هشدار تولید] فرمول ساخت برای ${b.itemCode} یافت نشد.`);
    }
  });

  data.SALES.forEach(s => {
    const b = validate(s, 'SALE'); 
    if(b) {
      b.qty = convertToBase(b, s.unit);
      ledger.push(b);
    }
  });

  data.WASTE.forEach(w => {
    const b = validate(w, 'WASTE'); 
    if(b) {
      b.qty = convertToBase(b, w.unit);
      ledger.push(b);
    }
  });

  data.STOCK.forEach(s => {
    const b = validate(s, 'STOCK_ADJUST'); 
    if(b) {
      const tempTxn = { ...b, qty: parseNumber(s.countedQty) };
      b.countedQty = convertToBase(tempTxn, s.unit);
      b.qty = b.countedQty; 
      ledger.push(b);
    }
  });

  return ledger.sort((a, b) => 
      (a.date - b.date) || 
      ((CONFIG.TXN_ORDER[a.type]||99) - (CONFIG.TXN_ORDER[b.type]||99)) || 
      (a._row - b._row)
  );
}

/* ==========================================
   6. WAC ENGINE & FEFO LOGIC (موتور حیاتی نسخه ۸)
   ========================================== */
function processLedgerAndAudit(ledger, itemsMap, convGraph, suspenseLog, errorLog) {
  // ساختار سه بعدی موجودی: inv[warehouse][itemCode][batch]
  const inv = {}; 
  
  const getBatch = (wh, item, batch) => {
    if (!inv[wh]) inv[wh] = {};
    if (!inv[wh][item]) inv[wh][item] = {};
    if (!inv[wh][item][batch]) {
      inv[wh][item][batch] = { 
        qty: 0, catchWeight: 0, wac: 0, val: 0, expiryDate: null,
        name: itemsMap[item] ? itemsMap[item].itemName : item,
        unit: itemsMap[item] ? itemsMap[item].baseUnit : ''
      };
    }
    return inv[wh][item][batch];
  };

  let maxTime = 0;
  ledger.forEach(t => { if(t.date > maxTime) maxTime = t.date; });
  
  const aggregatedLedger = [];
  const stockAdjustMap = {};

  ledger.forEach(txn => {
    if (txn.type === 'STOCK_ADJUST') {
      const key = txn.date + '|' + txn.warehouseCode + '|' + txn.itemCode + '|' + txn.batchNumber;
      if (!stockAdjustMap[key]) {
        stockAdjustMap[key] = { 
          date: txn.date, _row: txn._row, type: 'STOCK_ADJUST', 
          warehouseCode: txn.warehouseCode, itemCode: txn.itemCode, 
          batchNumber: txn.batchNumber, countedQty: 0
        };
      }
      stockAdjustMap[key].countedQty += txn.countedQty;
    } else {
      aggregatedLedger.push(txn);
    }
  });

  Object.values(stockAdjustMap).forEach(aggTxn => aggregatedLedger.push(aggTxn));
  aggregatedLedger.sort((a, b) => (a.date - b.date) || ((CONFIG.TXN_ORDER[a.type]||99) - (CONFIG.TXN_ORDER[b.type]||99)) || (a._row - b._row));

  let daily_cogs = 0, daily_purchases = 0, daily_wasteVal = 0, daily_prodCost = 0;
  const productionCosts = {};

  aggregatedLedger.forEach(txn => {
    const wh = txn.warehouseCode || 'DEFAULT_WH';
    const item = txn.itemCode;
    const batch = txn.batchNumber || 'NO_BATCH';
    const isTargetDate = (maxTime > 0 && txn.date === maxTime);

    if (txn.type === 'OPENING') {
      const e = getBatch(wh, item, batch);
      e.qty = txn.qty; e.wac = txn.wac; e.val = txn.val;
      e.catchWeight = txn.catchWeight || 0;
      e.expiryDate = txn.expiryDate;
    }
    else if (txn.type === 'PURCHASE') {
      const e = getBatch(wh, item, batch);
      e.qty += txn.qty; 
      if(txn.catchWeight) e.catchWeight += txn.catchWeight;
      e.val += txn.totalCost;
      if (txn.expiryDate) e.expiryDate = txn.expiryDate;
      if (e.qty > CONFIG.TOLERANCE) e.wac = e.val / e.qty;
      if (isTargetDate) daily_purchases += txn.totalCost;
    } 
    else if (txn.type === 'PRODUCTION_CONSUME' || txn.type === 'SALE' || txn.type === 'WASTE') {
      let remainingQty = txn.qty;
      let remainingCatchWeight = txn.catchWeight || 0;
      
      let batches = Object.keys(inv[wh]?.[item] || {}).map(b => ({ id: b, data: inv[wh][item][b] }));
      
      // اگر بچ خاصی مشخص شده باشد، فقط از همان بچ کسر می‌شود
      if (batch && batch !== 'AUTO' && batch !== 'NO_BATCH') {
        batches = batches.filter(b => b.id === batch);
      } else {
        // الگوریتم FEFO: مرتب‌سازی بر اساس تاریخ انقضا (قدیمی‌ترین در اولویت)
        batches.sort((a, b) => {
          if (!a.data.expiryDate && !b.data.expiryDate) return 0;
          if (!a.data.expiryDate) return 1; // بدون انقضا به آخر لیست می‌رود
          if (!b.data.expiryDate) return -1;
          return a.data.expiryDate - b.data.expiryDate;
        });
      }
      
      for (let b of batches) {
        if (remainingQty <= CONFIG.TOLERANCE) break;
        let e = b.data;
        let consumeQty = Math.min(e.qty, remainingQty);
        let cost = consumeQty * e.wac;
        
        // کسر وزن متغیر به صورت تناسبی
        let consumeCatchWeight = 0;
        if (e.catchWeight > 0 && e.qty > 0) {
           let ratio = consumeQty / e.qty;
           consumeCatchWeight = e.catchWeight * ratio;
           if (remainingCatchWeight > 0) {
               consumeCatchWeight = Math.min(consumeCatchWeight, remainingCatchWeight);
           }
        }
        
        e.qty -= consumeQty;
        e.val -= cost;
        e.catchWeight -= consumeCatchWeight;
        
        remainingQty -= consumeQty;
        remainingCatchWeight -= consumeCatchWeight;
        
        if(txn.type === 'PRODUCTION_CONSUME' && txn.productionId) {
            productionCosts[txn.productionId] = (productionCosts[txn.productionId] || 0) + cost;
        }
        if (isTargetDate) {
          if (txn.type === 'SALE') daily_cogs += cost;
          else if (txn.type === 'WASTE') daily_wasteVal += cost;
          else daily_prodCost += cost;
        }
      }
      
      if (remainingQty > CONFIG.TOLERANCE) {
        checkSuspense({qty: 0}, {qty: remainingQty, type: txn.type}, suspenseLog, txn);
      }
    }
    else if (txn.type === 'PRODUCTION_ADD') {
      const e = getBatch(wh, item, batch);
      e.qty += txn.qty; 
      if(txn.catchWeight) e.catchWeight += txn.catchWeight;
      if (txn.expiryDate) e.expiryDate = txn.expiryDate;
      
      const consumedCost = productionCosts[txn.productionId] || 0;
      e.val += consumedCost;
      if (e.qty > CONFIG.TOLERANCE) e.wac = e.val / e.qty;
    }
    else if (txn.type === 'STOCK_ADJUST') {
      const e = getBatch(wh, item, batch);
      const currentQty = e.qty;
      const countedQty = txn.countedQty;
      const variance = countedQty - currentQty;
      
      if (variance > CONFIG.TOLERANCE) {
          e.qty += variance;
          e.val += variance * e.wac;
          if (e.qty > CONFIG.TOLERANCE) e.wac = e.val / e.qty;
      } else if (variance < -CONFIG.TOLERANCE) {
          const absVariance = Math.abs(variance);
          const cost = absVariance * e.wac;
          e.qty -= absVariance; 
          e.val -= cost;
          checkSuspense(e, {qty: absVariance, type: 'STOCK_SHORTAGE'}, suspenseLog, txn);
      }
    }
    
    if (inv[wh]?.[item]?.[batch]) {
        let e = inv[wh][item][batch];
        if (Math.abs(e.qty) < CONFIG.TOLERANCE) { e.qty = 0; e.val = 0; e.catchWeight = 0; }
    }
  });

  const metrics = { 
      targetDate: maxTime > 0 ? formatDateJalali(new Date(maxTime)) : 'نامشخص', 
      targetTimestamp: maxTime, estCogs: daily_cogs, purchases: daily_purchases,
      prodCost: daily_prodCost, wasteVal: daily_wasteVal
  };
  
  return { inventory: inv, dailyMetrics: metrics };
}

function checkSuspense(entry, txn, suspenseLog, originalTxn) {
  let deficit = txn.qty;
  let jalaliDate = 'نامشخص';
  let sourceRow = '?';
  let type = txn.type || 'UNKNOWN';
  
  if (originalTxn) {
    jalaliDate = originalTxn.date > 0 ? formatDateJalali(new Date(originalTxn.date)) : 'نامشخص';
    sourceRow = originalTxn._row || '?';
  }

  suspenseLog.push([
    jalaliDate, originalTxn ? originalTxn.itemCode : 'نامشخص',
    Number(deficit.toFixed(CONFIG.ROUND_QTY)), type, 'ردیف ' + sourceRow
  ]);
}

/* ==========================================
   7. REPORTS EXPORTER (خروجی سه بعدی)
   ========================================== */
function flushReports(ss, inv, metrics, suspenseLog, errorLog, itemsMap) {
  const rSh = getOrCreateSheet(ss, CONFIG.SHEETS.REPORT_INV);
  rSh.clear();
  const h = ['انبار', 'کد کالا', 'نام کالا', 'شماره بچ', 'تاریخ انقضا', 'واحد', 'موجودی', 'وزن متغیر', 'WAC', 'ارزش دفتری'];
  rSh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
  
  const rows = [];
  for (let wh in inv) {
    for (let item in inv[wh]) {
      for (let batch in inv[wh][item]) {
        let e = inv[wh][item][batch];
        if (Math.abs(e.qty) < CONFIG.TOLERANCE && Math.abs(e.val) < CONFIG.TOLERANCE) continue;
        
        let expiryStr = 'بدون انقضا';
        if (e.expiryDate) expiryStr = formatDateJalali(new Date(e.expiryDate));
        
        rows.push([
          wh, item, e.name, batch, expiryStr, e.unit,
          Number(e.qty.toFixed(CONFIG.ROUND_QTY)), 
          Number(e.catchWeight.toFixed(CONFIG.ROUND_QTY)),
          Number(e.wac.toFixed(CONFIG.ROUND_MONEY)), 
          Number(e.val.toFixed(CONFIG.ROUND_MONEY))
        ]);
      }
    }
  }
  if (rows.length) rSh.getRange(2, 1, rows.length, h.length).setValues(rows);

  const sSh = getOrCreateSheet(ss, CONFIG.SHEETS.SUSPENSE);
  sSh.clear();
  const sHead = ['تاریخ جلالی', 'کد کالا', 'کسری موجودی موقت', 'نوع عملیات', 'ردیف منبع'];
  sSh.getRange(1, 1, 1, sHead.length).setValues([sHead]).setBackground('#ffeb3b');
  if(suspenseLog.length) sSh.getRange(2, 1, suspenseLog.length, sHead.length).setValues(suspenseLog);

  const dSh = getOrCreateSheet(ss, CONFIG.SHEETS.REPORT_DAILY);
  dSh.clear();
  const dHead = ['تاریخ جلالی', 'خرید روز', 'بهای تمام شده فروش (COGS)', 'هزینه تولید روز', 'ارزش ضایعات'];
  dSh.getRange(1, 1, 1, dHead.length).setValues([dHead]).setFontWeight('bold').setBackground('#e0f7fa');
  dSh.getRange(2, 1, 1, dHead.length).setValues([[
      metrics.targetDate, Number(metrics.purchases.toFixed(CONFIG.ROUND_MONEY)), 
      Number(metrics.estCogs.toFixed(CONFIG.ROUND_MONEY)), Number(metrics.prodCost.toFixed(CONFIG.ROUND_MONEY)),
      Number(metrics.wasteVal.toFixed(CONFIG.ROUND_MONEY))
  ]]);

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
   8. WEB APP & DATA VALIDATION (لیست‌های کشویی هوشمند)
   ========================================== */
function setupDataValidation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  let appliedCount = 0;

  // Helper to apply validation to a specific column
  function applyValidation(sheet, colName, rule) {
    if (!sheet) return false;
    const lastCol = sheet.getLastColumn() || 1;
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const colIdx = headers.indexOf(colName);
    if (colIdx !== -1) {
      sheet.getRange(2, colIdx + 1, Math.max(sheet.getMaxRows(), 1000) - 1, 1).setDataValidation(rule);
      return true;
    }
    return false;
  }

  // Helper to get unique values from a column across multiple sheets
  function getUniqueValues(sheetNames, colName) {
    let values = new Set();
    sheetNames.forEach(name => {
      const sh = ss.getSheetByName(name);
      if (sh && sh.getLastRow() > 1) {
        const lastCol = sh.getLastColumn() || 1;
        const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
        const colIdx = headers.indexOf(colName);
        if (colIdx !== -1) {
          const vals = sh.getRange(2, colIdx + 1, sh.getLastRow() - 1, 1).getValues();
          vals.forEach(v => {
            if (v[0] !== '' && v[0] !== null && v[0] !== undefined) {
              values.add(String(v[0]).trim());
            }
          });
        }
      }
    });
    return Array.from(values);
  }

  // 1. Item Codes (displayName: Name | Code)
  const itemsSh = ss.getSheetByName(CONFIG.SHEETS.ITEMS);
  if (itemsSh && itemsSh.getLastRow() >= 2) {
    const lastRow = itemsSh.getLastRow();
    const lastCol = itemsSh.getLastColumn() || 1;
    const headers = itemsSh.getRange(1, 1, 1, lastCol).getValues()[0];
    let displayNameCol = headers.indexOf('displayName');
    if (displayNameCol === -1) {
      displayNameCol = lastCol;
      itemsSh.getRange(1, displayNameCol + 1).setValue('displayName').setFontWeight('bold');
    }
    for (let i = 2; i <= lastRow; i++) {
      const code = itemsSh.getRange(i, 1).getValue();
      const name = itemsSh.getRange(i, 2).getValue();
      if (code && name) itemsSh.getRange(i, displayNameCol + 1).setValue(`${name} | ${code}`);
    }
    const displayRange = itemsSh.getRange(2, displayNameCol + 1, lastRow - 1, 1);
    const itemRule = SpreadsheetApp.newDataValidation().requireValueInRange(displayRange, true).setAllowInvalid(false).build();
    
    const itemTargets = [
      { sheet: CONFIG.SHEETS.PURCHASES, col: 'itemCode' }, { sheet: CONFIG.SHEETS.SALES, col: 'itemCode' },
      { sheet: CONFIG.SHEETS.WASTE, col: 'itemCode' }, { sheet: CONFIG.SHEETS.STOCK, col: 'itemCode' },
      { sheet: CONFIG.SHEETS.OPENING, col: 'itemCode' }, { sheet: CONFIG.SHEETS.PRODUCTION, col: 'menuCode' },
      { sheet: CONFIG.SHEETS.RECIPES, col: 'menuCode' }, { sheet: CONFIG.SHEETS.RECIPES, col: 'ingCode' }
    ];
    
    itemTargets.forEach(t => {
      if (applyValidation(ss.getSheetByName(t.sheet), t.col, itemRule)) appliedCount++;
    });
  }

  // 2. Item Type in ITEMS
  if (itemsSh) {
    const typeRule = SpreadsheetApp.newDataValidation().requireValueInList(Object.values(CONFIG.ITEM_TYPES), true).build();
    if (applyValidation(itemsSh, 'itemType', typeRule)) appliedCount++;
  }

  // 3. Is Catch Weight in ITEMS
  if (itemsSh) {
    const boolRule = SpreadsheetApp.newDataValidation().requireValueInList(['TRUE', 'FALSE'], true).build();
    if (applyValidation(itemsSh, 'isCatchWeight', boolRule)) appliedCount++;
  }

  // 4. Parent Item in ITEMS (List of itemCodes)
  if (itemsSh && itemsSh.getLastRow() >= 2) {
    const codeRange = itemsSh.getRange(2, 1, itemsSh.getLastRow() - 1, 1);
    const parentRule = SpreadsheetApp.newDataValidation().requireValueInRange(codeRange, true).setAllowInvalid(false).build();
    if (applyValidation(itemsSh, 'parentItem', parentRule)) appliedCount++;
  }

  // 5. Units (baseUnit, secondaryUnit, fromUnit, toUnit, unit)
  let units = getUniqueValues([CONFIG.SHEETS.CONVERSIONS], 'fromUnit');
  let unitsTo = getUniqueValues([CONFIG.SHEETS.CONVERSIONS], 'toUnit');
  units = [...new Set([...units, ...unitsTo])];
  if (units.length === 0) {
    units = ['kg', 'g', 'pcs', 'box', 'ltr', 'ml']; // Default units if CONVERSIONS is empty
  }
  const unitRule = SpreadsheetApp.newDataValidation().requireValueInList(units, true).setAllowInvalid(false).build();
  
  const unitTargets = [
    { sheet: CONFIG.SHEETS.ITEMS, col: 'baseUnit' },
    { sheet: CONFIG.SHEETS.ITEMS, col: 'secondaryUnit' },
    { sheet: CONFIG.SHEETS.CONVERSIONS, col: 'fromUnit' },
    { sheet: CONFIG.SHEETS.CONVERSIONS, col: 'toUnit' },
    { sheet: CONFIG.SHEETS.PURCHASES, col: 'unit' },
    { sheet: CONFIG.SHEETS.WASTE, col: 'unit' },
    { sheet: CONFIG.SHEETS.STOCK, col: 'unit' }
  ];
  unitTargets.forEach(t => {
    if (applyValidation(ss.getSheetByName(t.sheet), t.col, unitRule)) appliedCount++;
  });

  // 6. Warehouse Codes
  let warehouses = getUniqueValues([
    CONFIG.SHEETS.PURCHASES, CONFIG.SHEETS.PRODUCTION, CONFIG.SHEETS.SALES, 
    CONFIG.SHEETS.WASTE, CONFIG.SHEETS.STOCK, CONFIG.SHEETS.OPENING
  ], 'warehouseCode');
  
  if (warehouses.length === 0) {
    warehouses = ['DEFAULT_WH', 'MAIN_WH', 'COLD_STORAGE']; // Default warehouses
  }
  const whRule = SpreadsheetApp.newDataValidation().requireValueInList(warehouses, true).setAllowInvalid(false).build();
  
  const whTargets = [
    { sheet: CONFIG.SHEETS.PURCHASES, col: 'warehouseCode' },
    { sheet: CONFIG.SHEETS.PRODUCTION, col: 'warehouseCode' },
    { sheet: CONFIG.SHEETS.SALES, col: 'warehouseCode' },
    { sheet: CONFIG.SHEETS.WASTE, col: 'warehouseCode' },
    { sheet: CONFIG.SHEETS.STOCK, col: 'warehouseCode' },
    { sheet: CONFIG.SHEETS.OPENING, col: 'warehouseCode' }
  ];
  whTargets.forEach(t => {
    if (applyValidation(ss.getSheetByName(t.sheet), t.col, whRule)) appliedCount++;
  });

  ui.alert(`✅ لیست‌های کشویی روی ${appliedCount} ستون اعمال شد.\nموارد شامل: کد کالا، نوع کالا، واحد اندازه‌گیری، انبار و...`);
}

function onEdit(e) {
  if (!e || !e.range || !e.value) return;
  const sheet = e.source.getActiveSheet();
  const row = e.range.getRow();
  const col = e.range.getColumn();
  if (row < 2) return;
  const targetSheets = [CONFIG.SHEETS.PURCHASES, CONFIG.SHEETS.PRODUCTION, CONFIG.SHEETS.SALES, CONFIG.SHEETS.WASTE, CONFIG.SHEETS.STOCK];
  if (!targetSheets.includes(sheet.getName())) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const dateColIdx = headers.indexOf('date');
  const jalaliColIdx = headers.indexOf('jalaliDate');
  const expiryColIdx = headers.indexOf('expiryDate');
  
  if (col - 1 === jalaliColIdx || col - 1 === expiryColIdx) {
    const jalaliInput = String(e.value).trim();
    if (!jalaliInput) {
      if (col - 1 === jalaliColIdx) sheet.getRange(row, dateColIdx + 1).clearContent();
      else sheet.getRange(row, col).clearContent();
      return;
    }
    const gregorianDate = convertJalaliToGregorian(jalaliInput);
    if (gregorianDate) {
      if (col - 1 === jalaliColIdx) {
        sheet.getRange(row, dateColIdx + 1).setValue(gregorianDate).setNumberFormat('yyyy/mm/dd');
      } else {
        sheet.getRange(row, col).setValue(gregorianDate).setNumberFormat('yyyy/mm/dd');
      }
    } else {
      SpreadsheetApp.getActive().toast(`فرمت تاریخ جلالی نامعتبر: ${jalaliInput}`, "⚠️ خطا", 5);
    }
  }
}