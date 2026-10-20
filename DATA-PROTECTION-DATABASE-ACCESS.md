# CSPC SpaceHub — Data Protection & Database Access

## Data protection controls

- Passwords are stored as bcrypt hashes (cost 12), never plaintext.
- Password hashes are removed before a user object is placed in the session.
- Login rotates the session ID after successful authentication to reduce session-fixation risk.
- Session cookies are `HttpOnly`, `SameSite=Lax`, and become `Secure` in production.
- Production requires a `SESSION_SECRET` of at least 32 characters.
- Logout destroys the server-side session and clears the session cookie.
- Production error pages do not expose raw database/server error messages.
- Request bodies are capped at 100 KB to reduce oversized-request abuse.
- Database queries use `mysql2` parameter placeholders (`?`) for user-supplied values.
- Public registration is restricted to student/faculty roles; admin creation is separate.
- Role checks are enforced server-side through authentication middleware.
- Calendar privacy is enforced by route-level query selection: regular users receive facility/time/status information without other users' identity/details.

## Database access controls

The Node.js application should use a dedicated database account rather than MySQL `root`.
Run `database/least-privilege.sql` as a database administrator and then set:

```env
DB_USER=spacehub_app
DB_PASSWORD=<the dedicated password>
DB_NAME=cspc_spacehub
AUTO_MIGRATE=false
```

The application account receives only:

- `SELECT`
- `INSERT`
- `UPDATE`
- `DELETE`

It does **not** receive schema-management privileges. Database migrations should be executed separately by an authorized administrator.

## Database connection hardening

- `multipleStatements` is disabled.
- Connection count is bounded by `DB_POOL_LIMIT`.
- `utf8mb4` is used consistently.
- TLS can be enabled with `DB_SSL=true` for a remote database.
- Production rejects the use of `root` as `DB_USER`.

## Local XAMPP note

For the current local development environment, using `root` may still work. The security improvement is to create the dedicated `spacehub_app` account before deployment or when the project is used beyond a local development machine.
