# Home Tonometer Analysis

The application helps clinicians interpret home-tonometer measurements by viewing persistent clinical context and temporary time slices across chronological and diurnal charts.

## Language

**Persistent Period**:
A saved interval in the patient's measurement history that remains available independently of the current comparison search.
_Avoid_: Search period, temporary period

**Annotation**:
A saved point-in-time clinical change or procedure in the patient's measurement history.
_Avoid_: Point, comparison

**Measurement Export**:
A manufacturer-provided file containing the complete measurement history available from a home tonometer.
_Avoid_: Report, project

**Report**:
An editable, portable WhatIsMyIOP snapshot containing measurements, Persistent Periods, and Annotations.
_Avoid_: Project, PDF, measurement export

**Comparison Segment**:
A temporary time interval defined in the comparison box and displayed on the chronological and diurnal charts without becoming part of the saved clinical history.
_Avoid_: Comparison period, search period, temporary period

**Comparison Expression**:
Temporary editable text that defines one or more Comparison Segments in sequence.
_Avoid_: Search query, filter

**Comparison Target**:
A Persistent Period or Annotation whose boundary anchors a relative Comparison Segment.
_Avoid_: Search result, source annotation
