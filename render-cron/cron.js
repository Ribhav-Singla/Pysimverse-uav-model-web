import cron from "node-cron";
import { init } from "./producer.js";

// Run every 15 minutes
// cron.schedule("*/15 * * * *", () => {
//   console.log('⏰ Cron job triggered');
//   init();
// });

console.log('✅ Cron job scheduled to run every 15 minutes');

// Run immediately on startup
console.log('🚀 Running initial job...');
init();