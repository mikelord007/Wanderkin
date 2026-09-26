import type { AudioAssetReference, LevelMedia } from "@shared/index.js";

const AUTHORED_AT = "2026-09-24T00:00:00.000Z";

function audio(
  id: string,
  kind: AudioAssetReference["kind"],
  filename: string,
  sha256: string,
  sizeBytes: number,
  durationSeconds: number,
  loop: boolean,
  provenance?: AudioAssetReference["provenance"],
): AudioAssetReference {
  const capability = kind === "music" ? "music" : "mirelo-sfx";
  return {
    schemaVersion: 1,
    mediaType: "audio",
    kind,
    id,
    url: `/audio/${filename}`,
    sha256,
    sizeBytes,
    mimeType: "audio/wav",
    durationSeconds,
    loop,
    defaultGain: kind === "music" ? .48 : kind === "ambience" ? .28 : .75,
    provenance: provenance ?? {
      providerId: "objectquest-bundled-cc0",
      requestedCapability: capability,
      servedCapability: capability,
      servedModel: "procedural-audio-v1",
      applicationJobId: `bundled-${id}`,
      providerJobId: null,
      timings: { requestedAt: AUTHORED_AT, completedAt: AUTHORED_AT, totalMilliseconds: 0 },
      reportedCost: null,
    },
  };
}

/**
 * The collect sound is this project's own generated Mirelo SFX from the
 * 2026-09-24 live run (asset e8d567b4-7468-426f-9bff-f70e9860a522, source
 * sha256 b79dd5c6f413025b5fe4086b2a57bb20df64ae74ad709171f6a530e430fe5092),
 * trimmed and resampled to 32 kHz by scripts/derive-collect-sfx.mjs. It is
 * not CC0; the other files are.
 */
const GENERATED_COLLECT_PROVENANCE: AudioAssetReference["provenance"] = {
  providerId: "livepeer-agent-mcp",
  requestedCapability: "mirelo-sfx",
  servedCapability: "mirelo-sfx",
  servedModel: "Mirelo-AI/sfx1.6/text-to-audio",
  applicationJobId: "job_1474ebee-fa65-4d4b-b411-0f8babbabb87",
  providerJobId: "mjob_9b4d5aa5632c",
  timings: {
    requestedAt: "2026-09-24T14:22:09.886Z",
    startedAt: "2026-09-24T14:22:12.207Z",
    completedAt: "2026-09-24T14:22:19.203Z",
    queueMilliseconds: 2321,
    executionMilliseconds: 6996,
    totalMilliseconds: 9317,
  },
  reportedCost: null,
};

/** Canonical order: music, ambience, seven EFFECT_CUES. */
export const LOST_COLORS_BUNDLED_MEDIA: LevelMedia = {
  audio: [
    audio("bundled-music", "music", "lost-colors-loop.wav", "6261b557a54fe707bdbbc2e23adfba4d5b93e37307a912e1972c48ebc1c2da33", 176444, 4, true),
    audio("bundled-ambience", "ambience", "gentle-breeze.wav", "e22bc997a51ae2b3a8c2cbe987732f0986034718d682ba80ff5609b96930b138", 64044, 4, true),
    audio("bundled-fragment-pickup", "sfx", "fragment-pickup.wav", "025ca35812fee34cf2acbfbb8a6922d55d9e38cb0e758d19dae794930f863316", 182162, 2.846, false, GENERATED_COLLECT_PROVENANCE),
    audio("bundled-portal-activate", "sfx", "portal-activate.wav", "6a77a2b91078fe0e49e7fff42b90cefcde780f42af8fcf944368aa28b82f66e1", 19244, 1.2, false),
    audio("bundled-checkpoint", "sfx", "checkpoint.wav", "c25345079589413f5f3401d896931e0a97d9329fc434c9a29b39692c59ad2269", 5644, .35, false),
    audio("bundled-fall-respawn", "sfx", "fall-respawn.wav", "2802f69093a3ee42f68afa3bf47a6c6e55bba7e3a394ea6ca0761b43219e157c", 12044, .75, false),
    audio("bundled-race-start", "sfx", "race-start.wav", "3d0424d989e977a62ac803e61d23483a683bce4bb10c80371d7b93586fdd1ce2", 18444, 1.15, false),
    audio("bundled-race-finish", "sfx", "race-finish.wav", "d2b3238d2b0df6c835c2cc4394969494b37b4402eaf257ebabe7a00a7cda97bd", 24044, 1.5, false),
    audio("bundled-completion", "sfx", "completion.wav", "45c2000f5a37ff949d9d780f9a5856c6092a0703b2f8b892ba818961b60841c4", 28844, 1.8, false),
  ],
  video: [],
};
