import { Router, Request, Response } from 'express';
import {
  getAllRecipients,
  getRecipientById,
  createRecipient,
  updateRecipient,
  deleteRecipient,
  getRecipientCount,
  getActiveRecipientCount,
  getSendHistory,
  getTotalSentCount,
  getLastSendTime,
  getSetting,
  setSetting,
  getAllSettings,
  resetAllSentQuotes,
  getDynamicQuoteCount,
} from './db';
import {
  getTotalQuoteCount,
  getAllQuotes,
  addCustomQuote,
  removeCustomQuote,
  getCustomQuotes,
  getBuiltInQuoteCount,
  fetchFreshQuotes,
} from './quotes';
import { isEmailConfigured, sendQuoteEmail, verifyBrevoConfig } from './mailer';
import { initScheduler, stopScheduler, getScheduleInfo } from './scheduler';
import { pickQuoteForRecipient } from './quotes';

const router = Router();

// ===== System Status =====
router.get('/api/status', (_req: Request, res: Response) => {
  const scheduleInfo = getScheduleInfo();
  const emailMethod = isEmailConfigured();
  res.json({
    version: '1.0.0',
    recipientCount: getRecipientCount(),
    activeRecipientCount: getActiveRecipientCount(),
    totalQuotesSent: getTotalSentCount(),
    totalQuotes: getTotalQuoteCount(),
    builtInQuotes: getBuiltInQuoteCount(),
    dynamicQuotes: getDynamicQuoteCount(),
    sendTimes: scheduleInfo.times.map(t => ({ time: t, label: parseInt(t) < 12 ? '早上' : '傍晚' })),
    emailMethod,
    lastSendTime: getLastSendTime(),
    nextSendTime: scheduleInfo.nextRuns[0] || null,
    timezone: scheduleInfo.timezone,
  });
});

// ===== Recipient CRUD =====
router.get('/api/recipients', (_req: Request, res: Response) => {
  res.json(getAllRecipients());
});

router.get('/api/recipients/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const recipient = getRecipientById(id);
  if (!recipient) return res.status(404).json({ error: 'Recipient not found' });
  res.json(recipient);
});

router.post('/api/recipients', (req: Request, res: Response) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email format' });

  try {
    const recipient = createRecipient(name, email);
    res.status(201).json(recipient);
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint')) return res.status(409).json({ error: '邮箱已存在' });
    res.status(500).json({ error: '创建失败' });
  }
});

router.put('/api/recipients/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { name, email, active } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email format' });

  const activeInt = active !== undefined ? (active ? 1 : 0) : 1;
  const recipient = updateRecipient(id, name, email, activeInt);
  if (!recipient) return res.status(404).json({ error: 'Recipient not found' });
  res.json(recipient);
});

router.delete('/api/recipients/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!deleteRecipient(id)) return res.status(404).json({ error: 'Recipient not found' });
  res.json({ success: true });
});

// ===== Send History =====
router.get('/api/history', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string, 10) || 100;
  const offset = parseInt(req.query.offset as string, 10) || 0;
  res.json({ data: getSendHistory(limit, offset), total: getTotalSentCount(), limit, offset });
});

// ===== Settings =====
router.get('/api/settings', (_req: Request, res: Response) => {
  const settings = getAllSettings();
  if (settings.smtp_pass) settings.smtp_pass = '********';
  if (settings.brevo_api_key) settings.brevo_api_key = '********';
  res.json(settings);
});

router.put('/api/settings', (req: Request, res: Response) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Invalid settings data' });
  }

  const allowedKeys = [
    'send_times', 'timezone',
    'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from',
    'brevo_api_key', 'brevo_sender_name', 'brevo_sender_email',
    'ai_api_key', 'ai_api_provider',
  ];

  for (const [key, value] of Object.entries(updates)) {
    if (allowedKeys.includes(key) && typeof value === 'string') {
      if (key === 'smtp_pass' && value === '********') continue;
      if (key === 'brevo_api_key' && value === '********') continue;
      setSetting(key, value);
    }
  }

  // Restart scheduler if timing changed
  if ('send_times' in updates || 'timezone' in updates) {
    stopScheduler();
    initScheduler();
  }

  const settings = getAllSettings();
  if (settings.smtp_pass) settings.smtp_pass = '********';
  if (settings.brevo_api_key) settings.brevo_api_key = '********';
  res.json(settings);
});

// ===== Quotes =====
router.get('/api/quotes', (_req: Request, res: Response) => {
  const allQuotes = getAllQuotes();
  const custom = getCustomQuotes();
  res.json({
    total: allQuotes.length,
    builtIn: getBuiltInQuoteCount(),
    dynamic: getDynamicQuoteCount(),
    custom: custom.length,
  });
});

router.post('/api/quotes', (req: Request, res: Response) => {
  const { content, author } = req.body;
  if (!content) return res.status(400).json({ error: 'Quote content is required' });
  const quote = addCustomQuote(content, author || '佚名');
  res.status(201).json(quote);
});

router.delete('/api/quotes/:index', (req: Request, res: Response) => {
  const index = parseInt(req.params.index, 10);
  if (!removeCustomQuote(index)) return res.status(404).json({ error: 'Custom quote not found' });
  res.json({ success: true });
});

// ===== Fresh Quotes API =====
router.post('/api/fetch-quotes', async (_req: Request, res: Response) => {
  try {
    const quotes = await fetchFreshQuotes(20);
    res.json({ success: true, fetched: quotes.length, message: `成功获取 ${quotes.length} 条新鲜语录` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== Actions =====
router.post('/api/test-send', async (req: Request, res: Response) => {
  const { recipient_id } = req.body;
  if (!recipient_id) return res.status(400).json({ error: 'recipient_id is required' });

  const recipient = getRecipientById(parseInt(recipient_id, 10));
  if (!recipient) return res.status(404).json({ error: 'Recipient not found' });

  const quote = pickQuoteForRecipient(recipient.id);
  const result = await sendQuoteEmail(recipient.name, recipient.email, quote, '08:00');

  if (result.success) {
    res.json({ success: true, message: `测试邮件已发送至 ${recipient.email}` });
  } else {
    res.status(500).json({ success: false, error: result.error });
  }
});

router.post('/api/send-now', async (_req: Request, res: Response) => {
  const { executeSend } = require('./scheduler');
  const now = new Date();
  const hour = now.getHours().toString().padStart(2, '0');
  const minute = now.getMinutes().toString().padStart(2, '0');
  const timeStr = `${hour}:${minute}`;

  try {
    await executeSend(timeStr);
    res.json({ success: true, message: '发送任务已触发' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/reset-quotes', (_req: Request, res: Response) => {
  resetAllSentQuotes();
  res.json({ success: true, message: '所有发送记录已重置，语录将重新轮换' });
});

// ===== Brevo Verify =====
router.get('/api/brevo/verify', async (_req: Request, res: Response) => {
  const result = await verifyBrevoConfig();
  res.json(result);
});

// ===== Scheduler =====
router.post('/api/scheduler/restart', (_req: Request, res: Response) => {
  stopScheduler();
  initScheduler();
  res.json({ success: true, message: '定时器已重启' });
});

export default router;
