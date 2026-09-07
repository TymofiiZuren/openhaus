# Client accounts — development foundation

Development-only, disabled by default. Client pages are available at `/client`, `/client/login` and `/client/register`. They check backend availability before offering a form, show the authenticated account, support revocable sign-out and list account-owned saved properties. Private property notes and viewing questions are account-owned when signed in; anonymous notes stay browser-local. A signed-in buyer can permanently delete their account only after re-entering the current password and an explicit confirmation phrase. Email verification, recovery and retention enforcement must still be delivered before public launch.

## Isolation and security

Public pages share a header with direct Find homes, About, Contact, Help and Privacy links. These remain visible in a second row on smaller screens. A separate Sign in menu offers client and manager access. An additional optional prompt beside property notes appears after the session endpoint confirms availability; it opens a new tab to preserve unsaved notes. The login page is form-first; disabled installations offer a return to the map. Manager and buyer forms share the same email/password controls.

Migration `000005` introduces separate `client_users`, `client_sessions` and `client_auth_limits` tables. Migration `000006` adds the client-to-property save relationship with cascading foreign keys and a unique owner/property pair. Existing manager tables are unchanged. The buyer service reuses the tested password/session engine through a buyer-only repository; this does not grant manager permissions.

- Passwords: bcrypt, registration accepts 12–72 bytes; email is normalized.
- Sessions: random tokens, SHA-256 digests in the database, 24-hour expiry, revocable logout.
- Cookie: `openhaus_client_session`, HttpOnly, SameSite Strict, scoped to `/api/v1/client`; HTTPS deployments must use Secure cookies.
- Mutations require an exact configured Origin; credential endpoints require bounded, strict JSON.
- Credential attempts: atomic shared-database limits of 20 per email and 60 per direct peer address per 15 minutes. Limit keys are hashed, not anonymous. Forwarding headers are not trusted; deployments behind a proxy need an explicit trusted-proxy design before launch.
- Registration returns the same result for new and existing addresses and never overwrites an existing password. It does not verify email ownership. Public rollout is blocked in the API executable.
- Responses containing account/session state are `Cache-Control: no-store`. Tokens are never returned in response JSON.

## Local setup

Apply migrations `000005`, `000006`, `000008` and `000009` using the repository's migration workflow against an explicitly selected development database. Migrations `000008` and `000009` were applied to the local `openhaus` database on 2026-09-05; other installations still require migration. Rollback drops buyer data and is destructive; do not run it against populated data without a recovery plan.

Set `APP_ENV=development`, `ENABLE_CLIENT_ACCOUNTS=true` and `CLIENT_ORIGIN` to the exact browser origin, such as `http://127.0.0.1:5176` (no trailing slash). Restart the API using an available port; the frontend must proxy requests to that API. Enabling accounts outside development fails startup.

For a separate local testing instance, from the repository root:

```sh
bash scripts/start-client-api.sh
```

In another terminal, from `apps/web`:

```sh
OPENHAUS_API_PROXY_TARGET=http://127.0.0.1:8083 npm run dev -- --host 127.0.0.1 --port 5177 --strictPort
```

Open `http://127.0.0.1:5177/client/register`, choose a test email and a unique password of 12–72 bytes, then use the sign-in link after registration. The username is the email address. There are no shared/default client credentials. The launcher reads the local `.env`, verifies client tables exist, binds the API to loopback and never stops existing processes. It does not migrate or seed accounts automatically. For other unused ports, set `CLIENT_API_PORT` and `CLIENT_ORIGIN` consistently with the Vite port/proxy.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/client/accounts` | Register development account; JSON email/password; generic 202 |
| POST | `/api/v1/client/session` | Sign in; response contains client ID/email and sets cookie |
| GET | `/api/v1/client/session` | Read the authenticated buyer profile; 401 otherwise |
| DELETE | `/api/v1/client/session` | Revoke current session and clear cookie |
| PUT | `/api/v1/client/password` | Verify the current password, replace it and revoke every buyer session |
| GET | `/api/v1/client/saved-properties` | List the authenticated buyer's published saved homes |
| PUT | `/api/v1/client/saved-properties/{propertyID}` | Idempotently save a published home |
| DELETE | `/api/v1/client/saved-properties/{propertyID}` | Remove the authenticated buyer's saved relationship |

## Validation and remaining work

Unit tests cover hashing, normalization, password changes, session revocation, input checks, rate limiting, origin guards and cookie namespace separation. Password replacement verifies the current credential and changes the password plus session state in one database statement, so every browser must authenticate again. PostgreSQL integration tests run only with `TEST_DATABASE_URL`; they apply the migration inside an isolated schema and roll back all data afterwards.

Frontend interaction tests cover disabled accounts, connection retry, cookie-backed sign-in/sign-out, registration feedback, rejected credentials, saved-property rendering, direct saving from a property page and importing the browser comparison. Ownership integration tests verify that a second buyer cannot list or remove another buyer's saved relationship. On 2026-09-04 the live PostgreSQL-to-browser flow passed registration, rejected-password handling, login, reload persistence, HttpOnly/SameSite/path cookie checks, manager isolation, foreign-origin rejection and session revocation after logout. One generated browser-test client record was created; its credentials were never logged or offered as shared defaults. Database-store integration checks passed in a rolled-back test schema.

Account-owned saved searches now persist the catalogue criteria and alert cadence under the authenticated buyer, with a 50-search cap. No email or notification is sent. Authenticated buyers can download a no-cache JSON export containing their identity, saved-property identifiers, saved searches and property notes; authentication secrets and session material are excluded. Account deletion requires the authenticated buyer's current password, is rate-limited, deletes the buyer identity at the database boundary and relies on cascading foreign keys to remove sessions, saved properties, saved searches and private notes. Next: viewing history, alert delivery, email verification and recovery, expiry cleanup jobs, and operational privacy review. Retention cleanup for expired sessions and rate-limit rows is not implemented in this foundation; do not enable public traffic.
