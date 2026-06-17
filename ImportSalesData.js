/**
 * 📄 فایل: ImportSalesData.gs
 * 📝 توضیحات: اسکریپت خالص ETL برای استخراج، تبدیل و بارگذاری داده‌ها.
 * ⚠️ توجه: مدیریت اعتبارسنجی (Data Validation) به اسکریپت اصلی واگذار شده است.
 */

const IMPORT_SALES_CONFIG = {
  SOURCE_SHEET: 'import_items',
  TARGET_SHEET: 'SALES', // در صورت نیاز به 'SALES' تغییر دهید
  
  COL_DATE: 'تاريخ',
  COL_ITEM_CODE: 'کد کالا',
  COL_ITEM_NAME: 'نام کالا',
  COL_QTY: 'تعداد',
  COL_UNIT: 'نام واحد',
  COL_PRICE: 'قيمت',
  COL_WAREHOUSE: 'کد انبار',
  COL_RECEIPT_ID: 'شماره فاکتور', // ⚠️ حیاتی: نام دقیق هدر ستون شماره فیش در شیت import_items
  
  // 🪩 لیست کدهای اقلام پایه قلیان (هر چیزی که می‌تواند شارژ بگیرد)
  HOOKAH_BASE_CODES: new Set([
    '1801', '1802', '1803', '1804', '1805', '1810', '1813', '1814', '1815', '1816',
    '1818', '1819', '1820', '1822', '1905', '1906', '1973', '1974', '1995', '2006',
    '2009', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022'
  ]),
  
  // 🔋 لیست کدهای اقلام شارژ (که باید به قلیان اضافه و سپس از لیست حذف شوند)
  HOOKAH_CHARGE_CODES: new Set(['1823', '1864', '1975'])
};

function importSalesDataToTargetSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  
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
  
  const headers = rawData[0];
  const rows = rawData.slice(1);
  
  const getColIdx = (name) => headers.indexOf(name);
  const idxDate  = getColIdx(IMPORT_SALES_CONFIG.COL_DATE);
  const idxCode  = getColIdx(IMPORT_SALES_CONFIG.COL_ITEM_CODE);
  const idxName  = getColIdx(IMPORT_SALES_CONFIG.COL_ITEM_NAME); 
  const idxQty   = getColIdx(IMPORT_SALES_CONFIG.COL_QTY);
  const idxUnit  = getColIdx(IMPORT_SALES_CONFIG.COL_UNIT);
  const idxPrice = getColIdx(IMPORT_SALES_CONFIG.COL_PRICE);
  const idxWh    = getColIdx(IMPORT_SALES_CONFIG.COL_WAREHOUSE);
  const idxReceipt = getColIdx(IMPORT_SALES_CONFIG.COL_RECEIPT_ID); 

  if (idxDate === -1 || idxCode === -1 || idxQty === -1) {
    ui.alert('❌ خطا: ستون‌های ضروری (تاريخ، کد کالا، تعداد) یافت نشدند.');
    return;
  }
  
  // 1. شناسایی و ثبت خودکار واحدهای جدید در سیستم
  const sourceUnits = new Set();
  rows.forEach(row => {
    if (idxUnit !== -1 && row[idxUnit]) {
      sourceUnits.add(normalizeText(row[idxUnit]));
    }
  });
  syncUnitsToSystem(ss, Array.from(sourceUnits));
  
  // 2. افزودن خودکار کالاهای جدید به شیت ITEMS
  addNewItemsToItemsSheet(ss, rows, idxCode, idxName, idxUnit);
  
  // 🪩 2.5. اعمال منطق ادغام شارژ سری قلیان (قبل از پردازش نهایی)
  const processedRows = applyHookahChargeLogic(rows, idxReceipt, idxCode, idxQty);
  
    // 3. پردازش داده‌ها
  const outputRows = [];
  let skippedCount = 0;
  
  processedRows.forEach((row) => { 
    const jalaliDate = row[idxDate];
    const itemCode   = row[idxCode];
    const qty        = row[idxQty];
    
    if (!jalaliDate || !itemCode || !qty) {
      skippedCount++;
      return;
    }
    
    const gregorianDate = convertJalaliToGregorian(jalaliDate);
    if (!gregorianDate) {
      skippedCount++;
      return;
    }
    
    const unitName   = idxUnit  !== -1 ? String(row[idxUnit] || '').trim() : 'عدد';
    const totalCost  = idxPrice !== -1 ? parseNumber(row[idxPrice]) : 0;
    const warehouse  = idxWh    !== -1 ? (String(row[idxWh] || '').trim() || 'DEFAULT_WH') : 'DEFAULT_WH';
    
    // 🛡️ FIX: تبدیل تاریخ به رشته جلالی استاندارد برای نوشتن در شیت
    let jalaliStr = '';
    if (gregorianDate instanceof Date && !isNaN(gregorianDate.getTime())) {
        jalaliStr = formatDateJalali(gregorianDate);
    } else {
        jalaliStr = String(jalaliDate);
    }
    
    if (IMPORT_SALES_CONFIG.TARGET_SHEET === 'SALES') {
      outputRows.push([gregorianDate, jalaliStr, itemCode, parseNumber(qty), 'AUTO', warehouse, 0]);
    } else {
      outputRows.push([gregorianDate, jalaliStr, itemCode, parseNumber(qty), unitName, totalCost, 'AUTO', '', warehouse, 0]);
    }
  });
  
  
  if (outputRows.length === 0) {
    ui.alert('⚠️ هیچ ردیف معتبری برای انتقال یافت نشد.');
    return;
  }
  
  // 4. آماده‌سازی و نوشتن داده‌ها در شیت مقصد
  const targetLastRow = targetSheet.getLastRow();
  let startRow = 2;
  
  if (targetLastRow === 0) {
    const h = IMPORT_SALES_CONFIG.TARGET_SHEET === 'SALES' ? 
      ['date', 'jalaliDate', 'itemCode', 'qty', 'batchNumber', 'warehouseCode', 'catchWeight'] :
      ['date', 'jalaliDate', 'itemCode', 'qty', 'unit', 'totalCost', 'batchNumber', 'expiryDate', 'warehouseCode', 'catchWeight'];
    targetSheet.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#efefef');
    targetSheet.setFrozenRows(1);
  } else {
    startRow = targetLastRow + 1;
  }
  
  targetSheet.getRange(startRow, 1, outputRows.length, outputRows[0].length).setValues(outputRows);
  targetSheet.getRange(startRow, 1, outputRows.length, 1).setNumberFormat('yyyy/mm/dd');
  
  // 5. فراخوانی تابع اعتبارسنجی از فایل اصلی
  try {
    setupDataValidation(); 
  } catch (e) {
    console.warn("خطا در به‌روزرسانی اعتبارسنجی: " + e.message);
  }
  
  ui.alert(`✅ عملیات با موفقیت انجام شد!\n\n` +
           `📊 تعداد ${outputRows.length} ردیف منتقل شد.\n` +
           `⚠️ ${skippedCount} ردیف نادیده گرفته شد.\n\n` +
           `💡 کالاهای جدید و واحدهای جدید به سیستم اضافه و قوانین اعتبارسنجی به‌روز شدند.`);
}

