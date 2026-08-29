import { KatexMath as Math } from "./KatexMath";
import rawReadingsImage from "./assets/session-raw-readings.png";
import sessionValuesImage from "./assets/session-summary-values.png";

export function SessionExplanation() {
  return (
    <div className="session-explanation">
      <p>
        Sessions keep a burst of measurements from counting as several independent observations. The chart and trends use one value per eye per session unless you choose Raw.
      </p>

      <figure className="session-explanation__example">
        <div className="session-explanation__image-pair">
          <div>
            <div className="session-explanation__image-label">Raw readings</div>
            <img
              src={rawReadingsImage}
              alt="Individual right- and left-eye pressure readings shown as small chart points"
            />
          </div>
          <div>
            <div className="session-explanation__image-label">Session values</div>
            <img
              src={sessionValuesImage}
              alt="The same pressure readings summarized as one larger point per eye and session"
            />
          </div>
        </div>
        <figcaption>
          Readings taken close together become one value per eye. The original readings remain available in Raw view.
        </figcaption>
      </figure>

      <h3>How measurements are grouped</h3>
      <p>
        Measurements are sorted by time. The first measurement starts a session, and every measurement taken within the next 10 minutes joins it. A measurement after that window starts a new session.
      </p>
      <p>
        The session is placed at the midpoint between its first and last measurement. Right- and left-eye readings are summarized separately. A session can contribute one right-eye value, one left-eye value, or one of each; it contributes nothing for an eye that was not measured.
      </p>

      <h3>Median or average</h3>
      <p>
        Median is the middle pressure after the session&apos;s readings are sorted. It is less affected by one unusually high or low reading and is the default.
      </p>
      <p>
        Average adds every pressure in the session and divides by the number of readings. It uses the size of every reading, so an unusual value has more influence.
      </p>
      <Math block>{String.raw`y_i=\begin{cases}\operatorname{median}(x_{i1},\ldots,x_{im})&\text{Median}\\[2pt]\dfrac{1}{m}\sum_{j=1}^{m}x_{ij}&\text{Average}\end{cases}`}</Math>

      <h3>What the choice changes</h3>
      <p>
        Median or Average changes the session points shown on the chart and the values supplied to the trend calculation. It does not alter the imported measurements. Switching to Raw shows every original reading instead of the session summaries.
      </p>
      <p>
        Each session still contributes only one value per eye. Taking more readings inside one session therefore improves that session&apos;s summary without giving the session extra weight in the trend.
      </p>
    </div>
  );
}
