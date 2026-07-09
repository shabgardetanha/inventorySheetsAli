/**
 * 📄 فایل: ImportSalesData.gs
 * 📝 توضیحات: اسکریپت ETL برای استخراج، تبدیل و بارگذاری داده‌های فروش
 * 🆕 نسخه 3.0 - پشتیبانی از فرمت‌های مختلف داده با ستون‌های اختیاری
 */

const IMPORT_SALES_CONFIG = {
  SOURCE_SHEET: 'import_items',
  TARGET_SHEET: 'SALES',
  
  // 🆕 ستون‌های اجباری (حداقل این‌ها باید باشند)
  REQUIRED_COLS: ['کد کالا', 'نام کالا', 'تعداد'],
  
  // 🆕 ستون‌های اختیاری با مقدار پیش‌فرض
  OPTIONAL_COLS: {
    'تاريخ': null, // اگر نبود، از تاریخ امروز استفاده می‌شود
    'شماره فاکتور': null, // اگر نبود، خودکار تولید می‌شود
    'کد انبار': 'DEFAULT_WH', // اگر نبود، انبار پیش‌فرض
    'نام واحد': 'عدد',
    'قيمت': 0
  }
};

function importSalesDataToTargetSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  
  // 🆕 پیام تأیید قبل از شروع
  const response = ui.alert(
    '⚠️ هشدار فرمت تاریخ',
    'قبل از ادامه، لطفاً مطمئن شوید که:\n\n' +
    '✅ ستون "تاریخ" در شیت import_items به صورت TEXT فرمت شده است.\n\n' +
    '💡 برای تنظیم:\n' +
    '1. ستون تاریخ را انتخاب کنید\n' +
    '2. از منوی Format > Number > Plain text را انتخاب کنید\n\n' +
    'آیا می‌خواهید ادامه دهید؟',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response !== ui.Button.OK) {
    ui.alert('❌ عملیات لغو شد.');
    return;
  }
  
  const sourceSheet = ss.getSheetByName(IMPORT_SALES_CONFIG.SOURCE_SHEET);
  if (!sourceSheet) {
    ui.alert(`❌ خطا: شیت منبع '${IMPORT_SALES_CONFIG.SOURCE_SHEET}' یافت نشد.`);
    return;
  }
  
  const targetSheet = ss.getSheetByName(IMPORT_SALES_CONFIG.TARGET_SHEET);
  if (!targetSheet) {
    ui.alert(`❌ خطا: شیت مقصد '${IMPORT_SALES_CONFIG.TARGET_SHEET}' یافت نشد.`);
    return;
  }
  
  const rawData = sourceSheet.getDataRange().getValues();
  if (rawData.length < 2) {
    ui.alert('⚠️ شیت منبع خالی است یا فقط شامل هدر می‌باشد.');
    return;
  }
  
  // 🛡️ نرمال‌سازی هدرها
  const normalizeHeader = h => String(h || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\u064A\u0649]/g, 'ی')
    .replace(/[\u0643]/g, 'ک')
    .replace(/[\u0670]/g, '');

  const rawHeaders = rawData[0];
  const getColIdx = (name) => rawHeaders.findIndex(h => normalizeHeader(h) === normalizeHeader(name));
  
  const requiredCols = ['کد کالا', 'نام کالا', 'تعداد'];
  const missingRequired = requiredCols.filter(col => getColIdx(col) === -1);
  if (missingRequired.length > 0) {
    ui.alert(`❌ خطا: ستون‌های اجباری زیر در شیت یافت نشدند:\n${missingRequired.join('\n')}`);
    return;
  }
  
  const idxCode  = getColIdx('کد کالا');
  const idxName  = getColIdx('نام کالا'); 
  const idxQty   = getColIdx('تعداد');
  const idxDate  = getColIdx('تاريخ');
  const idxWh    = getColIdx('کد انبار');
  const idxUnit  = getColIdx('نام واحد');
  const idxPrice = getColIdx('قيمت');

  const sourceUnits = new Set();
  rawData.slice(1).forEach(row => {
    if (idxUnit !== -1 && row[idxUnit]) sourceUnits.add(normalizeText(row[idxUnit]));
  });
  syncUnitsToSystem(ss, Array.from(sourceUnits));
  
  addNewItemsToItemsSheet(ss, rawData.slice(1), idxCode, idxName, idxUnit);
  
  const outputRows = [];
  let skippedCount = 0;
  
  rawData.slice(1).forEach((row) => { 
    let itemCode = row[idxCode];
    let qtyRaw   = row[idxQty];
    
    if (itemCode) itemCode = String(itemCode).trim();
    const qty = parseNumber(qtyRaw);
    
    if (!itemCode || qty <= 0) {
      skippedCount++;
      return;
    }
    
    let jalaliDateRaw;
    if (idxDate !== -1 && row[idxDate]) {
      jalaliDateRaw = row[idxDate];
    } else {
      jalaliDateRaw = formatDateJalali(new Date(), 'yyyy/mm/dd');
    }
    
    const jalaliDate = normalizeJalaliDateString(jalaliDateRaw);
    if (!jalaliDate) { skippedCount++; return; }
    
    const gregorianDate = convertJalaliToGregorian(jalaliDate);
    if (!gregorianDate) { skippedCount++; return; }
    
    const warehouse = (idxWh !== -1 && row[idxWh]) ? String(row[idxWh]).trim() : 'DEFAULT_WH';
    const totalCost = (idxPrice !== -1 && row[idxPrice]) ? parseNumber(row[idxPrice]) : 0;
    
    if (IMPORT_SALES_CONFIG.TARGET_SHEET === 'SALES') {
      outputRows.push([gregorianDate, jalaliDate, itemCode, qty, 'AUTO', warehouse, 0]);
    } else {
      const unitName = (idxUnit !== -1 && row[idxUnit]) ? String(row[idxUnit]).trim() : 'عدد';
      outputRows.push([gregorianDate, jalaliDate, itemCode, qty, unitName, totalCost, 'AUTO', '', warehouse, 0]);
    }
  });
  
  if (outputRows.length === 0) {
    ui.alert(`⚠️ هیچ ردیف معتبری برای انتقال یافت نشد.\n\n🔍 دلیل احتمالی:\n1. ستون‌های اجباری خالی هستند\n2. تاریخ‌ها نامعتبر هستند\n3. تعداد ≤ 0 است`);
    return;
  }
  
  const targetLastRow = targetSheet.getLastRow();
  let startRow = targetLastRow === 0 ? 2 : targetLastRow + 1;
  
  if (targetLastRow === 0) {
    const h = IMPORT_SALES_CONFIG.TARGET_SHEET === 'SALES' ? 
      ['date', 'jalaliDate', 'itemCode', 'qty', 'batchNumber', 'warehouseCode', 'catchWeight'] :
      ['date', 'jalaliDate', 'itemCode', 'qty', 'unit', 'totalCost', 'batchNumber', 'expiryDate', 'warehouseCode', 'catchWeight'];
    targetSheet.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#efefef');
    targetSheet.setFrozenRows(1);
  }
  
  targetSheet.getRange(startRow, 1, outputRows.length, outputRows[0].length).setValues(outputRows);
  targetSheet.getRange(startRow, 1, outputRows.length, 1).setNumberFormat('yyyy/mm/dd');
  
  try { setupDataValidation(); } catch (e) { console.warn("خطا در اعتبارسنجی: " + e.message); }
  
  ui.alert(`✅ عملیات با موفقیت انجام شد!\n\n📊 تعداد ${outputRows.length} ردیف منتقل شد.\n⚠️ ${skippedCount} ردیف نادیده گرفته شد.`);
}
// =================================================================
// 🛡️ توابع کمکی نرمال‌سازی تاریخ (بدون تغییر)
// =================================================================

