# Home Tonometer Analysis

The application helps clinicians interpret home-tonometer measurements by viewing persistent clinical context and temporary time slices across chronological and diurnal charts.

## Language

**Persistent Period**:
A saved interval in the patient's measurement history that remains available independently of the current comparison search.
_Avoid_: Search period, temporary period

**Annotation**:
A saved point-in-time clinical event in the patient's measurement history.
_Avoid_: Period, comparison

**Comparison Segment**:
A temporary time interval defined in the comparison box and displayed on the chronological and diurnal charts without becoming part of the saved clinical history.
_Avoid_: Comparison period, search period, temporary period

**Comparison Expression**:
Temporary editable text that defines one or more Comparison Segments in sequence.
_Avoid_: Search query, filter

**Comparison Target**:
A Persistent Period or Annotation whose boundary anchors a relative Comparison Segment.
_Avoid_: Search result, source event
