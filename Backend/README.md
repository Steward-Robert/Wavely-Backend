
# Direct messaging

The chat feature supports 1:1 text messages and one optional attachment between
users with an accepted friendship. Friendship is read from the existing
directional `Friendship` records in either orientation; pending requests do not
grant access. Message history and attachment downloads recheck friendship and
conversation membership on every HTTP request.

## Database and deployment

The additive PostgreSQL migration
`prisma/migrations/20261030193000_add_direct_messages/migration.sql` creates
the `Conversation` and `Message` tables. Validate and generate the Prisma
client with:

```sh
npx prisma validate
npx prisma generate
```

Apply migrations as a separate deployment step, after reviewing the target
`DATABASE_URL`:

```sh
npx prisma migrate deploy
```

The backend uses the existing Supabase service-role configuration. On the first
attachment upload, it creates the private `wavely-messages` bucket if needed;
uploads fail if that bucket exists as public. Attachments are limited to one
10 MB JPEG, PNG, WebP, MP4, WebM, or PDF file per message.

The HTTP-only `jwt` cookie remains the source of authentication. The
cookie-protected `GET /api/chat/socket-token` endpoint issues a chat-only token
that expires after 60 seconds so the frontend can authenticate its direct
Socket.IO connection even when REST requests are proxied through Vercel. The
live connection remains bounded by the original session JWT expiration.
Socket connections allow the same frontend origins as the REST API. Configure
`FRONTEND_ORIGINS` with the deployed frontend origin when it is not already in
the allowlist, and set `VITE_SOCKET_URL` to the backend origin when it differs
from the configured API server. Conversation rooms are joined only after the
server confirms conversation membership and an active accepted friendship.
Message content and media are persisted through the authenticated REST API;
Socket.IO distributes committed messages to connected participants.
