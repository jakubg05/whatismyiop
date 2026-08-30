import { KatexMath as Math } from "./KatexMath";

export function TrendExplanation({ onOpenSessions, expanded = false }: { onOpenSessions: () => void; expanded?: boolean }) {
  const body = <div className="trend-explanation__body">
        <p>
          A trend is a smoothed summary of your session pressures, calculated separately for each eye. It is not a forecast and it does not invent readings beyond the dates you measured.
        </p>
        <p>
          Trends begin with one value per eye per session. The grouping rules and the Median or Average choice described in <button className="trend-explanation__session-link" type="button" onClick={onOpenSessions}>how sessions work?</button> are applied before the calculation described here.
        </p>

        <h3>A local curve, not one forced line</h3>
        <p>
          The line is calculated with a standard robust smoothing algorithm. It looks for a pattern that is repeated across nearby sessions, giving more influence to sessions close together in time. This keeps the trend responsive to sustained changes without treating every rise or dip as a new direction.
        </p>
        <Math block>{String.raw`\text{trend}=\text{pattern shared by nearby sessions}`}</Math>
        <p>
          A single unusual session can still affect the curve, but it has less influence than a pattern seen repeatedly. Nothing is silently deleted, and the curve is only drawn between your first and last session. It does not predict future pressure.
        </p>

        <h3>Observed and adjusted</h3>
        <p>
          Observed smooths the session values exactly as recorded. It can therefore move if your measurement schedule changes—for example, from mostly mornings to mostly evenings.
        </p>
        <p>
          Adjusted separates long-term change from a repeatable time-of-day pattern, then shows every date on the same noon reference. This helps prevent a change from mostly morning sessions to mostly evening sessions from looking like a real long-term shift.
        </p>
        <Math block>{String.raw`y_i=T(t_i)+D(\text{time of day}_i)+\varepsilon_i`}</Math>
        <p>
          The time-of-day pattern is learned only from your own sessions. The adjustment does not use posture, a population “normal,” or data from other people, and it never changes the imported measurements.
        </p>

        <h3>When the data are thin</h3>
        <p>
          A trend is not shown until an eye has at least eight sessions. Sections become dashed across unusually large gaps, so a weakly supported part of the curve does not look as certain as one surrounded by regular sessions.
        </p>
        <p>
          Hovering the curve shows an approximate uncertainty band based on how closely nearby sessions agree. A wider band means the underlying sessions are less consistent. It describes confidence in the smoothed pattern, not a safe range, a diagnosis, or a prediction of your next reading.
        </p>
        <Math block>{String.raw`\text{more agreement}\;\Longrightarrow\;\text{more confidence in the trend}`}</Math>
  </div>;

  if (expanded) return <div className="trend-explanation trend-explanation--standalone">{body}</div>;

  return (
    <details className="trend-explanation">
      <summary>
        <span>How are trends calculated?</span>
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m4.5 2.5 3.5 3.5-3.5 3.5" /></svg>
      </summary>
      {body}
    </details>
  );
}
