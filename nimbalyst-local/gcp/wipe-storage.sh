#!/bin/bash
# Move the live storage aside and start the API on an empty store. Run only after a disk snapshot.
set -euo pipefail
STAMP="$(date +%Y%m%d-%H%M)"
SRC=/mnt/data/objectquest
DST="/mnt/data/objectquest-before-wipe-$STAMP"
echo "--- stopping api ---"
sudo docker stop wanderkin-api
echo "--- moving $SRC -> $DST ---"
sudo mv "$SRC" "$DST"
sudo mkdir -p "$SRC"
sudo chown 1000:1000 "$SRC"
echo "--- starting api ---"
sudo docker start wanderkin-api
sleep 6
echo "--- storage now ---"
ls -la "$SRC"
echo "--- kept aside ---"
du -sh "$DST"
sudo docker logs --tail 3 wanderkin-api
