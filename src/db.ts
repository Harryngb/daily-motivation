import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { Recipient, SentQuote, Setting, SendHistory } from './types';

let db: Database.Database;

export function initDatabase(dbPath?: string): void {
  const resolvedPath = dbPath || process.env.DB_PATH || './data/database.db';
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(resolvedPath);

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS send_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_id INTEGER NOT NULL,
      recipient_name TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      quote_content TEXT NOT NULL,
      quote_author TEXT NOT NULL,
      sent_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      send_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'success',
      error_message TEXT,
      FOREIGN KEY (recipient_id) REFERENCES recipients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sent_quote_index (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_id INTEGER NOT NULL,
      quote_index INTEGER NOT NULL,
      sent_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (recipient_id) REFERENCES recipients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS dynamic_quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'api',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // Insert default settings if not exists
  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );

  insertSetting.run('send_times', '08:00,17:00');
  insertSetting.run('timezone', 'Asia/Shanghai');

  console.log(`[DB] Initialized at ${resolvedPath}`);
}

export function getDb(): Database.Database {
  return db;
}

// ===== Recipient CRUD =====

export function getAllRecipients(): Recipient[] {
  return db.prepare('SELECT * FROM recipients ORDER BY id ASC').all() as Recipient[];
}

export function getActiveRecipients(): Recipient[] {
  return db.prepare('SELECT * FROM recipients WHERE active = 1 ORDER BY id ASC').all() as Recipient[];
}

export function getRecipientById(id: number): Recipient | undefined {
  return db.prepare('SELECT * FROM recipients WHERE id = ?').get(id) as Recipient | undefined;
}

export function createRecipient(name: string, email: string): Recipient {
  const stmt = db.prepare('INSERT INTO recipients (name, email) VALUES (?, ?)');
  const result = stmt.run(name, email);
  return getRecipientById(result.lastInsertRowid as number)!;
}

export function updateRecipient(id: number, name: string, email: string, active: number): Recipient | undefined {
  const stmt = db.prepare(
    "UPDATE recipients SET name = ?, email = ?, active = ?, updated_at = datetime('now', 'localtime') WHERE id = ?"
  );
  stmt.run(name, email, active, id);
  return getRecipientById(id);
}

export function deleteRecipient(id: number): boolean {
  const stmt = db.prepare('DELETE FROM recipients WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function getRecipientCount(): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM recipients').get() as { count: number };
  return row.count;
}

export function getActiveRecipientCount(): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM recipients WHERE active = 1').get() as { count: number };
  return row.count;
}

// ===== Quote Tracking =====

export function getSentQuoteIndices(recipientId: number): number[] {
  const rows = db.prepare('SELECT quote_index FROM sent_quote_index WHERE recipient_id = ?').all(recipientId) as { quote_index: number }[];
  return rows.map(r => r.quote_index);
}

export function markQuoteSent(recipientId: number, quoteIndex: number): void {
  db.prepare('INSERT INTO sent_quote_index (recipient_id, quote_index) VALUES (?, ?)').run(recipientId, quoteIndex);
}

export function resetSentQuotesForRecipient(recipientId: number): void {
  db.prepare('DELETE FROM sent_quote_index WHERE recipient_id = ?').run(recipientId);
}

export function resetAllSentQuotes(): void {
  db.prepare('DELETE FROM sent_quote_index').run();
}

// ===== Send History =====

export function addSendHistory(entry: Omit<SendHistory, 'id' | 'sent_at'>): void {
  const stmt = db.prepare(
    `INSERT INTO send_history (recipient_id, recipient_name, recipient_email, quote_content, quote_author, send_time, status, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(entry.recipient_id, entry.recipient_name, entry.recipient_email, entry.quote_content, entry.quote_author, entry.send_time, entry.status, entry.error_message || null);
}

export function getSendHistory(limit: number = 100, offset: number = 0): SendHistory[] {
  return db.prepare('SELECT * FROM send_history ORDER BY sent_at DESC LIMIT ? OFFSET ?').all(limit, offset) as SendHistory[];
}

export function getTotalSentCount(): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM send_history').get() as { count: number };
  return row.count;
}

export function getLastSendTime(): string | null {
  const row = db.prepare('SELECT MAX(sent_at) as last FROM send_history').get() as { last: string | null };
  return row.last;
}

export function getRecentSendHistoryForRecipient(recipientId: number, limit: number = 50): SentQuote[] {
  return db.prepare(
    'SELECT id, recipient_id, quote_content, quote_author, sent_at, send_time FROM send_history WHERE recipient_id = ? ORDER BY sent_at DESC LIMIT ?'
  ).all(recipientId, limit) as SentQuote[];
}

// ===== Dynamic Quotes =====

export function getDynamicQuotes(): { id: number; content: string; author: string; source: string }[] {
  return db.prepare('SELECT * FROM dynamic_quotes ORDER BY id ASC').all() as any[];
}

export function getDynamicQuoteCount(): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM dynamic_quotes').get() as { count: number };
  return row.count;
}

export function insertDynamicQuote(content: string, author: string, source: string = 'api'): number {
  const result = db.prepare('INSERT INTO dynamic_quotes (content, author, source) VALUES (?, ?, ?)').run(content, author, source);
  return result.lastInsertRowid as number;
}

export function insertDynamicQuotes(quotes: { content: string; author: string; source?: string }[]): void {
  const stmt = db.prepare('INSERT INTO dynamic_quotes (content, author, source) VALUES (?, ?, ?)');
  const insertMany = db.transaction((items: { content: string; author: string; source?: string }[]) => {
    for (const q of items) {
      stmt.run(q.content, q.author || '', q.source || 'api');
    }
  });
  insertMany(quotes);
}

export function deleteAllDynamicQuotes(): void {
  db.prepare('DELETE FROM dynamic_quotes').run();
}

// ===== Settings =====

export function getSetting(key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

export function getAllSettings(): Record<string, string> {
  const rows = db.prepare('SELECT * FROM settings').all() as Setting[];
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}
