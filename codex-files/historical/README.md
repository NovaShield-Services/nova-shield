# Historical artifacts

These original files are preserved for recovery, not treated as current status.

- `measurement-reliability-handoff.md` and `.patch` were written before the
  first implementation commit. Their statements that changes are uncommitted
  or unpushed describe that earlier moment. The implemented work is now
  f4cdbe5; use the committed patch in `../patches/` and the main handoff index.
- `location-first-batch-roadmap.md` is superseded by `../plans/batch-plan-after-7.md`.
- `environment/` contains the exact original local loader/shim, debug probe,
  Caddy installation script and generated local Caddy config. They contain
  environment-specific paths. They are not the current application/server
  configuration or a portable complete setup workflow.

Portable browser path adapters are in `../tooling/`. Dependencies and server
processes are not included in this archive. The scratch debug probe is unrun
as a standalone current suite and is not registered in the regression runner.
