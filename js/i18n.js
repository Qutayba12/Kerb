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
  // guide / setup
  'Get set up': 'لنُجهّز حسابك', 'Guide': 'الدليل', 'Getting set up': 'جارٍ الإعداد', 'Your checklist': 'قائمتك',
  'Good to know': 'معلومات مفيدة', 'Set your start date': 'حدّد تاريخ البدء', 'Add your UTR (tax reference)': 'أضف الـ UTR (المرجع الضريبي)',
  'Log your first earnings': 'سجّل أول دخل لك', 'Start setting money aside': 'ابدأ بتجنيب المال', 'Take a backup': 'خذ نسخة احتياطية',
  'Turn on scanning (optional)': 'فعّل المسح (اختياري)', 'Register with HMRC': 'التسجيل لدى HMRC',
  'File online & pay your tax': 'قدّم أونلاين وادفع ضريبتك', 'Open your Self Assessment report': 'افتح تقرير Self Assessment',
  'Getting started guide & checklist': 'دليل البدء والقائمة', 'Getting started guide': 'دليل البدء',
  'Income by platform': 'الدخل حسب المنصّة', 'Recent activity': 'النشاط الأخير', 'View all': 'عرض الكل',
  'Add earnings': 'إضافة دخل', 'Scan receipt': 'تصوير فاتورة', 'Safe to spend': 'آمن للصرف',
  'profit after tax': 'الربح بعد الضريبة', 'Tax pot — set this aside': 'وعاء الضريبة — جنّب هذا',
  'Set an earnings goal': 'حدّد هدف دخل', '£ / hour': '£/ساعة', '£ / mile': '£/ميل', 'Tips': 'البقشيش',
  'Weekly goal': 'الهدف الأسبوعي', 'Daily goal': 'الهدف اليومي', 'Monthly goal': 'الهدف الشهري',
  'Employment (PAYE) — separate': 'الوظيفة (PAYE) — منفصلة', 'Salary': 'الراتب', 'Tax deducted': 'الضريبة المخصومة',
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
   'Online return & balancing payment': 'الإقرار والدفع أونلاين',
  '1st payment on account': 'الدفعة المقدّمة الأولى', '2nd payment on account': 'الدفعة المقدّمة الثانية',
  'Export': 'تصدير', 'Summary (CSV)': 'ملخّص (CSV)', 'Transactions (CSV)': 'المعاملات (CSV)',
  'Self Assessment report (print / PDF)': 'تقرير Self Assessment (طباعة / PDF)', 'Net profit': 'صافي الربح',
  'Effective rate': 'المعدّل الفعلي', 'Take-home': 'الصافي', 'Applies': 'ينطبق', 'Likely none this year': 'غالباً لا شيء هذا العام',
  '① Self-employment (delivery)': '① العمل الحر (التوصيل)',
  '② Employment (PAYE) — deducted at source': '② الوظيفة (PAYE) — مخصومة تلقائياً',
  '③ Combined this tax year': '③ المجموع هذه السنة الضريبية',
  'Annual salary': 'الراتب السنوي', 'Income tax deducted': 'ضريبة الدخل المخصومة', 'National Insurance deducted': 'التأمين الوطني المخصوم',
  'Annualised salary': 'الراتب السنوي المقدّر', 'Employment income (PAYE)': 'دخل الوظيفة (PAYE)', 'Self-employment profit': 'ربح العمل الحر',
  'Income tax — deducted via PAYE': 'ضريبة الدخل — مخصومة عبر PAYE', 'Income tax — to pay on self-employment': 'ضريبة الدخل — مستحقّة على العمل الحر',
  'Class 4 NIC — to pay': 'تأمين وطني Class 4 — مستحق', 'You still owe (Self Assessment)': 'ما تزال مديناً به (Self Assessment)',
  'incl. tips': 'شامل البقشيش', 'Less: allowable expenses': 'ناقص: مصاريف قابلة للخصم', 'Less: use of home': 'ناقص: استخدام المنزل',
  'Less: £1,000 trading allowance': 'ناقص: بدل تداول £1,000', 'Each instalment (×2)': 'كل دفعة (×2)',
  // pots
  'Your weekly plan': 'خطتك الأسبوعية', 'Tax pot': 'وعاء الضريبة', 'Tax & NIC reserve': 'احتياطي الضريبة والتأمين',
  'Vehicle pot': 'وعاء المركبة', 'Savings': 'المدّخرات', 'Update': 'تحديث', 'Saved so far': 'المُدّخر حتى الآن', 'Target': 'الهدف',
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
  'Send test notification': 'إرسال إشعار تجريبي', 'Income (turnover)': 'الدخل (الإجمالي)',
  'Daily': 'يومي', 'Weekly': 'أسبوعي', 'Monthly': 'شهري', 'Goal met — great work!': 'تحقّق الهدف — عمل رائع!',
  // shift
  'Live shift': 'الوردية المباشرة', 'Start shift': 'ابدأ الوردية', 'Track miles with GPS': 'تتبّع الأميال بالـ GPS',
  'Platform': 'المنصّة', 'Earnings so far': 'الدخل حتى الآن', 'Deliveries': 'التوصيلات',
  'Business miles (enter at the end)': 'أميال العمل (أدخلها في النهاية)', '£ / hour (live)': '£/ساعة (مباشر)',
  'Stop & save shift': 'إيقاف وحفظ الوردية', 'Discard shift': 'تجاهل الوردية',
  'Count miles by': 'حساب الأميال عبر', 'Odometer': 'عدّاد المسافة', 'GPS (app open)': 'GPS (والتطبيق مفتوح)', 'Add later': 'أضف لاحقاً',
  'Odometer reading now (start)': 'قراءة العدّاد الآن (البداية)', 'Odometer start': 'عدّاد البداية',
  'Odometer now (end)': 'عدّاد الآن (النهاية)', 'Odometer end': 'عدّاد النهاية',
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
  'Add expense manually': 'إضافة مصروف يدوياً', 'Add an expense': 'إضافة مصروف', 'Scan earnings statement': 'مسح كشف الأرباح', 'Scan earnings': 'مسح الأرباح',
  'Scan photo': 'مسح صورة', 'Upload PDF / file': 'رفع PDF / ملف', 'Import CSV': 'استيراد CSV', 'Add payslip': 'إضافة قسيمة راتب',
  // add-menu group headers
  'Scan or upload': 'مسح أو رفع', 'Add manually': 'إضافة يدوية', 'Track & ask': 'التتبّع والسؤال',
   'Scan or import…': 'مسح أو استيراد…', 'Scan or import': 'مسح أو استيراد',
  // bank statement import
  'Import bank statement': 'استيراد كشف بنكي', 'Expense': 'مصروف', 'Skip': 'تخطّي', 'Won\'t be added': 'لن يُضاف',
  'Income (self-employed)': 'دخل (عمل حر)', 'Salary (PAYE)': 'راتب (PAYE)',
  'PAYE — kept separate. Add a payslip for full detail.': 'PAYE — يُحفظ منفصلاً. أضف قسيمة راتب للتفاصيل الكاملة.',
  // payslips — job ended
  'I\'ve left this job': 'لقد تركت هذه الوظيفة',
  'Use the actual total earned (from your P45 / last payslip) — don\'t project it to a full year.': 'استخدم الإجمالي الفعلي المكتسب (من P45 / آخر قسيمة راتب) — دون توقّعه لسنة كاملة.',
   'Annual tax': 'الضريبة السنوية', 'Total salary': 'إجمالي الراتب', 'Total tax': 'إجمالي الضريبة',
  // quarterly updates, payments, pre-filing review
  'Quarterly updates (MTD-ready)': 'التحديثات الربع سنوية (جاهزة لـ MTD)', 'Paid to HMRC': 'المدفوع لـ HMRC',
  'Paid so far': 'المدفوع حتى الآن', 'Still to pay (est.)': 'المتبقّي للدفع (تقديري)',
  'Record a payment to HMRC': 'تسجيل دفعة لـ HMRC', 'Payment recorded': 'سُجّلت الدفعة', 'Payment removed': 'حُذفت الدفعة',
  'Amount paid': 'المبلغ المدفوع', 'Date paid': 'تاريخ الدفع', 'Save payment': 'حفظ الدفعة',
  'Check before you file': 'تحقّق قبل التقديم', 'Check & file': 'تحقّق وقدّم',
  'Worth fixing': 'يستحق الإصلاح',  'Looks fine': 'يبدو سليماً',
  'Open my Self Assessment report': 'افتح تقرير الإقرار الذاتي',
  // vehicles, losses, terms
  'Vehicles': 'المركبات', 'Add a vehicle': 'إضافة مركبة', 'Add vehicle': 'إضافة مركبة', 'Type': 'النوع',
  'Remove': 'إزالة', 'Remove vehicle?': 'إزالة المركبة؟', 'Vehicle added': 'أُضيفت المركبة', 'Vehicle removed': 'أُزيلت المركبة',
   'Carry losses forward': 'ترحيل الخسائر',
    'Loss this year': 'خسارة هذه السنة',
  'Less: loss brought forward': 'ناقص: خسارة مُرحّلة', 'Trading losses:': 'الخسائر التجارية:',
  'Terms of use & privacy': 'شروط الاستخدام والخصوصية', 'Terms & privacy': 'الشروط والخصوصية',
  'Back to Settings': 'العودة للإعدادات',
  // PDF export
  'PDF': 'PDF', 'Save as PDF': 'حفظ كـ PDF', 'Save report (PDF)': 'حفظ التقرير (PDF)', 'Save full records (PDF)': 'حفظ السجلات الكاملة (PDF)',
  'Nothing to export for this period': 'لا شيء للتصدير في هذه الفترة', 'No records to export yet': 'لا توجد سجلات للتصدير بعد',
  // duplicate detection
  'Already logged': 'مُسجّل مسبقاً', 'Skip likely duplicates (recommended)': 'تخطّي التكرارات المحتملة (موصى به)',
  // expense method advisor
  'Expense method': 'طريقة المصاريف', 'Simplified mileage': 'المسافة المبسّطة', 'Actual costs': 'التكاليف الفعلية',
  // privacy & security
  'Privacy & security': 'الخصوصية والأمان', 'Set up a PIN': 'إعداد رمز PIN', 'Change PIN': 'تغيير الرمز',
  'Turn off app lock': 'إيقاف قفل التطبيق', 'Lock when left in the background': 'القفل عند ترك التطبيق في الخلفية',
  'Enter your PIN': 'أدخل رمزك', 'Kerb is locked': 'التطبيق مقفل', 'Wrong PIN — try again.': 'رمز خاطئ — حاول مجدداً.',
  'Choose a 4-digit PIN': 'اختر رمزاً من 4 أرقام', 'Confirm your PIN': 'أكّد رمزك',
  'Enter your current PIN': 'أدخل رمزك الحالي', 'Set a PIN': 'ضبط رمز', 'Confirm PIN': 'تأكيد الرمز',
  'Immediately': 'فوراً', 'After 1 minute': 'بعد دقيقة', 'After 2 minutes': 'بعد دقيقتين', 'After 5 minutes': 'بعد 5 دقائق', 'After 15 minutes': 'بعد 15 دقيقة',
  'On': 'مُفعّل', 'Off': 'مُطفأ',
  // settings
  'Tax basis': 'أساس الضريبة', 'Region': 'المنطقة',  'Working tax year': 'السنة الضريبية العاملة',
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

  // toasts / statuses
  'Saved': 'تم الحفظ', 'Shift added': 'أُضيفت الوردية', 'Shift updated': 'حُدّثت الوردية',
  'Expense added': 'أُضيف المصروف', 'Expense updated': 'حُدّث المصروف', 'Bill updated': 'حُدّثت الفاتورة', 'Bill added': 'أُضيفت الفاتورة',
  'Goal saved': 'حُفظ الهدف', 'Reminders on': 'التذكيرات مُفعّلة', 'Reminders off': 'التذكيرات مُطفأة',
  'All set — welcome!': 'كل شيء جاهز — أهلاً!', 'Shift started — good luck!': 'بدأت الوردية — بالتوفيق!',
  'Shift discarded': 'تم تجاهل الوردية', 'Platform added': 'أُضيفت المنصّة', 'Removed': 'أُزيل', 'Sent': 'أُرسل',
  'Could not send': 'تعذّر الإرسال', 'Rates updated': 'حُدّثت المعدّلات', 'Reset to defaults': 'أُعيد للافتراضي',
  'Backup downloaded': 'نُزّلت النسخة', 'Backup imported': 'استوردت النسخة', 'All data deleted': 'حُذفت كل البيانات',
  'Key saved': 'حُفظ المفتاح', 'Updated': 'تم التحديث', 'Goal turned off': 'أُوقف الهدف',

  // ---- second translation pass: payslips, import, scan, shift, goals,
  // review, report, settings & guide screens ----
  '— none —': '— لا شيء —',
  'Payslips': 'قسائم الراتب',
  'Your payslips': 'قسائمك',
  'My scanned payslips': 'قسائم راتبي الممسوحة',
  'Add a payslip': 'أضف قسيمة راتب',
  'Add a payslip to populate your PAYE figures.': 'أضف قسيمة راتب لتعبئة أرقام PAYE تلقائياً.',
  'Use payslips for my tax figures': 'استخدم القسائم لأرقامي الضريبية',
  'Auto-fills your PAYE salary & tax from these payslips instead of a manual number.': 'يعبّئ راتب PAYE وضريبته من هذه القسائم بدلاً من رقم يدوي.',
  'A manual salary': 'راتب يدوي',
  'Delete payslip?': 'حذف قسيمة الراتب؟',
  'Payslip deleted': 'حُذفت القسيمة',
  'Enter at least the gross pay': 'أدخل الراتب الإجمالي على الأقل',
  'Enter manually': 'إدخال يدوي',
  'Tip: add your Anthropic API key in Settings to auto-read payslips.': 'نصيحة: أضف مفتاح Anthropic API في الإعدادات لقراءة القسائم تلقائياً.',
  'Add your API key in Settings to auto-read': 'أضف مفتاح API في الإعدادات للقراءة التلقائية',
  'Annual': 'سنوي',
  'Quarterly': 'ربع سنوي',
  'Every 4 weeks': 'كل 4 أسابيع',
  'Other': 'أخرى',
  'All time': 'كل الفترات',
  'Last 30 days': 'آخر 30 يوماً',
  'Add your Anthropic key to read receipts, statements & payslips': 'أضف مفتاح Anthropic لقراءة الفواتير والكشوف وقسائم الراتب',
  'Add your API key in Settings to auto-read receipts': 'أضف مفتاح API في الإعدادات لقراءة الفواتير تلقائياً',
  'Could not read image': 'تعذّر قراءة الصورة',
  'Could not read the file': 'تعذّر قراءة الملف',
  'Could not export backup': 'تعذّر تصدير النسخة الاحتياطية',
  'Enter the amount': 'أدخل المبلغ',
  'Enter earnings, tips or miles': 'أدخل الدخل أو البقشيش أو الأميال',
  'Full details': 'التفاصيل الكاملة',
  'Import as': 'استيراد كـ',
  'Auto-detect': 'كشف تلقائي',
  'ISO (YYYY-MM-DD)': 'ISO (سنة-شهر-يوم)',
  'UK (DD/MM/YYYY)': 'بريطانيا (يوم/شهر/سنة)',
  'US (MM/DD/YYYY)': 'أمريكا (شهر/يوم/سنة)',
  'No rows found in that file': 'لا صفوف في هذا الملف',
  'No valid rows with the current mapping — check the columns above.': 'لا صفوف صالحة بالربط الحالي — تحقّق من الأعمدة أعلاه.',
  'Nothing to import — check the mapping': 'لا شيء للاستيراد — تحقّق من الربط',
  'All rows look like duplicates — nothing new to import': 'كل الصفوف تبدو مكرّرة — لا جديد للاستيراد',
  'Rows without a valid amount (or miles, for earnings) are skipped. Likely duplicates of entries you already have are detected by date and amount.': 'تُتخطّى الصفوف بلا مبلغ صالح (أو بلا أميال، في حالة الدخل). وتُكتشف التكرارات المحتملة لمُدخلات موجودة لديك بالتاريخ والمبلغ.',
  'Import backup?': 'استيراد النسخة الاحتياطية؟',
  'No shifts found in that statement': 'لا ورديات في هذا الكشف',
  'Add anyway': 'أضف على أي حال',
  'Review the rows, remove any that are wrong, then add. You can edit each shift afterwards in Income.': 'راجع الصفوف، واحذف أي خطأ، ثم أضف. يمكنك تعديل كل وردية لاحقاً في شاشة الدخل.',
  'No transactions found in that statement': 'لا معاملات في هذا الكشف',
  'Claude suggested a type for each line — change any that are wrong, or set to Skip to leave a line out. You can edit each entry afterwards in Income or Expenses.': 'اقترح كلود نوعاً لكل سطر — عدّل أي خطأ، أو اختر «تخطّي» لاستثناء سطر. يمكنك تعديل كل مُدخل لاحقاً في شاشة الدخل أو المصاريف.',
  'Discard this shift?': 'تجاهل هذه الوردية؟',
  'Add earnings or miles first': 'أضف الدخل أو الأميال أولاً',
  'That is a very long shift': 'هذه وردية طويلة جداً',
  'Enter by odometer (most accurate)': 'الإدخال بعدّاد المسافة (الأدقّ)',
  'Enter the odometer reading, or pick another method': 'أدخل قراءة العدّاد، أو اختر طريقة أخرى',
  'Enter miles when you finish': 'أدخل الأميال عند الانتهاء',
  'HMRC-friendly: read your dashboard odometer at the start and end. Overrides GPS/manual miles.': 'مقبول لدى HMRC: اقرأ عدّاد المسافة في البداية والنهاية. يتجاوز أميال GPS أو اليدوية.',
  'When you finish, enter the dashboard reading here — miles = end − start. No need to keep the app open in between.': 'عند الانتهاء، أدخل قراءة العدّاد هنا — الأميال = النهاية − البداية. لا حاجة لإبقاء التطبيق مفتوحاً بينهما.',
  'Live tracking while Kerb stays open': 'تتبّع مباشر ما دام Kerb مفتوحاً',
  'Most accurate · works even if you close the app': 'الأدقّ · يعمل حتى لو أغلقت التطبيق',
  'Allow notifications first': 'اسمح بالإشعارات أولاً',
  'Permission not granted': 'لم يُمنح الإذن',
  'Notifications are blocked in your browser settings — allow them for Kerb to enable reminders.': 'الإشعارات محجوبة في إعدادات متصفّحك — اسمح بها لـ Kerb لتفعيل التذكيرات.',
  'Notifications are not supported on this browser.': 'هذا المتصفّح لا يدعم الإشعارات.',
  'Deadline & goal nudges on this device.': 'تنبيهات المواعيد والأهداف على هذا الجهاز.',
  'Reminders appear when you open Kerb; on installed Android apps they can also appear in the background. Full server push isn\'t used — your data stays on device.': 'تظهر التذكيرات عند فتح Kerb؛ وفي تطبيقات أندرويد المُثبّتة قد تظهر في الخلفية أيضاً. لا يُستخدم إشعار خادم كامل — بياناتك تبقى على جهازك.',
  'Enter a target amount': 'أدخل المبلغ المستهدف',
  'No history yet.': 'لا سجل بعد.',
  'Avg income / week (last 4 wks)': 'متوسط الدخل / أسبوع (آخر 4 أسابيع)',
  'Register with HMRC as self-employed': 'التسجيل لدى HMRC كعامل حر',
  'File & pay Self Assessment (online)': 'قدّم وادفع الإقرار الذاتي (أونلاين)',
  'Finish setting up for HMRC — tap to see your checklist & key dates.': 'أكمل الإعداد لـ HMRC — اضغط لرؤية قائمتك والمواعيد المهمة.',
  'from your job': 'من وظيفتك',
  'at source': 'عند المصدر',
  'Guidance to help you prepare — not tax advice. Confirm with HMRC or an accountant.': 'إرشادات لمساعدتك في التحضير — وليست استشارة ضريبية. تحقّق مع HMRC أو محاسب.',
  'Hide the setup card from Home': 'إخفاء بطاقة الإعداد من الرئيسية',
  'Hidden — find this guide in Settings': 'مُخفى — ستجد هذا الدليل في الإعدادات',
  'Review entries': 'مراجعة المُدخلات',
  'Review all entries': 'مراجعة كل المُدخلات',
  'This review looks for common mistakes. It cannot catch everything — you are responsible for the figures you file.': 'تبحث هذه المراجعة عن الأخطاء الشائعة. لا يمكنها اكتشاف كل شيء — وأنت المسؤول عن الأرقام التي تقدّمها.',
  'Open Income': 'فتح الدخل',
  'Open Expenses': 'فتح المصاريف',
  'Export a backup': 'صدّر نسخة احتياطية',
  'Set it now': 'اضبطه الآن',
  'Self Assessment Report': 'تقرير الإقرار الذاتي',
  'SA report': 'تقرير الإقرار',
  'No income recorded in this tax year.': 'لا دخل مسجّل في هذه السنة الضريبية.',
  'No expenses recorded in this tax year.': 'لا مصاريف مسجّلة في هذه السنة الضريبية.',
  'Because your bill is over £1,000 and little tax is collected at source, HMRC asks for two advance payments towards next year on top of this year’s bill.': 'لأن فاتورتك تتجاوز £1,000 ولا يُحصّل سوى قليل من الضريبة عند المصدر، تطلب HMRC دفعتين مقدّمتين على حساب السنة القادمة، فوق فاتورة هذه السنة.',
  'Your employer already deducted this tax. It is entered on the employment page so your Personal Allowance is shared correctly across both incomes — it is not extra tax to pay.': 'خصم صاحب العمل هذه الضريبة بالفعل. وتُدخل في صفحة الوظيفة ليُقسَم بدلك الشخصي بشكل صحيح بين الدخلين — وليست ضريبة إضافية مستحقة.',
  'Keep this report and your records for at least 5 years after the 31 January filing deadline, in case HMRC asks to see them.': 'احفظ هذا التقرير وسجلاتك 5 سنوات على الأقل بعد موعد التقديم في 31 يناير، في حال طلبت HMRC الاطلاع عليها.',
  'Estimates generated by Kerb to help you prepare and file. Not formal tax advice — confirm all figures on your HMRC Self Assessment. Kerb keeps your records digital and export-ready but is not HMRC-recognised filing software.': 'تقديرات يُنتجها Kerb لمساعدتك في التحضير والتقديم. ليست استشارة ضريبية رسمية — تحقّق من كل الأرقام في إقرارك لدى HMRC. يحفظ Kerb سجلاتك رقمياً وجاهزة للتصدير، لكنه ليس برنامج تقديم معتمداً من HMRC.',
  'Remove this payment?': 'إزالة هذه الدفعة؟',
  'Plan 1': 'الخطة 1',
  'Plan 2': 'الخطة 2',
  'Plan 4 (Scotland)': 'الخطة 4 (اسكتلندا)',
  'Plan 5': 'الخطة 5',
  'Postgraduate': 'الدراسات العليا',
  'Auto — live estimate': 'تلقائي — تقدير مباشر',
  'Manual — fixed %': 'يدوي — نسبة ثابتة %',
  'Claude Sonnet 5 (most capable)': 'Claude Sonnet 5 (الأقوى)',
  'Claude Haiku 4.5 (fast, cheapest)': 'Claude Haiku 4.5 (سريع وأرخص)',
  'A loss-making year is set against later profits of the same trade, cutting Income Tax and Class 4 NIC.': 'تُخصم السنة الخاسرة من أرباح السنوات التالية للنشاط نفسه، فتُقلّل ضريبة الدخل وتأمين Class 4.',
  'Save rate overrides': 'حفظ تعديلات المعدّلات',
  'Reset this year to defaults': 'إعادة هذه السنة للإعدادات الافتراضية',
  'Protect my data': 'حماية بياناتي',
  'App lock turned off': 'أُوقف قفل التطبيق',
  'Delete everything?': 'حذف كل شيء؟',
  'Simplified mileage (recommended)': 'المسافة المبسّطة (موصى به)',

  'Arabic switches the interface to right-to-left.':
    'العربية تبدّل الواجهة إلى اليمين-لليسار.',
  // ---- third pass: measured from the rendered DOM ----
  'England / Wales / N. Ireland':
    'إنجلترا / ويلز / أيرلندا الشمالية',
  'complete':
    'مكتملة',
  'in progress':
    'جارية',
  'upcoming':
    'قادمة',
  'fuel, insurance, repairs':
    'الوقود، التأمين، الإصلاحات',
  'HMRC rule: once you claim simplified mileage for a car / van, keep that method for it until you change vehicle.':
    'قاعدة HMRC: متى طالبت بالمسافة المبسّطة لسيارة أو فان، فالتزم بهذه الطريقة لها حتى تغيّر المركبة.',
  'Jan':
    'يناير',
  'Feb':
    'فبراير',
  'Mar':
    'مارس',
  'Apr':
    'أبريل',
  'May':
    'مايو',
  'Jun':
    'يونيو',
  'Jul':
    'يوليو',
  'Aug':
    'أغسطس',
  'Sep':
    'سبتمبر',
  'Oct':
    'أكتوبر',
  'Nov':
    'نوفمبر',
  'Dec':
    'ديسمبر',
  'Mon':
    'اثنين',
  'Tue':
    'ثلاثاء',
  'Wed':
    'أربعاء',
  'Thu':
    'خميس',
  'Fri':
    'جمعة',
  'Sat':
    'سبت',
  'Sun':
    'أحد',
  'Set an earnings goal to stay motivated — Kerb tracks your progress and streak.':
    'حدّد هدف دخل لتبقى متحمّساً — ويتابع Kerb تقدّمك وسلسلة إنجازك.',
  'What to enter on your SA103S':
    'ما تُدخله في نموذج SA103S',
  'Voluntary':
    'تطوّعي',
  'How the profit is worked out':
    'كيف يُحسب الربح',
  'Less: loss brought forward from earlier years':
    'ناقص: خسارة مُرحّلة من سنوات سابقة',
  'Employment (PAYE) — SA102':
    'الوظيفة (PAYE) — SA102',
  'Your tax & National Insurance':
    'ضريبتك وتأمينك الوطني',
  'Personal allowance':
    'البدل الشخصي',
  'Income tax on self-employment':
    'ضريبة الدخل على العمل الحر',
  'Total to set aside for HMRC':
    'الإجمالي المُجنّب لـ HMRC',
  'Estimated take-home':
    'الصافي المتوقّع',
  'Effective rate on profit':
    'المعدّل الفعلي على الربح',
  'Register with HMRC by':
    'التسجيل لدى HMRC بحلول',
  'File online & pay by':
    'التقديم أونلاين والدفع بحلول',
  '2nd payment on account by':
    'الدفعة المقدّمة الثانية بحلول',
  'They are excluded from this year\'s totals. The usual cause is the date picker landing on the wrong year. Check them and fix the date if needed.':
    'هي مُستثناة من مجاميع هذه السنة. والسبب المعتاد أن منتقي التاريخ وقع على السنة الخطأ. راجعها وصحّح التاريخ إن لزم.',
  'Your report is missing your name and your UTR':
    'تقريرك ينقصه اسمك ورقم UTR',
  'These appear on the Self Assessment report. Add them so the document is complete.':
    'يظهران في تقرير الإقرار الذاتي. أضفهما ليكون المستند كاملاً.',
  'You have never exported a backup':
    'لم تُصدّر نسخة احتياطية قط',
  'That is correct while you use simplified mileage — the per-mile rate already covers fuel, insurance and repairs. They are kept for your cash records. Kerb checks the other method for you in Insights.':
    'هذا صحيح ما دمت تستخدم المسافة المبسّطة — فمعدّل الميل يغطّي أصلاً الوقود والتأمين والإصلاحات. وتُحفظ لسجلاتك النقدية. ويفحص Kerb الطريقة الأخرى لك في شاشة التحليلات.',
  'This tax year has not ended yet':
    'هذه السنة الضريبية لم تنتهِ بعد',
  'No duplicate-looking entries':
    'لا مُدخلات تبدو مكرّرة',
  'Your records live only on this device — save a copy':
    'سجلاتك موجودة على هذا الجهاز فقط — احفظ نسخة',
  'What Kerb is':
    'ما هو Kerb',
  'Kerb is a record-keeping and estimating tool for UK self-employed delivery drivers. It records your income and expenses, applies published HMRC rates, and produces a summary you can use to complete your own tax return.':
    'Kerb أداة لحفظ السجلات وتقدير الضريبة لسائقي التوصيل العاملين لحسابهم في بريطانيا. يسجّل دخلك ومصاريفك، ويطبّق معدّلات HMRC المنشورة، ويُنتج ملخّصاً تستخدمه لإكمال إقرارك الضريبي بنفسك.',
  'Kerb is NOT accounting, tax or legal advice, and using it does not create a professional relationship of any kind.':
    'Kerb ليس استشارة محاسبية أو ضريبية أو قانونية، ولا ينشئ استخدامه أي علاقة مهنية من أي نوع.',
  'Kerb is not HMRC filing software':
    'Kerb ليس برنامج تقديم لدى HMRC',
  'Kerb is not HMRC-recognised software and cannot submit anything to HMRC. It does not file your Self Assessment and does not send Making Tax Digital quarterly updates.':
    'Kerb ليس برنامجاً معتمداً من HMRC ولا يستطيع إرسال أي شيء إليها. فهو لا يقدّم إقرارك الذاتي ولا يرسل التحديثات الربع سنوية لنظام Making Tax Digital.',
  'You file through HMRC\'s own online service or through HMRC-recognised software. Kerb only prepares the figures for you to enter.':
    'أنت تقدّم عبر خدمة HMRC الإلكترونية نفسها أو عبر برنامج معتمد منها. ويكتفي Kerb بتجهيز الأرقام لتُدخلها.',
  'Your responsibility':
    'مسؤوليتك',
  'You are responsible for the accuracy and completeness of everything you enter, and for the figures you submit to HMRC.':
    'أنت مسؤول عن دقة واكتمال كل ما تُدخله، وعن الأرقام التي ترسلها إلى HMRC.',
  'Check every number before you rely on it. Scanned receipts, statements and payslips are read automatically and can be misread — always verify amounts and dates.':
    'تحقّق من كل رقم قبل الاعتماد عليه. فالفواتير والكشوف وقسائم الراتب الممسوحة تُقرأ تلقائياً وقد تُقرأ خطأً — تأكّد دائماً من المبالغ والتواريخ.',
  'Tax rates, thresholds and rules change, and your own circumstances may need treatment Kerb does not model (for example capital allowances, multiple trades, VAT registration, or complex loss claims). If anything is unclear or significant, speak to a qualified accountant.':
    'المعدّلات والحدود والقواعد الضريبية تتغيّر، وقد تحتاج ظروفك الخاصة معالجة لا يحسبها Kerb (مثل بدلات رأس المال، أو تعدّد الأنشطة، أو التسجيل في ضريبة القيمة المضافة، أو مطالبات الخسائر المعقّدة). وإن كان أي شيء غير واضح أو كبير الأثر، فاستشر محاسباً مؤهّلاً.',
  'Limitation of liability':
    'حدود المسؤولية',
  'Kerb is provided "as is", without warranty of any kind, express or implied, including fitness for a particular purpose or accuracy of results.':
    'يُقدَّم Kerb «كما هو»، دون أي ضمان صريح أو ضمني، بما في ذلك الملاءمة لغرض معيّن أو دقّة النتائج.',
  'To the fullest extent permitted by law, the author is not liable for any loss or damage arising from your use of Kerb — including any tax, interest, penalty, assessment or other cost resulting from figures that are incorrect, incomplete, misread or relied upon.':
    'إلى أقصى حدّ يسمح به القانون، لا يتحمّل المؤلّف أي مسؤولية عن أي خسارة أو ضرر ينشأ عن استخدامك Kerb — بما في ذلك أي ضريبة أو فائدة أو غرامة أو تقدير أو تكلفة أخرى تنتج عن أرقام خاطئة أو ناقصة أو مقروءة خطأً أو تم الاعتماد عليها.',
  'Nothing here excludes or limits liability where it cannot lawfully be excluded.':
    'لا شيء هنا يستثني أو يحدّ المسؤولية حيث لا يجوز استثناؤها قانوناً.',
  'Privacy — your data stays on your device':
    'الخصوصية — بياناتك تبقى على جهازك',
  'Your records are stored only on this device. There is no Kerb server and no account, so your income, expenses and tax figures are never uploaded to us, and we cannot see them.':
    'تُحفظ سجلاتك على هذا الجهاز فقط. لا يوجد خادم لـ Kerb ولا حساب، لذا لا تُرفع إلينا أرقام دخلك ومصاريفك وضريبتك أبداً، ولا نستطيع رؤيتها.',
  'The one exception is scanning: if you add your own Anthropic API key and choose to scan a receipt, statement or payslip, that single image or file is sent directly from your device to Anthropic to be read, under your own key and their terms. It is not stored by Kerb.':
    'الاستثناء الوحيد هو المسح: إن أضفت مفتاح Anthropic الخاص بك واخترت مسح فاتورة أو كشف أو قسيمة راتب، فتُرسل تلك الصورة أو الملف وحده مباشرةً من جهازك إلى Anthropic لقراءته، بمفتاحك الخاص ووفق شروطهم. ولا يحفظه Kerb.',
  'Because the data is only on this device, losing or wiping the device loses the records. Export a backup regularly, and keep your device\'s own screen lock on.':
    'ولأن البيانات على هذا الجهاز فقط، فإن فقدانه أو مسحه يفقدك السجلات. صدّر نسخة احتياطية بانتظام، وأبقِ قفل شاشة جهازك مُفعّلاً.',
  'Deleting the app, or clearing its data, permanently deletes your records.':
    'حذف التطبيق أو مسح بياناته يحذف سجلاتك نهائياً.',
  'Changes':
    'التغييرات',
  'These terms may be updated as the app changes. The date at the top shows the current version. Continuing to use Kerb means you accept the terms in force at the time.':
    'قد تُحدّث هذه الشروط مع تطوّر التطبيق. والتاريخ في الأعلى يوضّح النسخة الحالية. ويعني استمرارك في استخدام Kerb قبولك للشروط السارية حينها.',
  'Scotland':
    'اسكتلندا',
  'Car / Van':
    'سيارة / فان',
  'Motorcycle / Scooter':
    'دراجة نارية / سكوتر',
  'Bicycle':
    'دراجة هوائية',
  'Claim a flat rate per business mile.':
    'طالِب بمعدّل ثابت لكل ميل عمل.',
  'Used for your HMRC registration reminder.':
    'يُستخدم لتذكيرك بالتسجيل لدى HMRC.',
  'Optional — appears on the printable report.':
    'اختياري — يظهر في التقرير القابل للطباعة.',
  'Optional Unique Taxpayer Reference.':
    'المرجع الضريبي الفريد (اختياري).',
  'PAYE figures from':
    'أرقام PAYE من',
  'Choose “scanned payslips” to auto-fill your PAYE salary & tax from uploaded payslips.':
    'اختر «القسائم الممسوحة» لتعبئة راتب PAYE وضريبته تلقائياً من القسائم المرفوعة.',
  'Manage payslips (scan / PDF)':
    'إدارة قسائم الراتب (مسح / PDF)',
  'Your employed job\'s yearly pay before tax. Delivery profit is taxed on top of this.':
    'أجر وظيفتك السنوي قبل الضريبة. ويُفرض على ربح التوصيل فوق هذا المبلغ.',
  'Optional — improves the payments-on-account estimate.':
    'اختياري — يُحسّن تقدير الدفعات المقدّمة.',
  'Rent, other self-employment, etc.':
    'الإيجار، عمل حر آخر، إلخ.',
  'Simplified flat-rate relief if you do admin from home (25h+/month).':
    'خصم ثابت مبسّط إن كنت تؤدّي أعمالاً إدارية من المنزل (25 ساعة+/شهر).',
  'Set aside weekly for fuel, servicing, insurance renewal.':
    'جنّب أسبوعياً للوقود والصيانة وتجديد التأمين.',
  'Personal allowance (£)':
    'البدل الشخصي (£)',
  'Mileage rate — first 10k (£/mile)':
    'معدّل المسافة — أول 10 آلاف (£/ميل)',
  'Mileage rate — over 10k (£/mile)':
    'معدّل المسافة — بعد 10 آلاف (£/ميل)',
  'Trading allowance (£)':
    'بدل التداول (£)',
  'App lock (PIN)':
    'قفل التطبيق (PIN)',
  'Off — anyone with your phone can open Kerb.':
    'مُطفأ — أي شخص بحوزته هاتفك يمكنه فتح Kerb.',
  'Import platform CSV':
    'استيراد CSV من المنصّة',
  'No payslips yet':
    'لا قسائم راتب بعد',
  'Scan or upload your latest payslip to get started.':
    'امسح أو ارفع آخر قسيمة راتب للبدء.',
  'Export your weekly statement from Amazon Flex / Uber Eats (or any app) as CSV, then import it here. Kerb auto-detects the columns — you can adjust the mapping before importing.':
    'صدّر كشفك الأسبوعي من Amazon Flex أو Uber Eats (أو أي تطبيق) بصيغة CSV، ثم استورده هنا. يكتشف Kerb الأعمدة تلقائياً — ويمكنك تعديل الربط قبل الاستيراد.',
  'Earnings':
    'الدخل',
  'Choose CSV file':
    'اختر ملف CSV',
  'Add your Anthropic API key in Settings to read statements. Your statement is sent only to Anthropic to read it — never stored anywhere else.':
    'أضف مفتاح Anthropic في الإعدادات لقراءة الكشوف. ويُرسل كشفك إلى Anthropic فقط لقراءته — ولا يُحفظ في أي مكان آخر.',
  'Add your Anthropic API key in Settings to scan statements. You can still add earnings manually or import a CSV.':
    'أضف مفتاح Anthropic في الإعدادات لمسح الكشوف. ويمكنك مع ذلك إضافة الدخل يدوياً أو استيراد ملف CSV.',
  'Add your Anthropic API key in Settings to use the assistant (quick-add by text, questions about your data, and summaries).':
    'أضف مفتاح Anthropic في الإعدادات لاستخدام المساعد (الإضافة السريعة بالنص، والأسئلة عن بياناتك، والملخّصات).',
  'Read the number on your dashboard. At the end, enter the new reading — Kerb works out the miles.':
    'اقرأ الرقم على لوحة عدّادات سيارتك. وفي النهاية أدخل القراءة الجديدة — ويحسب Kerb الأميال.',
  'Best choice. You only open Kerb twice — now, and when you finish. Nothing runs in the background.':
    'الخيار الأفضل. تفتح Kerb مرّتين فقط — الآن، وعند الانتهاء. ولا شيء يعمل في الخلفية.',

  'Handled automatically by your employer — nothing to set aside. Kept separate from your delivery figures above.':
    'يتولّاها صاحب العمل تلقائياً — فلا شيء لتجنيبه. وتُحفظ منفصلة عن أرقام التوصيل أعلاه.',
  'not deductible':
    'غير قابل للخصم',

  // ---- expense categories ----
  'Phone & Internet': 'الهاتف والإنترنت',
  'Bags & Equipment': 'الحقائب والمستلزمات',
  'Parking & Tolls': 'المواقف والرسوم',
  'Platform / Service Fees': 'رسوم المنصّة / الخدمة',
  'Protective Clothing': 'الملابس الواقية',
  'Accountancy & Software': 'المحاسبة والبرمجيات',
  'Stationery & Postage': 'القرطاسية والبريد',
  'Fuel': 'الوقود',
  'Vehicle Insurance': 'تأمين المركبة',
  'Repairs & Servicing': 'الإصلاحات والصيانة',
  'Road Tax & MOT': 'ضريبة الطريق والفحص الفني',
  'Vehicle Cleaning': 'تنظيف المركبة',
  'vs': 'مقابل',
  'today': 'اليوم',
  'tomorrow': 'غداً',
  'no hours logged': 'لا ساعات مسجّلة',
  'Your records are stored only on this device. There is no account, and your income, expenses and tax figures are never uploaded to us. We cannot see them.':
    'تُحفظ سجلاتك على هذا الجهاز فقط. لا يوجد حساب، ولا تُرفع إلينا أرقام دخلك ومصاريفك وضريبتك أبداً. ولا نستطيع رؤيتها.',
  'Scanning is the exception, and it works one of two ways. If you add your own Anthropic API key, the image or file goes straight from this device to Anthropic under your key and their terms, and touches no server of ours.':
    'المسح هو الاستثناء، ويعمل بإحدى طريقتين. إن أضفت مفتاح Anthropic الخاص بك، فتذهب الصورة أو الملف مباشرةً من هذا الجهاز إلى Anthropic بمفتاحك ووفق شروطهم، ولا تمرّ بأي خادم لنا.',
  'If you have not added a key, scanning uses a free monthly allowance. The image or file is then sent to a Kerb endpoint, which forwards it to Anthropic using our key and returns the result. It passes through our server to get there. We do not store it, and it is not used for anything else — but it does leave your device by way of us, which is the difference between the two. Add your own key if you would rather it never did.':
    'وإن لم تُضف مفتاحاً، فيستخدم المسح حصّة شهرية مجانية. عندها تُرسل الصورة أو الملف إلى خادم Kerb، فيمرّرها إلى Anthropic بمفتاحنا ويعيد النتيجة. أي أنها تمرّ بخادمنا في طريقها. نحن لا نحفظها ولا تُستخدم لأي غرض آخر — لكنها تغادر جهازك عبرنا، وهذا هو الفرق بين الطريقتين. أضف مفتاحك الخاص إن كنت تفضّل ألّا تفعل.',
  'Either way, only the file you choose to scan is sent. Your records, totals and tax figures are not.':
    'وفي الحالتين، لا يُرسل سوى الملف الذي تختار مسحه. أما سجلاتك ومجاميعك وأرقامك الضريبية فلا تُرسل.',
  'Free for a limited number of scans each month. Add your own Anthropic API key in Settings for unlimited scanning.':
    'مجاني لعدد محدود من المسحات شهرياً. أضف مفتاح Anthropic الخاص بك في الإعدادات لمسح بلا حدود.',
  'Scanning is free for a limited number each month. Add your own Anthropic API key in Settings for unlimited scanning.':
    'المسح مجاني لعدد محدود شهرياً. أضف مفتاح Anthropic الخاص بك في الإعدادات لمسح بلا حدود.',
  'Scanning is free for a limited number each month, and your statement passes through Kerb\'s server on its way to Anthropic to be read. Add your own Anthropic API key in Settings to send it straight from this device instead.':
    'المسح مجاني لعدد محدود شهرياً، ويمرّ كشفك بخادم Kerb في طريقه إلى Anthropic لقراءته. أضف مفتاح Anthropic الخاص بك في الإعدادات لإرساله مباشرةً من هذا الجهاز بدلاً من ذلك.',
  'This needs your own Anthropic API key. Add one in Settings — scanning receipts and statements works without it.':
    'هذا يتطلّب مفتاح Anthropic الخاص بك. أضفه في الإعدادات — أما مسح الفواتير والكشوف فيعمل بدونه.',
  'Scanning is not available on this deployment. Add your own Anthropic API key in Settings.':
    'المسح غير متاح في هذه النسخة. أضف مفتاح Anthropic الخاص بك في الإعدادات.',
  'Enter a key first.':
    'أدخل مفتاحاً أولاً.',
  'Capture your earnings':
    'صوّر أرباحك',
  'An entry adds up to other entries you already have':
    'مُدخل يساوي مجموع مُدخلات أخرى لديك',
  'Pickup stations':
    'محطات الاستلام',
  'Add a station':
    'إضافة محطة',
  'Add station':
    'إضافة محطة',
  'Station':
    'المحطة',
  'Station name':
    'اسم المحطة',
  'Whatever you call it.':
    'أي اسم تعرفها به.',
  'Pick one to fill the miles in automatically.':
    'اختر واحدة لتُملأ الأميال تلقائياً.',
  'How you worked these out':
    'كيف توصّلت إلى هذه الأرقام',
  'Shown on your Self Assessment report. If HMRC asks how you arrived at your mileage, this is the answer.':
    'يظهر في تقرير إقرارك الذاتي. وإن سألتك HMRC كيف توصّلت إلى أميالك، فهذا هو الجواب.',
  'Station removed':
    'أُزيلت المحطة',
  'Station added':
    'أُضيفت المحطة',
  'Remove station?':
    'إزالة المحطة؟',
  'Shifts already logged keep the miles they have.':
    'الورديات المسجّلة تحتفظ بأميالها كما هي.',
  'Name the station':
    'سمِّ المحطة',
  '— not set —':
    '— غير محدّدة —',
  'Pickup points sit at very different distances, so one "typical miles" figure would overstate the near ones and understate the far ones. Set each station once and Kerb fills the miles in when you log a block there.':
    'نقاط الاستلام تقع على مسافات شديدة التباين، فرقم «أميال نمطية» واحد يُضخّم القريبة ويُنقص البعيدة. اضبط كل محطة مرّة واحدة، فيملأ Kerb الأميال عند تسجيل بلوك فيها.',
  'Use this':
    'استخدم هذا',
  'Updated from your measured shifts':
    'حُدّث من ورديّاتك المقيسة',
  'Miles from home to this station':
    'الأميال من البيت إلى هذه المحطة',
  'Typical miles for a whole block':
    'الأميال المعتادة للبلوك كاملاً',
  'One way. This is the only part that is the same every time.':
    'اتجاه واحد. وهو الجزء الوحيد الثابت في كل مرة.',
  'Leave it blank — log one shift by odometer and Kerb fills it in.':
    'اتركه فارغاً — سجّل وردية واحدة بالعدّاد فيملؤه Kerb.',
  'Recording it lets Kerb learn what a block from here comes to.':
    'تسجيلها يتيح لـ Kerb معرفة كم يبلغ البلوك من هنا.',
  'Assign stations':
    'تعيين المحطات',
  'Assign stations to past shifts':
    'تعيين المحطات للورديات السابقة',
  'Set in bulk':
    'تعيين جماعي',
  'Choose a station…':
    'اختر محطة…',
  'Also set the miles from that station':
    'اضبط الأميال أيضاً من تلك المحطة',
  'Pick a station to enable this.':
    'اختر محطة لتفعيل هذا.',
  'Select some shifts below':
    'اختر ورديات من الأسفل',
  'Every shift has a station':
    'كل وردية لها محطة',
  'Station cleared':
    'أُزيلت المحطة',
  'Set the station on shifts logged before you had them. If a statement never said which station a shift was from, leave it unset — the miles you already entered stay, and the report counts them as not attributed to a station rather than pretending otherwise.':
    'عيّن المحطة للورديات المسجّلة قبل أن تضيفها. وإن لم يذكر الكشف من أي محطة كانت الوردية، فاتركها فارغة — تبقى الأميال التي أدخلتها، ويعدّها التقرير غير منسوبة لمحطة بدل التظاهر بغير ذلك.',
  'Their miles still count in full. Setting the station records which pickup point each shift ran from, which is what shows the travel was between varying places rather than to one fixed base. Leave any you genuinely cannot work out — a guess here would change the mileage.':
    'أميالها تُحسب كاملة كما هي. وتعيين المحطة يسجّل نقطة الاستلام لكل وردية، وهو ما يُظهر أن تنقّلك كان بين أماكن متغيّرة لا إلى قاعدة ثابتة واحدة. واترك ما لا تستطيع معرفته فعلاً — فالتخمين هنا يغيّر الأميال.',
  'Add your stations first, in Settings. Each one needs the distance from home before a shift can use it.':
    'أضف محطاتك أولاً من الإعدادات. كل محطة تحتاج مسافتها من البيت قبل أن تستخدمها وردية.',
  'No shifts in this tax year':
    'لا ورديات في هذه السنة الضريبية',
  'Your whole mileage claim is an estimate':
    'مطالبة الأميال كلها تقديرية',
  'A distance with no reading behind it is an estimate, however carefully it was worked out. Settings marks which stations have never been measured — one tracked shift from each is all it takes.':
    'المسافة التي لا تستند إلى قراءة هي تقدير، مهما حُسبت بعناية. والإعدادات تبيّن أي المحطات لم تُقَس قط — ووردية واحدة متتبَّعة من كل منها تكفي.',
  'Every station has a measured block behind its mileage':
    'كل محطة خلف أميالها بلوك مقيس',
  'Start a tracked shift':
    'ابدأ وردية متتبَّعة',
  'How the mileage was worked out:':
    'كيف حُسبت المسافة:',
  'Your mileage claim may not be allowed':
    'قد لا تكون مطالبة الأميال مسموحة',
  'You have said you deducted a vehicle\u2019s purchase price as an expense. Under the cash basis HMRC does not allow simplified mileage for that same vehicle \u2014 you claim one or the other. This is the biggest figure on your return, so settle it with an accountant before you file, or switch to the actual-costs method.':
    'ذكرت أنك خصمت ثمن شراء مركبة كمصروف. وتحت الأساس النقدي لا تسمح HMRC بمعدّل المسافة المبسّط للمركبة نفسها — فإما هذا أو ذاك. وهذا أكبر رقم في إقرارك، فاحسمه مع محاسب قبل التقديم، أو انتقل إلى طريقة التكاليف الفعلية.',
  'One question still decides whether your mileage claim stands':
    'سؤال واحد ما زال يحدّد هل تصمد مطالبة الأميال',
  'On the cash basis you cannot claim simplified mileage for a vehicle whose purchase price you already deducted as an expense. Kerb cannot tell from your records which it was. Answer it once in Settings and this goes.':
    'تحت الأساس النقدي لا يمكنك المطالبة بمعدّل المسافة المبسّط لمركبة خصمت ثمن شرائها كمصروف. ولا يستطيع Kerb معرفة ذلك من سجلاتك. أجب عنه مرة واحدة في الإعدادات ويختفي هذا.',
  'No vehicle purchase was claimed against this mileage':
    'لم يُطالَب بثمن شراء مركبة مقابل هذه الأميال',
  'All entries fall inside the tax year':
    'كل المُدخلات تقع داخل السنة الضريبية',
  'No expenses recorded':
    'لا مصاريف مسجّلة',
  'Almost every driver has costs — phone, insurance, repairs, parking, bags. Without them you may pay more tax than you need to.':
    'لكل سائق تقريباً تكاليف — الهاتف والتأمين والإصلاحات ومواقف السيارات والحقائب. وبدونها قد تدفع ضريبة أكثر مما يلزم.',
  'Add an expense':
    'أضف مصروفاً',
  'Your mileage will not be claimable when it overtakes the allowance':
    'لن تكون أميالك قابلة للمطالبة حين تتجاوز البدل',
  'One question will decide your mileage claim once it overtakes the allowance':
    'سؤال واحد سيحدّد مطالبة الأميال حين تتجاوز البدل',
  'It beats your recorded expenses this year, so Kerb claims it instead. You cannot claim both — if you have costs you have not logged yet, add them and this may flip.':
    'إنه يتجاوز مصاريفك المسجّلة هذه السنة، فيطالب به Kerb بدلاً منها. ولا يمكنك المطالبة بالاثنين — فإن كانت لديك تكاليف لم تسجّلها بعد، أضفها وقد ينقلب هذا.',
  'Declare this in the losses section of your return so HMRC carries it into future years. If you miss it, you lose the relief.':
    'أعلن هذا في قسم الخسائر من إقرارك ليُرحّله HMRC إلى السنوات القادمة. وإن أغفلته فقدت الإعفاء.',
  'Answer it':
    'أجب عنه',
  'Did you claim a vehicle\'s purchase price as an expense?':
    'هل طالبت بثمن شراء مركبة كمصروف؟',
  'On the cash basis you cannot claim simplified mileage for a vehicle whose purchase cost you already deducted. Kerb cannot tell from your records, so it asks.':
    'تحت الأساس النقدي لا يمكنك المطالبة بمعدّل المسافة المبسّط لمركبة خصمت تكلفتها من قبل. ولا يستطيع Kerb معرفة ذلك من سجلاتك، لذلك يسأل.',
  '\u2014 not answered \u2014':
    '— بلا إجابة —',
  'Yes \u2014 I deducted the cost of buying one':
    'نعم — خصمت تكلفة شراء واحدة',
  'No':
    'لا',
  'That is one shift, so it is one route rather than a typical distance. Use it only if that block was an ordinary one, and check the miles against the drive you actually made each time. A second reading will show the spread.':
    'هذه وردية واحدة، فهي مسار واحد لا مسافة معتادة. استخدمها فقط إن كان ذلك البلوك عادياً، وراجع الأميال في كل مرة مقابل المسافة التي قطعتها فعلاً. والقراءة الثانية ستُظهر لك المدى.',
};

