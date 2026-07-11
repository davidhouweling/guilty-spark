# Privacy Policy for Guilty Spark

Last Updated: 2026-07-11

This Privacy Policy explains what data Guilty Spark processes, why it is processed, how long it is kept, and what controls are available to users.

## 1. Who Operates Guilty Spark

David Houweling operates Guilty Spark, which includes a Discord bot and supporting web application for Halo-related features.

## 2. Data We Process

Guilty Spark processes only the data needed to operate bot commands, NeatQueue integrations, tracking features, and account linking.

### 2.1 Discord data

- Discord user IDs, usernames, global names, and (when available) guild nicknames.
- Guild, channel, and message IDs needed to locate and update bot-related messages.
- Command and interaction metadata, plus limited message content where required for feature reliability (for example, NeatQueue result and active queue message parsing, and bounded lookup/recovery flows).

### 2.2 Halo/Xbox linkage and gameplay metadata

- Discord-to-Xbox association data (for example: Discord ID, Xbox XUID, gamertag, and association reason).
- Match and tracker metadata needed to render stats and tracking views.

### 2.3 Web/session and identity data

- Session records and linked identity records used by the web experience and account linking flows.
- OAuth access/refresh tokens and session credential material needed to maintain authenticated sessions and linked providers.

### 2.4 Operational and security data

- Service logs and error telemetry used for reliability, debugging, and abuse prevention.

## 3. How We Use Data

Guilty Spark uses processed data to:

- Execute bot commands and interaction flows requested by users.
- Resolve queue and series context for NeatQueue and live-tracker reliability.
- Maintain account linking and session functionality.
- Detect, investigate, and fix operational issues.

## 4. Data Sharing

Guilty Spark does not sell personal data.

Data may be processed by infrastructure and service providers required to operate the service, including:

- Discord (platform/API interactions).
- Halo/Xbox platform services (for stats, linkage, and gameplay metadata retrieval).
- Cloudflare services used for compute/storage.
- Error monitoring/logging tooling used for reliability and incident response.

Data may also be disclosed when legally required.

## 5. Storage and Retention

Retention depends on data type and feature need.

- Short-lived cache/state data uses explicit TTLs (for example, minutes to hours, and in some feature caches up to 30 days).
- Queue and related transient state is generally retained for short operational windows (for example, around 24 hours for queue-state style KV entries).
- Account/linking/configuration records are retained until changed, removed, or no longer needed for the feature.
- Logs and telemetry are retained according to operational needs and provider retention settings.

## 6. User Controls and Deletion

Users can remove specific linkage data via product flows (for example, removing a Discord-to-Xbox association through bot interaction paths).

For broader deletion requests, contact via GitHub issue:

- https://github.com/davidhouweling/guilty-spark/issues/new

Deletion requests will be handled in line with technical and legal constraints (for example, active security/abuse investigation or required records).

## 7. AI/Model Training

Guilty Spark data is not used to train general-purpose AI models.

## 8. Security

Reasonable technical and organizational safeguards are used to protect processed data. No system is guaranteed to be perfectly secure.

## 9. Policy Updates

This policy may be updated over time. Updates will be reflected by revising the "Last Updated" date.

## 10. Contact

Questions or concerns can be submitted via:

- https://github.com/davidhouweling/guilty-spark/issues/new
