export function platformPreviewDocument(
  fragment: string,
  platform: "wordpress" | "tistory",
  title: string,
): string {
  const wordpressStyles = platform === "wordpress" ? `
figure.wp-block-table{display:block;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
figure.wp-block-table table{width:100%;border-collapse:collapse;border-spacing:0;line-height:1.6}
figure.wp-block-table th,figure.wp-block-table td{border:1px solid #dcdcde;padding:12px 14px;text-align:left;vertical-align:top}
figure.wp-block-table th{background:#f6f7f7;font-weight:700}
figure.wp-block-table figcaption{margin:0 0 10px;color:#646970;font-size:14px;text-align:left}` : "";
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}html{background:#fff}body{margin:0 auto;max-width:920px;padding:clamp(18px,4vw,48px);color:#1e1e1e;background:#fff;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Noto Sans KR",sans-serif;font-size:17px;line-height:1.75;overflow-wrap:anywhere}h1{font-size:clamp(28px,5vw,44px);line-height:1.25;margin:0 0 36px}h2{font-size:clamp(23px,4vw,30px);line-height:1.35;margin:46px 0 18px}h3{font-size:21px;line-height:1.4;margin:32px 0 14px}p{margin:0 0 20px}img{display:block;max-width:100%;height:auto}a{color:#135e96}${wordpressStyles}
</style></head><body><article><h1>${escapeHtml(title)}</h1>${fragment}</article></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]!);
}
