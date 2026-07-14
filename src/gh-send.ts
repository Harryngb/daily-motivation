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

// ===== 内置语录（冷启动和降级备用）=====
const BUILT_IN_QUOTES: { content: string; author: string }[] = [
  { content: '千里之行，始于足下。', author: '老子' },
  { content: '天行健，君子以自强不息。', author: '《周易》' },
  { content: '宝剑锋从磨砺出，梅花香自苦寒来。', author: '《警世贤文》' },
  { content: '世上无难事，只怕有心人。', author: '民间谚语' },
  { content: '有志者，事竟成。', author: '《后汉书》' },
  { content: '业精于勤，荒于嬉。', author: '韩愈' },
  { content: '不积跬步，无以至千里。', author: '荀子' },
  { content: '天生我材必有用。', author: '李白' },
  { content: '长风破浪会有时。', author: '李白' },
  { content: '会当凌绝顶，一览众山小。', author: '杜甫' },
  { content: '千磨万击还坚劲，任尔东西南北风。', author: '郑板桥' },
  { content: '不经一番寒彻骨，怎得梅花扑鼻香。', author: '黄蘖禅师' },
  { content: '山重水复疑无路，柳暗花明又一村。', author: '陆游' },
  { content: '沉舟侧畔千帆过，病树前头万木春。', author: '刘禹锡' },
  { content: '人生自古谁无死，留取丹心照汗青。', author: '文天祥' },
  { content: '天将降大任于斯人也，必先苦其心志。', author: '孟子' },
  { content: '锲而不舍，金石可镂。', author: '荀子' },
  { content: '三人行，必有我师焉。', author: '孔子' },
  { content: '学而不思则罔，思而不学则殆。', author: '孔子' },
  { content: '志当存高远。', author: '诸葛亮' },
  { content: '非淡泊无以明志，非宁静无以致远。', author: '诸葛亮' },
  { content: '少壮不努力，老大徒伤悲。', author: '《长歌行》' },
  { content: '莫等闲，白了少年头。', author: '岳飞' },
  { content: '老当益壮，宁移白首之心？', author: '王勃' },
  { content: '博观而约取，厚积而薄发。', author: '苏轼' },
  { content: '古之立大事者，不惟有超世之才，亦必有坚忍不拔之志。', author: '苏轼' },
  { content: '不是因为看到希望才坚持，而是因为坚持才看到希望。', author: '佚名' },
  { content: '你今天的努力，是未来你感激自己的理由。', author: '佚名' },
  { content: '成功的路上并不拥挤，因为坚持的人不多。', author: '佚名' },
  { content: '梦想还是要有的，万一实现了呢？', author: '佚名' },
  { content: '当你觉得累的时候，你正在走上坡路。', author: '佚名' },
  { content: '人生没有白走的路，每一步都算数。', author: '佚名' },
  { content: '种一棵树最好的时间是十年前，其次是现在。', author: '佚名' },
  { content: '所有的幸运，都是努力埋下的伏笔。', author: '佚名' },
  { content: '每一个清晨都是一个新的开始。', author: '佚名' },
  { content: '乾坤未定，你我皆是黑马。', author: '佚名' },
  { content: '星光不问赶路人，时光不负有心人。', author: '佚名' },
  { content: '你若盛开，蝴蝶自来。', author: '佚名' },
  { content: '不忘初心，方得始终。', author: '《华严经》' },
  { content: '万物皆有裂痕，那是光照进来的地方。', author: '莱昂纳德·科恩' },
  { content: '心若向阳，无畏悲伤。', author: '佚名' },
  { content: '生活明朗，万物可爱。', author: '佚名' },
  { content: '一切都会好起来的。', author: '佚名' },
  { content: '既然选择了远方，便只顾风雨兼程。', author: '汪国真' },
  { content: '没有比脚更长的路，没有比人更高的山。', author: '汪国真' },
  { content: '生活不能等待别人来安排。', author: '路遥' },
  { content: '昨天是段历史，明天是个谜团，而今天是天赐的礼物。', author: '《功夫熊猫》' },
  { content: '每一个优秀的人都有一段沉默的时光。', author: '佚名' },
  { content: '最怕你一生碌碌无为，还安慰自己平凡可贵。', author: '佚名' },
  { content: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
  { content: 'Stay hungry, stay foolish.', author: 'Steve Jobs' },
  { content: 'Believe you can and you\'re halfway there.', author: 'Theodore Roosevelt' },
  { content: 'The future belongs to those who believe in the beauty of their dreams.', author: 'Eleanor Roosevelt' },
  { content: 'In the middle of difficulty lies opportunity.', author: 'Albert Einstein' },
  { content: 'Success is not final, failure is not fatal: it is the courage to continue that counts.', author: 'Winston Churchill' },
  { content: 'The only impossible journey is the one you never begin.', author: 'Tony Robbins' },
  { content: 'The best time to plant a tree was 20 years ago. The second best time is now.', author: 'Chinese Proverb' },
  { content: 'Whether you think you can or you think you can\'t, you\'re right.', author: 'Henry Ford' },
  { content: 'You miss 100% of the shots you don\'t take.', author: 'Wayne Gretzky' },
  { content: 'It always seems impossible until it\'s done.', author: 'Nelson Mandela' },
  { content: 'The greatest glory in living lies not in never falling, but in rising every time we fall.', author: 'Nelson Mandela' },
  { content: 'I am the master of my fate: I am the captain of my soul.', author: 'William Ernest Henley' },
  { content: 'Be the change that you wish to see in the world.', author: 'Mahatma Gandhi' },
  { content: 'Live as if you were to die tomorrow. Learn as if you were to live forever.', author: 'Mahatma Gandhi' },
  { content: 'Hard work beats talent when talent doesn\'t work hard.', author: 'Tim Notke' },
  { content: 'Don\'t count the days, make the days count.', author: 'Muhammad Ali' },
  { content: 'If you can dream it, you can do it.', author: 'Walt Disney' },
  { content: 'The best revenge is massive success.', author: 'Frank Sinatra' },
  { content: 'Courage is resistance to fear, mastery of fear, not absence of fear.', author: 'Mark Twain' },
  { content: 'Tough times never last, but tough people do.', author: 'Robert H. Schuller' },
  { content: 'You don\'t have to be great to start, but you have to start to be great.', author: 'Zig Ziglar' },
  { content: 'A goal without a plan is just a wish.', author: 'Antoine de Saint-Exupéry' },
  { content: 'Twenty years from now you will be more disappointed by the things you didn\'t do.', author: 'Mark Twain' },
  { content: 'The best way to predict the future is to invent it.', author: 'Alan Kay' },
  { content: 'Well done is better than well said.', author: 'Benjamin Franklin' },
  { content: 'Happiness is not something ready made. It comes from your own actions.', author: 'Dalai Lama' },
  { content: 'We may encounter many defeats but we must not be defeated.', author: 'Maya Angelou' },
  { content: 'Quality is not an act, it is a habit.', author: 'Aristotle' },
  { content: 'Patience is bitter, but its fruit is sweet.', author: 'Aristotle' },
  { content: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', author: 'Aristotle' },
  { content: 'I have not failed. I\'ve just found 10,000 ways that won\'t work.', author: 'Thomas Edison' },
  { content: 'Imagination is more important than knowledge.', author: 'Albert Einstein' },
  { content: 'Life is like riding a bicycle. To keep your balance, you must keep moving.', author: 'Albert Einstein' },
  { content: 'Learn from yesterday, live for today, hope for tomorrow.', author: 'Albert Einstein' },
  { content: 'Act as if what you do makes a difference. It does.', author: 'William James' },
  { content: 'The only limit to our realization of tomorrow will be our doubts of today.', author: 'Franklin D. Roosevelt' },
  { content: 'It is never too late to be what you might have been.', author: 'George Eliot' },
  { content: 'Be yourself; everyone else is already taken.', author: 'Oscar Wilde' },
  { content: 'Do one thing every day that scares you.', author: 'Eleanor Roosevelt' },
  { content: 'If opportunity doesn\'t knock, build a door.', author: 'Milton Berle' },
  { content: 'Nothing will work unless you do.', author: 'Maya Angelou' },
  { content: 'Whatever you are, be a good one.', author: 'Abraham Lincoln' },
  { content: 'The best way to find yourself is to lose yourself in the service of others.', author: 'Mahatma Gandhi' },
  { content: 'I never lose. I either win or learn.', author: 'Nelson Mandela' },
  { content: 'There is no passion to be found playing small.', author: 'Nelson Mandela' },
  { content: 'The brave man is not he who does not feel afraid, but he who conquers that fear.', author: 'Nelson Mandela' },
];

// ===== 获取新鲜语录 =====
async function fetchQuoteFromAPI(): Promise<{ content: string; author: string } | null> {
  const sources = [
    async () => {
      const res = await fetch('https://api.quotable.io/random?maxLength=120');
      if (!res.ok) return null;
      const d = await res.json() as { content?: string; author?: string };
      return d?.content ? { content: d.content, author: d.author || 'Unknown' } : null;
    },
    async () => {
      const res = await fetch('https://zenquotes.io/api/random');
      if (!res.ok) return null;
      const d = await res.json() as Array<{ q?: string; a?: string }>;
      return Array.isArray(d) && d[0]?.q ? { content: d[0].q, author: d[0].a || 'Unknown' } : null;
    },
  ];

  for (const src of sources) {
    try {
      const q = await Promise.race([
        src(),
        new Promise<null>(r => setTimeout(() => r(null), 5000)),
      ]);
      if (q) return q;
    } catch { continue; }
  }
  return null;
}

// ===== 判断时段 =====
function getTimeLabel(): string {
  const h = new Date().getHours();
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
.header{background:linear-gradient(135deg,#667eea,#764ba2);border-radius:12px 12px 0 0;padding:40px 30px;text-align:center}
.header h1{color:#fff;font-size:28px;margin-bottom:8px}
.header p{color:rgba(255,255,255,0.85);font-size:14px}
.body-card{background:#fff;border-radius:0 0 12px 12px;padding:40px 30px;box-shadow:0 2px 12px rgba(0,0,0,0.08)}
.greeting{font-size:16px;color:#666;margin-bottom:12px}
.greeting strong{color:#667eea}
.banner{text-align:center;font-size:15px;color:#667eea;font-weight:600;padding:8px 0 12px;letter-spacing:1px}
.quote-wrapper{text-align:center;padding:30px 20px;margin:12px 0;background:linear-gradient(135deg,#fdf2e9,#fef9ef);border-left:4px solid #f5a623;border-radius:8px}
.quote-content{font-size:20px;line-height:1.8;color:#2c3e50;font-weight:500;margin-bottom:16px;font-style:italic}
.quote-author{font-size:15px;color:#888}
.quote-author::before{content:'—— '}
.footer{margin-top:30px;padding-top:20px;border-top:1px solid #eee;text-align:center}
.footer p{font-size:13px;color:#999;margin-bottom:4px}
.footer .tagline{color:#667eea;font-size:14px;font-weight:500}
.footer .unsubscribe{color:#bbb;font-size:11px;margin-top:8px}
</style></head><body>
<div class="container">
<div class="header"><h1>✨ 每日心语</h1><p>Daily Inspiration</p></div>
<div class="body-card">
<div class="greeting">${emoji} ${greet}，<strong>${name}</strong>：</div>
<div class="banner">🎯 开开心心上班，快快乐乐下班！</div>
<div class="quote-wrapper">
<div class="quote-content">"${content}"</div>
<div class="quote-author">${author}</div>
</div>
<div class="footer">
<p class="tagline">愿这句话为你的一天带来力量与温暖 💪</p>
<p>—— 每日心语 · 与你同行</p>
<p class="unsubscribe">此邮件由系统自动发送</p>
</div>
</div></div></body></html>`;
}

// ===== 通过 Brevo 发送 =====
async function sendEmail(toName: string, toEmail: string, html: string): Promise<boolean> {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
      to: [{ email: toEmail, name: toName }],
      subject: `✨ 每日心语 · ${toName}，今天也要加油哦！`,
      htmlContent: html,
    }),
  });

  if (res.ok) {
    console.log(`  ✅ ${toEmail}`);
    return true;
  }
  const err = await res.text();
  console.error(`  ❌ ${toEmail}: HTTP ${res.status} ${err.slice(0, 100)}`);
  return false;
}

// ===== 主逻辑 =====
async function main() {
  console.log('========================================');
  console.log('  📬 每日心语 · GitHub Actions 发送任务');
  console.log(`  🕐 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  console.log('========================================\n');

  // 验证 Brevo 配置
  if (!BREVO_API_KEY) { console.error('❌ BREVO_API_KEY 未设置'); process.exit(1); }
  if (!BREVO_SENDER_EMAIL) { console.error('❌ BREVO_SENDER_EMAIL 未设置'); process.exit(1); }

  // 为每个收件人获取不同的语录
  const used = new Set<string>();
  const results: { name: string; email: string; ok: boolean }[] = [];

  for (const r of RECIPIENTS) {
    // 取语录：先试 API，失败用内置（不重复）
    let quote: { content: string; author: string } | null = null;

    // 尝试从 API 获取
    for (let attempt = 0; attempt < 5; attempt++) {
      const apiQuote = await fetchQuoteFromAPI();
      if (apiQuote && !used.has(apiQuote.content.substring(0, 40))) {
        quote = apiQuote;
        used.add(apiQuote.content.substring(0, 40));
        break;
      }
    }

    // API 没取到或不唯一，从内置库随机取
    if (!quote) {
      const shuffled = BUILT_IN_QUOTES.sort(() => Math.random() - 0.5);
      for (const q of shuffled) {
        if (!used.has(q.content.substring(0, 40))) {
          quote = q;
          used.add(q.content.substring(0, 40));
          break;
        }
      }
    }

    // 实在没有了就用默认
    if (!quote) {
      quote = { content: '每一天都是新的开始，加油！', author: '每日心语' };
    }

    console.log(`📧 发送给 ${r.name} (${r.email}):`);
    console.log(`    "${quote.content}" — ${quote.author}`);

    const html = buildHtml(quote.content, quote.author, r.name);
    const ok = await sendEmail(r.name, r.email, html);
    results.push({ name: r.name, email: r.email, ok });

    // 避免同时请求过多
    await new Promise(r => setTimeout(r, 200));
  }

  // 汇总
  const success = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n========================================`);
  console.log(`  ✅ 成功: ${success}  |  ❌ 失败: ${failed}  |  📊 共 ${results.length} 人`);
  console.log(`  🕐 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  console.log(`========================================`);
  // 发送结果作为 Actions 输出
  if (process.env.GITHUB_OUTPUT) {
    const fs = require('fs');
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `success_count=${success}\nfail_count=${failed}\n`);
  }
}

main().catch(err => {
  console.error('❌ 脚本异常:', err);
  process.exit(1);
});
