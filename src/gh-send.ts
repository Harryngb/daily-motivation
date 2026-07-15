/**
 * GitHub Actions 独立发送脚本
 * 不依赖 Express/SQLite，直接调用 Brevo API + 免费语录 API
 *
 * 用法: npx tsx src/gh-send.ts
 */

// ===== 配置（从环境变量读取）=====
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || '';
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || '每日心语';

// ===== 收件人列表（从 recipients.json 读取）=====
import * as fs from 'fs';
import * as path from 'path';
const RECIPIENTS: { name: string; email: string; active?: boolean }[] = (() => {
  try {
    const p = path.join(__dirname, '..', 'recipients.json');
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return Array.isArray(data) ? data.filter((r: any) => r.active !== false) : [];
  } catch {
    return [];
  }
})();

// ===== 内置语录（从 quotes.json 加载 595 条，中文:英文 = 3:7）=====
const QUOTES_FILE = path.join(__dirname, '..', 'quotes.json');
let BUILT_IN_QUOTES: { content: string; author: string }[] = [];
try {
  if (fs.existsSync(QUOTES_FILE)) {
    BUILT_IN_QUOTES = JSON.parse(fs.readFileSync(QUOTES_FILE, 'utf-8'));
    console.log(`📚 已加载 ${BUILT_IN_QUOTES.length} 条内置语录`);
  }
} catch { /* ignore */ }

// 极简降级（文件加载失败时）
if (BUILT_IN_QUOTES.length === 0) {
  BUILT_IN_QUOTES = [
    { content: '千里之行，始于足下。', author: '老子' },
    { content: 'Stay hungry, stay foolish.', author: 'Steve Jobs' },
    { content: 'Believe you can.', author: 'Theodore Roosevelt' },
    { content: '每一天都是新的开始。', author: '佚名' },
    { content: 'In the middle of difficulty lies opportunity.', author: 'Albert Einstein' },
    { content: '所有的幸运都是努力埋下的伏笔。', author: '佚名' },
    { content: 'The best time to plant a tree was 20 years ago.', author: 'Chinese Proverb' },
    { content: 'Be the change you wish to see.', author: 'Mahatma Gandhi' },
    { content: '乾坤未定，你我皆是黑马。', author: '佚名' },
    { content: '人生没有白走的路。', author: '佚名' },
  ];
}

// ===== 30天不重复追踪（sent_history.json）=====
const HISTORY_FILE = path.join(__dirname, '..', 'data', 'sent_history.json');
const LAST_SEND_FILE = path.join(__dirname, '..', 'data', 'last_send.json');
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface SentRecord {
  [email: string]: { quoteKey: string; sentAt: string }[];
}

function loadSentHistory(): SentRecord {
  try {
    const dir = path.dirname(HISTORY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(HISTORY_FILE)) return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
  } catch { /* ignore */ }
  return {};
}

function saveSentHistory(h: SentRecord): void {
  try { fs.writeFileSync(HISTORY_FILE, JSON.stringify(h, null, 2)); } catch { /* ignore */ }
}

// ===== 防重复发送检查 =====
function wasSlotSentToday(slot: string): boolean {
  try {
    if (!fs.existsSync(LAST_SEND_FILE)) return false;
    const data = JSON.parse(fs.readFileSync(LAST_SEND_FILE, 'utf-8'));
    const today = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return data.date === today && data.slot === slot;
  } catch { return false; }
}

function markSlotSent(slot: string): void {
  const today = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  try { fs.writeFileSync(LAST_SEND_FILE, JSON.stringify({ date: today, slot })); } catch {}
}

function cleanOldHistory(h: SentRecord): void {
  const now = Date.now();
  for (const email of Object.keys(h)) {
    h[email] = h[email].filter(r => now - new Date(r.sentAt).getTime() < THIRTY_DAYS_MS);
    if (h[email].length === 0) delete h[email];
  }
}

function historyKey(q: { content: string; author: string }): string {
  return q.content.substring(0, 30).toLowerCase().replace(/\s+/g, ' ');
}

function wasSentIn30Days(h: SentRecord, email: string, q: { content: string; author: string }): boolean {
  const records = h[email];
  if (!records) return false;
  const key = historyKey(q);
  const now = Date.now();
  return records.some(r => r.quoteKey === key && (now - new Date(r.sentAt).getTime() < THIRTY_DAYS_MS));
}

function markAsSent(h: SentRecord, email: string, q: { content: string; author: string }): void {
  if (!h[email]) h[email] = [];
  h[email].push({ quoteKey: historyKey(q), sentAt: new Date().toISOString() });
}

