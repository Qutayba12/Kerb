// ============================================================
// i18n.js — lightweight Arabic layer. Instead of wrapping every
// string, we translate the rendered DOM: after a view/sheet is
// built, translate() swaps text nodes, placeholders and titles
// that match the dictionary, and applyDir() sets RTL. English is
// the source of truth; unknown strings simply stay English.
// ============================================================
import { getSettings, saveSettings } from './store.js';

export function getLang() { return getSettings().lang || 'en'; }
export function isRTL() { return getLang() === 'ar'; }

// English -> Arabic. Keys are the exact UI strings.
const AR = {
  // nav / chrome
  'Home': 'الرئيسية', 'Income': 'الدخل', 'Expenses': 'المصاريف', 'Tax': 'الضرائب', 'Add': 'إضافة',
  'Insights': 'تحليلات', 'Pots': 'الأوعية', 'Settings': 'الإعدادات', 'Ask Kerb': 'اسأل Kerb',
  // dashboard
  'Money to keep': 'ما يجب الاحتفاظ به', 'Last 7 days': 'آخر 7 أيام', 'Coming up': 'قادم',
  'Income by platform': 'الدخل حسب المنصّة', 'Recent activity': 'النشاط الأخير', 'View all': 'عرض الكل',
  'Add earnings': 'إضافة دخل', 'Scan receipt': 'تصوير فاتورة', 'Safe to spend': 'آمن للصرف',
  'profit after tax': 'الربح بعد الضريبة', 'Tax pot — set this aside': 'وعاء الضريبة — جنّب هذا',
  'Set an earnings goal': 'حدّد هدف دخل', '£ / hour': '£/ساعة', '£ / mile': '£/ميل', 'Tips': 'البقشيش',
  'Weekly goal': 'الهدف الأسبوعي', 'Daily goal': 'الهدف اليومي', 'Monthly goal': 'الهدف الشهري',
  'Shift in progress': 'وردية جارية', 'Gross income': 'إجمالي الدخل', 'Deductions': 'الخصومات', 'Set aside': 'المُجنّب',
  // income / expenses lists
  '7 days': '7 أيام', '30 days': '30 يوماً', 'Tax year': 'السنة الضريبية', 'All': 'الكل',
  'Hours': 'الساعات', 'Miles': 'الأميال', 'Paid out': 'المدفوع', 'Claimable': 'قابل للخصم', 'Not deductible': 'غير قابل للخصم',
  'No shifts logged': 'لا ورديات مسجّلة', 'No expenses yet': 'لا مصاريف بعد', 'Scan a receipt': 'صوّر فاتورة',
  // tax view
  'Self-employment income': 'دخل العمل الحر', 'Taxable profit': 'الربح الخاضع للضريبة',
  'Other income (PAYE etc.)': 'دخل آخر (PAYE إلخ)', 'Total income': 'إجمالي الدخل',
  'Income tax on profit': 'ضريبة الدخل على الربح', 'Class 4 NIC': 'تأمين وطني Class 4', 'Class 2 NIC': 'تأمين وطني Class 2',
  'Total to set aside': 'الإجمالي المُجنّب', 'Payments on account': 'الدفعات المقدّمة', 'Key dates': 'مواعيد مهمة',
  'Register with HMRC': 'التسجيل لدى HMRC', 'Online return & balancing payment': 'الإقرار والدفع أونلاين',
  '1st payment on account': 'الدفعة المقدّمة الأولى', '2nd payment on account': 'الدفعة المقدّمة الثانية',
  'Export': 'تصدير', 'Summary (CSV)': 'ملخّص (CSV)', 'Transactions (CSV)': 'المعاملات (CSV)',
  'Self Assessment report (print / PDF)': 'تقرير Self Assessment (طباعة / PDF)', 'Net profit': 'صافي الربح',
  'Effective rate': 'المعدّل الفعلي', 'Take-home': 'الصافي', 'Applies': 'ينطبق', 'Likely none this year': 'غالباً لا شيء هذا العام',
  'incl. tips': 'شامل البقشيش', 'Less: allowable expenses': 'ناقص: مصاريف قابلة للخصم', 'Less: use of home': 'ناقص: استخدام المنزل',
  'Less: £1,000 trading allowance': 'ناقص: بدل تداول £1,000', 'Each instalment (×2)': 'كل دفعة (×2)',
  // pots
  'Your weekly plan': 'خطتك الأسبوعية', 'Tax pot': 'وعاء الضريبة', 'Tax & NIC reserve': 'احتياطي الضريبة والتأمين',
  'Vehicle pot': 'وعاء المركبة', 'Savings': 'المدّخرات', 'Update': 'تحديث', 'Saved': 'مُدّخر', 'Target': 'الهدف',
  'Set weekly targets & tax mode': 'ضبط الأهداف الأسبوعية ووضع الضريبة', 'Vehicle & maintenance pot': 'وعاء المركبة والصيانة',
  'Savings pot': 'وعاء المدّخرات', 'Spend': 'الصرف', 'Vehicle': 'المركبة',
  // insights
  '£ / drop': '£/توصيلة', 'Net £ / hr': 'صافي £/ساعة', 'Total hours': 'إجمالي الساعات', 'Total miles': 'إجمالي الأميال',
  'By month (tax year)': 'حسب الشهر (السنة الضريبية)', 'Earnings by weekday': 'الدخل حسب يوم الأسبوع',
  'Platform comparison': 'مقارنة المنصّات', 'Full-year projection': 'توقّع السنة الكاملة', 'Est. tax': 'ضريبة تقديرية', 'Profit': 'الربح',
  // goals
  'Goals': 'الأهداف', 'Streak': 'السلسلة', 'Recent periods': 'الفترات الأخيرة', 'Your goal': 'هدفك',
  'Measure': 'المقياس', 'Period': 'الفترة', 'Target amount': 'المبلغ المستهدف', 'Update goal': 'تحديث الهدف',
  'Set goal': 'ضبط الهدف', 'Turn off goal': 'إيقاف الهدف', 'Reminders': 'التذكيرات', 'Enable reminders': 'تفعيل التذكيرات',
  'Send test notification': 'إرسال إشعار تجريبي', 'Income (turnover)': 'الدخل (الإجمالي)', 'Net profit': 'صافي الربح',
  'Daily': 'يومي', 'Weekly': 'أسبوعي', 'Monthly': 'شهري', 'Goal met — great work!': 'تحقّق الهدف — عمل رائع!',
  // shift
  'Live shift': 'الوردية المباشرة', 'Start shift': 'ابدأ الوردية', 'Track miles with GPS': 'تتبّع الأميال بالـ GPS',
  'Platform': 'المنصّة', 'Earnings so far': 'الدخل حتى الآن', 'Deliveries': 'التوصيلات',
  'Business miles (enter at the end)': 'أميال العمل (أدخلها في النهاية)', '£ / hour (live)': '£/ساعة (مباشر)',
  'Stop & save shift': 'إيقاف وحفظ الوردية', 'Discard shift': 'تجاهل الوردية',
  // assistant
  'Quick add by text': 'إضافة سريعة بالنص', 'Ask about your money': 'اسأل عن أموالك', 'Ask': 'اسأل', 'Clear': 'مسح',
  'Open Settings': 'فتح الإعدادات', 'Summarise this week': 'لخّص هذا الأسبوع', 'How am I doing this month?': 'كيف أدائي هذا الشهر؟',
  'Best day & platform': 'أفضل يوم ومنصّة', 'How much tax so far?': 'كم الضريبة حتى الآن؟',
  // forms
  'Edit shift': 'تعديل الوردية', 'Add expense': 'إضافة مصروف', 'Edit expense': 'تعديل المصروف', 'Date': 'التاريخ',
  'Earnings (before tips)': 'الدخل (قبل البقشيش)', 'Hours worked': 'ساعات العمل', 'Business miles driven': 'أميال العمل المقطوعة',
  'Note': 'ملاحظة', 'Save': 'حفظ', 'Delete': 'حذف', 'Cancel': 'إلغاء', 'Scan receipt with Claude': 'تصوير الفاتورة بكلود',
  'Category': 'التصنيف', 'Amount paid (inc. VAT)': 'المبلغ المدفوع (شامل VAT)', 'Vendor': 'المتجر',
  'Business use %': 'نسبة الاستخدام للعمل %', 'VAT (optional)': 'VAT (اختياري)', 'Amount': 'المبلغ', 'Frequency': 'التكرار',
  'Name': 'الاسم', 'Next due': 'الاستحقاق التالي', 'Business expense (deductible)': 'مصروف عمل (قابل للخصم)',
  'Add recurring bill': 'إضافة فاتورة متكرّرة',
  // add menu
  'Ask Kerb (AI)': 'اسأل Kerb (ذكاء)', 'Start live shift': 'ابدأ وردية مباشرة', 'Log mileage only': 'تسجيل الأميال فقط',
  'Add expense manually': 'إضافة مصروف يدوياً',
  // settings
  'Tax basis': 'أساس الضريبة', 'Region': 'المنطقة', 'Expense method': 'طريقة المصاريف', 'Working tax year': 'السنة الضريبية العاملة',
  'Self-employment start date': 'تاريخ بدء العمل الحر', 'Your income context': 'سياق دخلك',
  'PAYE salary (annual, gross)': 'راتب PAYE (سنوي، إجمالي)', 'Income tax already paid via PAYE': 'ضريبة الدخل المدفوعة عبر PAYE',
  'Other taxable income (annual)': 'دخل خاضع للضريبة آخر (سنوي)', 'Student loan plan': 'خطة القرض الطلابي',
  'Use of home (hours/month)': 'استخدام المنزل (ساعات/شهر)', 'Money pots': 'الأوعية المالية', 'Tax pot mode': 'وضع وعاء الضريبة',
  'Manual tax %': 'نسبة الضريبة اليدوية %', 'Vehicle pot (£/week)': 'وعاء المركبة (£/أسبوع)', 'Savings goal (£/week)': 'هدف الادّخار (£/أسبوع)',
  'Receipt scanning (Claude)': 'قراءة الفواتير (كلود)', 'Anthropic API key': 'مفتاح Anthropic API', 'Model': 'النموذج',
  'Platforms': 'المنصّات', 'Tax rates (advanced)': 'المعدّلات الضريبية (متقدّم)', 'Appearance': 'المظهر', 'Theme': 'السمة',
  'Language': 'اللغة', 'Your data': 'بياناتك', 'Export backup (JSON)': 'تصدير نسخة احتياطية (JSON)',
  'Import backup': 'استيراد نسخة احتياطية', 'Delete all data': 'حذف كل البيانات', 'Save key': 'حفظ المفتاح', 'Test': 'اختبار', 'Show': 'إظهار',
  'System': 'النظام', 'Light': 'فاتح', 'Dark': 'داكن', 'None': 'لا يوجد',
  'Your name (for SA report)': 'اسمك (للتقرير)', 'UTR (for SA report)': 'UTR (للتقرير)',
  // onboarding
  'Set up Kerb': 'إعداد Kerb', 'Start using Kerb': 'ابدأ استخدام Kerb', 'Skip for now': 'تخطَّ الآن',
  'PAYE salary (annual, gross)': 'راتب PAYE (سنوي، إجمالي)',
  // toasts / statuses
  'Saved': 'تم الحفظ', 'Shift added': 'أُضيفت الوردية', 'Shift updated': 'حُدّثت الوردية',
  'Expense added': 'أُضيف المصروف', 'Expense updated': 'حُدّث المصروف', 'Bill updated': 'حُدّثت الفاتورة', 'Bill added': 'أُضيفت الفاتورة',
  'Goal saved': 'حُفظ الهدف', 'Reminders on': 'التذكيرات مُفعّلة', 'Reminders off': 'التذكيرات مُطفأة',
  'All set — welcome!': 'كل شيء جاهز — أهلاً!', 'Shift started — good luck!': 'بدأت الوردية — بالتوفيق!',
  'Shift discarded': 'تم تجاهل الوردية', 'Platform added': 'أُضيفت المنصّة', 'Removed': 'أُزيل', 'Sent': 'أُرسل',
  'Could not send': 'تعذّر الإرسال', 'Rates updated': 'حُدّثت المعدّلات', 'Reset to defaults': 'أُعيد للافتراضي',
  'Backup downloaded': 'نُزّلت النسخة', 'Backup imported': 'استوردت النسخة', 'All data deleted': 'حُذفت كل البيانات',
  'Key saved': 'حُفظ المفتاح', 'Updated': 'تم التحديث', 'Goal turned off': 'أُوقف الهدف',
};

