import { getSetting } from './db';
import { Quote } from './types';

const BREVO_API = 'https://api.brevo.com/v3/smtp/email';

// ===== SMTP (fallback) =====
let nodemailerTransporter: any = null;

async function getNodemailerTransporter(): Promise<any> {
  if (nodemailerTransporter) return nodemailerTransporter;

  const host = getSetting('smtp_host') || process.env.SMTP_HOST;
  const portStr = getSetting('smtp_port') || process.env.SMTP_PORT || '587';
  const user = getSetting('smtp_user') || process.env.SMTP_USER;
  const pass = getSetting('smtp_pass') || process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  try {
    const nodemailer = await import('nodemailer');
    nodemailerTransporter = nodemailer.default.createTransport({
      host,
      port: parseInt(portStr, 10),
      secure: parseInt(portStr, 10) === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
    });
    return nodemailerTransporter;
  } catch {
    return null;
  }
}

// ===== Brevo API =====
function getBrevoApiKey(): string | null {
  return getSetting('brevo_api_key') || process.env.BREVO_API_KEY || null;
}

function getBrevoSender(): { name: string; email: string } {
  return {
    name: getSetting('brevo_sender_name') || process.env.BREVO_SENDER_NAME || '每日心语',
    email: getSetting('brevo_sender_email') || process.env.BREVO_SENDER_EMAIL || '',
  };
}

async function sendViaBrevo(
  toName: string,
  toEmail: string,
  subject: string,
  htmlContent: string
): Promise<{ success: boolean; error?: string }> {
  const apiKey = getBrevoApiKey();
  if (!apiKey) {
    return { success: false, error: 'Brevo API key not configured' };
  }

  const sender = getBrevoSender();
  if (!sender.email) {
    return { success: false, error: 'Brevo sender email not configured' };
  }

  try {
    const response = await fetch(BREVO_API, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        sender,
        to: [{ email: toEmail, name: toName }],
        subject,
        htmlContent,
      }),
    });

    const body = await response.text();

    if (response.ok) {
      console.log(`[Brevo] Sent to ${toEmail}: ${response.status}`);
      return { success: true };
    }

    // Specific error handling
    let errMsg = `HTTP ${response.status}`;
    try {
      const json = JSON.parse(body);
      errMsg = json.message || json.code || errMsg;
    } catch {
      errMsg = body || errMsg;
    }

    if (response.status === 401) {
      errMsg = 'Brevo API key 无效或已过期，请检查设置';
    } else if (response.status === 400 && errMsg.includes('sender')) {
      errMsg = '发件人邮箱未在 Brevo 后台验证，请先验证';
    }

    return { success: false, error: errMsg };
  } catch (err: any) {
    return { success: false, error: `Network error: ${err.message}` };
  }
}

// ===== Detection =====
export function isEmailConfigured(): 'brevo' | 'smtp' | false {
  if (getBrevoApiKey() && getBrevoSender().email) return 'brevo';
  return false;
}

// ===== HTML Template =====
function buildEmailHtml(quote: Quote, recipientName: string, sendLabel: string): string {
  const timeEmoji = sendLabel === '08:00' ? '🌅' : '🌇';
  const timeGreeting = sendLabel === '08:00'
    ? '早上好！'
    : '傍晚好！';

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
      background-color: #f5f7fa;
      color: #333;
      line-height: 1.6;
    }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 12px 12px 0 0;
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 { color: #fff; font-size: 28px; font-weight: 700; margin-bottom: 8px; }
    .header p { color: rgba(255,255,255,0.85); font-size: 14px; }
    .body-card {
      background: #ffffff;
      border-radius: 0 0 12px 12px;
      padding: 40px 30px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    }
    .greeting { font-size: 16px; color: #666; margin-bottom: 24px; }
    .greeting strong { color: #667eea; }
    .quote-wrapper {
      text-align: center;
      padding: 30px 20px;
      margin: 20px 0;
      background: linear-gradient(135deg, #fdf2e9 0%, #fef9ef 100%);
      border-left: 4px solid #f5a623;
      border-radius: 8px;
    }
    .quote-content {
      font-size: 20px;
      line-height: 1.8;
      color: #2c3e50;
      font-weight: 500;
      margin-bottom: 16px;
      font-style: italic;
    }
    .quote-author { font-size: 15px; color: #888; }
    .quote-author::before { content: '—— '; }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #eee;
      text-align: center;
    }
    .footer p { font-size: 13px; color: #999; margin-bottom: 4px; }
    .footer .tagline { color: #667eea; font-size: 14px; font-weight: 500; }
    .footer .unsubscribe { color: #bbb; font-size: 11px; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✨ 每日心语</h1>
      <p>Daily Inspiration</p>
    </div>
    <div class="body-card">
      <div class="greeting">${timeEmoji} ${timeGreeting} <strong>${recipientName}</strong>：</div>
      <div style="text-align:center;font-size:15px;color:#667eea;font-weight:600;padding:8px 0 4px;letter-spacing:1px">🎯 开开心心上班，快快乐乐下班！</div>
      <div class="quote-wrapper">
        <div class="quote-content">"${quote.content}"</div>
        <div class="quote-author">${quote.author}</div>
      </div>
      <div class="footer">
        <p class="tagline">愿这句话为你的一天带来力量与温暖 💪</p>
        <p>—— NVision 每日心语 · 与你同行</p>
        <p class="unsubscribe">此邮件由系统自动发送</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ===== Send Email =====
export async function sendQuoteEmail(
  toName: string,
  toEmail: string,
  quote: Quote,
  sendTimeLabel: string
): Promise<{ success: boolean; error?: string }> {
  const subject = `✨ 每日心语 · ${toName}，今天也要加油哦！`;
  const html = buildEmailHtml(quote, toName, sendTimeLabel);

  // Try Brevo first
  const brevoResult = await sendViaBrevo(toName, toEmail, subject, html);
  if (brevoResult.success) return brevoResult;

  // Fallback to SMTP
  console.log(`[Mailer] Brevo failed (${brevoResult.error}), trying SMTP fallback...`);
  const transporter = await getNodemailerTransporter();
  if (!transporter) {
    return { success: false, error: `Brevo: ${brevoResult.error} (SMTP also not configured)` };
  }

  try {
    const fromAddr = getSetting('smtp_from') || process.env.SMTP_FROM || '每日心语 <noreply@daily-motivation.com>';
    const info = await transporter.sendMail({
      from: fromAddr,
      to: `"${toName}" <${toEmail}>`,
      subject,
      html,
    });
    console.log(`[SMTP] Sent to ${toEmail}: ${info.messageId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: `Brevo: ${brevoResult.error} / SMTP: ${err.message}` };
  }
}

/**
 * Verify Brevo API key by making a lightweight API call
 */
export async function verifyBrevoConfig(): Promise<{ valid: boolean; message: string }> {
  const apiKey = getBrevoApiKey();
  if (!apiKey) {
    return { valid: false, message: 'API key 未配置' };
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/account', {
      headers: { 'api-key': apiKey },
    });

    if (response.ok) {
      const data = await response.json() as { email?: string };
      return { valid: true, message: `✅ 已验证 — ${data.email || '账户有效'}` };
    }

    if (response.status === 401) {
      return { valid: false, message: 'API key 无效或已过期' };
    }

    return { valid: false, message: `验证失败 (HTTP ${response.status})` };
  } catch (err: any) {
    return { valid: false, message: `网络错误: ${err.message}` };
  }
}