// Both "all estimated" details open the same way and differ only in their
// closing advice, so the shared halves are declared once here.
const EST_EN = "{0} of this year's deduction rests on {1} miles that were all typed in — not one was read off an odometer or tracked. HMRC does accept a reasonable estimate, so this is not an error, but it is the thinnest record you can hold for your largest claim. ";
const EST_AR = '{0} من خصم هذه السنة يستند إلى {1} ميل أُدخلت كلها يدوياً — ولم يُقرأ أي منها من عدّاد السيارة ولم تُتبَّع. وHMRC يقبل التقدير المعقول، فهذا ليس خطأً، لكنه أضعف سجل يمكن أن تحتفظ به لأكبر مطالبة لديك. ';

// placeholders (separate so we can target the attribute)
const AR_PH = {
  '0.00': '0.00',
  'business miles': 'أميال العمل', 'miles this shift': 'أميال هذه الوردية', 'optional': 'اختياري',
  'e.g. 4': 'مثال 4', 'e.g. 12': 'مثال 12', 'e.g. Shell, EE': 'مثال Shell، EE', 'e.g. phone 50%': 'مثال الهاتف 50%',
  'Ask anything about your earnings…': 'اسأل أي شيء عن دخلك…', 'e.g. Amazon Flex £52, 4 hours, 40 miles': 'مثال Amazon Flex £52، 4 ساعات، 40 ميلاً',
  'sk-ant-…': 'sk-ant-…', 'Add platform (e.g. Stuart)': 'إضافة منصّة (مثل Stuart)',
  'Search platform or note…': 'ابحث بالمنصّة أو الملاحظة…', 'Search vendor, category or note…': 'ابحث بالمتجر أو التصنيف أو الملاحظة…',

  'street address': 'عنوان الشارع',
  'town / city / area': 'البلدة / المدينة / المنطقة',
  'postcode': 'الرمز البريدي',
  'e.g. Visa ****1234': 'مثال Visa ****1234',
  'receipt / invoice no.': 'رقم الفاتورة',
  'VAT reg no.': 'رقم تسجيل VAT',
  'items summary': 'ملخّص البنود',
  'e.g. Phone contract': 'مثال عقد الهاتف',
  'sk-ant-…  (optional, for receipt scanning)': 'sk-ant-…  (اختياري، لقراءة الفواتير)',
  'e.g. Corsa (AB12 CDE)': 'مثال Corsa (AB12 CDE)',
  'e.g. 84213': 'مثال 84213',
  'start': 'البداية',
  'end': 'النهاية',
  'e.g. Balancing payment, 1st payment on account': 'مثال دفعة التسوية، الدفعة المقدّمة الأولى',
};