// placeholders (separate so we can target the attribute)
const AR_PH = {
  '0.00': '0.00',
  'business miles': 'أميال العمل', 'miles this shift': 'أميال هذه الوردية', 'optional': 'اختياري',
  'e.g. 4': 'مثال 4', 'e.g. 12': 'مثال 12', 'e.g. Shell, EE': 'مثال Shell، EE', 'e.g. phone 50%': 'مثال الهاتف 50%',
  'Ask anything about your earnings…': 'اسأل أي شيء عن دخلك…', 'e.g. Amazon Flex £52, 4 hours, 40 miles': 'مثال Amazon Flex £52، 4 ساعات، 40 ميلاً',
  'sk-ant-…': 'sk-ant-…', 'Add platform (e.g. Stuart)': 'إضافة منصّة (مثل Stuart)',
};

// Prefix rules for dynamic strings (a number/year follows the label).
const AR_PREFIX = [
  ['Self-employment take-home · ', 'صافي العمل الحر · '],
  ['Estimated take-home · ', 'صافي متوقّع · '],
  ['Set aside for HMRC · ', 'جنّب لـ HMRC · '],
  ['Less: mileage', 'ناقص المسافة'],
  ['Self-employment take-home', 'صافي العمل الحر'],
];

function tr(text) {
  const key = text.trim();
  if (!key) return null;
  if (AR[key]) return AR[key];
  for (const [en, ar] of AR_PREFIX) if (key.startsWith(en)) return ar + key.slice(en.length);
  return null;
}

export function translate(root) {
  if (!isRTL() || !root) return;
  // text nodes
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const val = tr(n.nodeValue);
    if (val != null) n.nodeValue = n.nodeValue.replace(n.nodeValue.trim(), val);
  }
  // placeholders
  root.querySelectorAll?.('[placeholder]').forEach((elm) => {
    const v = AR_PH[elm.placeholder] || AR[elm.placeholder];
    if (v) elm.placeholder = v;
  });
  // titles / aria-labels
  root.querySelectorAll?.('[title]').forEach((elm) => { const v = tr(elm.title); if (v) elm.title = v; });
  root.querySelectorAll?.('[aria-label]').forEach((elm) => { const v = tr(elm.getAttribute('aria-label')); if (v) elm.setAttribute('aria-label', v); });
}

export function applyDir() {
  const html = document.documentElement;
  if (isRTL()) { html.setAttribute('dir', 'rtl'); html.setAttribute('lang', 'ar'); }
  else { html.setAttribute('dir', 'ltr'); html.setAttribute('lang', 'en'); }
}

// Changing language reloads once so every string (incl. static chrome) is correct.
export function setLang(l) { saveSettings({ lang: l }); location.reload(); }
