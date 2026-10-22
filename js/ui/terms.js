// ============================================================
// ui/terms.js — Terms of Use, liability and privacy. Kerb gives
// tax ESTIMATES, is not an accountant and is not HMRC-recognised
// filing software; this screen says so plainly and limits
// liability. Required before the app is ever sold or shared.
// ============================================================
import { el } from '../util.js';
import { icon } from './shared.js';
import { bus } from '../bus.js';

const UPDATED = '22 October 2026';

export async function render() {
  const root = el('div');
  root.append(el('h2', { style: 'font-size:22px;margin:4px 2px 4px', text: 'Terms & privacy' }));
  root.append(el('div', { class: 'tiny faint', style: 'margin:0 2px 14px', text: `Last updated ${UPDATED}` }));

  root.append(el('div', { class: 'callout callout--warn', html: `${icon('warn')}<div><b>Kerb gives estimates, not tax advice.</b> It helps you keep records and understand what you may owe. It is not a substitute for an accountant or for HMRC's own figures. Always confirm the final numbers on your HMRC Self Assessment before you file.</div>` }));

  section(root, 'What Kerb is', [
    'Kerb is a record-keeping and estimating tool for UK self-employed delivery drivers. It records your income and expenses, applies published HMRC rates, and produces a summary you can use to complete your own tax return.',
    'Kerb is NOT accounting, tax or legal advice, and using it does not create a professional relationship of any kind.',
  ]);

  section(root, 'Kerb is not HMRC filing software', [
    'Kerb is not HMRC-recognised software and cannot submit anything to HMRC. It does not file your Self Assessment and does not send Making Tax Digital quarterly updates.',
    'You file through HMRC\'s own online service or through HMRC-recognised software. Kerb only prepares the figures for you to enter.',
  ]);

  section(root, 'Your responsibility', [
    'You are responsible for the accuracy and completeness of everything you enter, and for the figures you submit to HMRC.',
    'Check every number before you rely on it. Scanned receipts, statements and payslips are read automatically and can be misread — always verify amounts and dates.',
    'Tax rates, thresholds and rules change, and your own circumstances may need treatment Kerb does not model (for example capital allowances, multiple trades, VAT registration, or complex loss claims). If anything is unclear or significant, speak to a qualified accountant.',
    'HMRC expects you to keep your business records for at least 5 years after the 31 January filing deadline. Keeping those records — including your own backups — is your responsibility.',
  ]);

  section(root, 'Limitation of liability', [
    'Kerb is provided "as is", without warranty of any kind, express or implied, including fitness for a particular purpose or accuracy of results.',
    'To the fullest extent permitted by law, the author is not liable for any loss or damage arising from your use of Kerb — including any tax, interest, penalty, assessment or other cost resulting from figures that are incorrect, incomplete, misread or relied upon.',
    'Nothing here excludes or limits liability where it cannot lawfully be excluded.',
  ]);

  section(root, 'Privacy — your data stays on your device', [
    'Your records are stored only on this device. There is no Kerb server and no account, so your income, expenses and tax figures are never uploaded to us, and we cannot see them.',
    'The one exception is scanning: if you add your own Anthropic API key and choose to scan a receipt, statement or payslip, that single image or file is sent directly from your device to Anthropic to be read, under your own key and their terms. It is not stored by Kerb.',
    'Because the data is only on this device, losing or wiping the device loses the records. Export a backup regularly, and keep your device\'s own screen lock on.',
    'Deleting the app, or clearing its data, permanently deletes your records.',
  ]);

  section(root, 'Changes', [
    'These terms may be updated as the app changes. The date at the top shows the current version. Continuing to use Kerb means you accept the terms in force at the time.',
  ]);

  const back = el('button', { class: 'btn btn--sub btn--block', type: 'button', style: 'margin-top:16px' });
  back.innerHTML = icon('check') + '<span>Back to Settings</span>';
  back.onclick = () => bus.navigate('settings');
  root.append(back);
  return root;
}

function section(root, title, paras) {
  root.append(el('div', { class: 'section-title', text: title }));
  const card = el('div', { class: 'card' });
  paras.forEach((t, i) => card.append(el('div', {
    style: `font-size:13.5px;line-height:1.6;color:var(--text)${i ? ';margin-top:10px' : ''}`, text: t,
  })));
  root.append(card);
}
