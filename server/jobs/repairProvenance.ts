import { env } from "../env.js";
import { LivepeerAdapter } from "../livepeer/adapter.js";
import { mcpClient } from "../livepeer/mcpClient.js";
import { AssetStore } from "../persistence/assetStore.js";
import { PhotoStore } from "../persistence/photoStore.js";
import { JobManager } from "./manager.js";
import { JobStore, JobStoreUploadUrlCache } from "./store.js";

const jobId = process.argv[2];
if (!jobId || process.argv.length !== 3) {
  throw new Error("Usage: tsx server/jobs/repairProvenance.ts <job-id>");
}

const jobStore = new JobStore(env.storageDir);
const assetStore = new AssetStore(env.storageDir);
const photoStore = new PhotoStore(env.storageDir);
const adapter = new LivepeerAdapter(mcpClient, photoStore, new JobStoreUploadUrlCache(jobStore));
const manager = new JobManager(jobStore, adapter, assetStore, photoStore);
const repaired = await manager.repairReadyAssetProvenance(jobId);

if (!repaired?.provenance) {
  throw new Error(`Ready generated asset for job "${jobId}" was not found`);
}

// Deliberately print only stable identifiers and the repaired field. Raw
// provider responses remain in server-only job storage.
console.log(
  JSON.stringify({
    assetId: repaired.id,
    providerJobId: repaired.provenance.providerJobId,
    registeredModel: repaired.provenance.registeredModel,
  }),
);
