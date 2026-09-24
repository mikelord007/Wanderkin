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
  transcript?: string,
): AudioAssetReference {
  const capability = kind === "music" ? "music" : kind === "narration" ? "chatterbox-tts" : "mirelo-sfx";
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
    defaultGain: kind === "music" ? .48 : kind === "ambience" ? .28 : kind === "narration" ? .72 : .75,
    ...(transcript ? { transcript } : {}),
    provenance: {
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

/** Canonical order: music, ambience, seven EFFECT_CUES, narration. */
export const LOST_COLORS_BUNDLED_MEDIA: LevelMedia = {
  audio: [
    audio("bundled-music", "music", "lost-colors-loop.wav", "90167b3cad7474b77ad2f3c9b691e37e4bdff70abd0a3faf23a8693d4edb7051", 176444, 4, true),
    audio("bundled-ambience", "ambience", "gentle-breeze.wav", "0c69d03d214a3bcec1a294d24e0bc88793582a0c3cf96b81ab4f061922c3b217", 64044, 4, true),
    audio("bundled-fragment-pickup", "sfx", "fragment-pickup.wav", "7a959727eddea2167dd56a1130c84cb17db43ae4a9d91dbaa5cb257cd97a6812", 7244, .45, false),
    audio("bundled-portal-activate", "sfx", "portal-activate.wav", "6a77a2b91078fe0e49e7fff42b90cefcde780f42af8fcf944368aa28b82f66e1", 19244, 1.2, false),
    audio("bundled-checkpoint", "sfx", "checkpoint.wav", "c25345079589413f5f3401d896931e0a97d9329fc434c9a29b39692c59ad2269", 5644, .35, false),
    audio("bundled-fall-respawn", "sfx", "fall-respawn.wav", "ee52d55d7d723dbfad6167b888e6bdb2ff452a05acb15e2e481e76a755bc8796", 12044, .75, false),
    audio("bundled-race-start", "sfx", "race-start.wav", "3d0424d989e977a62ac803e61d23483a683bce4bb10c80371d7b93586fdd1ce2", 18444, 1.15, false),
    audio("bundled-race-finish", "sfx", "race-finish.wav", "d2b3238d2b0df6c835c2cc4394969494b37b4402eaf257ebabe7a00a7cda97bd", 24044, 1.5, false),
    audio("bundled-completion", "sfx", "completion.wav", "45c2000f5a37ff949d9d780f9a5856c6092a0703b2f8b892ba818961b60841c4", 28844, 1.8, false),
    audio("bundled-narration", "narration", "narration-intro.wav", "95839594cea00d93f42e82cef10df3db365d601873262c3eeede83f05ed91c39", 17644, 1.1, false, "Welcome to Teacup Island. Find the three lost colors and carry them to the portal to bring this little world back to life."),
  ],
  video: [],
};