// ===== 获取新鲜语录 =====
const API_SOURCES: (() => Promise<{ content: string; author: string } | null>)[] = [
  async () => { try {
    const r = await fetch('https://api.quotable.io/random?maxLength=150', { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return null;
    const d = await r.json() as { content?: string; author?: string };
    return d?.content ? { content: d.content, author: d.author || 'Unknown' } : null;
  } catch { return null; }},
  async () => { try {
    const r = await fetch('https://zenquotes.io/api/random', { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return null;
    const d = await r.json() as Array<{ q?: string; a?: string }>;
    return Array.isArray(d) && d[0]?.q ? { content: d[0].q, author: d[0].a || 'Unknown' } : null;
  } catch { return null; }},
];

async function fetchBatchFromAPIs(count: number): Promise<{ content: string; author: string }[]> {
  const seen = new Set<string>();
  const collected: { content: string; author: string }[] = [];
  const waveSize = Math.min(count * 10, 100);
  await Promise.all(Array.from({ length: waveSize }, async () => {
    const src = API_SOURCES[Math.floor(Math.random() * API_SOURCES.length)];
    try {
      const q = await src();
      if (q && q.content && !seen.has(q.content.substring(0, 25).toLowerCase())) {
        seen.add(q.content.substring(0, 25).toLowerCase());
        collected.push(q);
      }
    } catch { /* ignore */ }
  }));
  console.log(`  🌐 API补充: ${collected.length} 条`);
  return collected;
}

// ===== 判断时段 =====
function getTimeLabel(): string {
  const now = new Date();
  const h = parseInt(new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: 'numeric',
    hour12: false,
  }).format(now), 10);
  return h < 12 ? '08:00' : '17:00';
}

// ===== 构建邮件HTML =====
function buildHtml(content: string, author: string, name: string): string {
  const label = getTimeLabel();
  const emoji = label === '08:00' ? '🌅' : '🌇';
  const greet = label === '08:00' ? '早上好' : '傍晚好';
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif;background:#f5f7fa;color:#333;line-height:1.6}
.container{max-width:600px;margin:0 auto;padding:20px}
.header{background:linear-gradient(135deg,#667eea,#764ba2);border-radius:12px 12px 0 0;padding:40px 30px;text-align:center;color:#fff}
.header h1{font-size:28px;margin-bottom:8px}.header p{color:rgba(255,255,255,0.85);font-size:14px}
.body-card{background:#fff;border-radius:0 0 12px 12px;padding:40px 30px;box-shadow:0 2px 12px rgba(0,0,0,0.08)}
.greeting{font-size:16px;color:#666;margin-bottom:12px}.greeting strong{color:#667eea}
.banner{text-align:center;font-size:15px;color:#667eea;font-weight:600;padding:8px 0 12px;letter-spacing:1px}
.quote-wrapper{text-align:center;padding:30px 20px;margin:12px 0;background:linear-gradient(135deg,#fdf2e9,#fef9ef);border-left:4px solid #f5a623;border-radius:8px}
.quote-content{font-size:20px;line-height:1.8;color:#2c3e50;font-weight:500;margin-bottom:16px;font-style:italic}
.quote-author{font-size:15px;color:#888}.quote-author::before{content:'—— '}
.footer{margin-top:30px;padding-top:20px;border-top:1px solid #eee;text-align:center}
.footer p{font-size:13px;color:#999;margin-bottom:4px}
.footer .tagline{color:#667eea;font-size:14px;font-weight:500}
</style></head><body>
<div class=container>
<div class=header><h1>✨ 每日心语</h1><p>Daily Inspiration</p></div>
<div class=body-card>
<div class=greeting>${emoji} ${greet}，<strong>${escHtml(name)}</strong>：</div>
<div class=banner>🎯 开开心心上班，快快乐乐下班！</div>
<div class=quote-wrapper>
<div class=quote-content>"${escHtml(content)}"</div>
<div class=quote-author>${escHtml(author)}</div>
</div>
<div class=footer>
<p class=tagline>愿这句话为你的一天带来力量与温暖 💪</p>
<p>—— 每日心语 · 与你同行</p>
<p class=unsubscribe>此邮件由系统自动发送</p>
</div></div></div></body></html>`;
}

// ===== 通过 Brevo 发送 =====
async function sendEmail(toName: string, toEmail: string, html: string): Promise<boolean> {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
      to: [{ email: toEmail, name: toName }],
      subject: `✨ 每日心语 · ${toName}，今天也要加油哦！`,
      htmlContent: html,
    }),
  });
  if (res.ok) { console.log(`  ✅ ${toEmail}`); return true; }
  const err = await res.text();
  console.error(`  ❌ ${toEmail}: HTTP ${res.status} ${err.slice(0, 100)}`);
  return false;
}

// ===== 报告接口 =====
interface SendResult {
  name: string; email: string; ok: boolean;
  quoteContent: string; quoteAuthor: string; quoteSource: string;
}

// ===== 发送报告给管理员 =====
async function sendReport(results: SendResult[], success: number, failed: number): Promise<void> {
  const label = getTimeLabel();
  const dateStr = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const period = label === '08:00' ? '🌅 早间' : '🌇 傍晚';
  const rows = results.map(r => `<tr${r.ok?'':' style="background:#fef2f2"'}><td style="padding:6px 10px;border-bottom:1px solid #eee">${escHtml(r.name)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;color:#666;font-size:12px">${escHtml(r.email)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:11px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(r.quoteContent)}">${escHtml(r.quoteContent.substring(0,30))}…</td><td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:11px;color:#888">${r.quoteSource}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">${r.ok?'<span style="color:#10b981">✅</span>':'<span style="color:#ef4444">❌</span>'}</td></tr>`).join('');

  const srcCounts: Record<string, number> = {};
  for (const r of results) srcCounts[r.quoteSource] = (srcCounts[r.quoteSource] || 0) + 1;
  const srcSummary = Object.entries(srcCounts).map(([k,v]) => `${k}: ${v}条`).join(' | ');
  const apiPct = srcCounts['🌐 API实时获取'] || 0;
  const libPct = srcCounts['📚 内置库'] || 0;
  const total = results.length;
  const apiPercent = Math.round((apiPct / total) * 100);

  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
      to: [{ email: 'hashen@nvisionglobal.com', name: 'Harry Shen' }],
      subject: `📬 每日心语报告 · ${period} · ${dateStr}`,
      htmlContent: `<!DOCTYPE html>
<html><head><meta charset=UTF-8><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif;background:#f5f7fa;color:#333;line-height:1.6}
.container{max-width:600px;margin:0 auto;padding:20px}
.header{background:linear-gradient(135deg,#667eea,#764ba2);border-radius:12px 12px 0 0;padding:30px;text-align:center;color:#fff}
.header h1{font-size:22px;margin-bottom:4px}.header p{opacity:.85;font-size:13px}
.body-card{background:#fff;border-radius:0 0 12px 12px;padding:24px 20px;box-shadow:0 2px 12px rgba(0,0,0,0.08)}
table{width:100%;border-collapse:collapse;font-size:12px;margin:8px 0}
th{background:#f9fafb;padding:6px 10px;text-align:left;font-weight:600;font-size:10px;color:#666;text-transform:uppercase;border-bottom:2px solid #e5e7eb}
.summary{display:flex;gap:12px;margin-bottom:12px;justify-content:center}
.stat{text-align:center;padding:12px 18px;border-radius:8px;background:#f9fafb;flex:1}
.stat-value{font-size:24px;font-weight:700}
.stat-label{font-size:12px;color:#666;margin-top:2px}
.ok{color:#10b981}.fail{color:#ef4444}
.footer{text-align:center;margin-top:16px;padding-top:12px;border-top:1px solid #eee;font-size:11px;color:#999}
</style></head><body>
<div class=container><div class=header><h1>📬 每日心语发送报告</h1><p>${period}发送 · ${dateStr}</p></div>
<div class=body-card style=text-align:center>
<div class=summary>
<span class=stat><div class="stat-value ok">${success}</div><div class=stat-label>✅ 成功</div></span>
<span class=stat><div class="stat-value ${failed>0?'fail':'ok'}">${failed}</div><div class=stat-label>${failed>0?'❌ 失败':'✅ 全部成功'}</div></span>
<span class=stat><div class=stat-value>${total}</div><div class=stat-label>📊 共计</div></span>
</div>
<div style="font-size:12px;color:#666;padding:4px 0">
📚 语录来源: ${srcSummary} &nbsp;|&nbsp; 🌐 API占比: ${apiPercent}%
</div>
</div>
<div class=body-card style=margin-top:12px>
<table><tr><th>姓名</th><th>邮箱</th><th>语录</th><th>来源</th><th style=text-align:center>状态</th></tr>${rows}</table>
${failed>0?`<div style="padding:10px;background:#fef2f2;border-radius:6px;font-size:12px;color:#dc2626;margin-top:10px">⚠️ ${failed}人发送失败，请检查</div>`:''}
</div>
<div class=footer>
<p>📚 内置库 ${BUILT_IN_QUOTES.length} 条 (中文:英文=3:7) · 每人30天内不重复</p>
<p>🌐 每次发送会自动补充免费API语录</p>
<p>—— 每日心语 · 自动发送系统</p>
</div></div></body></html>`,
    }),
  });
  console.log(`\n📬 报告已发送至 hashen@nvisionglobal.com`);
}

function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== 主逻辑 =====
async function main() {
  console.log('========================================');
  console.log('  📬 每日心语 · GitHub Actions 发送任务');
  console.log(`  🕐 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  console.log(`  📚 内置库 ${BUILT_IN_QUOTES.length} 条 · 收件人 ${RECIPIENTS.length} 人`);
  console.log('========================================\n');

  if (!BREVO_API_KEY) { console.error('❌ BREVO_API_KEY 未设置'); process.exit(1); }
  if (!BREVO_SENDER_EMAIL) { console.error('❌ BREVO_SENDER_EMAIL 未设置'); process.exit(1); }

  // 加载发送历史（30天不重复追踪）
  const sentHistory = loadSentHistory();
  cleanOldHistory(sentHistory);

  // 检查是否今天这个时段已经发过（防重复触发）
  const sendSlot = getTimeLabel();
  if (wasSlotSentToday(sendSlot)) {
    console.log(`⏭️ 今天 ${sendSlot} 时段已发送，跳过此次（如需强制重发请删除 data/last_send.json）`);
    return;
  }
  markSlotSent(sendSlot);

  // 先尝试从 API 补充新鲜语录
  const apiQuotes = await fetchBatchFromAPIs(RECIPIENTS.length);

  // 从内置库挑出可用语录（未被30天内发过 + 本轮未使用）
  const batchUsed = new Set<string>();
  const getAvailableLibQuotes = () => {
    return [...BUILT_IN_QUOTES]
      .sort(() => Math.random() - 0.5)
      .filter(q => {
        const key = historyKey(q);
        return !batchUsed.has(key);
      });
  };

  const results: SendResult[] = [];

  for (const r of RECIPIENTS) {
    let quote: { content: string; author: string } | null = null;
    let source = '';

    // 优先用 API 获取的
    if (apiQuotes.length > 0) {
      quote = apiQuotes.shift()!;
      source = '🌐 API实时获取';
    }

    // 用内置库，每人不同 + 避开30天内发过的
    if (!quote) {
      const available = getAvailableLibQuotes();
      for (const q of available) {
        if (!wasSentIn30Days(sentHistory, r.email, q)) {
          quote = q;
          batchUsed.add(historyKey(q));
          source = '📚 内置库';
          break;
        }
      }
    }

    // 如果所有都30天内发过，放宽限制
    if (!quote) {
      const available = getAvailableLibQuotes();
      if (available.length > 0) {
        quote = available[0];
        batchUsed.add(historyKey(quote));
        source = '📚 内置库(超30天)';
      }
    }

    // 实在不行用默认
    if (!quote) {
      quote = { content: '每一天都是新的开始，加油！', author: '每日心语' };
      source = 'ℹ️ 默认';
    }

    // 记录发送历史
    markAsSent(sentHistory, r.email, quote);

    console.log(`📧 ${r.name} (${r.email}) [${source}]:`);
    console.log(`    "${quote.content.substring(0, 50)}…" — ${quote.author}`);

    const html = buildHtml(quote.content, quote.author, r.name);
    const ok = await sendEmail(r.name, r.email, html);
    results.push({ name: r.name, email: r.email, ok, quoteContent: quote.content, quoteAuthor: quote.author, quoteSource: source });

    await new Promise(r => setTimeout(r, 100));
  }

  // 保存发送历史
  saveSentHistory(sentHistory);

  // 汇总
  const success = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;

  console.log(`\n========================================`);
  console.log(`  ✅ 成功: ${success}  |  ❌ 失败: ${failed}  |  📊 共 ${results.length} 人`);
  console.log(`  🕐 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  console.log(`========================================`);

  if (process.env.GITHUB_OUTPUT) {
    require('fs').appendFileSync(process.env.GITHUB_OUTPUT, `success_count=${success}\nfail_count=${failed}\n`);
  }

  // 发送报告
  try { await sendReport(results, success, failed); } catch (err: any) { console.error(`❌ 报告发送失败: ${err.message}`); }
}

main().catch(err => { console.error('❌ 脚本异常:', err); process.exit(1); });