// Slotted patterns for plain text nodes: '… {0} …' -> '… {0} …'.
const AR_PAT = {
  '{0} days':
    '{0} يوماً',
  'Nothing recorded for last {0} days.':
    'لا شيء مسجّل في آخر {0} يوماً.',
  'Income tax {0} + Class {1} NIC {2}':
    'ضريبة الدخل {0} + تأمين وطني Class {1} {2}',
  'Class {0} NIC':
    'تأمين وطني Class {0}',
  'Class {0} NIC — to pay':
    'تأمين وطني Class {0} — مستحق',
  'Income {0} · Expenses {1} · due {2} {3} {4}':
    'دخل {0} · مصاريف {1} · الاستحقاق {2} {3} {4}',
  'Each instalment (×{0})':
    'كل دفعة (×{0})',
  'Estimates for guidance using {0} rates (Car / Van, simplified mileage). Always confirm figures on your HMRC Self Assessment. Adjust rates or your PAYE salary in Settings.':
    'تقديرات إرشادية بمعدّلات {0} (سيارة / فان، مسافة مبسّطة). تحقّق دائماً من الأرقام في إقرارك لدى HMRC. ويمكنك تعديل المعدّلات أو راتب PAYE من الإعدادات.',
  'Avg income / week (last {0} wks)':
    'متوسط الدخل / أسبوع (آخر {0} أسابيع)',
  'Recommended reserve for {0}. Live estimate ({1} of profit).':
    'الاحتياطي الموصى به لسنة {0}. تقدير مباشر ({1} من الربح).',
  'On track ({0} buffer)':
    'على المسار ({0} هامش)',
  '{0}/week × {1} weeks this tax year.':
    '{0}/أسبوع × {1} أسبوعاً في هذه السنة الضريبية.',
  '{0} short':
    'ناقص {0}',
  '{0}/week × {1} weeks.':
    '{0}/أسبوع × {1} أسبوعاً.',
  '{0} mi claim':
    'مطالبة {0} ميل',
  'Best rate: {0} at {1}/hour':
    'أفضل معدّل: {0} بـ {1}/ساعة',
  'Based on {0} of the tax year elapsed. Assumes a steady pace.':
    'بناءً على انقضاء {0} من السنة الضريبية. ويفترض وتيرة ثابتة.',
  'Tax year {0} ({1} {2} {3} – {4} {5} {6})':
    'السنة الضريبية {0} ({1} {2} {3} – {4} {5} {6})',
  'Turnover is your total takings before any costs. Put the single total of your allowable expenses in box {0} (the short form does not need them itemised while turnover is under {1}).':
    'إجمالي الدخل هو كل متحصّلاتك قبل أي تكاليف. اكتب مجموعاً واحداً لمصاريفك القابلة للخصم في خانة {0} (النموذج المختصر لا يطلب تفصيلها ما دام إجمالي الدخل أقل من {1}).',
  'Mileage is claimed at HMRC\'s simplified rate. For a car that is {0}/mile for the first {1} business miles and {2} after. When you claim mileage you cannot also claim fuel, insurance or repairs for the same vehicle.':
    'تُطالَب المسافة بالمعدّل المبسّط من HMRC. وللسيارة يكون {0}/ميل لأول {1} ميل عمل، و{2} بعدها. وعند المطالبة بالمسافة لا يمكنك المطالبة أيضاً بالوقود أو التأمين أو الإصلاحات للمركبة نفسها.',
  '1st payment on account — by {0} {1} {2}':
    'الدفعة المقدّمة الأولى — بحلول {0} {1} {2}',
  '2nd payment on account — by {0} {1} {2}':
    'الدفعة المقدّمة الثانية — بحلول {0} {1} {2}',
  'Because your bill is over {0} and little tax is collected at source, HMRC asks for two advance payments towards next year on top of this year’s bill.':
    'لأن فاتورتك تتجاوز {0} ولا يُحصّل سوى قليل من الضريبة عند المصدر، تطلب HMRC دفعتين مقدّمتين على حساب السنة القادمة، فوق فاتورة هذه السنة.',
  'Keep this report and your records for at least {0} years after the {1} {2} filing deadline, in case HMRC asks to see them.':
    'احفظ هذا التقرير وسجلاتك {0} سنوات على الأقل بعد موعد التقديم في {1} {2}، في حال طلبت HMRC الاطلاع عليها.',
  'A review of your {0} records — the things an accountant would look at.':
    'مراجعة لسجلات سنة {0} — الأمور التي ينظر فيها المحاسب.',
  '{0} entry is dated outside {1}':
    '{0} مُدخل تاريخه خارج {1}',
  'Your records live only on this device, and HMRC expects you to keep them for {0} years after filing.':
    'سجلاتك موجودة على هذا الجهاز فقط، وتتوقّع HMRC أن تحفظها {0} سنوات بعد التقديم.',
  '{0} of vehicle running costs are not separately claimed':
    '{0} من تكاليف تشغيل المركبة غير مُطالَب بها منفصلة',
  'It runs to {0} {1} {2}. You can file from {3} {4}, and the deadline is {5} {6} {7}.':
    'تنتهي في {0} {1} {2}. ويمكنك التقديم من {3} {4}، والموعد النهائي {5} {6} {7}.',
  '{0} business miles claimed':
    'مُطالَب بـ {0} ميل عمل',
  '{0} / {1} done':
    '{0} / {1} مُنجزة',
  'Started {0} {1} {2}':
    'بدأت في {0} {1} {2}',
  'HMRC sends it ~{0} days after registering — add it when it arrives':
    'ترسله HMRC بعد نحو {0} يوماً من التسجيل — أضفه عند وصوله',
  '{0} shifts logged':
    '{0} وردية مسجّلة',
  '{0} in your tax pot':
    '{0} في وعاء ضريبتك',
  'Key dates · {0}':
    'مواعيد مهمة · {0}',
  '{0} {1} {2} · you\'ve done this ✓':
    '{0} {1} {2} · أنجزت هذا ✓',
  '{0} {1} {2} · first Self Assessment':
    '{0} {1} {2} · أول إقرار ذاتي',
  'Last updated {0} {1} {2}':
    'آخر تحديث {0} {1} {2}',
  'HMRC expects you to keep your business records for at least {0} years after the {1} {2} filing deadline. Keeping those records — including your own backups — is your responsibility.':
    'تتوقّع HMRC أن تحفظ سجلات عملك {0} سنوات على الأقل بعد موعد التقديم في {1} {2}. وحفظ تلك السجلات — بما فيها نسخك الاحتياطية — مسؤوليتك.',
  'A loss-making year is set against later profits of the same trade, cutting Income Tax and Class {0} NIC.':
    'تُخصم السنة الخاسرة من أرباح السنوات التالية للنشاط نفسه، فتُقلّل ضريبة الدخل وتأمين Class {0}.',
  'Plan {0}':
    'الخطة {0}',
  'Plan {0} (Scotland)':
    'الخطة {0} (اسكتلندا)',
  'Claude Haiku {0} (fast, cheapest)':
    'Claude Haiku {0} (سريع وأرخص)',
  'Claude Sonnet {0} (most capable)':
    'Claude Sonnet {0} (الأقوى)',
  'Haiku {0} is plenty for receipts and the cheapest.':
    'Haiku {0} يكفي تماماً للفواتير وهو الأرخص.',
  'Editing {0}. Changes are saved as overrides for this year only.':
    'تعديل سنة {0}. تُحفظ التغييرات كتعديلات لهذه السنة فقط.',
  'Class {0} NIC main rate ({1}–{2})':
    'المعدّل الأساسي لتأمين Class {0} ({1}–{2})',
  'Class {0} NIC upper rate ({1}–{2})':
    'المعدّل الأعلى لتأمين Class {0} ({1}–{2})',

  'Q1 · {0} {1} – {2} {3} {4}':
    'الربع 1 · {0} {1} – {2} {3} {4}',
  'Q2 · {0} {1} – {2} {3} {4}':
    'الربع 2 · {0} {1} – {2} {3} {4}',
  'Q3 · {0} {1} – {2} {3} {4}':
    'الربع 3 · {0} {1} – {2} {3} {4}',
  'Q4 · {0} {1} – {2} {3} {4}':
    'الربع 4 · {0} {1} – {2} {3} {4}',
  'Net profit {0} after {1} tax & NIC':
    'صافي الربح {0} بعد {1} ضريبة وتأمين',
  '≈ {0} of profit (live estimate)':
    '≈ {0} من الربح (تقدير مباشر)',
  'Last {0} days':
    'آخر {0} يوماً',
  '{0} shifts':
    '{0} وردية',
  '{0} items':
    '{0} عنصراً',
  '{0} worked':
    '{0} عمل',
  '{0} {1} {2} · {3} ago':
    '{0} {1} {2} · قبل {3}',
  'Simplified flat-rate relief if you do admin from home ({0}+/month).':
    'خصم ثابت مبسّط إن كنت تؤدّي أعمالاً إدارية من المنزل ({0}+/شهر).',
  '{0}, {1} {2}':
    '{0}، {1} {2}',
  '{0} mi':
    '{0} ميل',
  '{0} drops':
    '{0} توصيلة',
  '{0} tips':
    '{0} بقشيش',
  '{0}% biz':
    '{0}% عمل',
  '{0} claimable':
    '{0} قابل للخصم',
  'Less: mileage ({0} mi)': 'ناقص المسافة ({0} ميل)',
  'Less: mileage — {0} ({1} mi)': 'ناقص المسافة — {0} ({1} ميل)',
  '{0} ago': 'قبل {0}',
  'in {0}': 'خلال {0}',
  'in ~{0}': 'خلال ~{0}',
  '{0} · {1}/hr': '{0} · {1}/ساعة',
  'No earnings logged yet. Your platform only keeps recent history and you cannot download it, so capture it before it goes.':
    'لا دخل مسجّل بعد. منصّتك تحتفظ بسجل حديث فقط ولا يمكنك تحميله، فصوّره قبل أن يختفي.',
  'Nothing logged since {0} {1} {2} — {3} days. Your platform only keeps recent history and you cannot download it, so capture it before it goes.':
    'لا شيء مسجّل منذ {0} {1} {2} — {3} يوماً. منصّتك تحتفظ بسجل حديث فقط ولا يمكنك تحميله، فصوّره قبل أن يختفي.',
  '{0} entries add up to other entries you already have':
    '{0} مُدخلات تساوي مجموع مُدخلات أخرى لديك',
  '{0} on {1} {2} is exactly the total of {3} entries from {4} {5} to {6} {7}, and has no hours or miles of its own. That is the shape of a weekly payout recorded next to the blocks it pays for — which would declare the same money twice and tax you on income you never earned. Check it, and delete whichever one is the summary.':
    '{0} في {1} {2} يساوي تماماً مجموع {3} مُدخلات من {4} {5} إلى {6} {7}، وليست له ساعات ولا أميال خاصة به. هذا شكل الدفعة الأسبوعية مسجّلة بجانب البلوكات التي تدفع عنها — وهو ما يُعلن المال نفسه مرّتين ويفرض عليك ضريبة على دخل لم تكسبه. راجعه، واحذف أيّهما الملخّص.',
  'Measured over {0} shifts: {1} mi a block ({2}–{3}).':
    'مقيسة عبر {0} ورديات: {1} ميل للبلوك ({2}–{3}).',
  'Measured over {0} shift: {1} mi a block.':
    'مقيسة عبر وردية {0}: {1} ميل للبلوك.',
  'None of the {0} shifts claimed this year had its mileage read from an odometer or tracked; every figure is an estimate arrived at as described above.':
    'لم تُقرأ أميال أي من الورديات الـ{0} المطالَب بها هذه السنة من عدّاد السيارة ولم تُتبَّع؛ فكل رقم فيها تقدير تم التوصل إليه بالطريقة الموضّحة أعلاه.',
  'All {0} shifts claimed this year had their mileage read from an odometer or tracked at the time.':
    'كل الورديات الـ{0} المطالَب بها هذه السنة قُرئت أميالها من عدّاد السيارة أو تُتبِّعت وقتها.',
  'The {0} trading allowance is being used':
    'يُستخدَم بدل الدخل التجاري {0}',
  'You have said you deducted a vehicle’s purchase price as an expense. Under the cash basis HMRC does not allow simplified mileage for that same vehicle — you claim one or the other. The {0} trading allowance is still ahead of your mileage, so nothing is at risk this moment — but once your miles pass it, this becomes the largest figure on your return. Settle it with an accountant before then.':
    'ذكرت أنك خصمت ثمن شراء مركبة كمصروف. وتحت الأساس النقدي لا تسمح HMRC بمعدّل المسافة المبسّط للمركبة نفسها — فإما هذا أو ذاك. وبدل الدخل التجاري {0} ما زال متقدّماً على أميالك، فلا شيء في خطر هذه اللحظة — لكن حين تتجاوزه أميالك يصبح هذا أكبر رقم في إقرارك. احسمه مع محاسب قبل ذلك.',
  '{0} of losses carried forward':
    '{0} من الخسائر مُرحَّلة',
  'Of {0} business miles, {1} are the outbound drive from home to a pickup station, across stations at differing distances. Return journeys begin at the final delivery point and are not included in that figure.':
    'من أصل {0} ميل عمل، {1} ميل هي رحلة الذهاب من البيت إلى محطة الاستلام، عبر محطات متفاوتة البُعد. أما رحلات العودة فتبدأ من نقطة التسليم الأخيرة وهي غير داخلة في هذا الرقم.',
  'Of the {0} shifts claimed this year, {1} had their mileage read from an odometer or tracked at the time ({2} miles); the remaining {3} miles are estimates arrived at as described above.':
    'من أصل {0} وردية مطالَب بها هذه السنة، {1} قُرئت أميالها من عدّاد السيارة أو تُتبِّعت وقتها ({2} ميل)؛ والأميال الـ{3} الباقية تقديرات تم التوصل إليها بالطريقة الموضّحة أعلاه.',
  'A trading loss of {0} remains to carry forward against profits of the same trade in future years. Record it in the losses section of your SA103S so HMRC carries it over.':
    'تبقى خسارة تجارية بمقدار {0} تُرحَّل لتُخصم من أرباح النشاط نفسه في السنوات القادمة. سجّلها في قسم الخسائر من نموذج SA103S ليُرحّلها HMRC.',
  'Your takings are low enough that the {0} trading allowance beats your actual expenses, so claim the allowance in box {1} (you then do not deduct expenses).':
    'متحصّلاتك منخفضة بما يكفي ليتجاوز بدل الدخل التجاري {0} مصاريفك الفعلية، فطالب بالبدل في الخانة {1} (ولا تخصم المصاريف حينها).',
  '{0} mi a block · {1} mi of that is getting there':
    '{0} ميل للبلوك · منها {1} ميل للوصول',
  '{0} mi to get there · block distance not measured yet':
    '{0} ميل للوصول · مسافة البلوك لم تُقَس بعد',
  'Usually {0} mi a block, {1} mi of it getting there.':
    'عادةً {0} ميل للبلوك، منها {1} ميل للوصول.',
  '{0} mi to get there. Log a shift by odometer and Kerb learns what a block comes to.':
    '{0} ميل للوصول. سجّل وردية بالعدّاد ليعرف Kerb كم يبلغ البلوك.',
  '{0} shifts have no station set':
    '{0} ورديات بلا محطة محدّدة',
  '{0} of your {1} stations has no measured block behind it':
    '{0} من أصل {1} من محطاتك ليس خلفها بلوك مقيس',
  '{0} of your {1} stations have no measured block behind them':
    '{0} من أصل {1} من محطاتك ليس خلفها بلوك مقيس',
  [EST_EN + 'Run one shift per station from the live tracker, reading the odometer at the start and at the end. Kerb then offers that measured figure for every later block from the same station, and this notice clears one station at a time.']:
    EST_AR + 'شغّل وردية واحدة من كل محطة عبر المتتبّع المباشر، واقرأ العدّاد في البداية وفي النهاية. بعدها يعرض Kerb الرقم المقيس لكل بلوك لاحق من المحطة نفسها، ويختفي هذا التنبيه محطةً محطة.',
  [EST_EN + 'Run a shift from the live tracker, reading the odometer at the start and at the end, and Kerb works the miles out for you.']:
    EST_AR + 'شغّل وردية من المتتبّع المباشر، واقرأ العدّاد في البداية وفي النهاية، ويحسب Kerb الأميال لك.',
  '{0} shift has no station set':
    'وردية {0} بلا محطة محدّدة',
  'Without a station ({0})':
    'بلا محطة ({0})',
  'All {0}':
    'الكل {0}',
  'Apply to {0} shifts':
    'طبّق على {0} ورديات',
  'Apply to {0} shift':
    'طبّق على وردية {0}',
  '{0} shifts updated':
    'حُدّثت {0} ورديات',
  '{0} shift updated':
    'حُدّثت وردية {0}',
  'Set {0} shifts to {1}?':
    'تعيين {0} ورديات إلى {1}؟',
  'Set {0} shift to {1}?':
    'تعيين وردية {0} إلى {1}؟',
  'Replaces the miles on the selected shifts with {0} miles each — what a block from {1} measured. Leave it off to keep the miles you entered.':
    'يستبدل أميال الورديات المختارة بـ {0} ميلاً لكل منها — وهو ما قيس لبلوك من {1}. اتركه مُطفأ للإبقاء على الأميال التي أدخلتها.',
  '{0} has no measured block distance yet, so the miles you already entered are kept. Log one shift there by odometer to get a real figure.':
    '{0} ليس لها مسافة بلوك مقيسة بعد، فتبقى الأميال التي أدخلتها. سجّل وردية واحدة هناك بالعدّاد للحصول على رقم حقيقي.',
  'Their miles will be replaced with {0} miles each. Only do this where you are sure that is the station you worked from.':
    'ستُستبدل أميالها بـ {0} ميلاً لكل منها. لا تفعل هذا إلا حيث تكون واثقاً أنها المحطة التي عملت منها.',
  'Set to {0}':
    'عُيّنت إلى {0}',
};

