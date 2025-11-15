import cron from "node-cron";
import { init } from "../bullmq/producer";


cron.schedule("0 4 * * *", () => {
  init();
});
