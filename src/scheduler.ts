import { CronJob } from 'cron';
import { getActiveRecipients, getSetting, addSendHistory } from './db';
import { pickQuotesForRecipients, fetchFreshQuotes } from './quotes';
import { sendQuoteEmail } from './mailer';
import { Recipient } from './types';

interface ActiveJob {
  time: string;
  job: CronJob;
}

const activeJobs: ActiveJob[] = [];

/**
 * Parse send times from settings (e.g., "08:00,17:00")
 */
function parseSendTimes(): string[] {
  const timesStr = getSetting('send_times') || '08:00,17:00';
  return timesStr.split(',').map(t => t.trim()).filter(Boolean);
}

/**
 * Get the timezone setting
 */
function getTimezone(): string {
  return getSetting('timezone') || 'Asia/Shanghai';
}

/**
 * Convert "HH:MM" to cron minute-hour format
 */
function timeToCron(time: string): { minute: string; hour: string } {
  const [h, m] = time.split(':');
  return {
    minute: parseInt(m, 10).toString(),
    hour: parseInt(h, 10).toString(),
  };
}

/**
 * Determine send time label (for email greeting)
 */
function getSendLabel(time: string): string {
  const hour = parseInt(time.split(':')[0], 10);
  if (hour < 12) return '08:00';
  return '17:00';
}

/**
 * Execute the send for a specific time slot
 */
async function executeSend(sendTime: string): Promise<void> {
  console.log(`[Scheduler] Starting send for ${sendTime}...`);

  const recipients = getActiveRecipients();
  if (recipients.length === 0) {
    console.log('[Scheduler] No active recipients, skipping');
    return;
  }

  console.log(`[Scheduler] Sending to ${recipients.length} recipients`);

  // Fetch fresh quotes from APIs to keep the pool constantly updating
  try {
    const freshCount = await fetchFreshQuotes(recipients.length);
    if (freshCount.length > 0) {
      console.log(`[Scheduler] ${freshCount.length} fresh quotes added to pool`);
    }
  } catch (err) {
    console.warn('[Scheduler] Failed to fetch fresh quotes, using existing pool');
  }

  const recipientIds = recipients.map(r => r.id);
  const quoteMap = pickQuotesForRecipients(recipientIds);

  const sendLabel = getSendLabel(sendTime);
  const results = await Promise.allSettled(
    recipients.map(async (recipient: Recipient) => {
      const quote = quoteMap.get(recipient.id);
      if (!quote) {
        console.warn(`[Scheduler] No quote for ${recipient.name} (id=${recipient.id})`);
        return;
      }

      const result = await sendQuoteEmail(recipient.name, recipient.email, quote, sendLabel);

      // Record history
      addSendHistory({
        recipient_id: recipient.id,
        recipient_name: recipient.name,
        recipient_email: recipient.email,
        quote_content: quote.content,
        quote_author: quote.author,
        send_time: sendTime,
        status: result.success ? 'success' : 'failed',
        error_message: result.error,
      });
    })
  );

  const successCount = results.filter(r => r.status === 'fulfilled').length;
  const failCount = results.filter(r => r.status === 'rejected').length;
  console.log(`[Scheduler] Send completed: ${recipients.length} attempted, ${successCount} succeeded`);
  if (failCount > 0) {
    console.error(`[Scheduler] ${failCount} send jobs rejected`);
  }
}

/**
 * Initialize all cron jobs based on current settings
 */
export function initScheduler(): void {
  // Clear existing jobs
  stopScheduler();

  const sendTimes = parseSendTimes();
  const timezone = getTimezone();

  console.log(`[Scheduler] Initializing with send times: ${sendTimes.join(', ')}, timezone: ${timezone}`);

  for (const time of sendTimes) {
    const { minute, hour } = timeToCron(time);

    const job = new CronJob(
      `${minute} ${hour} * * *`,
      () => {
        executeSend(time).catch(err => {
          console.error(`[Scheduler] Error in send job ${time}:`, err);
        });
      },
      null, // onComplete
      false, // start immediately
      timezone
    );

    job.start();
    activeJobs.push({ time, job });

    // Calculate next run time
    const nextDate = job.nextDate();
    console.log(`[Scheduler] Cron job added for ${time}, next run: ${nextDate.toISO()}`);
  }
}

/**
 * Stop all running cron jobs
 */
export function stopScheduler(): void {
  for (const { time, job } of activeJobs) {
    job.stop();
    console.log(`[Scheduler] Stopped cron job for ${time}`);
  }
  activeJobs.length = 0;
}

/**
 * Get current schedule info
 */
export function getScheduleInfo(): { times: string[]; nextRuns: string[]; timezone: string } {
  const times = parseSendTimes();
  const timezone = getTimezone();

  const nextRuns = activeJobs
    .filter(j => j.job.running)
    .map(j => j.job.nextDate().toISO())
    .filter((d): d is string => d !== null);

  return { times, nextRuns, timezone };
}
