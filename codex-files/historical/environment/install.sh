#!/usr/bin/env bash
set -euo pipefail
mkdir -p /workspace/.local/bin /workspace/.nova-shield
tmp_dir=$(mktemp -d /tmp/nova-caddy.XXXXXX)
trap 'rm -rf "$tmp_dir"' EXIT
curl -fsSL https://github.com/caddyserver/caddy/releases/download/v2.10.2/caddy_2.10.2_linux_amd64.tar.gz -o "$tmp_dir/caddy_2.10.2_linux_amd64.tar.gz"
curl -fsSL https://github.com/caddyserver/caddy/releases/download/v2.10.2/caddy_2.10.2_checksums.txt -o "$tmp_dir/checksums.txt"
cd "$tmp_dir"
awk '$2 == "caddy_2.10.2_linux_amd64.tar.gz" {print}' checksums.txt | sha512sum -c -
tar -xzf caddy_2.10.2_linux_amd64.tar.gz caddy
install -m 755 caddy /workspace/.local/bin/caddy
python3 - <<'PY'
from pathlib import Path
root=Path('/workspace/nova-shield')
config=(root/'deploy/Caddyfile').read_text().replace('/srv',str(root)).replace(':8080 {','http://127.0.0.1:8080 {\n\tbind 127.0.0.1')
Path('/workspace/.nova-shield/Caddyfile').write_text(config)
PY
export XDG_CONFIG_HOME=/workspace/.nova-shield/config XDG_DATA_HOME=/workspace/.nova-shield/data
/workspace/.local/bin/caddy validate --config /workspace/.nova-shield/Caddyfile --adapter caddyfile
