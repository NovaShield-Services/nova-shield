#!/usr/bin/env bash
# Nova Shield — create the version-control baseline.
#
# I could not run this: git is not installed on this machine (checked). Install
# it, then run this script once from the nova-shield/ directory. It creates the
# repository and a small, honest commit history rather than one giant blob.
#
#   sudo dnf install git     # or apt / brew, depending on the machine
#   cd /home/demiurge/Downloads/nova-shield
#   bash git-init.sh

set -euo pipefail

if ! command -v git >/dev/null 2>&1; then
  echo "git is not installed. Install it first, then re-run this script." >&2
  exit 1
fi

if [ -d .git ]; then
  echo "A git repository already exists here. Nothing to do." >&2
  exit 0
fi

git init
git add .gitignore
git commit -m "Add gitignore so secrets and build output stay out of history"

# 1. shared foundation
git add shared/
git commit -m "Add shared Supabase client, DOM and formatting helpers

Single client definition used by both the public site and the field tool so
the project reference and publishable key cannot drift between them."

# 2. public site
git add site/
git commit -m "Add public site: database-driven services, quote request flow, quote page

Pages read the service menu from the services table and lighting terms from
app_settings, so the website and the admin price book cannot disagree.
Submissions go through submit_quote_request() rather than writing to tables
directly, which applies validation, honeypot, rate limiting and customer
deduplication server-side.

Three presentations (Refined, Bold Editorial, Night Signal) are CSS skins over
identical markup and identical business logic."

# 3. admin / field tool
git add admin/
git commit -m "Add internal field tool: jobs, measurements, inspection, quoting

Property sections carry height and access; measurements carry condition,
surface and scope. Pricing is calculated in the database by
calculate_job_pricing() and never in the browser. Sent quotes are immutable."

# 4. documentation
git add SETUP.md ARCHITECTURE.md git-init.sh
git commit -m "Document setup, architecture review and remaining manual steps"

echo
echo "Done. History:"
git --no-pager log --oneline
echo
cat <<'NOTE'

Note on the key in shared/supabase.js:
  That is the PUBLISHABLE (anon) key and is meant to be public. Every table
  denies anon access except the service menu and two settings keys; writes go
  through validated RPCs. It is safe in the repository.

  The SERVICE ROLE key is a different thing entirely. It must never appear in
  this repository or in any frontend file. It belongs only in Supabase Edge
  Function secrets, where send-notifications reads it from the environment.
NOTE
