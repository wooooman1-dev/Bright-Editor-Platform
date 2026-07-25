import { readFile, writeFile } from "node:fs/promises";

import { replaceTistoryMediaPlaceholdersWithMarkers } from "./tistory-media-marker.mjs";

const [commandPath] = process.argv.slice(2);

try {
  const command = JSON.parse(await readFile(commandPath, "utf8"));
  const media = Array.isArray(command.media) ? command.media : [];
  if (!media.length) {
    process.stdout.write(`${JSON.stringify({ status: "not_required", media: [] })}\n`);
    process.exit(0);
  }

  const html = replaceTistoryMediaPlaceholdersWithMarkers(String(command.html ?? ""), media);
  await writeFile(commandPath, JSON.stringify({
    ...command,
    html,
    mediaPreparationMode: "same_editor_markers",
    mediaMarkersPrepared: true,
  }), { encoding: "utf8", mode: 0o600 });

  process.stdout.write(`${JSON.stringify({
    status: "prepared",
    preparationMode: "same_editor_markers",
    media: media.map((item, index) => ({
      blockId: item.blockId,
      markerPrepared: true,
      representativeCandidate: index === 0,
    })),
  })}\n`);
} catch (error) {
  const code = error?.diagnosticCode ?? "media_marker_preparation_failed";
  const message = error?.safeMessage ?? "Tistory 이미지 위치 Marker 준비를 완료하지 못했습니다.";
  process.stderr.write(`[tistory-media-worker] ${code}\n`);
  process.stdout.write(`${JSON.stringify({ status: "failed", code, error: message })}\n`);
  process.exitCode = 1;
}
