export interface Recipient {
  id: number;
  name: string;
  email: string;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface Quote {
  content: string;
  author: string;
}

export interface SentQuote {
  id: number;
  recipient_id: number;
  quote_content: string;
  quote_author: string;
  sent_at: string;
  send_time: string; // "08:00" | "17:00"
}

export interface Setting {
  key: string;
  value: string;
}

export interface SendHistory {
  id: number;
  recipient_id: number;
  recipient_name: string;
  recipient_email: string;
  quote_content: string;
  quote_author: string;
  sent_at: string;
  send_time: string;
  status: 'success' | 'failed';
  error_message?: string;
}

export interface SendSchedule {
  time: string; // "HH:MM" format
  label: string;
}

export interface SystemStatus {
  version: string;
  recipientCount: number;
  activeRecipientCount: number;
  totalQuotesSent: number;
  totalQuotes: number;
  sendTimes: SendSchedule[];
  smtpConfigured: boolean;
  lastSendTime: string | null;
  nextSendTime: string | null;
}
