# Current system behavior

Status: baseline documentation for the from-scratch ETL redesign  
Repository snapshot: `main` at `d9cf6950be96dd83528de0667b8edf627f2e48d7`  
Reviewed: 2026-09-29

## Purpose

This document describes what the repository does today. It is descriptive, not a recommendation to preserve the current architecture.

## System boundary

The repository is presently several systems in one Node.js project:

1. Source-specific web scrapers.
2. Parish record normalization and deduplication.
3. Enrichment and geocoding.
4. SQLite persistence.
5. Geographic computation and static snapshot generation.
6. An Express API, authentication, and a browser application.

The advertised end-to-end pipeline has eight ordered stages:

`scrape -> dedup -> enrich -> geocode -> import -> compute -> snapshot -> serve`

The default pipeline runs through `snapshot`; `serve` is opt-in.

## Current extraction behavior

- `scrape.js` registers 19 source adapters: 12 North American sources and 7 European sources.
- A run may target every registered source or one named source.
- Selected sources run concurrently, with a default five-minute timeout per source.
- Optional retry reruns failed sources once at the runner level.
- Shared HTTP helpers add retry/backoff behavior at the request level.
- Each adapter exports a `run()` function and typically a `scrape()` function.
- Adapters parse source-specific HTML or JSON and return parish-shaped objects.
- Several adapters try multiple discovery strategies or fallbacks.
- Individual adapters write their own per-source CSV and JSON files into `output/`.

## Current transformation behavior

The unified runner calls each adapter's `run()`, then immediately normalizes returned records in memory. The normalized schema is:

- `name`
- `jurisdiction`
- `diocese`
- `deanery`
- `city`
- `state`
- `zip`
- `country`
- `phone`
- `website`
- `lat`
- `lng`
- `address`
- `clergy`
- `source`

When multiple sources are selected, the runner merges and deduplicates all normalized records and writes `all-parishes.json` and `all-parishes.csv`.

The formal pipeline then repeats deduplication in a separate stage. Subsequent stages add bishop/diocese data, geocode missing coordinates, import into SQLite, calculate map geometry, and build frontend snapshots.

## Current load and serving behavior

- `src/import.js` reads generated JSON, normalizes and deduplicates again, and inserts into SQLite.
- A fresh import resets existing parish and computed data.
- The database also contains map, user, authentication, journal, goal, and preference tables.
- The frontend can read static JSON snapshots and fall back to live API routes.

## Inputs and outputs

Primary inputs:

- Public parish directory pages and APIs.
- Static registries in `data/`.
- Environment configuration for HTTP behavior, geocoding, and the server.

Generated or checked-in outputs currently include:

- Per-source CSV and JSON under `output/` (normally gitignored).
- Merged and deduplicated CSV and JSON.
- `data/parishes.db` plus SQLite WAL/SHM files.
- Static snapshot JSON under `public/data/snapshots/`.

## Important coupling and ambiguity

1. **Extraction and transformation are not separated.** Adapters parse, shape, and write records; the runner then normalizes those records.
2. **Per-source and merged artifacts do not have the same guarantee.** Adapters write before runner-level normalization, while merged files are produced after normalization and deduplication.
3. **Deduplication occurs more than once.** It happens in the scrape runner, the dedicated pipeline stage, and the importer.
4. **Persistence is mixed with application concerns.** The same database module owns ETL data, map products, and user-facing product tables.
5. **Failure semantics are permissive.** A multi-source run may finish and emit merged output even when one or more sources fail.
6. **No automated test suite is configured.** The package test command intentionally exits with an error.
7. **Documentation and code have drifted.** Some documents describe 12 sources while the current registry contains 19; the README also contains duplicated/misaligned project-structure prose.
8. **Generated state is committed.** Database files, WAL/SHM files, and large frontend snapshots are stored in the repository, which blurs source code and build artifacts.
9. **Claims are not verification.** Historical audit documents report broad coverage and healthy scrapers, but the repository does not contain repeatable tests that substantiate those claims today.

## Redesign constraints derived from the current system

The replacement should:

- Give each ETL stage one responsibility and an explicit input/output contract.
- Keep extraction artifacts immutable and reproducible enough to inspect.
- Prevent source adapters from writing final files directly.
- Make partial failure visible and machine-readable.
- Avoid deduplication, enrichment, geocoding, database loading, map computation, APIs, and UI concerns in Stage 1.
- Establish fixture-based tests before expanding source coverage.
- Add one source at a time after the Stage 1 contract is proven.
