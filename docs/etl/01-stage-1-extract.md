# Stage 1: minimal extraction

Status: proposed scope for the first implementation iteration  
Depends on: [Current system behavior](./00-current-system.md)

## Goal

Prove a small, testable extraction boundary by collecting observations from one source and writing an auditable raw artifact plus a run manifest.

The recommended first source is the Orthodox Church in America (OCA) directory because the repository already contains a dedicated adapter with directory and detail-page discovery.

Stage 1 is successful when later stages can consume its output without importing scraper code or knowing how OCA pages are structured.

## In scope

- A single command that runs one explicitly selected source.
- One source adapter: `oca`.
- Discovery and retrieval of OCA parish listing/detail pages needed to produce observations.
- A stable observation envelope.
- A newline-delimited JSON artifact containing one observation per line.
- A JSON manifest describing the run and its outcome.
- Clear non-zero exit behavior for invalid configuration or a failed run.
- Fixture-based automated tests that do not require live network access.
- Minimal operator documentation for running the extractor and locating artifacts.

## Observation contract

Each line in the observations artifact is one JSON object:

```json
{
  "source": "oca",
  "source_record_id": "source-defined stable identifier or null",
  "source_url": "https://www.oca.org/...",
  "fetched_at": "RFC 3339 UTC timestamp",
  "payload": {
    "field_name": "value exactly as observed"
  }
}
```

Rules:

- `source`, `source_url`, `fetched_at`, and `payload` are required.
- `source_record_id` is nullable when the source exposes no stable identifier.
- `payload` preserves source values as observed, including missing or oddly formatted values.
- Stage 1 may trim transport-only whitespace needed to parse a page, but it must not standardize names, jurisdictions, addresses, phones, countries, coordinates, or clergy.
- Stage 1 must not merge observations.
- Each observation must retain enough provenance to locate the source page.

## Run artifact layout

The exact run identifier is implementation detail, but one run must be isolated in one directory:

```text
artifacts/
  <run-id>/
    manifest.json
    sources/
      oca/
        observations.jsonl
```

The manifest must include:

- `run_id`
- `started_at`
- `finished_at`
- `status`: `succeeded` or `failed`
- requested source list
- per-source observation count
- per-source error summary, if any
- relative path and byte size of each produced artifact
- extractor version, represented initially by the Git commit SHA when available

A failed run may retain diagnostic artifacts, but it must not claim success.

## Acceptance criteria

1. From a clean checkout with documented prerequisites installed, the Stage 1 command can run `oca` without invoking later pipeline stages.
2. Given committed OCA fixtures, the command produces a valid `observations.jsonl` and `manifest.json` without network access.
3. Every non-empty line in `observations.jsonl` parses as JSON and satisfies the observation contract.
4. Every observation has `source === "oca"`, a valid absolute `source_url`, an RFC 3339 UTC `fetched_at`, and an object-valued `payload`.
5. Source strings in fixture output remain unnormalized; tests demonstrate at least one value that a later transform stage would change.
6. Replaying the same fixtures produces equivalent observations after ignoring run-specific timestamps and identifiers.
7. The manifest count equals the number of JSONL observations.
8. An unknown source is rejected before network access, prints the allowed source keys, and exits non-zero.
9. A required-page fetch or parse failure produces a failed manifest with a concise source-scoped error and exits non-zero.
10. The implementation does not import or invoke sanitization, deduplication, enrichment, geocoding, SQLite, map computation, snapshot, server, authentication, or UI modules.
11. The automated Stage 1 tests pass through the repository's standard test command.
12. The Stage 1 documentation states its command, output paths, contract, and failure behavior.

## Explicitly out of scope

- Any source other than OCA.
- Canonical parish schema design.
- Data cleaning or validation beyond the extraction envelope.
- Cross-source merging or deduplication.
- Diocese, patriarchate, or bishop enrichment.
- Geocoding.
- CSV output.
- SQLite or any other database.
- Map polygons, clusters, or frontend snapshots.
- API, server, authentication, profiles, or UI.
- Scheduling, queues, distributed execution, dashboards, alerts, proxies, or headless browsers.
- Performance optimization beyond avoiding clearly unbounded behavior.

## Decisions to confirm before implementation

Recommended defaults are shown first:

1. Use OCA as the pilot source.
2. Use JSONL observations plus a JSON manifest.
3. Treat any required OCA page failure as a failed Stage 1 run; do not publish a successful partial artifact.
4. Keep live-network execution available for operators, but make fixture execution the acceptance-test path.

Changing one of these decisions should update this document before code is written.

## Next iteration after approval

Implement only the Stage 1 command, OCA adapter boundary, artifact writer, fixtures, and acceptance tests described above. Do not begin Stage 2 design or implementation in that change.
