/** Offline badge — renders "offline mode - using cached data" wherever a feed degraded. */
export function OfflineBadge({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <span className="offline-badge" role="status">
      ◌ OFFLINE MODE — USING CACHED DATA
    </span>
  );
}
