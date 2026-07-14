/**
 * Seed script: Initialize recipients from the provided list.
 * Run: npm run seed
 */
import dotenv from 'dotenv';
dotenv.config();

import { initDatabase, createRecipient, getAllRecipients } from './db';

const recipients = [
  { name: 'Harry Shen', email: 'hashen@nvisionglobal.com' },
  { name: 'James Hong', email: 'jhong@nvisionglobal.com' },
  { name: 'Jesse Zhang', email: 'jesse.zhang@nvisionglobal.com' },
  { name: 'Cathy Xue', email: 'cxue@nvisionglobal.com' },
  { name: 'Sandra Zheng', email: 'szheng@nvisionglobal.com' },
  { name: 'Lucia Liu', email: 'lliu@nvisionglobal.com' },
  { name: 'Candy Tang', email: 'ctang@nvisionglobal.com' },
  { name: 'Daisy Lu', email: 'dlu@nvisionglobal.com' },
  { name: 'Annice Xu', email: 'axu@nvisionglobal.com' },
  { name: 'Ada Hu', email: 'ahu@nvisionglobal.com' },
  { name: 'Daphne Chen', email: 'daphne.chen@nvisionglobal.com' },
  { name: 'Bella Li', email: 'Bella.li@nvisionglobal.com' },
  { name: 'Carmen Zhang', email: 'carmen.zhang@nvisionglobal.com' },
  { name: 'Mia Chen', email: 'mia.chen@nvisionglobal.com' },
];

function seed(): void {
  initDatabase(process.env.DB_PATH);

  const existing = getAllRecipients();
  if (existing.length > 0) {
    console.log(`[Seed] Database already has ${existing.length} recipients. Skipping.`);
    console.log('[Seed] To re-seed, delete the database file first.');
    return;
  }

  let created = 0;
  for (const r of recipients) {
    try {
      createRecipient(r.name, r.email);
      console.log(`[Seed] Created: ${r.name} <${r.email}>`);
      created++;
    } catch (err: any) {
      console.error(`[Seed] Failed for ${r.email}: ${err.message}`);
    }
  }

  console.log(`[Seed] Done: ${created}/${recipients.length} recipients created`);
}

seed();
