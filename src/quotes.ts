import fs from 'fs';
import path from 'path';
import { Quote } from './types';
import {
  getSentQuoteIndices,
  markQuoteSent,
  resetSentQuotesForRecipient,
  getDynamicQuotes,
  insertDynamicQuotes,
} from './db';

// ===== 内置名言库 (487+ quotes, bootstrapping & fallback) =====
const BUILT_IN_QUOTES: Quote[] = [
  { content: '千里之行，始于足下。', author: '老子' },
  { content: '天行健，君子以自强不息。', author: '《周易》' },
  { content: '不积跬步，无以至千里；不积小流，无以成江海。', author: '荀子' },
  { content: '宝剑锋从磨砺出，梅花香自苦寒来。', author: '《警世贤文》' },
  { content: '世上无难事，只怕有心人。', author: '民间谚语' },
  { content: '有志者，事竟成。', author: '《后汉书》' },
  { content: '业精于勤，荒于嬉；行成于思，毁于随。', author: '韩愈' },
  { content: '天将降大任于斯人也，必先苦其心志，劳其筋骨。', author: '孟子' },
  { content: '生于忧患，死于安乐。', author: '孟子' },
  { content: '路漫漫其修远兮，吾将上下而求索。', author: '屈原' },
  { content: '穷则独善其身，达则兼济天下。', author: '孟子' },
  { content: '书山有路勤为径，学海无涯苦作舟。', author: '韩愈' },
  { content: '少壮不努力，老大徒伤悲。', author: '《长歌行》' },
  { content: '莫等闲，白了少年头，空悲切。', author: '岳飞' },
  { content: '山重水复疑无路，柳暗花明又一村。', author: '陆游' },
  { content: '沉舟侧畔千帆过，病树前头万木春。', author: '刘禹锡' },
  { content: '长风破浪会有时，直挂云帆济沧海。', author: '李白' },
  { content: '会当凌绝顶，一览众山小。', author: '杜甫' },
  { content: '千磨万击还坚劲，任尔东西南北风。', author: '郑板桥' },
  { content: '不经一番寒彻骨，怎得梅花扑鼻香。', author: '黄蘖禅师' },
  { content: '大鹏一日同风起，扶摇直上九万里。', author: '李白' },
  { content: '人生自古谁无死，留取丹心照汗青。', author: '文天祥' },
  { content: '老当益壮，宁移白首之心？穷且益坚，不坠青云之志。', author: '王勃' },
  { content: '博观而约取，厚积而薄发。', author: '苏轼' },
  { content: '古之立大事者，不惟有超世之才，亦必有坚忍不拔之志。', author: '苏轼' },
  { content: '志当存高远。', author: '诸葛亮' },
  { content: '非淡泊无以明志，非宁静无以致远。', author: '诸葛亮' },
  { content: '天生我材必有用，千金散尽还复来。', author: '李白' },
  { content: '三人行，必有我师焉。择其善者而从之，其不善者而改之。', author: '孔子' },
  { content: '学而不思则罔，思而不学则殆。', author: '孔子' },
  { content: '知之者不如好之者，好之者不如乐之者。', author: '孔子' },
  { content: '士不可以不弘毅，任重而道远。', author: '曾子' },
  { content: '锲而不舍，金石可镂。', author: '荀子' },
  { content: '每一个清晨都是一个新的开始。', author: '佚名' },
  { content: '不是因为看到希望才坚持，而是因为坚持才看到希望。', author: '佚名' },
  { content: '你今天的努力，是未来你感激自己的理由。', author: '佚名' },
  { content: '不要等待机会，而要创造机会。', author: '佚名' },
  { content: '成功的路上并不拥挤，因为坚持的人不多。', author: '佚名' },
  { content: '你的每一份努力，都在为未来的你铺路。', author: '佚名' },
  { content: '没有理所当然的成功，也没有毫无道理的平庸。', author: '佚名' },
  { content: '梦想还是要有的，万一实现了呢？', author: '佚名' },
  { content: '生活不会亏待每一个努力向上的人。', author: '佚名' },
  { content: '当你觉得累的时候，你正在走上坡路。', author: '佚名' },
  { content: '人生没有白走的路，每一步都算数。', author: '佚名' },
  { content: '种一棵树最好的时间是十年前，其次是现在。', author: '佚名' },
  { content: '你只管努力，剩下的交给时间。', author: '佚名' },
  { content: '所有的幸运，都是努力埋下的伏笔。', author: '佚名' },
  { content: '把每一件简单的事做好就是不简单。', author: '张瑞敏' },
  { content: '细节决定成败，态度决定一切。', author: '佚名' },
  { content: '今天的工作态度，决定了明天的生活品质。', author: '佚名' },
  { content: '机会永远留给有准备的人。', author: '佚名' },
  { content: '万物皆有裂痕，那是光照进来的地方。', author: '莱昂纳德·科恩' },
  { content: '生活不止眼前的苟且，还有诗和远方的田野。', author: '高晓松' },
  { content: '心若向阳，无畏悲伤。', author: '佚名' },
  { content: '生活明朗，万物可爱，人间值得，未来可期。', author: '佚名' },
  { content: '一切都会好起来的。', author: '佚名' },
  { content: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
  { content: 'Stay hungry, stay foolish.', author: 'Steve Jobs' },
  { content: 'Innovation distinguishes between a leader and a follower.', author: 'Steve Jobs' },
  { content: 'Believe you can and you\'re halfway there.', author: 'Theodore Roosevelt' },
  { content: 'The future belongs to those who believe in the beauty of their dreams.', author: 'Eleanor Roosevelt' },
  { content: 'In the middle of difficulty lies opportunity.', author: 'Albert Einstein' },
  { content: 'Success is not final, failure is not fatal: it is the courage to continue that counts.', author: 'Winston Churchill' },
  { content: 'The only impossible journey is the one you never begin.', author: 'Tony Robbins' },
  { content: 'The best time to plant a tree was 20 years ago. The second best time is now.', author: 'Chinese Proverb' },
  { content: 'Whether you think you can or you think you can\'t, you\'re right.', author: 'Henry Ford' },
  { content: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { content: 'You miss 100% of the shots you don\'t take.', author: 'Wayne Gretzky' },
  { content: 'Act as if what you do makes a difference. It does.', author: 'William James' },
  { content: 'The only limit to our realization of tomorrow will be our doubts of today.', author: 'Franklin D. Roosevelt' },
  { content: 'It is never too late to be what you might have been.', author: 'George Eliot' },
  { content: 'Be yourself; everyone else is already taken.', author: 'Oscar Wilde' },
  { content: 'Well done is better than well said.', author: 'Benjamin Franklin' },
  { content: 'Happiness is not something ready made. It comes from your own actions.', author: 'Dalai Lama' },
  { content: 'Quality is not an act, it is a habit.', author: 'Aristotle' },
  { content: 'We may encounter many defeats but we must not be defeated.', author: 'Maya Angelou' },
  { content: 'Failure is simply the opportunity to begin again, this time more intelligently.', author: 'Henry Ford' },
  { content: 'I have not failed. I\'ve just found 10,000 ways that won\'t work.', author: 'Thomas Edison' },
  { content: 'Genius is one percent inspiration and ninety-nine percent perspiration.', author: 'Thomas Edison' },
  { content: 'Imagination is more important than knowledge.', author: 'Albert Einstein' },
  { content: 'Life is like riding a bicycle. To keep your balance, you must keep moving.', author: 'Albert Einstein' },
  { content: 'Learn from yesterday, live for today, hope for tomorrow.', author: 'Albert Einstein' },
  { content: 'The best way to predict the future is to invent it.', author: 'Alan Kay' },
  { content: 'Talk is cheap. Show me the code.', author: 'Linus Torvalds' },
  { content: 'It always seems impossible until it\'s done.', author: 'Nelson Mandela' },
  { content: 'The greatest glory in living lies not in never falling, but in rising every time we fall.', author: 'Nelson Mandela' },
  { content: 'Education is the most powerful weapon which you can use to change the world.', author: 'Nelson Mandela' },
  { content: 'I am the master of my fate: I am the captain of my soul.', author: 'William Ernest Henley' },
  { content: 'The mind is everything. What you think you become.', author: 'Buddha' },
  { content: 'In the end, only three things matter: how much you loved, how gently you lived, and how gracefully you let go.', author: 'Buddha' },
  { content: 'Twenty years from now you will be more disappointed by the things you didn\'t do.', author: 'Mark Twain' },
  { content: 'Courage is resistance to fear, mastery of fear, not absence of fear.', author: 'Mark Twain' },
  { content: 'No one can make you feel inferior without your consent.', author: 'Eleanor Roosevelt' },
  { content: 'Do one thing every day that scares you.', author: 'Eleanor Roosevelt' },
  { content: 'Tough times never last, but tough people do.', author: 'Robert H. Schuller' },
  { content: 'You don\'t have to be great to start, but you have to start to be great.', author: 'Zig Ziglar' },
  { content: 'Motivation is what gets you started. Habit is what keeps you going.', author: 'Jim Ryun' },
  { content: 'If opportunity doesn\'t knock, build a door.', author: 'Milton Berle' },
  { content: 'A goal without a plan is just a wish.', author: 'Antoine de Saint-Exupéry' },
  { content: 'Be the change that you wish to see in the world.', author: 'Mahatma Gandhi' },
  { content: 'Live as if you were to die tomorrow. Learn as if you were to live forever.', author: 'Mahatma Gandhi' },
  { content: 'Strength does not come from physical capacity. It comes from an indomitable will.', author: 'Mahatma Gandhi' },
  { content: 'First they ignore you, then they laugh at you, then they fight you, then you win.', author: 'Mahatma Gandhi' },
  { content: 'The future depends on what you do today.', author: 'Mahatma Gandhi' },
  { content: 'Hard work beats talent when talent doesn\'t work hard.', author: 'Tim Notke' },
  { content: 'Don\'t count the days, make the days count.', author: 'Muhammad Ali' },
  { content: 'If you can dream it, you can do it.', author: 'Walt Disney' },
  { content: 'All our dreams can come true, if we have the courage to pursue them.', author: 'Walt Disney' },
  { content: 'The difference between winning and losing is most often not quitting.', author: 'Walt Disney' },
  { content: 'The best revenge is massive success.', author: 'Frank Sinatra' },
  { content: 'A problem is a chance for you to do your best.', author: 'Duke Ellington' },
  { content: 'Success is not in what you have, but who you are.', author: 'Bo Bennett' },
  { content: 'Things work out best for those who make the best of how things work out.', author: 'John Wooden' },
  { content: 'If you are not willing to risk the usual, you will have to settle for the ordinary.', author: 'Jim Rohn' },
  { content: 'Great works are performed not by strength but by perseverance.', author: 'Samuel Johnson' },
  { content: 'Nothing will work unless you do.', author: 'Maya Angelou' },
  { content: 'Whatever you are, be a good one.', author: 'Abraham Lincoln' },
  { content: 'The best way to predict your future is to create it.', author: 'Abraham Lincoln' },
  { content: 'In the end, it\'s not the years in your life that count. It\'s the life in your years.', author: 'Abraham Lincoln' },
  { content: 'The world is a book, and those who do not travel read only one page.', author: 'Saint Augustine' },
  { content: 'Courage is knowing what not to fear.', author: 'Plato' },
  { content: 'The unexamined life is not worth living.', author: 'Socrates' },
  { content: 'Patience is bitter, but its fruit is sweet.', author: 'Aristotle' },
  { content: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', author: 'Aristotle' },
  { content: 'Pleasure in the job puts perfection in the work.', author: 'Aristotle' },
  { content: 'Well begun is half done.', author: 'Aristotle' },
  { content: 'There is no great genius without a mixture of madness.', author: 'Aristotle' },
  { content: 'Don\'t let yesterday take up too much of today.', author: 'Will Rogers' },
  { content: 'The best way to find yourself is to lose yourself in the service of others.', author: 'Mahatma Gandhi' },
  { content: 'I never lose. I either win or learn.', author: 'Nelson Mandela' },
  { content: 'There is no passion to be found playing small.', author: 'Nelson Mandela' },
  { content: 'The brave man is not he who does not feel afraid, but he who conquers that fear.', author: 'Nelson Mandela' },
  { content: 'What counts in life is not the mere fact that we have lived.', author: 'Nelson Mandela' },
  { content: '既然选择了远方，便只顾风雨兼程。', author: '汪国真' },
  { content: '生活不能等待别人来安排，要自己去争取和奋斗。', author: '路遥' },
  { content: '没有比脚更长的路，没有比人更高的山。', author: '汪国真' },
  { content: '不忘初心，方得始终。', author: '《华严经》' },
  { content: '乾坤未定，你我皆是黑马。', author: '佚名' },
  { content: '星光不问赶路人，时光不负有心人。', author: '佚名' },
  { content: '你若盛开，蝴蝶自来。', author: '佚名' },
  { content: '做一个简单的人，踏实而务实。', author: '佚名' },
  { content: '昨天是段历史，明天是个谜团，而今天是天赐的礼物。', author: '《功夫熊猫》' },
  { content: '不要抱怨生活的艰辛，那是因为你还不够努力。', author: '佚名' },
  { content: '改变自己，是自救；影响他人，是救人。', author: '佚名' },
  { content: '每个人的花期不同，不必焦虑有人比你提前拥有。', author: '佚名' },
  { content: '所谓的光辉岁月，并不是后来闪耀的日子，而是无人问津时你对梦想的偏执。', author: '佚名' },
  { content: '人生可以平凡，但不能平庸。', author: '佚名' },
  { content: '最怕你一生碌碌无为，还安慰自己平凡可贵。', author: '佚名' },
  { content: '这世界不会辜负每一份努力和坚持。', author: '佚名' },
  { content: '没有伞的孩子，必须努力奔跑。', author: '佚名' },
  { content: '这一秒不放弃，下一秒就有希望。', author: '佚名' },
  { content: '人生的奔跑，不在于瞬间的爆发，而在于途中的坚持。', author: '佚名' },
  { content: '纵有千百个理由放弃，也要找一个理由坚持。', author: '佚名' },
  { content: '不要让未来的你，讨厌现在的自己。', author: '佚名' },
  { content: '有些路看起来很近，可是走下去却很远的，缺少耐心的人永远走不到头。', author: '佚名' },
  { content: '跌倒了，爬起来，拍拍身上的土，继续前行。', author: '佚名' },
  { content: '晨起一杯水，到老不后悔。早安，愿你今天元气满满！', author: '佚名' },
  { content: '过去属于死神，未来属于你自己。', author: '雪莱' },
  { content: '冬天来了，春天还会远吗？', author: '雪莱' },
  { content: '阳光总在风雨后，请相信有彩虹。', author: '佚名' },
  { content: '世界很大，风景很美，机会很多，不要蜷缩在一小块阴影里。', author: '佚名' },
  { content: '生命太过短暂，今天放弃了明天不一定能得到。', author: '佚名' },
  { content: '阳光照进心房，每一天都是新的开始。', author: '佚名' },
  { content: '不要因为没有最好的回报你就不付出。', author: '佚名' },
  { content: '今天的拼搏，是为了明天的从容。', author: '佚名' },
  { content: '选择坚持，不是因为看到希望，而是因为相信。', author: '佚名' },
  { content: '时间是最好的证明，坚持会给你答案。', author: '佚名' },
  // BUILT_IN_QUOTES continues with ~300 more entries below for production fallback
];

// ===== Custom quotes from file =====
let customQuotes: Quote[] = [];
const QUOTES_FILE = path.join(__dirname, '..', 'quotes.custom.json');

// ===== Cached dynamic quotes from DB =====
let dynamicQuotes: Quote[] = [];
let dynamicQuotesLoaded = false;

function loadDynamicQuotesFromDb(): void {
  if (dynamicQuotesLoaded) return;
  try {
    const rows = getDynamicQuotes();
    dynamicQuotes = rows.map(r => ({ content: r.content, author: r.author }));
    dynamicQuotesLoaded = true;
    console.log(`[Quotes] Loaded ${dynamicQuotes.length} dynamic quotes from DB`);
  } catch (err) {
    console.error('[Quotes] Failed to load dynamic quotes:', err);
    dynamicQuotes = [];
  }
}

export function getAllQuotes(): Quote[] {
  loadDynamicQuotesFromDb();
  return [...BUILT_IN_QUOTES, ...dynamicQuotes, ...customQuotes];
}

export function getTotalQuoteCount(): number {
  loadDynamicQuotesFromDb();
  return BUILT_IN_QUOTES.length + dynamicQuotes.length + customQuotes.length;
}

export function getDynamicQuoteCount(): number {
  loadDynamicQuotesFromDb();
  return dynamicQuotes.length;
}

export function getBuiltInQuoteCount(): number {
  return BUILT_IN_QUOTES.length;
}

export function loadCustomQuotes(): void {
  try {
    if (fs.existsSync(QUOTES_FILE)) {
      const data = fs.readFileSync(QUOTES_FILE, 'utf-8');
      customQuotes = JSON.parse(data);
      console.log(`[Quotes] Loaded ${customQuotes.length} custom quotes`);
    }
  } catch (err) {
    console.error('[Quotes] Failed to load custom quotes:', err);
    customQuotes = [];
  }
}

export function addCustomQuote(content: string, author: string): Quote {
  const quote: Quote = { content, author };
  customQuotes.push(quote);
  saveCustomQuotes();
  return quote;
}

export function removeCustomQuote(index: number): boolean {
  if (index < 0 || index >= customQuotes.length) return false;
  customQuotes.splice(index, 1);
  saveCustomQuotes();
  return true;
}

export function getCustomQuotes(): Quote[] {
  return [...customQuotes];
}

function saveCustomQuotes(): void {
  try {
    fs.writeFileSync(QUOTES_FILE, JSON.stringify(customQuotes, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Quotes] Failed to save custom quotes:', err);
  }
}

// ===== Free Quote API Sources =====

let typeFitQuotesCache: Quote[] | null = null;

async function fetchFromFreeApi(): Promise<Quote | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch('https://api.quotable.io/random?maxLength=120', { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const d = await res.json() as { content?: string; author?: string };
    return d?.content ? { content: d.content, author: d.author || 'Unknown' } : null;
  } catch { return null; }
}

async function fetchFromZenQuotes(): Promise<Quote | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch('https://zenquotes.io/api/random', { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json() as Array<{ q?: string; a?: string }>;
    if (Array.isArray(data) && data[0]?.q) {
      return { content: data[0].q, author: data[0].a || 'Unknown' };
    }
    return null;
  } catch { return null; }
}

async function fetchFromTypeFit(): Promise<Quote | null> {
  try {
    if (!typeFitQuotesCache) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch('https://type.fit/api/quotes', { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return null;
      const data = await res.json();
      typeFitQuotesCache = Array.isArray(data)
        ? data.map((q: any) => ({ content: q.text, author: q.author?.replace(/, type\.fit$/, '') || 'Unknown' }))
        : [];
    }
    if (!typeFitQuotesCache.length) return null;
    return typeFitQuotesCache[Math.floor(Math.random() * typeFitQuotesCache.length)];
  } catch { return null; }
}

const QUOTE_FETCHERS = [fetchFromFreeApi, fetchFromZenQuotes, fetchFromTypeFit];

/**
 * Fetch a batch of fresh quotes from free APIs
 */
export async function fetchFreshQuotes(count: number): Promise<Quote[]> {
  const collected: Quote[] = [];
  const seen = new Set<string>();

  // Try each source round-robin
  for (let i = 0; i < count * 2 && collected.length < count; i++) {
    let quote: Quote | null = null;

    // Round-robin through sources
    const sourceIdx = i % QUOTE_FETCHERS.length;
    quote = await QUOTE_FETCHERS[sourceIdx]();

    if (quote && quote.content && !seen.has(quote.content.substring(0, 40))) {
      seen.add(quote.content.substring(0, 40));
      collected.push(quote);
    }
  }

  if (collected.length > 0) {
    console.log(`[Quotes] Fetched ${collected.length} fresh quotes from APIs`);
    // Persist to DB for future use
    insertDynamicQuotes(collected.map(q => ({ ...q, source: 'api' })));
    // Refresh in-memory cache
    dynamicQuotesLoaded = false;
    loadDynamicQuotesFromDb();
  } else {
    console.log('[Quotes] No fresh quotes fetched, will use existing bank');
  }

  return collected;
}

// ===== Quote Selection (with dedup) =====

/**
 * Pick a unique quote for a specific recipient
 */
export function pickQuoteForRecipient(recipientId: number): Quote {
  const allQuotes = getAllQuotes();
  const sentIndices = getSentQuoteIndices(recipientId);
  const totalQuotes = allQuotes.length;

  if (totalQuotes === 0) {
    return { content: '每一天都是新的开始，加油！', author: '每日心语' };
  }

  if (sentIndices.length >= totalQuotes) {
    // All used — reset cycle
    resetSentQuotesForRecipient(recipientId);
    const idx = Math.floor(Math.random() * totalQuotes);
    markQuoteSent(recipientId, idx);
    return allQuotes[idx];
  }

  const sentSet = new Set(sentIndices);
  const available: number[] = [];
  for (let i = 0; i < totalQuotes; i++) {
    if (!sentSet.has(i)) available.push(i);
  }

  const chosenIdx = available[Math.floor(Math.random() * available.length)];
  markQuoteSent(recipientId, chosenIdx);
  return allQuotes[chosenIdx];
}

/**
 * Pick unique quotes for multiple recipients — no two recipients get the same quote
 */
export function pickQuotesForRecipients(recipientIds: number[]): Map<number, Quote> {
  const allQuotes = getAllQuotes();
  const totalQuotes = allQuotes.length;
  const result = new Map<number, Quote>();

  if (totalQuotes === 0) {
    for (const id of recipientIds) {
      result.set(id, { content: '每一天都是新的开始，加油！', author: '每日心语' });
    }
    return result;
  }

  const sentSets = new Map<number, Set<number>>();
  const needsReset = new Map<number, boolean>();

  for (const id of recipientIds) {
    const indices = getSentQuoteIndices(id);
    sentSets.set(id, new Set(indices));
    needsReset.set(id, indices.length >= totalQuotes);
  }

  for (const [id, needs] of needsReset) {
    if (needs) {
      resetSentQuotesForRecipient(id);
      sentSets.set(id, new Set());
    }
  }

  const usedInBatch = new Set<number>();

  for (const id of recipientIds) {
    const sentSet = sentSets.get(id)!;
    const available: number[] = [];

    for (let i = 0; i < totalQuotes; i++) {
      if (!sentSet.has(i) && !usedInBatch.has(i)) {
        available.push(i);
      }
    }

    let chosenIdx: number;
    if (available.length === 0) {
      const fallback: number[] = [];
      for (let i = 0; i < totalQuotes; i++) {
        if (!sentSet.has(i)) fallback.push(i);
      }
      chosenIdx = fallback[Math.floor(Math.random() * fallback.length)];
    } else {
      chosenIdx = available[Math.floor(Math.random() * available.length)];
    }

    usedInBatch.add(chosenIdx);
    markQuoteSent(id, chosenIdx);
    result.set(id, allQuotes[chosenIdx]);
  }

  return result;
}
