export function HeatmapExplanation() {
  return (
    <div className="heatmap-explanation">
      <p>
        The heatmap shows how pressure changes by date and time of day. It shares the main chart&apos;s
        horizontal date range, so panning or zooming either view keeps them aligned.
      </p>

      <h3>How to read it</h3>
      <p>
        Each horizontal band starts with a three-hour part of the day. The chart averages the selected
        eye&apos;s readings for each date and time band, smooths those daily values across the calendar, and
        blends between adjacent bands. Position and Quality filters determine which readings are included.
      </p>
      <p>
        Color represents estimated mean pressure. One shared scale is calculated from both eyes across the
        full date history using the currently included readings. A pressure therefore keeps the same color
        when you pan, zoom, or switch eyes. Changing a Position or Quality filter can change the scale. The
        legend below the heatmap shows the active scale, and estimates outside its endpoints use the nearest end color.
      </p>

      <h3>Eyes and uncertain regions</h3>
      <p>
        The Left and Right control chooses which eye contributes to the heatmap. This choice is independent
        from the eye controls for the main chart.
      </p>
      <p>
        White diagonal stripes mark regions where the selected eye has fewer than two nearby reading days
        in that time band. The color beneath is still an estimate, but has little local support. You can hide
        the stripes from the heatmap menu.
      </p>
    </div>
  );
}
