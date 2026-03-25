interface HeaderBarProps {
  refreshing: boolean;
  enableAlertSound: boolean;
  onToggleSound: (enabled: boolean) => void;
  onSimulateAttack: () => void;
  onResetDemo: () => void;
  simulating: boolean;
  resetting: boolean;
}

export const HeaderBar = ({
  refreshing,
  enableAlertSound,
  onToggleSound,
  onSimulateAttack,
  onResetDemo,
  simulating,
  resetting
}: HeaderBarProps) => {
  return (
    <header className="soc-header">
      <div className="brand">
        <div className="brand-mark">FX</div>
        <div>
          <h1>FirewallX Security Command Center</h1>
          <p>Centralized Zero-Trust Defense and Live Threat Intelligence</p>
        </div>
      </div>

      <div className="header-right">
        <div className="live-indicator">
          <span className={`live-dot ${refreshing ? "pulse" : ""}`} />
          <span>LIVE</span>
        </div>
        <input className="soc-search" placeholder="Search IP, endpoint, alert..." />
        <button className="btn btn-accent" onClick={onSimulateAttack} disabled={simulating}>
          {simulating ? "Simulating..." : "Simulate Attack"}
        </button>
        <button className="btn" onClick={onResetDemo} disabled={resetting}>
          {resetting ? "Resetting..." : "Reset Demo"}
        </button>
        <label className="sound-toggle">
          <input type="checkbox" checked={enableAlertSound} onChange={(e) => onToggleSound(e.target.checked)} />
          Sound
        </label>
      </div>
    </header>
  );
};
