import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import { initDatabase } from './db';
import { loadCustomQuotes } from './quotes';
import { initScheduler } from './scheduler';
import routes from './routes';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use(routes);

// Serve frontend for all non-API routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Initialize
function initialize(): void {
  console.log('========================================');
  console.log('  每日心语平台 Daily Motivation Platform');
  console.log('========================================');

  // Database
  initDatabase(process.env.DB_PATH);

  // Load custom quotes
  loadCustomQuotes();

  // Init scheduler
  initScheduler();

  // Start server
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Running at http://localhost:${PORT}`);
    console.log(`[Server] Admin UI: http://localhost:${PORT}`);
    console.log(`[Server] Send times: ${require('./scheduler').getScheduleInfo().times.join(', ')}`);
    console.log('========================================');
  });
}

initialize();