// =================================================================
// توابع کمکی (فقط مربوط به داده، بدون اعتبارسنجی)
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
    const unit = idxUnit !== -1 ? normalizeText(row[idxUnit]) : 'عدد';
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

/**
 * 🆕 فقط افزودن کالاهای جدید به ITEMS (بدون انتقال فروش)
 */
function syncNewItemsOnly() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  
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
  
  const getColIdx = (name) => headers.indexOf(name);
  const idxCode = getColIdx(IMPORT_SALES_CONFIG.COL_ITEM_CODE);
  const idxName = getColIdx(IMPORT_SALES_CONFIG.COL_ITEM_NAME);
  const idxUnit = getColIdx(IMPORT_SALES_CONFIG.COL_UNIT);
  
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
    const unit = idxUnit !== -1 ? normalizeText(row[idxUnit]) : 'عدد'; 
    
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
  
  ui.alert(`✅ عملیات با موفقیت انجام شد!\n\n` +
           `🆕 تعداد ${newRows.length} کالای جدید به ITEMS اضافه شد.\n` +
           `📏 واحدهای جدید به سیستم و لیست‌های کشویی اضافه شدند.\n\n` +
           `💡 تمام حروف عربی/فارسی و فاصله‌ها به صورت خودکار استاندارد شدند.`);
}

// =================================================================
// توابع کمکی به‌روزرسانی شده
// =================================================================

/**
 * 📏 افزودن واحدهای جدید به شیت CONVERSIONS (با پشتیبانی از استانداردسازی)
 */
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

/**
 * 🪩 منطق هوشمند ادغام شارژ قلیان بر اساس کد کالا
 */
function applyHookahChargeLogic(rows, idxReceipt, idxCode, idxQty) {
  if (idxReceipt === -1) {
    console.warn("⚠️ ستون 'شماره فیش' یافت نشد. منطق ادغام شارژ قلیان نادیده گرفته شد.");
    return rows;
  }

  const receiptsMap = new Map();
  rows.forEach((row, index) => {
    const receiptId = String(row[idxReceipt] || '').trim();
    if (!receiptId) return;
    if (!receiptsMap.has(receiptId)) receiptsMap.set(receiptId, []);
    receiptsMap.get(receiptId).push({ index, row });
  });

  const rowsToSkip = new Set(); 

  receiptsMap.forEach((itemsInReceipt) => {
    let baseHookahRowIndex = -1;
    let baseHookahTotalQty = 0;
    let totalChargeQty = 0;
    const chargeRowIndices = [];

    itemsInReceipt.forEach(item => {
      const itemCode = String(item.row[idxCode] || '').trim();
      const qty = parseNumber(item.row[idxQty]);

      if (IMPORT_SALES_CONFIG.HOOKAH_CHARGE_CODES.has(itemCode)) {
        totalChargeQty += qty;
        chargeRowIndices.push(item.index);
      } 
      else if (IMPORT_SALES_CONFIG.HOOKAH_BASE_CODES.has(itemCode)) {
        if (baseHookahRowIndex === -1) {
          baseHookahRowIndex = item.index;
          baseHookahTotalQty = qty;
        } else {
          baseHookahTotalQty += qty;
        }
      }
    });

    if (baseHookahRowIndex !== -1 && totalChargeQty > 0) {
      rows[baseHookahRowIndex][idxQty] = baseHookahTotalQty + totalChargeQty;
      chargeRowIndices.forEach(idx => rowsToSkip.add(idx));
    }
  });

  return rows.filter((row, index) => !rowsToSkip.has(index));
}