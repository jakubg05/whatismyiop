# WhatIsMyIOP

WhatIsMyIOP turns home-tonometer measurement exports into charts for reviewing pressure history. Persistent Periods and Annotations preserve context, while Comparison Segments select temporary intervals across chronological and time-of-day views.

## Language

**Persistent Period**:
A saved interval in a measurement history that remains available independently of the current comparison expression.
_Avoid_: Search period, temporary period

**Annotation**:
A saved point-in-time note in a measurement history, such as a treatment change or procedure.
_Avoid_: Point, comparison

**Measurement Export**:
A manufacturer-provided file containing the complete measurement history available from a home tonometer.
_Avoid_: Report, project

**Report**:
An editable, portable WhatIsMyIOP snapshot containing measurements, Persistent Periods, and Annotations.
_Avoid_: Project, PDF, measurement export

**Comparison Segment**:
A temporary interval defined by a Comparison Expression and displayed on the chronological and time-of-day charts without becoming part of the saved measurement history.
_Avoid_: Comparison period, search period, temporary period

**Comparison Expression**:
Temporary editable text that defines one or more Comparison Segments in sequence.
_Avoid_: Search query, filter

**Comparison Target**:
A Persistent Period or Annotation whose boundary anchors a relative Comparison Segment.
_Avoid_: Search result, source annotation
