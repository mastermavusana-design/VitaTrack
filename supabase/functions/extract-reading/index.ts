// ── extract-reading — REMOVED (2026-08-01) ──────────────────────────────────
// VitaTrack moved to on-device-only extraction (ML Kit on mobile, Tesseract on
// web). No captured image or PHI is sent to the cloud. See REMEDIATION_PLAN.md R6.
//
// This tombstone stays only so any still-deployed instance fails closed instead
// of processing PHI. Delete the deployment and this folder:
//     supabase functions delete extract-reading
//
// It is no longer invoked by any client (the mobile useCapture cloud path was
// removed in the same change).

Deno.serve(() =>
  new Response(
    JSON.stringify({ error: 'gone', message: 'extract-reading was removed; extraction is on-device only.' }),
    { status: 410, headers: { 'content-type': 'application/json' } },
  ),
)
