/**
 * 📊 داشبورد روزانه جامع (Comprehensive Daily Dashboard)
 * فایل جداگانه برای گزارش‌های مدیریتی روزانه
 */

/**
 * 🎯 تابع اصلی: ایجاد داشبورد روزانه جامع
 */
function generateDailyDashboard(ss, inv, metrics, suspenseLog, itemsMap) {
  const dSh = getOrCreateSheet(ss, CONFIG.SHEETS.REPORT_DAILY);
  dSh.clear();
  
  let currentRow = 1;
  
  // ─────────────────────────────────────────────────────────
  // ۱. هدر اصلی داشبورد
  // ─────────────────────────────────────────────────────────
  dSh.getRange(currentRow, 1, 1, 5).setValues([[
    `📊 داشبورد روزانه جامع - ${metrics.targetDate}`, '', '', '', ''
  ]]).merge().setFontWeight('bold').setFontSize(14)
    .setHorizontalAlignment('center').setBackground('#1a73e8').setFontColor('#ffffff');
  
  currentRow += 2;
  
  // ─────────────────────────────────────────────────────────
  // ۲. بخش خلاصه مالی روز
  // ─────────────────────────────────────────────────────────
  dSh.getRange(currentRow, 1, 1, 5).setValues([[
    '💰 بخش ۱: خلاصه مالی روز', '', '', '', ''
  ]]).merge().setFontWeight('bold').setFontSize(12).setBackground('#e8f0fe');
  
  currentRow++;
  
  const financialData = [
    ['شاخص', 'مقدار', 'واحد', 'توضیح', ''],
    ['خرید روز', Number(metrics.purchases.toFixed(CONFIG.ROUND_MONEY)), 'ریال', 'مجموع خریدهای امروز', ''],
    ['بهای تمام شده فروش (COGS)', Number(metrics.estCogs.toFixed(CONFIG.ROUND_MONEY)), 'ریال', 'هزینه مواد اولیه فروش رفته', ''],
    ['هزینه تولید روز', Number(metrics.prodCost.toFixed(CONFIG.ROUND_MONEY)), 'ریال', 'هزینه تولیدات امروز', ''],
    ['ارزش ضایعات', Number(metrics.wasteVal.toFixed(CONFIG.ROUND_MONEY)), 'ریال', 'ارزش کالاهای دور ریخته شده', '']
  ];
  
  dSh.getRange(currentRow, 1, financialData.length, 5).setValues(financialData);
  dSh.getRange(currentRow, 1, 1, 5).setFontWeight('bold').setBackground('#f3f3f3');
  
  currentRow += financialData.length + 1;
  
  // ─────────────────────────────────────────────────────────
  // ۳. بخش مغایرت انبار
  // ─────────────────────────────────────────────────────────
  dSh.getRange(currentRow, 1, 1, 5).setValues([[
    '📦 بخش ۲: مغایرت انبار', '', '', '', ''
  ]]).merge().setFontWeight('bold').setFontSize(12).setBackground('#e8f0fe');
  
  currentRow++;
  
  const suspenseStats = calculateSuspenseStats(suspenseLog);
  
  const varianceData = [
    ['شاخص', 'مقدار', 'واحد', 'توضیح', ''],
    ['تعداد کسری‌ها', suspenseStats.shortageCount, 'مورد', 'تعداد کالاهای با کسری', ''],
    ['مجموع کسری', Number(suspenseStats.totalShortage.toFixed(2)), 'واحد', 'مجموع مقدار کسری', ''],
    ['ارزش کل کسری', Number(suspenseStats.totalShortageValue.toFixed(CONFIG.ROUND_MONEY)), 'ریال', 'ارزش ریالی کسری‌ها', '']
  ];
  
  dSh.getRange(currentRow, 1, varianceData.length, 5).setValues(varianceData);
  dSh.getRange(currentRow, 1, 1, 5).setFontWeight('bold').setBackground('#f3f3f3');
  
  if (suspenseStats.shortageCount > 0) {
    dSh.getRange(currentRow + 1, 1, 1, 5).setBackground('#ffcccc');
  }
  
  currentRow += varianceData.length + 1;
  
  // ─────────────────────────────────────────────────────────
  // ۴. بخش کالاهای بحرانی
  // ─────────────────────────────────────────────────────────
  dSh.getRange(currentRow, 1, 1, 5).setValues([[
    '⚠️ بخش ۳: کالاهای بحرانی (موجودی زیر حد مجاز)', '', '', '', ''
  ]]).merge().setFontWeight('bold').setFontSize(12).setBackground('#e8f0fe');
  
  currentRow++;
  
  const criticalItems = findCriticalItems(inv, itemsMap);
  
  if (criticalItems.length > 0) {
    const criticalHeaders = [['کد کالا', 'نام کالا', 'موجودی', 'واحد', 'وضعیت']];
    dSh.getRange(currentRow, 1, 1, 5).setValues(criticalHeaders).setFontWeight('bold').setBackground('#f3f3f3');
    currentRow++;
    
    const criticalRows = criticalItems.slice(0, 10).map(item => [
      item.code,
      item.name,
      Number(item.qty.toFixed(2)),
      item.unit,
      item.status
    ]);
    
    dSh.getRange(currentRow, 1, criticalRows.length, 5).setValues(criticalRows);
    
    for (let i = 0; i < criticalRows.length; i++) {
      if (criticalRows[i][4] === 'بحرانی') {
        dSh.getRange(currentRow + i, 1, 1, 5).setBackground('#ffcccc');
      } else {
        dSh.getRange(currentRow + i, 1, 1, 5).setBackground('#fff2cc');
      }
    }
    
    currentRow += criticalRows.length + 1;
  } else {
    dSh.getRange(currentRow, 1, 1, 5).setValues([[
      '✅ هیچ کالای بحرانی یافت نشد', '', '', '', ''
    ]]).merge().setBackground('#d9ead3');
    currentRow += 2;
  }
  
  // ─────────────────────────────────────────────────────────
  // ۵. بخش تفکیک فروش بر اساس دسته
  // ─────────────────────────────────────────────────────────
  dSh.getRange(currentRow, 1, 1, 5).setValues([[
    '📊 بخش ۴: تفکیک فروش بر اساس دسته', '', '', '', ''
  ]]).merge().setFontWeight('bold').setFontSize(12).setBackground('#e8f0fe');
  
  currentRow++;
  
  const salesByCategory = calculateSalesByCategory(ss, itemsMap);
  
  if (salesByCategory.length > 0) {
    const categoryHeaders = [['دسته', 'تعداد فروش', 'درصد از کل', '', '']];
    dSh.getRange(currentRow, 1, 1, 5).setValues(categoryHeaders).setFontWeight('bold').setBackground('#f3f3f3');
    currentRow++;
    
    const categoryRows = salesByCategory.map(cat => [
      cat.category,
      cat.count,
      cat.percentage + '%',
      '',
      ''
    ]);
    
    dSh.getRange(currentRow, 1, categoryRows.length, 5).setValues(categoryRows);
    currentRow += categoryRows.length + 1;
  } else {
    dSh.getRange(currentRow, 1, 1, 5).setValues([[
      'ℹ️ داده‌ای برای نمایش وجود ندارد', '', '', '', ''
    ]]).merge().setBackground('#fff2cc');
    currentRow += 2;
  }
  
  // ─────────────────────────────────────────────────────────
  // ۶. بخش Top 5 پرفروش‌ترین آیتم‌ها
  // ─────────────────────────────────────────────────────────
  dSh.getRange(currentRow, 1, 1, 5).setValues([[
    '🔥 بخش ۵: Top 5 پرفروش‌ترین آیتم‌های امروز', '', '', '', ''
  ]]).merge().setFontWeight('bold').setFontSize(12).setBackground('#e8f0fe');
  
  currentRow++;
  
  const topSelling = calculateTopSelling(ss, itemsMap);
  
  if (topSelling.length > 0) {
    const topHeaders = [['رتبه', 'کد کالا', 'نام کالا', 'تعداد فروش', '']];
    dSh.getRange(currentRow, 1, 1, 5).setValues(topHeaders).setFontWeight('bold').setBackground('#f3f3f3');
    currentRow++;
    
    const topRows = topSelling.slice(0, 5).map((item, idx) => [
      idx + 1,
      item.code,
      item.name,
      item.qty,
      ''
    ]);
    
    dSh.getRange(currentRow, 1, topRows.length, 5).setValues(topRows);
    
    for (let i = 0; i < Math.min(3, topRows.length); i++) {
      dSh.getRange(currentRow + i, 1, 1, 5).setBackground('#d9ead3');
    }
    
    currentRow += topRows.length + 1;
  } else {
    dSh.getRange(currentRow, 1, 1, 5).setValues([[
      'ℹ️ داده‌ای برای نمایش وجود ندارد', '', '', '', ''
    ]]).merge().setBackground('#fff2cc');
  }
  
  // ─────────────────────────────────────────────────────────
  // ۷. تنظیمات نهایی
  // ─────────────────────────────────────────────────────────
  dSh.setFrozenRows(1);
  dSh.setColumnWidth(1, 200);
  dSh.setColumnWidth(2, 150);
  dSh.setColumnWidth(3, 100);
  dSh.setColumnWidth(4, 250);
  dSh.setColumnWidth(5, 100);
}

