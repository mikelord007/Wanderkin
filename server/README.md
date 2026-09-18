# server — Small Node API (owners: Foundation worker for scaffold; Livepeer worker for provider routes; Level tools worker for persistence routes)

Durable job records (`shared/job.ts`), provider adapters
(`shared/provider.ts`), asset storage/download/cache, and manifest
persistence. Keeps credentials server-side; never forwards them to the
client bundle.
