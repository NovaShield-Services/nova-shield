# Nova Shield planning handoff after Batch 7

Canonical planning documents on `codex/roadmap-after-batch-7`:

- [Revised batch plan](batch-plan-after-7.md): X.1 Claude, X.2 Codex, scopes,
  ownership, acceptance criteria and integration boundaries.
- [Service operating blueprint](service-operations-blueprint.md): confirmed
  one/two-crew requirements, suppliers, units, seasonal reuse and equipment loads.
- [Claude handoff prompt](claude-roadmap-handoff.md): planning and 8.1 scope preparation.

This is a documentation-only handoff commit. Neither a merge nor a checkout of
this branch is needed to read it. From an authenticated repository clone:

```sh
git fetch origin codex/roadmap-after-batch-7
git show FETCH_HEAD:docs/plans/batch-plan-after-7.md
git show FETCH_HEAD:docs/plans/service-operations-blueprint.md
git show FETCH_HEAD:docs/plans/claude-roadmap-handoff.md
```

Keep the current agent's working branch. These documents replace the earlier
container-local `/workspace/.nova-shield/plans/` links as the shared handoff.
They do not authorize implementation of every future batch, live database
changes, integration or deployment.