function normalizeJalaliDateString(dateStr) {
  if (!dateStr) return null;
  
  if (dateStr instanceof Date) {
    if (isNaN(dateStr.getTime())) return null;
    return formatDateJalali(dateStr, 'yyyy/mm/dd');
  }
  
  if (typeof dateStr === 'number') {
    return formatDateJalali(new Date(dateStr), 'yyyy/mm/dd');
  }

  let str = String(dateStr).trim()
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  
  const parts = str.split(/[\/\-\.،,\s]+/).map(p => parseInt(p, 10));
  if (parts.length < 3 || parts.some(isNaN)) return null;
  
  const [jy, jm, jd] = parts;
  if (jy < 1300 || jy > 1500 || jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
  
  const pad = (n) => n < 10 ? '0' + n : n;
  return `${jy}/${pad(jm)}/${pad(jd)}`;
}

// =================================================================
// توابع کمکی (بقیه توابع بدون تغییر)
// =================================================================

function addNewItemsToItemsSheet(ss, sourceRows, idxCode, idxName, idxUnit) {
  const itemsSheet = ss.getSheetByName('ITEMS');
  if (!itemsSheet) {
    const sh = ss.insertSheet('ITEMS');
    sh.getRange(1, 1, 1, 8).setValues([['itemCode', 'itemName', 'baseUnit', 'itemType', 'packageSize', 'parentItem', 'isCatchWeight', 'secondaryUnit']]).setFontWeight('bold').setBackground('#efefef');
    sh.setFrozenRows(1);
  }
  
  const existingItems = getExistingItemCodes(itemsSheet);
  const newItemsMap = new Map();
  
  sourceRows.forEach(row => {
    const code = row[idxCode];
    if (!code) return;
    const codeStr = String(code).trim();
    if (existingItems.has(codeStr) || newItemsMap.has(codeStr)) return;
    
    const name = idxName !== -1 ? String(row[idxName] || '').trim() : '';
    const unit = idxUnit !== -1 && row[idxUnit] ? normalizeText(row[idxUnit]) : 'عدد';
    newItemsMap.set(codeStr, { name: name || `کالای ${codeStr}`, unit: unit || 'عدد' });
  });
  
  if (newItemsMap.size === 0) return;
  
  const newRows = [];
  newItemsMap.forEach((data, code) => {
    newRows.push([code, data.name, data.unit, 'PRODUCT', 0, '', 'FALSE', '']);
  });
  
  const lastRow = itemsSheet.getLastRow();
  const startRow = lastRow === 0 ? 2 : lastRow + 1;
  
  if (lastRow === 0) {
    itemsSheet.getRange(1, 1, 1, 8).setValues([['itemCode', 'itemName', 'baseUnit', 'itemType', 'packageSize', 'parentItem', 'isCatchWeight', 'secondaryUnit']]).setFontWeight('bold').setBackground('#efefef');
    itemsSheet.setFrozenRows(1);
  }
  
  itemsSheet.getRange(startRow, 1, newRows.length, 8).setValues(newRows).setBackground('#fff2cc');
  updateDisplayNameColumn(itemsSheet, startRow, newRows.length);
}

function getExistingItemCodes(itemsSheet) {
  const existing = new Set();
  const lastRow = itemsSheet.getLastRow();
  if (lastRow < 2) return existing;
  const lastCol = itemsSheet.getLastColumn() || 1;
  const headers = itemsSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const codeColIdx = headers.indexOf('itemCode');
  if (codeColIdx === -1) return existing;
  
  const codes = itemsSheet.getRange(2, codeColIdx + 1, lastRow - 1, 1).getValues();
  codes.forEach(row => {
    if (row[0] !== '' && row[0] !== null) existing.add(String(row[0]).trim());
  });
  return existing;
}

function updateDisplayNameColumn(itemsSheet, startRow, count) {
  const lastCol = itemsSheet.getLastColumn() || 1;
  const headers = itemsSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  let displayNameColIdx = headers.indexOf('displayName');
  if (displayNameColIdx === -1) {
    displayNameColIdx = lastCol;
    itemsSheet.getRange(1, displayNameColIdx + 1).setValue('displayName').setFontWeight('bold');
  }
  for (let i = 0; i < count; i++) {
    const rowIdx = startRow + i;
    const code = itemsSheet.getRange(rowIdx, 1).getValue();
    const name = itemsSheet.getRange(rowIdx, 2).getValue();
    if (code && name) itemsSheet.getRange(rowIdx, displayNameColIdx + 1).setValue(`${name} | ${code}`);
  }
}

function syncNewItemsOnly() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  
  // 🆕 پیام تأیید (بدون نیاز به هشدار تاریخ چون این تابع تاریخ را نمی‌خواند)
  const response = ui.alert(
    '⚠️ تأیید عملیات',
    'این عملیات فقط کالاهای جدید را به شیت ITEMS اضافه می‌کند.\n\n' +
    'آیا می‌خواهید ادامه دهید؟',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response !== ui.Button.OK) {
    ui.alert('❌ عملیات لغو شد.');
    return;
  }
  
  const sourceSheet = ss.getSheetByName(IMPORT_SALES_CONFIG.SOURCE_SHEET);
  if (!sourceSheet) {
    ui.alert(`❌ خطا: شیت منبع '${IMPORT_SALES_CONFIG.SOURCE_SHEET}' یافت نشد.`);
    return;
  }
  
  const itemsSheet = ss.getSheetByName('ITEMS');
  if (!itemsSheet) {
    ui.alert(`❌ خطا: شیت مقصد 'ITEMS' یافت نشد.`);
    return;
  }
  
  const rawData = sourceSheet.getDataRange().getValues();
  if (rawData.length < 2) {
    ui.alert('⚠️ شیت منبع خالی است یا فقط شامل هدر می‌باشد.');
    return;
  }
  
  const headers = rawData[0];
  const rows = rawData.slice(1);
  
  const normalizeHeader = h => String(h || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\u064A\u0649]/g, 'ی')
    .replace(/[\u0643]/g, 'ک');
  
  const getColIdx = (name) => headers.findIndex(h => normalizeHeader(h) === normalizeHeader(name));
  const idxCode = getColIdx('کد کالا');
  const idxName = getColIdx('نام کالا');
  const idxUnit = getColIdx('نام واحد');
  
  if (idxCode === -1) {
    ui.alert('❌ خطا: ستون "کد کالا" در شیت منبع یافت نشد.');
    return;
  }

  const sourceUnits = new Set();
  rows.forEach(row => {
    if (idxUnit !== -1 && row[idxUnit]) {
      sourceUnits.add(normalizeText(row[idxUnit])); 
    }
  });
  
  syncUnitsToSystem(ss, Array.from(sourceUnits));
  
  const existingItems = getExistingItemCodes(itemsSheet);
  const newItemsMap = new Map();
  
  rows.forEach(row => {
    const code = row[idxCode];
    if (!code) return;
    const codeStr = String(code).trim();
    if (existingItems.has(codeStr) || newItemsMap.has(codeStr)) return;
    
    const name = idxName !== -1 ? String(row[idxName] || '').trim() : '';
    const unit = idxUnit !== -1 && row[idxUnit] ? normalizeText(row[idxUnit]) : 'عدد'; 
    
    newItemsMap.set(codeStr, { name: name || `کالای ${codeStr}`, unit: unit || 'عدد' });
  });
  
  if (newItemsMap.size === 0) {
    ui.alert('✅ هیچ کالای جدیدی برای افزودن به ITEMS یافت نشد.');
    return;
  }
  
  const newRows = [];
  newItemsMap.forEach((data, code) => {
    newRows.push([code, data.name, data.unit, 'PRODUCT', 0, '', 'FALSE', '']);
  });
  
  const lastRow = itemsSheet.getLastRow();
  const startRow = lastRow === 0 ? 2 : lastRow + 1;
  
  if (lastRow === 0) {
    itemsSheet.getRange(1, 1, 1, 8).setValues([['itemCode', 'itemName', 'baseUnit', 'itemType', 'packageSize', 'parentItem', 'isCatchWeight', 'secondaryUnit']]).setFontWeight('bold').setBackground('#efefef');
    itemsSheet.setFrozenRows(1);
  }
  
  try {
    itemsSheet.getDataRange().clearDataValidations();
    SpreadsheetApp.flush(); 
  } catch (e) {
    console.error("هشدار در پاک‌سازی اعتبارسنجی ITEMS: " + e.message);
  }
  
  itemsSheet.getRange(startRow, 1, newRows.length, 8).setValues(newRows).setBackground('#fff2cc');
  updateDisplayNameColumn(itemsSheet, startRow, newRows.length);
  
  try {
    setupDataValidation(); 
  } catch (e) {
    console.warn("خطا در به‌روزرسانی اعتبارسنجی: " + e.message);
  }
  
  ui.alert(`✅ عملیات با موفقیت انجام شد!\n\n🆕 تعداد ${newRows.length} کالای جدید به ITEMS اضافه شد.\n📏 واحدهای جدید به سیستم اضافه شدند.`);
}

function syncUnitsToSystem(ss, newUnits) {
  const convSheet = ss.getSheetByName('CONVERSIONS');
  if (!convSheet) {
    const sh = ss.insertSheet('CONVERSIONS');
    sh.getRange(1, 1, 1, 3).setValues([['fromUnit', 'toUnit', 'factor']]).setFontWeight('bold').setBackground('#efefef');
  }
  
  const data = convSheet.getDataRange().getValues();
  const existingUnits = new Set();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) existingUnits.add(normalizeText(data[i][0]));
    if (data[i][1]) existingUnits.add(normalizeText(data[i][1]));
  }
  
  const toAdd = [];
  newUnits.forEach(u => {
    const normalizedUnit = normalizeText(u); 
    if (normalizedUnit && !existingUnits.has(normalizedUnit)) {
      toAdd.push([normalizedUnit, normalizedUnit, 1]); 
      existingUnits.add(normalizedUnit);
    }
  });
  
  if (toAdd.length > 0) {
    const lastRow = convSheet.getLastRow();
    const startRow = lastRow === 0 ? 2 : lastRow + 1;
    convSheet.getRange(startRow, 1, toAdd.length, 3).setValues(toAdd);
  }
}