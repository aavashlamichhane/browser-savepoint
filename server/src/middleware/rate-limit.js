const buckets = new Map();

export const rateLimit = ({ windowMs = 60_000, max = 200 } = {}) => (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const bucket = buckets.get(ip) ?? { count: 0, resetAt: now + windowMs };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }

  bucket.count += 1;
  buckets.set(ip, bucket);

  if (bucket.count > max) {
    res.status(429).json({
      ok: false,
      code: "RATE_LIMITED",
      message: "Too many requests, please retry later."
    });
    return;
  }

  next();
};