// Slotted patterns for whole prose units, keyed on inner markup. The Arabic
// value carries its own tags and may place the slots in any order.
const AR_HTML = {
  '<b>Class {0} NIC:</b> Below threshold — voluntary only. You can pay voluntarily ({1}/week) to protect your State Pension.':
    '<b>تأمين وطني Class {0}:</b> دون الحد — تطوّعي فقط. يمكنك الدفع تطوّعاً ({1}/أسبوع) لحماية معاش الدولة.',
  '<b>Trading losses:</b> <b>{0}</b> of earlier losses has been set against this year\'s profit, cutting your Income Tax and Class {1} NIC. Declare these in the losses section of your SA103S.':
    '<b>الخسائر التجارية:</b> خُصم <b>{0}</b> من خسائر سابقة من ربح هذه السنة، فقلّل ضريبة الدخل وتأمين Class {1}. أعلن عنها في قسم الخسائر من نموذج SA103S.',
  'Your employer already deducts this tax &amp; NI from each payslip — <b>you don\'t set anything aside for it</b>. It only matters here because your salary uses your Personal Allowance, which is why your delivery profit is taxed from the first £.':
    'يخصم صاحب العمل هذه الضريبة والتأمين من كل قسيمة راتب — <b>فلا تجنّب لها شيئاً</b>. وتظهر هنا فقط لأن راتبك يستهلك بدلك الشخصي، ولذلك يُفرض على ربح التوصيل من أول جنيه.',
  'These are the four standard MTD periods. If you become required to send quarterly updates, these are the <b>income and expense totals</b> each update needs (reported cumulatively). Kerb prepares them — it cannot submit them.':
    'هذه هي فترات MTD الأربع القياسية. إن أصبحت مُلزماً بإرسال تحديثات ربع سنوية، فهذه هي <b>مجاميع الدخل والمصاريف</b> التي يحتاجها كل تحديث (تُرفع تراكمياً). يُجهّزها Kerb — لكنه لا يستطيع إرسالها.',
  'Your SA bill exceeds {0} and under {1} is collected at source, so HMRC will ask for two advance payments. On top of your balancing payment, budget ~<b>{2}</b> on {3} {4} and again on {5} {6}.':
    'فاتورة إقرارك تتجاوز {0} ويُحصّل أقل من {1} عند المصدر، لذا ستطلب HMRC دفعتين مقدّمتين. فوق دفعة التسوية، خصّص نحو <b>{2}</b> في {3} {4} ومثلها في {5} {6}.',
  '<b>VAT:</b> you register only if turnover passes <b>{0}</b>/year. You\'re at {1} ({2}).':
    '<b>ضريبة القيمة المضافة:</b> لا تُسجّل إلا إذا تجاوز إجمالي دخلك <b>{0}</b>/سنة. أنت عند {1} ({2}).',
  'From each week\'s pay, keep about <b>{0}</b> for tax, <b>{1}</b> for the vehicle, <b>{2}</b> to savings — leaving about <b>{3}</b> to spend.':
    'من دخل كل أسبوع، احتفظ بنحو <b>{0}</b> للضريبة، و<b>{1}</b> للمركبة، و<b>{2}</b> للمدّخرات — فيتبقّى نحو <b>{3}</b> للصرف.',
  'Saved so far <b style="color:var(--text)">{0}</b>':
    'المُدّخر حتى الآن <b style="color:var(--text)">{0}</b>',
  'Target <b style="color:var(--text)">{0}</b>':
    'الهدف <b style="color:var(--text)">{0}</b>',
  '<b>Net £/hour</b> is what you actually keep after tax, NIC and mileage costs — the number that really matters when choosing shifts.':
    '<b>صافي £/ساعة</b> هو ما تحتفظ به فعلاً بعد الضريبة والتأمين وتكاليف المسافة — وهو الرقم الذي يهمّ حقاً عند اختيار الورديات.',
  'You\'re on the better method — <b>Simplified mileage</b> saves you about <b>{0}/yr</b> vs the other.':
    'أنت على الطريقة الأفضل — <b>المسافة المبسّطة</b> توفّر لك نحو <b>{0}/سنة</b> مقارنة بالأخرى.',
  'This is built so you can file your own Self Assessment. Each figure shows the <b>SA103S</b> box to type it into on HMRC. Save as a PDF from the <b>Print</b> dialog (choose “Save as PDF”). Always confirm figures on HMRC.':
    'أُعدّ هذا لتقدّم إقرارك الذاتي بنفسك. كل رقم يوضّح خانة <b>SA103S</b> التي تكتبه فيها على موقع HMRC. احفظه كـ PDF من نافذة <b>الطباعة</b> (اختر “Save as PDF”). تحقّق من الأرقام على HMRC دائماً.',
  '<span class="k">Name</span><span class="v">—</span>':
    '<span class="k">الاسم</span><span class="v">—</span>',
  '<span class="k">UTR</span><span class="v">—</span>':
    '<span class="k">UTR</span><span class="v">—</span>',
  '<span class="k">Business</span><span class="v">Self-employed delivery driver</span>':
    '<span class="k">النشاط</span><span class="v">سائق توصيل يعمل لحسابه</span>',
  '<span class="k">Region</span><span class="v">England / Wales / N. Ireland</span>':
    '<span class="k">المنطقة</span><span class="v">إنجلترا / ويلز / أيرلندا الشمالية</span>',
  '<span class="k">Accounting basis</span><span class="v">Cash basis</span>':
    '<span class="k">الأساس المحاسبي</span><span class="v">الأساس النقدي</span>',
  '<span class="k">Vehicle</span><span class="v">Car / Van</span>':
    '<span class="k">المركبة</span><span class="v">سيارة / فان</span>',
  '<span class="k">Expense method</span><span class="v">Simplified (mileage)</span>':
    '<span class="k">طريقة المصاريف</span><span class="v">المبسّطة (المسافة)</span>',
  '<span class="k">Prepared</span><span class="v">{0} {1} {2}</span>':
    '<span class="k">تاريخ الإعداد</span><span class="v">{0} {1} {2}</span>',
  'Your turnover — total takings <span class="report__box">Box {0}</span>':
    'إجمالي دخلك — كل المتحصّلات <span class="report__box">خانة {0}</span>',
  'Total allowable business expenses <span class="report__box">Box {0}</span>':
    'إجمالي مصاريف العمل القابلة للخصم <span class="report__box">خانة {0}</span>',
  'Net profit <span class="report__box">Box {0}</span>':
    'صافي الربح <span class="report__box">خانة {0}</span>',
  '<b>Free scanning on this deployment has no working limits.</b> Its counters are not backed by a shared store, so the monthly allowance and the rate limits are not enforced and whoever runs it pays for every scan. Add your own key below to stop using it. If this deployment is yours, configure a KV store for it.':
    '<b>المسح المجاني على هذا النشر بلا حدود فعّالة.</b> عدّاداته لا تستند إلى مخزن مشترك، فالحصة الشهرية وحدود المعدّل غير مطبَّقة، ومن يشغّله يدفع ثمن كل عملية مسح. أضف مفتاحك الخاص أدناه لتتوقف عن استخدامه. وإن كان هذا النشر نشرك، فاضبط له مخزن KV.',
  'Loss brought forward, set against this year <span class="report__box">losses section</span>':
    'خسارة مُرحّلة، تُخصم من هذه السنة <span class="report__box">قسم الخسائر</span>',
  'Total loss to carry forward <span class="report__box">losses section</span>':
    'إجمالي الخسارة المُرحَّلة إلى ما بعد <span class="report__box">قسم الخسائر</span>',
  'Net loss for the year <span class="report__box">Box {0}</span>':
    'صافي خسارة السنة <span class="report__box">خانة {0}</span>',
  'Net loss for the year <span class="report__box">losses section</span>':
    'صافي خسارة السنة <span class="report__box">قسم الخسائر</span>',
  'Net profit (taxable) <span class="report__box">Box {0} / {1}</span>':
    'صافي الربح (الخاضع للضريبة) <span class="report__box">خانة {0} / {1}</span>',
  'Trading income allowance (instead of expenses) <span class="report__box">Box {0}</span>':
    'بدل الدخل التجاري (بدلاً من المصاريف) <span class="report__box">خانة {0}</span>',
  'Trading income allowance <span class="report__box">Box {0}</span>':
    'بدل الدخل التجاري <span class="report__box">خانة {0}</span>',
  'Taxable profit <span class="report__box">Box {0}</span>':
    'الربح الخاضع للضريبة <span class="report__box">خانة {0}</span>',
  'Class {0} NIC <span class="report__box">Box {1}</span>':
    'تأمين وطني Class {0} <span class="report__box">خانة {1}</span>',
  'Turnover (all delivery income incl. tips) <span class="report__box">Box {0}</span>':
    'إجمالي الدخل (كل دخل التوصيل شاملاً البقشيش) <span class="report__box">خانة {0}</span>',
  'Business mileage ({0} miles) <span class="report__box">in Box {1}</span>':
    'أميال العمل ({0} ميل) <span class="report__box">داخل خانة {1}</span>',
  'Other allowable expenses <span class="report__box">in Box {0}</span>':
    'مصاريف أخرى قابلة للخصم <span class="report__box">داخل خانة {0}</span>',
  'Total allowable expenses <span class="report__box">Box {0}</span>':
    'إجمالي المصاريف القابلة للخصم <span class="report__box">خانة {0}</span>',
  'Pay from employment (from your P60/P45) <span class="report__box">SA102 box {0}</span>':
    'أجر الوظيفة (من P60/P45) <span class="report__box">SA102 خانة {0}</span>',
  'Tax taken off that pay <span class="report__box">SA102 box {0}</span>':
    'الضريبة المخصومة من ذلك الأجر <span class="report__box">SA102 خانة {0}</span>',
  '<b>{0} things to look at</b> before you file your {1} return.':
    '<b>{0} أمور تستحق النظر</b> قبل تقديم إقرار {1}.',
  '<b>You\'re registered as self-employed 🎉</b> Here\'s everything to stay on top of it — Kerb ticks each step as you go.':
    '<b>أنت مُسجّل كعامل حر 🎉</b> هذا كل ما تحتاجه للبقاء مُسيطراً — ويعلّم Kerb كل خطوة وأنت تتقدّم.',
  '<b>Nothing to pay yet.</b> You pay after the tax year ends — by <b>{0} {1} {2}</b>. Set money aside as you go so it\'s easy.':
    '<b>لا شيء مستحق بعد.</b> تدفع بعد انتهاء السنة الضريبية — بحلول <b>{0} {1} {2}</b>. جنّب المال تدريجياً ليكون الأمر سهلاً.',
  '<b>First {0} is tax-free.</b> The {1} trading allowance means your first {2} of delivery income each year isn\'t taxed. Kerb applies it automatically.':
    '<b>أول {0} معفاة من الضريبة.</b> بدل التداول لسنة {1} يعني أن أول {2} من دخل التوصيل سنوياً غير خاضعة للضريبة. ويطبّقه Kerb تلقائياً.',
  '<b>Mileage covers car costs.</b> {0}/mile (first {1} miles) covers fuel, servicing, insurance &amp; repairs — so you don\'t claim those separately. Log parking, tolls, phone &amp; kit on top.':
    '<b>المسافة تغطّي تكاليف السيارة.</b> {0}/ميل (أول {1} ميل) تغطّي الوقود والصيانة والتأمين والإصلاحات — فلا تطالب بها منفصلة. وسجّل فوقها المواقف والرسوم والهاتف والمستلزمات.',
  '<b>NI is handled for you.</b> Class {0} &amp; Class {1} National Insurance are worked out and paid through the same Self Assessment — Kerb calculates them.':
    '<b>التأمين الوطني مُدار نيابة عنك.</b> يُحسب تأمين Class {0} و Class {1} ويُدفع من خلال الإقرار الذاتي نفسه — ويحسبهما Kerb لك.',
  '<b>Keep records {0}+ years.</b> HMRC can ask to see your records. Export a backup now and then and keep it somewhere safe.':
    '<b>احفظ السجلات {0}+ سنوات.</b> قد تطلب HMRC الاطلاع على سجلاتك. صدّر نسخة احتياطية من وقت لآخر واحفظها في مكان آمن.',
  '<b>Kerb gives estimates, not tax advice.</b> It helps you keep records and understand what you may owe. It is not a substitute for an accountant or for HMRC\'s own figures. Always confirm the final numbers on your HMRC Self Assessment before you file.':
    '<b>يقدّم Kerb تقديرات، لا استشارة ضريبية.</b> يساعدك في حفظ السجلات وفهم ما قد تكون مديناً به. وليس بديلاً عن محاسب ولا عن أرقام HMRC نفسها. تحقّق دائماً من الأرقام النهائية في إقرارك لدى HMRC قبل التقديم.',
  'HMRC gives <b>each vehicle</b> its own first {0} business miles at the higher rate. Add a vehicle if you changed car or use more than one — then pick the vehicle when you log a shift.':
    'تمنح HMRC <b>كل مركبة</b> أول {0} ميل عمل خاصة بها بالمعدّل الأعلى. أضف مركبة إن غيّرت سيارتك أو كنت تستخدم أكثر من واحدة — ثم اختر المركبة عند تسجيل وردية.',
  'Get a key at <b>console.anthropic.com</b> → API keys, and add a little credit. Stored only on this device; sent only to Anthropic.':
    'احصل على مفتاح من <b>console.anthropic.com</b> → API keys، وأضف رصيداً بسيطاً. يُحفظ على هذا الجهاز فقط، ولا يُرسل إلا إلى Anthropic.',
  'The PIN keeps casual snoopers out. Your data still lives <b>unencrypted</b> on this device, so keep your phone\'s own screen lock on and export a backup now and then. If you forget the PIN, you\'ll need to clear the app\'s data to get back in.':
    'يمنع الرمز المتطفّلين العابرين. لكن بياناتك تبقى <b>غير مُشفّرة</b> على هذا الجهاز، فأبقِ قفل شاشة هاتفك مُفعّلاً وصدّر نسخة احتياطية من وقت لآخر. وإن نسيت الرمز، فستحتاج لمسح بيانات التطبيق للعودة إليه.',
  '<b>Storage is permanent.</b> Your records won\'t be auto-deleted by the browser · {0} KB used. Still export a backup occasionally — it\'s the only copy off this device.':
    '<b>الحفظ دائم.</b> لن يحذف المتصفّح سجلاتك تلقائياً · {0} كيلوبايت مُستخدمة. ومع ذلك صدّر نسخة احتياطية أحياناً — فهي النسخة الوحيدة خارج هذا الجهاز.',
  '<b>Kerb</b> keeps everything on this device — your entries never leave it, except a receipt image you choose to scan, which goes only to Anthropic via your own key. Figures are estimates to help you budget; confirm on your HMRC Self Assessment.':
    'يحفظ <b>Kerb</b> كل شيء على هذا الجهاز — فمُدخلاتك لا تخرج منه، إلا صورة فاتورة تختار مسحها، وتذهب إلى Anthropic فقط عبر مفتاحك الخاص. والأرقام تقديرات تساعدك في وضع ميزانيتك؛ تحقّق منها في إقرارك لدى HMRC.',
  'Scan a photo or upload the <b>PDF</b> of your monthly payslip — Claude reads the pay, tax, NI, hours, dates and your/employer details, and can keep your tax estimate accurate automatically.':
    'صوّر أو ارفع ملف <b>PDF</b> لقسيمة راتبك الشهرية — يقرأ كلود الأجر والضريبة والتأمين والساعات والتواريخ وبياناتك وبيانات صاحب العمل، ويمكنه إبقاء تقديرك الضريبي دقيقاً تلقائياً.',
  'Scan a photo or upload the <b>PDF</b> of your bank / card statement — Claude reads every transaction and suggests which are delivery <b>income</b> and which are business <b>expenses</b>. You confirm each one before it\'s added.':
    'صوّر أو ارفع ملف <b>PDF</b> لكشف حسابك البنكي أو بطاقتك — يقرأ كلود كل معاملة ويقترح أيّها <b>دخل</b> توصيل وأيّها <b>مصاريف</b> عمل. وتؤكّد كل واحدة قبل إضافتها.',
  'Scan a photo or upload the <b>PDF</b> of your Amazon Flex / Uber Eats (or any) earnings statement — Claude reads each shift (date, pay, tips, hours, miles) so you can add them all at once.':
    'صوّر أو ارفع ملف <b>PDF</b> لكشف أرباحك من Amazon Flex أو Uber Eats (أو أي منصّة) — يقرأ كلود كل وردية (التاريخ، الأجر، البقشيش، الساعات، الأميال) لتضيفها كلها مرة واحدة.',
  'Clock in to track your <b>time</b> and <b>miles</b>. Pick how to count miles below.':
    'ابدأ الوردية لتتبّع <b>وقتك</b> و<b>أميالك</b>. واختر طريقة حساب الأميال أدناه.',

  '<span class="dot" style="background:var(--warn)"></span>Tax · {0}':
    '<span class="dot" style="background:var(--warn)"></span>الضريبة · {0}',
  '<span class="dot" style="background:var(--info)"></span>Vehicle · {0}':
    '<span class="dot" style="background:var(--info)"></span>المركبة · {0}',
  '<span class="dot" style="background:var(--gold)"></span>Savings · {0}':
    '<span class="dot" style="background:var(--gold)"></span>المدّخرات · {0}',
  '<span class="dot" style="background:var(--pos)"></span>Spend · {0}':
    '<span class="dot" style="background:var(--pos)"></span>الصرف · {0}',
  '<b>Make storage permanent.</b> The browser could clear this app\'s data under storage pressure · {0} KB used. Tap below to protect it — on iPhone, also add Kerb to your Home Screen.':
    '<b>اجعل الحفظ دائماً.</b> قد يمسح المتصفّح بيانات هذا التطبيق عند ضغط المساحة · {0} كيلوبايت مُستخدمة. اضغط أدناه لحمايتها — وعلى الآيفون، أضف Kerb إلى الشاشة الرئيسية أيضاً.',
  'Your records are stored on this device. Export a backup now and then so nothing is lost.':
    'تُحفظ سجلاتك على هذا الجهاز. صدّر نسخة احتياطية من وقت لآخر حتى لا يضيع شيء.',
  '<b>{0}</b> entry is dated outside <b>{1}</b>, so it isn\'t in the totals here. Tap to review &amp; fix the date.':
    '<b>{0}</b> مُدخل تاريخه خارج <b>{1}</b>، فلا يدخل في المجاميع هنا. اضغط للمراجعة وتصحيح التاريخ.',
  '<b>Back up your records.</b> Everything is stored only on this device — you haven\'t exported a backup yet. HMRC records should be kept for {0}+ years. Tap to save a backup file.':
    '<b>خذ نسخة احتياطية من سجلاتك.</b> كل شيء محفوظ على هذا الجهاز فقط — ولم تُصدّر نسخة احتياطية بعد. وينبغي حفظ سجلات HMRC {0}+ سنوات. اضغط لحفظ ملف النسخة الاحتياطية.',
  'For every <b>{0}</b> profit from now, keep about <b>{1}</b> for tax &amp; NIC — the rest is yours.':
    'من كل <b>{0}</b> ربح من الآن، احتفظ بنحو <b>{1}</b> للضريبة والتأمين — والباقي لك.',
  '<b>Kerb</b> keeps everything on this device — your entries never leave it. Only a file you choose to scan is sent: straight to Anthropic when you have added your own key, otherwise via Kerb\'s endpoint using the free allowance. Figures are estimates to help you budget; confirm on your HMRC Self Assessment.':
    'يحفظ <b>Kerb</b> كل شيء على هذا الجهاز — فمُدخلاتك لا تغادره. ولا يُرسل سوى ملف تختار مسحه: مباشرةً إلى Anthropic إن أضفت مفتاحك الخاص، وإلا فعبر خادم Kerb باستخدام الحصّة المجانية. والأرقام تقديرات تساعدك في وضع ميزانيتك؛ تحقّق منها في إقرارك لدى HMRC.',
  '<b>These use {0} rates.</b> HMRC has not published the {1} figures in Kerb yet, so the previous year\'s allowances and thresholds are being used as a placeholder. Treat the result as a rough guide and check back once the new rates are in.':
    '<b>هذه بمعدّلات {0}.</b> لم تُضَف أرقام سنة {1} إلى Kerb بعد، لذا تُستخدم بدلات وحدود السنة السابقة مؤقتاً. اعتبر النتيجة دليلاً تقريبياً وراجعها عند إضافة المعدّلات الجديدة.',
  '<b>{0} on {1} {2} adds up to {3} other entries</b> from {4} {5} to {6} {7}. That is what a weekly payout looks like — the same money as the blocks it pays for. It is left out below; tick it only if it really is separate work.':
    '<b>{0} في {1} {2} يساوي مجموع {3} مُدخلات أخرى</b> من {4} {5} إلى {6} {7}. هذا شكل الدفعة الأسبوعية — نفس مال البلوكات التي تدفع عنها. وهو مستبعَد أدناه؛ لا تؤشّره إلا إن كان عملاً منفصلاً فعلاً.',
  '<b>You already have {0} saved on {1} {2}</b>, and these {3} rows add up to exactly that. If that saved entry was the weekly payout, adding these blocks as well would count the week twice — delete it in Income after adding.':
    '<b>لديك {0} محفوظ في {1} {2}</b>، وهذه الصفوف الـ{3} تساوي مجموعه تماماً. لو كان ذلك المُدخل هو الدفعة الأسبوعية، فإضافة هذه البلوكات ستحسب الأسبوع مرّتين — احذفه من شاشة الدخل بعد الإضافة.',
  'Pickup points sit at very different distances, so one "typical miles" figure would overstate the near ones and understate the far ones. Set each station once and Kerb fills the miles in when you log a block there.':
    'نقاط الاستلام تقع على مسافات شديدة التباين، فرقم «أميال نمطية» واحد يُضخّم القريبة ويُنقص البعيدة. اضبط كل محطة مرّة واحدة، فيملأ Kerb الأميال عند تسجيل بلوك فيها.',
  'Don\'t guess what a block comes to. The way home starts at your last drop, not at the station, so it is different every time and cannot be worked out on a map. Start a live shift with <b>Odometer</b> selected and pick the station — after a shift or two Kerb has the real figure.':
    'لا تخمّن كم يبلغ البلوك. فطريق العودة يبدأ من آخر نقطة توصيل لا من المحطة، أي أنه يختلف كل مرة ولا يمكن حسابه على خريطة. ابدأ وردية مباشرة واختر <b>عدّاد المسافة</b> ثم المحطة — وبعد وردية أو اثنتين يملك Kerb الرقم الحقيقي.',
};

