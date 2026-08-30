export function HeatmapExplanation() {
  return (
    <div className="heatmap-explanation">
      <p>
        The heatmap shows how pressure changes by both date and time of day. It shares the main chart&apos;s
        horizontal date range, so scrubbing or zooming either view keeps them aligned.
      </p>

      <h3>How to read it</h3>
      <p>
        Each horizontal band represents a three-hour part of the day. Within each band, the chart builds a
        trend from measurements recorded during those hours and lays that trend across the calendar.
      </p>
      <p>
        Color represents the estimated pressure. The scale adapts to the values currently in view so useful
        differences remain visible; the legend below the heatmap shows the active range.
      </p>

      <h3>Eyes and uncertain regions</h3>
      <p>
        The Left and Right control chooses which eye contributes to the heatmap. This choice is independent
        from the eye controls for the main chart.
      </p>
      <p>
        White diagonal stripes mark regions supported by fewer than two nearby reading days for a selected
        eye. The color beneath is still an estimate, but should be interpreted with more caution. You can hide
        these markings from the heatmap menu.
      </p>
    </div>
  );
}
