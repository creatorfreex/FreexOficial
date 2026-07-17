// api/health.js — тот же health-check, что у локального server.js, для Vercel.
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ ok: true, hasServerKey: !!process.env.DEEPSEEK_API_KEY });
}
