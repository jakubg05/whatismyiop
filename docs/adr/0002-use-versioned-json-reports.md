# Use versioned JSON for editable reports

WhatIsMyIOP reports use a versioned JSON document with the `.whatismyiop` extension. A report contains the same canonical measurements, Persistent Periods, and Annotations stored in the browser, plus the metadata needed to identify and version the format. JSON was chosen over CSV because the report contains several different record shapes, and putting them into one table would create a brittle format. Reports remain editable after import and are unencrypted files that users can share through a channel they choose.