// Prefix rules for dynamic strings (a number/year follows the label).
const AR_PREFIX = [
  ['Self-employment take-home · ', 'صافي العمل الحر · '],
  ['Estimated take-home · ', 'صافي متوقّع · '],
  ['Set aside for HMRC · ', 'جنّب لـ HMRC · '],
  ['Self-employment take-home', 'صافي العمل الحر'],
  ['Import failed: ', 'فشل الاستيراد: '],
];

// ---------- patterns ----------
// Most prose in this app carries figures ("keep about £20.00 for tax"), and a
// lot of it is split across inline <b> tags. Neither can be translated by
// exact-matching a text node: the figures differ per user, and a fragment like
// "and which are business" cannot be reordered into correct Arabic on its own.
//
// So a pattern key is the string with every figure replaced by {0}, {1}, …
// The Arabic side reuses those slots in whatever order Arabic needs, and may
// carry its own inline markup. slotify() is exported so the tooling that
// harvests these keys derives them with this exact function, never a copy.
// Month and weekday names are slotted too, so one pattern covers all twelve
// months instead of twelve near-identical keys. They are localised when the
// slot is filled. Only the CAPITALISED forms, and only in a date position, so
// the modal "may" in prose is never mistaken for the month.
const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const DOW_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DATE_WORD = new Map([
  ...MON_FULL.map((m, i) => [m, MON_AR[i]]),
  ...MON_EN.map((m, i) => [m, MON_AR[i]]),
  ...DOW_EN.map((d, i) => [d, DOW_AR[i]]),
]);
// Longest first, so 'June' is matched before 'Jun' leaves a stray 'e'.
const MON_ANY = [...MON_FULL, ...MON_EN].sort((a, b) => b.length - a.length);

