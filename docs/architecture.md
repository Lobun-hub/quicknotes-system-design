# QuickNotes service architecture

## Requirements

### Functional

- Register and authenticate users; every note and tag is isolated by owner.
- Create, read, update, and delete notes, and organize notes with tags.
- List notes with bounded pagination and return predictable validation and
  authorization errors.
- Keep saved notes durable and expose updated data promptly after a write.

### Non-functional

- Scale horizontally for one million registered users and bursty traffic.
- Target 99.9% monthly availability, p95 reads under 300 ms, and p95 writes
  under 500 ms under the estimated load.
- Encrypt traffic in transit and data at rest; protect credentials and secrets;
  enforce authorization, rate limits, and audit-worthy access controls.
- Back up the database, monitor service health, and recover from an app,
  availability-zone, or database-node failure without a single machine taking
  down the service.

## Load and storage estimate

Planning assumptions: one million registered users, 20% daily active users
(200,000), 20 note reads and 2 note writes per active user per day. One note
averages 1.5 KB including content, row metadata, and indexes. The estimate is
an initial capacity target; production metrics should replace these
assumptions.

| Measure | Calculation | Estimate |
| --- | --- | --- |
| Reads per day | 200,000 active users × 20 | 4,000,000 |
| Average reads per second | 4,000,000 ÷ 86,400 | ~46 reads/s |
| Peak read design rate | Average × 5 burst factor | ~230 reads/s |
| Writes per day | 200,000 active users × 2 | 400,000 |
| Average writes per second | 400,000 ÷ 86,400 | ~4.6 writes/s |
| Peak write design rate | Average × 5 burst factor | ~23 writes/s |
| New notes per year | 400,000 × 365 | 146,000,000 |
| Primary storage growth per year | 146,000,000 × 1.5 KB × 1.2 operational headroom | ~263 GB/year |

The 20% storage headroom covers database overhead and growth variance; it does
not count the replica, backups, logs, or object storage. Replication and backup
capacity must be provisioned separately.

## High-level architecture

```text
                       +----------------------+
                       | Managed DNS / health |
                       +----------+-----------+
                                  |
                                  v
+--------+     +-----------------+----------------+
| Client | --> | CDN / edge cache and TLS         |
+--------+     +-----------------+----------------+
                                  |
                                  v
                       +----------+-----------+
                       | Redundant load       |
                       | balancer              |
                       +-----+------------+---+
                             |            |
                    +--------v---+    +---v--------+
                    | App server |    | App server |
                    | AZ A       |    | AZ B       |
                    +---+-----+--+    +--+-----+---+
                        |     |          |     |
                        |     +----+-----+     |
                        |          |           |
                   +----v----+     |      +----v----------+
                   | Clustered|     |      | Durable      |
                   | cache    |     |      | queue        |
                   +----+-----+     |      +------+-------+
                        |           |             |
                        |           v             v
                        |    +------+-------+  +--+--------+
                        +--->| Primary DB   |  | Workers   |
                             | (multi-AZ HA)|  | (2+ AZs)  |
                             +------+-------+  +-----------+
                                    |
                                    | asynchronous replication
                                    v
                             +------+-------+
                             | Read replica |
                             | (separate AZ)|
                             +--------------+
```

## Component responsibilities

- **Client:** provides the browser and mobile experience and sends authenticated
  API requests without owning authoritative note data.
- **Managed DNS:** routes clients to healthy regional endpoints and supports
  controlled failover between regions.
- **CDN / edge:** serves static assets close to users, terminates or forwards
  TLS securely, and reduces origin traffic for cacheable content.
- **Load balancer:** health-checks app instances and spreads API traffic across
  availability zones instead of relying on one server.
- **App servers:** validate input, enforce identity and ownership rules, and
  execute stateless API handlers that can scale horizontally.
- **Clustered cache:** serves frequently requested, safe-to-cache note-list
  results quickly and reduces repeated database reads.
- **Primary database:** commits authoritative note changes transactionally and
  provides durable storage with automated multi-zone failover.
- **Read replica:** serves eligible read-only queries and adds read capacity
  while asynchronous replication keeps it close to the primary.
- **Durable queue:** buffers retryable background work so API latency is not
  coupled to slower downstream processing.
- **Workers:** consume queued jobs such as notifications or derived search
  indexing, with retries and idempotency to handle transient failures.

## Request flows

### `GET /v1/notes`

1. The client resolves the service name through managed DNS and sends an
   authenticated HTTPS request through the CDN to the load balancer.
2. The load balancer forwards the request to a healthy app server in either
   availability zone.
3. The app server validates the token and pagination parameters, then scopes
   the query to the authenticated user's ID.
4. The app checks the clustered cache using a user- and query-specific key. On
   a cache hit, it returns the bounded result; on a miss, it reads from the
   replica when its freshness is acceptable, otherwise from the primary.
5. The app stores a short-lived result in cache and returns the notes and
   pagination cursor. Cache failure falls back to the database.

### `POST /v1/notes`

1. DNS, CDN, and the load balancer route the HTTPS request to a healthy app
   server, as for a read.
2. The app validates the access token and JSON body, trims and checks the
   required title, and derives `user_id` from the authenticated identity.
3. The app inserts the note in a primary-database transaction and returns
   `201 Created` only after the database commit succeeds.
4. The app invalidates the affected user's note-list cache keys so subsequent
   reads do not keep showing stale data.
5. The app publishes optional downstream work to the durable queue; workers
   process it asynchronously and retry transient failures without delaying the
   note-creation response.

## Trade-offs and failure handling

- **Cache speed vs. freshness:** cached lists reduce database load but can be
  briefly stale; writes invalidate affected keys, entries have short TTLs, and
  a cache outage degrades to database reads rather than making notes
  unavailable.
- **Read replica capacity vs. consistency:** replication is asynchronous, so a
  replica may lag; send read-after-write requests to the primary (or use a
  consistency token) and only route other reads to the replica within an
  acceptable lag threshold.
- **Queue decoupling vs. eventual completion:** queued work may be delayed or
  retried; use a replicated durable queue, idempotent consumers, bounded
  retries, and a dead-letter queue with monitoring.
- **Horizontal app scaling vs. operational complexity:** multiple stateless
  instances improve throughput and fault tolerance but require shared
  observability, versioned deployments, and backward-compatible changes.

No single application instance is a point of failure: the load balancer
health-checks multiple app servers across zones, with redundant DNS/CDN and a
clustered cache. The database uses multi-zone automated failover and a
separately placed replica with tested promotion and backups; the queue and
workers also run redundantly. Regional disaster recovery remains a separate
recovery objective and should be validated with failover exercises.
