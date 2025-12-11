// ───────────────────────────────────
// 심각도 → 색상 매핑
// ───────────────────────────────────
export function severityToColor(severity: string): number {
  if (!severity) return 0x808080;

  switch (severity.toUpperCase()) {
    case 'CRITICAL':
      return 0x8b0000; // 진한 빨강
    case 'HIGH':
      return 0xff0000; // 빨강
    case 'MEDIUM':
      return 0xffa500; // 주황
    case 'LOW':
      return 0x00b050; // 초록
    default:
      return 0x808080; // UNKNOWN
  }
}
