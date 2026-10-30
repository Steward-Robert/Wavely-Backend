
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

Socket.IO authenticates the existing HTTP-only `jwt` cookie and allows the same
frontend origins as the REST API. The frontend connects directly to the backend
origin; set `VITE_SOCKET_URL` to that origin when it differs from the configured
API server. Message content and media are persisted through the authenticated
REST API; Socket.IO distributes committed messages to connected participants.
