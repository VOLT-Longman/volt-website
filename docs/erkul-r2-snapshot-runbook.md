# Erkul R2 Snapshot Runbook

This runbook preserves the Erkul raw inputs needed to independently reproduce ShipDB data. Raw JSON is never committed. Git stores only `data/external/erkul/r2-snapshot-manifest.json`, which contains R2 object keys and checksums.

## Safety invariants

- `erkul/` contains final snapshots only and is protected by an R2 Bucket Lock rule.
- `staging/` is for rehearsal only and must not be covered by the Bucket Lock rule.
- A final upload requires a staged upload and a successful local reproducibility receipt.
- The writer credential exists only on the operator workstation. GitHub Actions receives an R2 read-only credential.
- Every R2 upload sets `If-None-Match: *`; an existing object key is never overwritten.

An R2 Bucket Lock prevents deletion and overwriting while its rule remains active. A Cloudflare account administrator can remove the rule, so Cloudflare account change permission remains part of the security boundary.

## One-time operator setup

1. Create the private R2 bucket `volt-erkul-snapshots`. Do not enable public access or a custom domain.
2. Add an R2 Bucket Lock rule for prefix `erkul/` with indefinite retention. Do not lock `staging/`.
3. Create two bucket-scoped R2 API tokens:
   - `erkul-snapshot-writer`: Object Read & Write, operator workstation only.
   - `erkul-snapshot-ci`: Object Read only, GitHub Actions only.
4. Add these GitHub Actions Secrets:
   - `R2_ACCOUNT_ID`
   - `R2_SNAPSHOT_BUCKET`
   - `R2_SNAPSHOT_CI_ACCESS_KEY_ID`
   - `R2_SNAPSHOT_CI_SECRET_ACCESS_KEY`
5. Set the GitHub Actions Variable `ERKUL_SNAPSHOT_VERIFY_ENABLED` to `true`.

The operator workstation additionally needs `R2_SNAPSHOT_WRITER_ACCESS_KEY_ID` and `R2_SNAPSHOT_WRITER_SECRET_ACCESS_KEY`. Never add either writer value to GitHub Secrets or the repository.

## Safe Apply sequence

```powershell
# 1. Confirm the CMS Preview hash, then apply it.
npm run shipdb:erkul:apply -- --confirm-preview-hash <previewHash>
npm run shipdb:erkul:post-apply
npm run check
npm run test:functions

# 2. Upload to unlocked staging and verify the upload round trip.
npm run shipdb:erkul:snapshot:stage

# 3. Download staging and reproduce the live layers locally.
npm run shipdb:erkul:snapshot:verify -- --stage

# 4. Publish to locked erkul/ only after step 3 records its receipt.
npm run shipdb:erkul:snapshot:publish
```

`snapshot:publish` checks the local staging receipt, staged source checksums, and final object create-only conditions. It refuses to upload a final snapshot if any check fails.

Commit the generated `data/external/erkul/r2-snapshot-manifest.json` with the Safe Apply data changes. Do not commit raw JSON or `r2-snapshot-stage-manifest.json`.

## Independent CI verification

The `Erkul Snapshot Verify` workflow downloads the final `erkul/` snapshot with the read-only token. It regenerates the normalized and matched layers, runs `shipdb:erkul:verify`, and compares the tracked derived-output SHA-256 values with the final snapshot manifest.

After the first configuration, manually run `Erkul Snapshot Verify` once. For each subsequent Safe Apply data commit, confirm that the workflow passes. Physical legacy deletion (3.5-B) remains prohibited until this independent verification is green.