// A figure is a standalone money/number/percent/pence/tax-year token. The
// lookaround keeps it from biting into identifiers: SA103S, P45 and Class2
// must survive intact, or every key would depend on a box number.
// Unit suffixes are part of the figure (2.5h, 18d, 12mo, 55p, 80%), so one key
// covers every value instead of one key per hour count. The tax-year
// alternative comes first or 2026/27 would match as a bare 2026.
const FIGURE_SRC = String.raw`(?<![A-Za-z\d.,])(?:£\s?\d[\d,]*(?:\.\d+)?|\d{4}\/\d{2}|\d[\d,]*(?:\.\d+)?(?:%|p|h|d|mo)?)(?![A-Za-z\d]|\.\d)`;
const MON_SRC = String.raw`(?<=\d\s)(?:${MON_ANY.join('|')})\b|\b(?:${MON_ANY.join('|')})(?=\s\d{4})`;
const DOW_SRC = String.raw`\b(?:${DOW_EN.join('|')})(?=,|\s+at\b)`;
const FIGURE = new RegExp(`${FIGURE_SRC}|${MON_SRC}|${DOW_SRC}`, 'g');

export function slotify(str) {
  const slots = [];
  // Split on tags so figures inside attributes (colours, widths) are never
  // slotted — a key must not change when a style value does.
  const key = str
    .split(/(<[^>]*>)/)
    .map((part) => (part.startsWith('<')
      ? part
      : part.replace(FIGURE, (m) => '{' + (slots.push(m) - 1) + '}')))
    .join('');
  return { key, slots };
}

