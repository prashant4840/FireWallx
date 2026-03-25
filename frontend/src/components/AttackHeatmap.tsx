import { useMemo } from "react";
import { Skeleton } from "./Skeleton";
import type { HeatPoint } from "../types";

export const AttackHeatmap = ({ points, loading = false }: { points: HeatPoint[]; loading?: boolean }) => {
  const normalized = useMemo(() => {
    return points.map((point) => ({
      ...point,
      x: Math.round(((point.lon + 180) / 360) * 100),
      y: Math.round(((90 - point.lat) / 180) * 100),
      intensity: Math.max(20, Math.min(100, point.riskScore))
    }));
  }, [points]);

  return (
    <div className="panel heatmap fade-in">
      <h3>Attack Heatmap</h3>
      <div className="map-canvas">
        {loading
          ? Array.from({ length: 7 }).map((_, idx) => (
              <Skeleton key={idx} className="map-skeleton-dot" width="10px" height={10} />
            ))
          : normalized.length > 0 ? (
              normalized.map((point) => (
                <div
                  key={point.id}
                  className="map-dot"
                  title={`${point.ip} (${point.country}) risk=${point.riskScore}`}
                  style={{ left: `${point.x}%`, top: `${point.y}%`, opacity: point.intensity / 100 }}
                />
              ))
            ) : (
              <div className="empty-state">No heatmap points yet. Run a simulation to generate data.</div>
            )}
      </div>
    </div>
  );
};
