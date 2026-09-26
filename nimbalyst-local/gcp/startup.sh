#!/bin/bash
# Wanderkin API host bootstrap (Debian 12 on Compute Engine).
# Idempotent: safe to re-run on every boot. Reads its settings from instance metadata:
#   image, api-host, supabase-url, legacy-owner-email
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

MD=http://metadata.google.internal/computeMetadata/v1/instance
get() { curl -fs -H 'Metadata-Flavor: Google' "$MD/attributes/$1"; }
IMAGE="$(get image)"
HOST="$(get api-host)"
SUPABASE_URL="$(get supabase-url)"
OWNER_EMAIL="$(get legacy-owner-email)"

# --- Docker -------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io
fi
systemctl enable --now docker

# --- Durable data disk (STORAGE_DIR lives here) -------------------------
DEV=/dev/disk/by-id/google-wanderkin-data
if ! blkid "$DEV" >/dev/null 2>&1; then
  mkfs.ext4 -F -m 0 "$DEV"
fi
mkdir -p /mnt/data
grep -q ' /mnt/data ' /etc/fstab || echo "$DEV /mnt/data ext4 defaults,nofail 0 2" >> /etc/fstab
mountpoint -q /mnt/data || mount /mnt/data
mkdir -p /mnt/data/objectquest /mnt/data/caddy/data /mnt/data/caddy/config
# The image runs as the "node" user (uid 1000).
chown -R 1000:1000 /mnt/data/objectquest

# --- Pull the image with the VM's own service account -------------------
TOKEN="$(curl -fs -H 'Metadata-Flavor: Google' "$MD/service-accounts/default/token" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')"
echo "$TOKEN" | docker login -u oauth2accesstoken --password-stdin https://asia-south1-docker.pkg.dev
docker pull "$IMAGE"

# --- Containers ----------------------------------------------------------
docker network inspect wanderkin >/dev/null 2>&1 || docker network create wanderkin
docker rm -f wanderkin-api wanderkin-caddy >/dev/null 2>&1 || true

docker run -d --name wanderkin-api --restart unless-stopped --network wanderkin \
  -v /mnt/data/objectquest:/data/objectquest \
  -e NODE_ENV=production \
  -e PORT=8787 \
  -e STORAGE_DIR=/data/objectquest \
  -e SUPABASE_URL="$SUPABASE_URL" \
  -e WANDERKIN_AUTH_MODE=supabase \
  -e WANDERKIN_LEGACY_OWNER_EMAIL="$OWNER_EMAIL" \
  -e OBJECTQUEST_SECURE_COOKIE=true \
  -e OBJECTQUEST_LEGACY_OPEN=false \
  -e TRUST_PROXY_HOPS=2 \
  --log-opt max-size=20m --log-opt max-file=5 \
  "$IMAGE"

cat > /mnt/data/caddy/Caddyfile <<EOF
$HOST {
	encode zstd gzip
	reverse_proxy wanderkin-api:8787
	header {
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
		-Server
	}
}
EOF

docker run -d --name wanderkin-caddy --restart unless-stopped --network wanderkin \
  -p 80:80 -p 443:443 \
  -v /mnt/data/caddy/Caddyfile:/etc/caddy/Caddyfile:ro \
  -v /mnt/data/caddy/data:/data \
  -v /mnt/data/caddy/config:/config \
  --log-opt max-size=20m --log-opt max-file=5 \
  caddy:2

echo "wanderkin startup complete: $IMAGE behind https://$HOST"
