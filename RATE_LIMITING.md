# CSPC SpaceHub — API Security Rate Limiting

CSPC SpaceHub now includes server-side, IP-based rate limiting without adding a third-party dependency.

## Protected endpoints

- `POST /login`: 10 requests per IP per 15 minutes
- `POST /register`: 5 requests per IP per hour
- `GET /reservations/availability`: 60 requests per IP per minute
- `POST /reservations/review`: 30 requests per IP per 15 minutes
- `POST /reservations/submit`: 30 requests per IP per 15 minutes

When the limit is exceeded, the server returns HTTP `429 Too Many Requests` and includes `Retry-After` plus standard `RateLimit-*` response headers. JSON/API requests receive a JSON error response.

## Important deployment note

The limiter uses an in-memory Map, which is appropriate for a single-server local/XAMPP or classroom deployment. If the application is deployed across multiple Node.js instances, use a shared store such as Redis so all instances enforce the same limits.
