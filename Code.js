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

/**
 * 🛡️ تابع استانداردسازی متن (تبدیل حروف عربی به فارسی و حذف کاراکترهای مخفی)
 */
function normalizeText(text) {
  if (!text) return '';
  let str = String(text).trim();
  
  // 1. تبدیل حروف عربی به معادل فارسی
  str = str.replace(/[\u064A\u0649]/g, 'ی'); // ي و ى عربی -> ی فارسی
  str = str.replace(/[\u0643]/g, 'ک');       // ك عربی -> ک فارسی
  str = str.replace(/[\u0629]/g, 'ه');       // ة عربی -> ه فارسی
  
  // 2. حذف نیم‌فاصله (ZWNJ) و یکپارچه‌سازی فاصله‌ها
  str = str.replace(/\u200C/g, ' '); // تبدیل نیم‌فاصله به فاصله معمولی
  str = str.replace(/\s+/g, ' ').trim(); // تبدیل چند فاصله متوالی به یک فاصله
  
  // 3. تبدیل حروف بزرگ انگلیسی به کوچک (برای یکپارچگی)
  return str.toLowerCase();
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
    .addItem('📖 ایجاد راهنمای کدگذاری (Coding Guide)', 'createCodingGuideSheet')
    .addSeparator()
    
    // 📥 زیرمنوی وارد کردن داده‌های خارجی
    .addSubMenu(SpreadsheetApp.getUi().createMenu('📥 وارد کردن داده‌های خارجی')
      .addItem('🧾 انتقال فروش + افزودن کالاهای جدید', 'importSalesDataToTargetSheet')
      .addItem('🆕 فقط افزودن کالاهای جدید به ITEMS (بدون انتقال)', 'syncNewItemsOnly')
    )
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
  let appliedCount = 0;

  // تابع کمکی ایمن برای اعمال اعتبارسنجی فقط روی ستون مشخص شده توسط نام هدر
  function applyValidation(sheetName, colName, rule) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return false;
    
    const lastCol = sheet.getLastColumn() || 1;
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const colIdx = headers.indexOf(colName);
    
    // فقط اگر ستون پیدا شد عمل کن (جلوگیری از اعمال روی ستون A در صورت عدم یافتن هدر)
    if (colIdx !== -1) {
      // اعمال قانون از ردیف 2 تا (آخرین ردیف داده + 500 ردیف حاشیه امن)
      const targetRows = Math.max(sheet.getLastRow(), 100) + 500;
      sheet.getRange(2, colIdx + 1, targetRows, 1).setDataValidation(rule);
      return true;
    }
    return false;
  }

  // تابع کمکی برای دریافت مقادیر یکتا از یک ستون خاص
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

  // 1. اعتبارسنجی کدهای کالا (از طریق displayName)
  const itemsSh = ss.getSheetByName('ITEMS');
  let displayRange = null;
  
  if (itemsSh && itemsSh.getLastRow() >= 2) {
    const lastRow = itemsSh.getLastRow();
    const lastCol = itemsSh.getLastColumn() || 1;
    const headers = itemsSh.getRange(1, 1, 1, lastCol).getValues()[0];
    let displayNameCol = headers.indexOf('displayName');
    
    if (displayNameCol === -1) {
      displayNameCol = lastCol;
      itemsSh.getRange(1, displayNameCol + 1).setValue('displayName').setFontWeight('bold');
    }
    
    // به‌روزرسانی displayName برای اطمینان از صحت
    for (let i = 2; i <= lastRow; i++) {
      const code = itemsSh.getRange(i, 1).getValue();
      const name = itemsSh.getRange(i, 2).getValue();
      if (code && name) itemsSh.getRange(i, displayNameCol + 1).setValue(`${name} | ${code}`);
    }
    
    displayRange = itemsSh.getRange(2, displayNameCol + 1, lastRow - 1, 1);
    const itemRule = SpreadsheetApp.newDataValidation().requireValueInRange(displayRange, true).setAllowInvalid(false).build();
    
    const itemTargets = [
      { sheet: 'PURCHASES', col: 'itemCode' }, { sheet: 'SALES', col: 'itemCode' },
      { sheet: 'WASTE', col: 'itemCode' }, { sheet: 'STOCK', col: 'itemCode' },
      { sheet: 'OPENING_BALANCES', col: 'itemCode' }, { sheet: 'PRODUCTION', col: 'menuCode' },
      { sheet: 'RECIPES', col: 'menuCode' }, { sheet: 'RECIPES', col: 'ingCode' }
    ];
    
    itemTargets.forEach(t => {
      if (applyValidation(t.sheet, t.col, itemRule)) appliedCount++;
    });
  }

  // 2. واحدهای اندازه‌گیری (Units)
  let units = getUniqueValues(['CONVERSIONS'], 'fromUnit');
  let unitsTo = getUniqueValues(['CONVERSIONS'], 'toUnit');
  units = [...new Set([...units, ...unitsTo, 'kg', 'g', 'ltr', 'ml', 'pcs', 'box', 'عدد', 'بسته', 'كيلو', 'گرم'])];
  
  const unitRule = SpreadsheetApp.newDataValidation().requireValueInList(units, true).setAllowInvalid(false).build();
  
  const unitTargets = [
    { sheet: 'ITEMS', col: 'baseUnit' }, { sheet: 'ITEMS', col: 'secondaryUnit' },
    { sheet: 'CONVERSIONS', col: 'fromUnit' }, { sheet: 'CONVERSIONS', col: 'toUnit' },
    { sheet: 'PURCHASES', col: 'unit' }, { sheet: 'WASTE', col: 'unit' }, { sheet: 'STOCK', col: 'unit' }
  ];
  unitTargets.forEach(t => {
    if (applyValidation(t.sheet, t.col, unitRule)) appliedCount++;
  });

  // 3. کدهای انبار (Warehouse Codes)
  let warehouses = getUniqueValues(['PURCHASES', 'PRODUCTION', 'SALES', 'WASTE', 'STOCK', 'OPENING_BALANCES'], 'warehouseCode');
  if (warehouses.length === 0) {
    warehouses = ['DEFAULT_WH', 'MAIN_WH', 'COLD_STORAGE', 'انبار اصلی'];
  }
  const whRule = SpreadsheetApp.newDataValidation().requireValueInList(warehouses, true).setAllowInvalid(false).build();
  
  const whTargets = [
    { sheet: 'PURCHASES', col: 'warehouseCode' }, { sheet: 'PRODUCTION', col: 'warehouseCode' },
    { sheet: 'SALES', col: 'warehouseCode' }, { sheet: 'WASTE', col: 'warehouseCode' },
    { sheet: 'STOCK', col: 'warehouseCode' }, { sheet: 'OPENING_BALANCES', col: 'warehouseCode' }
  ];
  whTargets.forEach(t => {
    if (applyValidation(t.sheet, t.col, whRule)) appliedCount++;
  });

  // 4. نوع کالا و وزن متغیر در ITEMS
  if (itemsSh) {
    const typeRule = SpreadsheetApp.newDataValidation().requireValueInList(['RAW', 'PACKAGED', 'PRODUCT'], true).build();
    if (applyValidation('ITEMS', 'itemType', typeRule)) appliedCount++;
    
    const boolRule = SpreadsheetApp.newDataValidation().requireValueInList(['TRUE', 'FALSE'], true).build();
    if (applyValidation('ITEMS', 'isCatchWeight', boolRule)) appliedCount++;
  }

  SpreadsheetApp.getUi().alert(`✅ لیست‌های کشویی روی ${appliedCount} ستون به صورت ایمن و دقیق اعمال شد.`);
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