// ═══════════════════════════════════════════════════════════
// توابع کمکی
// ═══════════════════════════════════════════════════════════

function calculateSuspenseStats(suspenseLog) {
  let shortageCount = 0;
  let totalShortage = 0;
  let totalShortageValue = 0;
  
  suspenseLog.forEach(row => {
    const qty = parseNumber(row[2]);
    if (qty < 0) {
      shortageCount++;
      totalShortage += Math.abs(qty);
      totalShortageValue += Math.abs(qty) * 10000;
    }
  });
  
  return { shortageCount, totalShortage, totalShortageValue };
}

function findCriticalItems(inv, itemsMap) {
  const critical = [];
  
  for (let wh in inv) {
    for (let item in inv[wh]) {
      let totalQty = 0;
      let unit = '';
      
      for (let batch in inv[wh][item]) {
        totalQty += inv[wh][item][batch].qty;
        unit = inv[wh][item][batch].unit;
      }
      
      if (totalQty > 0 && totalQty < 100) {
        // 🆕 اصلاح: تبدیل به رشته
        const itemCode = String(item);
        critical.push({
          code: itemCode,
          name: itemsMap[itemCode]?.itemName || itemCode,
          qty: totalQty,
          unit: unit,
          status: totalQty < 50 ? 'بحرانی' : 'هشدار'
        });
      }
    }
  }
  
  return critical.sort((a, b) => a.qty - b.qty);
}

