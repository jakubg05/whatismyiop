export function TrendExplanation({ onOpenSessions, expanded = false }: { onOpenSessions: () => void; expanded?: boolean }) {
  const body = <div className="trend-explanation__body">
        <p>
          A trend is a smoothed summary of the values shown in the active measurement view, calculated separately for each eye. It is not a forecast and it does not extend beyond the dates you measured.
        </p>
        <p>
          Raw uses every included reading. Sessions uses one median or average value per eye per session, following the rules described in <button className="explanation-link" type="button" onClick={onOpenSessions}>how sessions work?</button> Position and Quality filters also determine which values are included.
        </p>

        <h3>A local curve, not one forced line</h3>
        <p>
          The line is calculated with a standard robust smoothing algorithm. It looks for a pattern repeated across nearby values and gives more influence to values close together in time. This keeps the trend responsive to sustained changes without treating every rise or dip as a new direction.
        </p>
        <p>
          A single unusual value can still affect the curve, but it has less influence than a pattern seen repeatedly. Nothing is silently deleted, and the curve is only drawn between your first and last included value. It does not predict future pressure.
        </p>

        <h3>Measurement schedules matter</h3>
        <p>
          The trend smooths the included values as recorded. Pressure can vary during the day, so a change from mostly morning measurements to mostly evening measurements can move the trend even when the broader pattern has not changed.
        </p>

        <h3>When the data are thin</h3>
        <p>
          A trend is not shown until an eye has at least eight readings or sessions in the active view. Sections become dashed across unusually large gaps, so a weakly supported part of the curve does not look as certain as one surrounded by regular measurements.
        </p>
        <p>
          Hovering the curve shows an approximate uncertainty band based on how closely nearby values agree. A wider band means those values are less consistent. It describes confidence in the smoothed pattern, not a safe range, a diagnosis, or a prediction of your next reading.
        </p>
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
