import { init } from "../bullmq/producer.js";

export default async function handler(req, res) {
  // Verify the request is from Vercel Cron
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('⏰ Cron job triggered via Vercel');
    await init();
    res.status(200).json({ success: true, message: 'Job completed successfully' });
  } catch (error) {
    console.error('❌ Cron job failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