function calculateSalesByCategory(ss, itemsMap) {
  const salesData = getSheetSafe(ss, CONFIG.SHEETS.SALES, 
    ['date', 'itemCode', 'qty'], 'itemCode');
  
  const categories = {};
  
  salesData.forEach(sale => {
    const item = itemsMap[sale.itemCode];
    if (!item) return;
    
    // 🆕 اصلاح: تبدیل به رشته قبل از split
    const codeStr = String(sale.itemCode);
    const codeParts = codeStr.split('-');
    const category = codeParts.length >= 2 ? codeParts[1] : 'OTHER';
    
    if (!categories[category]) {
      categories[category] = 0;
    }
    categories[category] += parseNumber(sale.qty);
  });
  
  const total = Object.values(categories).reduce((sum, val) => sum + val, 0);
  
  return Object.keys(categories).map(cat => ({
    category: getCategoryName(cat),
    count: categories[cat],
    percentage: total > 0 ? ((categories[cat] / total) * 100).toFixed(1) : 0
  })).sort((a, b) => b.count - a.count);
}
function getCategoryName(code) {
  const names = {
    'HK': 'قلیان و لانژ',
    'ME': 'گوشت و پروتئین',
    'DA': 'لبنیات',
    'PR': 'میوه و سبزیجات',
    'DR': 'خشکبار و غلات',
    'BV': 'نوشیدنی‌ها',
    'PK': 'بسته‌بندی',
    'CL': 'شوینده و بهداشتی'
  };
  return names[code] || 'سایر';
}

function calculateTopSelling(ss, itemsMap) {
  const salesData = getSheetSafe(ss, CONFIG.SHEETS.SALES, 
    ['date', 'itemCode', 'qty'], 'itemCode');
  
  const salesMap = {};
  
  salesData.forEach(sale => {
    // 🆕 اصلاح: تبدیل به رشته
    const code = String(sale.itemCode);
    if (!salesMap[code]) {
      salesMap[code] = {
        code: code,
        name: itemsMap[code]?.itemName || code,
        qty: 0
      };
    }
    salesMap[code].qty += parseNumber(sale.qty);
  });
  
  return Object.values(salesMap).sort((a, b) => b.qty - a.qty);
}