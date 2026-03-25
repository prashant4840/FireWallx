import { Skeleton } from "./Skeleton";
import type { TimelineEvent } from "../types";

export const ThreatTimeline = ({ events, loading = false }: { events: TimelineEvent[]; loading?: boolean }) => {
  return (
    <div className="panel timeline fade-in">
      <h3>Threat Timeline</h3>
      <div className="timeline-list">
        {loading
          ? Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="timeline-item">
                <div className="dot skeleton-dot" />
                <div className="timeline-content-skeleton">
                  <Skeleton height={14} width="62%" />
                  <Skeleton height={12} width="78%" />
                  <Skeleton height={10} width="40%" />
                </div>
              </div>
            ))
          : events.length > 0 ? (
              events.slice(-15).reverse().map((event, idx) => (
                <div key={`${event.at}-${idx}`} className={`timeline-item ${event.severity.toLowerCase()} ${idx % 2 === 0 ? "from-left" : "from-right"}`} style={{ animationDelay: `${Math.min(idx * 45, 420)}ms` }}>
                  <div className="dot" />
                  <div>
                    <strong>{event.label}</strong>
                    <p>{event.detail}</p>
                    <small>{new Date(event.at).toLocaleTimeString()}</small>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">No timeline events yet. Run a simulation or Reset Demo.</div>
            )}
      </div>
    </div>
  );
};