// Put the captured values back, localising month and weekday names on the way.
const fill = (tpl, slots) => tpl.replace(/\{(\d+)\}/g, (m, i) => {
  const v = slots[+i];
  if (v === undefined) return m;
  return DATE_WORD.get(v) || v;
});

// Look a string up: exact first, then prefix rules, then slotted patterns.
function tr(text) {
  const key = text.trim();
  if (!key) return null;
  if (AR[key]) return AR[key];
  for (const [en, ar] of AR_PREFIX) if (key.startsWith(en)) return ar + key.slice(en.length);
  const { key: pat, slots } = slotify(key);
  if (slots.length && AR_PAT[pat]) return fill(AR_PAT[pat], slots);
  // No phrase matched, but a bare date ("5 Oct 2027") still has a month or
  // weekday to localise. Rebuilding from the slots does that without needing
  // a dictionary entry for every date in the app.
  if (slots.some((v) => DATE_WORD.has(v))) return fill(pat, slots);
  return null;
}

// Translate an element's whole inner markup as one unit, so Arabic word order
// is free and the emphasis tags survive. Returns true if it was replaced.
function trHtml(elm) {
  const raw = elm.innerHTML;
  const key = raw.trim();
  if (!key) return false;
  if (AR_HTML[key]) { elm.innerHTML = AR_HTML[key]; return true; }
  const { key: pat, slots } = slotify(key);
  if (AR_HTML[pat]) { elm.innerHTML = fill(AR_HTML[pat], slots); return true; }
  return false;
}