/* ==========================================
   9. CODING GUIDE GENERATOR (راهنمای کدگذاری)
   ========================================== */
/* ==========================================
   9. CODING GUIDE GENERATOR (راهنمای کدگذاری - نسخه نهایی و هوشمند)
   ========================================== */
/* ==========================================
   9. CODING GUIDE GENERATOR (راهنمای کدگذاری - نسخه نهایی و هوشمند)
   ========================================== */
function createCodingGuideSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  
  // حذف شیت قدیمی در صورت وجود برای بازسازی تمیز
  const oldSheet = ss.getSheetByName('CODING_GUIDE');
  if (oldSheet) ss.deleteSheet(oldSheet);
  
  const sheet = ss.insertSheet('CODING_GUIDE');
  
  // داده‌های راهنما (به‌روزرسانی شده با دسته‌های جدید FP, PR, TR, BK)
  const data = [
    ["دیکشنری جامع کدگذاری اقلام (ERP Coding Dictionary)", "", ""],
    ["ساختار کلی کد:   T - CC - SS - NNN   (نوع - دسته اصلی - زیردسته - شماره ترتیبی)", "", ""],
    ["", "", ""],
    ["1️⃣ بخش اول: نوع کالا (Type) - حرف اول کد", "", ""],
    ["کد (T)", "توضیح کامل", "مثال کاربردی"],
    ["R", "Raw Material (مواد اولیه و خوراکی)", "R-ME-BF-001 (راسته گوساله)"],
    ["P", "Packaging (ملزومات بسته‌بندی و یکبار مصرف)", "P-PK-BX-001 (جعبه ساندویچ)"],
    ["C", "Cleaning & Hygiene (شوینده، بهداشتی و نظافت)", "C-CL-DC-004 (مایع ظرفشویی)"],
    ["H", "Hookah & Lounge (ملزومات قلیان و لانژ)", "H-HK-TB-001 (تنباکو لاو)"],
    ["F", "Finished Product (محصول نهایی / غذای آماده سرو)", "F-DR-BK-001 (کیک روز)"],
    ["", "", ""],
    ["2️⃣ بخش دوم و سوم: دسته اصلی (CC) و زیردسته (SS)", "", ""],
    ["🥩 گروه ME: گوشت و پروتئین", "", ""],
    ["BF", "گوساله (Beef)", "R-ME-BF-004 (فیله گوساله)"],
    ["LM", "گوسفندی (Lamb/Mutton)", "R-ME-LM-003 (شیشلیک گوسفندی)"],
    ["PO", "طیور / مرغ (Poultry)", "R-ME-PO-001 (سینه مرغ)"],
    ["SF", "دریایی / ماهی و میگو (Seafood)", "R-ME-SF-001 (میگو منجمد)"],
    ["PR", "فرآوری‌شده گوشتی (Processed)", "R-ME-PR-005 (سوسیس المانی)"],
    ["🧀 گروه DA: لبنیات و تخم‌مرغ", "", ""],
    ["CH", "پنیر (Cheese)", "R-DA-CH-001 (پنیر پارمسان)"],
    ["MK", "شیر و خامه (Milk/Cream)", "R-DA-MK-001 (خامه پرچرب)"],
    ["YG", "ماست و لبنه (Yogurt)", "R-DA-YG-002 (ماست چکیده)"],
    ["EG", "تخم‌مرغ (Eggs)", "R-DA-EG-001 (تخم مرغ)"],
    ["🥬 گروه PR: میوه و سبزیجات", "", ""],
    ["VG", "سبزیجات تازه (Vegetables)", "R-PR-VG-001 (پیاز زرد)"],
    ["FR", "میوه تازه (Fruits)", "R-PR-FR-002 (موز)"],
    ["HB", "سبزیجات معطر و خوردنی (Herbs)", "R-PR-HB-001 (سبزی پیازچه)"],
    ["FZ", "میوه/سبزی منجمد خام (Frozen Raw)", "R-PR-FZ-001 (توت فرنگی منجمد)"],
    ["🏺 گروه DR: خشکبار، غلات و اقلام انبار", "", ""],
    ["FP", "اقلام نیمه‌آماده منجمد (Frozen Prepared)", "R-DR-FP-001 (سیب‌زمینی خلالی شرکتی)"],
    ["PR", "مواد آماده‌سازی شده (Prepared)", "R-DR-PR-001 (پیاز داغ)"],
    ["SP", "ادویه‌جات (Spices)", "R-DR-SP-001 (ادویه کاری)"],
    ["SY", "سس‌ها و چاشنی‌ها (Sauces/Syrups)", "R-DR-SY-011 (رب گوجه فرنگی)"],
    ["CN", "کنسرو و شیشه‌ای (Canned/Jarred)", "R-DR-CN-003 (کنسرو تن ماهی)"],
    ["GR", "غلات، حبوبات و ماکارونی (Grains)", "R-DR-GR-006 (برنج ایرانی)"],
    ["FL", "آرد و اقلام قنادی (Flour/Baking)", "R-DR-FL-005 (آرد قنادی سه صفر)"],
    ["SW", "آجیل، خشکبار و تنقلات (Snacks/Nuts)", "R-DR-SW-001 (مغز گردو)"],
    ["OI", "روغن‌ها (Oils)", "R-DR-OI-001 (روغن سرخ کردنی)"],
    ["BR", "نان‌ها (Bread)", "R-DR-BR-004 (نان لواش)"],
    ["🥤 گروه BV: نوشیدنی‌ها", "", ""],
    ["SD", "نوشابه و دلستر (Soft Drinks)", "R-BV-SD-001 (نوشابه قوطی فانتا)"],
    ["JC", "آبمیوه و دوغ (Juices)", "R-BV-JC-001 (آب انار)"],
    ["WT", "آب و یخ (Water)", "R-BV-WT-001 (آب معدنی بزرگ)"],
    ["CF", "قهوه، چای و ملزومات دم‌آوری (Coffee/Tea)", "R-BV-CF-009 (دان قهوه)"],
    ["EN", "نوشیدنی انرژی‌زا (Energy)", "R-BV-EN-001 (انرژی زا نایت کینگ)"],
    ["SY", "سیروپ‌ها و عرقیات (Syrups/Extracts)", "R-BV-SY-001 (سیروپ پشن فروت)"],
    ["📦 گروه PK: بسته‌بندی (پیشوند P)", "", ""],
    ["BX", "جعبه و کارتن (Boxes)", "P-PK-BX-001 (جعبه ساندویچ)"],
    ["BG", "کیسه و پاکت (Bags)", "P-PK-BG-001 (کیسه دسته دار)"],
    ["CT", "ظروف یکبار مصرف (Containers)", "P-PK-CT-001 (ظرف آلومینیوم)"],
    ["TR", "سینی و زیردستی (Trays)", "P-PK-TR-001 (سینی شیرینگ بیرون بر)"],
    ["UT", "ملزومات سرو و خوردن (Utensils)", "P-PK-UT-002 (قاشق یکبار مصرف)"],
    ["LB", "لیبل، سلفون و فویل (Labels/Films)", "P-PK-LB-003 (سلفون)"],
    ["🧼 گروه CL: شوینده و بهداشتی (پیشوند C)", "", ""],
    ["DC", "مواد شوینده و شیمیایی (Detergents)", "C-CL-DC-004 (مایع ظرفشویی)"],
    ["GL", "دستکش‌ها (Gloves)", "C-CL-GL-002 (دستکش لاتکس)"],
    ["PP", "محصولات کاغذی (Paper Products)", "C-CL-PP-002 (دستمال رولی بزرگ)"],
    ["MT", "ابزار و ملزومات نظافت (Tools)", "C-CL-MT-005 (جارو و خاک انداز)"],
    ["🪩 گروه HK: قلیان و لانژ (پیشوند H)", "", ""],
    ["TB", "تنباکو (Tobacco)", "H-HK-TB-001 (تنباکو لاو)"],
    ["AC", "لوازم جانبی قلیان (Accessories)", "H-HK-AC-001 (شلنگ قلیان)"],
    ["CH", "زغال و مشتقات (Charcoal)", "H-HK-CH-001 (زغال)"],
    ["🥐 گروه BK: محصولات پخت روز (پیشوند F)", "", ""],
    ["BK", "شیرینی و کیک آماده سرو (Baked)", "F-DR-BK-001 (کیک روز)"],
    ["", "", ""],
    ["3️⃣ بخش چهارم: شماره ترتیبی (Sequence) - NNN", "", ""],
    ["قانون", "توضیح", "مثال"],
    ["1", "همیشه ۳ رقمی است (از 001 تا 999).", "001, 042, 105"],
    ["2", "استفاده از صفرهای پیشرو (Leading Zeros) الزامی است.", "✅ 001 | ❌ 1"],
    ["", "", ""],
    ["⚠️ ۴ قانون طلایی نگهداری دیتابیس کالا", "", ""],
    ["1", "کد هرگز تغییر نمی‌کند: حتی اگر نام کالا عوض شد، کد ثابت می‌ماند.", ""],
    ["2", "یک کالا = یک کد: هرگز دو کد متفاوت برای یک کالای یکسان نسازید.", ""],
    ["3", "واحدهای اندازه‌گیری (Unit) را استاندارد کنید (مثلاً گوشت همیشه kg).", ""],
    ["4", "ستون isCatchWeight: برای کالاهایی با وزن متغیر (گوشت، سبزی) حتماً TRUE باشد.", ""]
  ];

  // نوشتن داده‌ها در شیت
  const lastRow = data.length;
  sheet.getRange(1, 1, lastRow, 3).setValues(data);

  // --- قالب‌بندی هوشمند و حرفه‌ای (Smart Professional Formatting) ---
  
  // 1. تنظیمات پایه
  sheet.setColumnWidth(1, 110); // ستون کد
  sheet.setColumnWidth(2, 420); // ستون توضیح
  sheet.setColumnWidth(3, 280); // ستون مثال
  sheet.setRightToLeft(true); // راست‌چین کردن کل شیت
  sheet.setFrozenRows(2); // فریز کردن دو ردیف اول

  // 2. حلقه هوشمند فرمت‌بندی بر اساس محتوا
  for (let i = 1; i <= lastRow; i++) {
    let col1 = sheet.getRange(i, 1).getValue().toString().trim();
    let rowRange = sheet.getRange(i, 1, 1, 3);

    // عنوان اصلی (ردیف 1)
    if (i === 1) {
      rowRange.merge();
      rowRange.setFontWeight('bold').setFontSize(16).setFontColor('#ffffff')
                .setHorizontalAlignment('center').setVerticalAlignment('middle')
                .setBackground('#1a73e8'); // آبی گوگل
    }
    // زیرعنوان ساختار (ردیف 2)
    else if (i === 2) {
      rowRange.merge();
      rowRange.setFontWeight('bold').setFontSize(12).setFontColor('#1a73e8')
                .setHorizontalAlignment('center').setBackground('#e8f0fe');
    }
    // هدرهای بخش‌های اصلی (شماره‌دار با ایموجی)
    else if (col1.match(/^[1-4]️⃣/) || col1.includes("⚠️")) {
      rowRange.merge();
      let bgColor = col1.includes("⚠️") ? '#fce8e6' : '#d9ead3'; // قرمز روشن برای هشدار، سبز برای بخش‌ها
      let fontColor = col1.includes("⚠️") ? '#b0080d' : '#0d652d';
      rowRange.setFontWeight('bold').setFontSize(12).setFontColor(fontColor)
                .setHorizontalAlignment('right').setBackground(bgColor);
    }
    // هدرهای دسته‌بندی (شروع با ایموجی)
    else if (col1.match(/^[🥩🧀🥬🏺🥤📦🧼🪩🥐]/)) {
      rowRange.merge();
      rowRange.setFontWeight('bold').setFontSize(11).setFontColor('#0d652d')
                .setHorizontalAlignment('right').setBackground('#e6f4ea');
    }
    // هدرهای جداول داخلی (شامل کلمه "کد" یا "قانون")
    else if (col1.includes("کد (") || col1 === "قانون") {
      rowRange.setFontWeight('bold').setFontSize(10).setFontColor('#202124')
                .setHorizontalAlignment('center').setBackground('#f3f3f3')
                .setBorder(true, true, true, true, true, true, '#b7b7b7', SpreadsheetApp.BorderStyle.SOLID);
    }
    // ردیف‌های داده (کدهای 1 یا 2 حرفی، یا اعداد قوانین)
    else if (col1.match(/^[A-Z]{1,2}$/) || col1.match(/^\d+$/)) {
      // ستون 1 (کد/شماره): وسط‌چین، فونت کد
      sheet.getRange(i, 1).setHorizontalAlignment('center').setFontFamily('Courier New, monospace')
           .setFontWeight('bold').setFontColor(col1.match(/^\d+$/) ? '#202124' : '#d93025');
      
      // ستون 2 (توضیح): راست‌چین
      sheet.getRange(i, 2).setHorizontalAlignment('right');
      
      // ستون 3 (مثال): راست‌چین، فونت کد
      sheet.getRange(i, 3).setHorizontalAlignment('right').setFontFamily('Courier New, monospace')
           .setFontColor('#188038');
      
      // خط جداکننده ملایم پایین ردیف
      rowRange.setBorder(false, false, true, false, false, false, '#e0e0e0', SpreadsheetApp.BorderStyle.SOLID);
    }
  }

  // 3. محافظت از شیت (فقط مالک می‌تواند ویرایش کند)
  const protection = sheet.protect().setDescription('Coding Guide Protection');
  protection.removeEditors(protection.getEditors());
  if (protection.canDomainEdit()) {
    protection.setDomainEdit(false);
  }

  SpreadsheetApp.getUi().alert('✅ شیت راهنمای کدگذاری (CODING_GUIDE) با موفقیت، با فرمت هوشمند و دسته‌بندی‌های جدید ایجاد شد.');
}