// Simple in-memory rate limiter for CSPC SpaceHub.
// Suitable for a single-server school/demo deployment. For multiple servers,
// replace the Map store with a shared store such as Redis.

function createRateLimiter({ windowMs, max, message, json = false }) {
  const hits = new Map();

  // Periodically remove expired entries so the Map does not grow forever.
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, Math.min(windowMs, 60_000));
  cleanup.unref?.();

  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    let entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;
    const remaining = Math.max(0, max - entry.count);
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      res.setHeader("Retry-After", String(retryAfter));

      if (json || req.path.startsWith("/api/") || req.path === "/reservations/availability") {
        return res.status(429).json({
          error: message || "Too many requests. Please try again later.",
          retry_after_seconds: retryAfter
        });
      }

      req.flash("error", message || "Too many requests. Please try again later.");
      return res.redirect(req.get("Referrer") || "/login");
    }

    next();
  };
}

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many login attempts. Please wait 15 minutes before trying again."
});

const registrationLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "Too many registration attempts. Please wait before creating another account."
});

const apiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many API requests. Please slow down and try again in a moment.",
  json: true
});

const reservationWriteLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many reservation requests. Please wait a few minutes and try again."
});

module.exports = {
  createRateLimiter,
  loginLimiter,
  registrationLimiter,
  apiLimiter,
  reservationWriteLimiter
};