// An element is a single prose unit when all its children are inline and leaf:
// its text reads as one sentence, so it must be translated as one.
const INLINE = /^(B|I|EM|STRONG|SPAN|A|CODE|BR|SMALL)$/;
function isProseUnit(elm) {
  const kids = elm.children;
  if (!kids.length) return false;
  for (const k of kids) if (!INLINE.test(k.tagName) || k.children.length) return false;
  return /[A-Za-z]{3}/.test(elm.textContent);
}

// Translate a bare string. Notifications never touch the DOM, so the
// tree-walking translate() below cannot reach them — without this, every
// reminder arrives in English regardless of the chosen language.
export function t(str) {
  if (!isRTL() || typeof str !== 'string') return str;
  return tr(str) || str;
}

export function translate(root) {
  if (!isRTL() || !root) return;
  // Whole prose units first (a sentence broken up by <b>/<span> tags). Anything
  // replaced here is skipped by the text-node pass below, which would otherwise
  // translate the Arabic fragments it just produced.
  const done = new Set();
  if (root.querySelectorAll) {
    // The root itself is included: when late content is handed here directly,
    // the added node often IS the prose unit, not an ancestor of one.
    for (const elm of [...(root.nodeType === 1 ? [root] : []), ...root.querySelectorAll('*')]) {
      if (done.has(elm) || !isProseUnit(elm)) continue;
      if (trHtml(elm)) { done.add(elm); for (const d of elm.querySelectorAll('*')) done.add(d); }
    }
  }
  // text nodes
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    if (n.parentElement && done.has(n.parentElement)) continue;
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

// Content that arrives after a screen is rendered — an awaited storage check,
// a scan result, an import preview — misses the translate() that ran when the
// view was built. Watching for added nodes covers every such flow in one place.
let lateObserver = null;
export function observeLateContent(roots) {
  if (!isRTL() || typeof MutationObserver !== 'function') return;
  const list = (Array.isArray(roots) ? roots : [roots]).filter(Boolean);
  if (!list.length) return;
  const watch = () => list.forEach((r) => lateObserver.observe(r, { childList: true, subtree: true }));
  if (lateObserver) lateObserver.disconnect();
  lateObserver = new MutationObserver((records) => {
    const added = [];
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n.nodeType === 1) added.push(n);
        else if (n.nodeType === 3 && n.parentElement) added.push(n.parentElement);
      }
    }
    if (!added.length) return;
    // Translating mutates the DOM, so stop listening first. disconnect() also
    // drops the pending queue, which is what stops this from looping on its
    // own writes.
    lateObserver.disconnect();
    try { for (const n of added) if (n.isConnected) translate(n); } finally { watch(); }
  });
  watch();
}

export function applyDir() {
  const html = document.documentElement;
  if (isRTL()) { html.setAttribute('dir', 'rtl'); html.setAttribute('lang', 'ar'); }
  else { html.setAttribute('dir', 'ltr'); html.setAttribute('lang', 'en'); }
}

// Changing language reloads once so every string (incl. static chrome) is correct.
export function setLang(l) { saveSettings({ lang: l }); location.reload(); }
