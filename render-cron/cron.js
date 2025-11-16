import cron from "node-cron";
import { init } from "./producer.js";

// Run every 1 hour
cron.schedule("0 * * * *", () => {
  console.log('⏰ Cron job triggered');
  init();
});

console.log('✅ Cron job scheduled to run every 1 hour');

// Run immediately on startup
console.log('🚀 Running initial job...');
init();