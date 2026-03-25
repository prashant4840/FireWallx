import { useEffect, useRef, useState } from "react";
import { Skeleton } from "./Skeleton";

interface KpiCardProps {
  title: string;
  value: number;
  icon: string;
  tone: "success" | "danger" | "warning" | "info";
  loading?: boolean;
}

export const KpiCard = ({ title, value, icon, tone, loading = false }: KpiCardProps) => {
  const [displayValue, setDisplayValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (loading) {
      setDisplayValue(0);
      return;
    }

    const durationMs = 550;
    const startValue = displayValue;
    const delta = value - startValue;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      setDisplayValue(Math.round(startValue + delta * progress));
      if (progress < 1) {
        rafRef.current = window.requestAnimationFrame(tick);
      }
    };

    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [value, loading]);

  return (
    <div className={`kpi-card kpi-${tone}`}>
      {loading ? (
        <>
          <Skeleton height={12} width="52%" />
          <Skeleton height={34} width="60%" className="skeleton-kpi-value" />
        </>
      ) : (
        <>
          <div className="kpi-meta">
            <span className="kpi-title">{title}</span>
            <span className="kpi-icon">{icon}</span>
          </div>
          <strong>{displayValue}</strong>
        </>
      )}
    </div>
  );
};
