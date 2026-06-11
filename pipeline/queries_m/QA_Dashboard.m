let
    // Pull directly from your existing QA_TimingSections query
    Source = QA_TimingSections,

    // ── FLAG 1: Too Fast — Full survey under 19 mins ─────────────────────
    F_TooFast = Table.AddColumn(Source, "FLAG_TooFast", each
        if [Full Time All Sections] < 19
        then "✗ Too Fast"
        else "✓ OK",
        type text),

    // ── FLAG 2: Too Slow — Full survey over 90 mins ──────────────────────
    F_TooSlow = Table.AddColumn(F_TooFast, "FLAG_TooSlow", each
        if [Full Time All Sections] > 90
        then "✗ Too Slow"
        else "✓ OK",
        type text),

    // ── FLAG 3: App Left Open — your GAP column already detects this ─────
    F_AppOpen = Table.AddColumn(F_TooSlow, "FLAG_AppLeftOpen", each
        if [GAP] = "App left open / long pause"
        then "✗ App Left Open"
        else "✓ OK",
        type text),

    // ── FLAG 4: Below Time Range — your existing column ──────────────────
    F_BelowRange = Table.AddColumn(F_AppOpen, "FLAG_BelowRange", each
        if [time range accepted] = "Below 19 mins"
        then "✗ Below Range"
        else "✓ OK",
        type text),

    // ── FLAG 5: Missing GPS + SurveyStatus_New — re-join from data ────────
    // LocationOn and SurveyStatus_New are pulled fresh from the master "data" sheet.
    DataSource = data,
    GPSRef = Table.SelectColumns(DataSource, {"instanceID", "LocationOn", "SurveyStatus_New"}),

    Joined = Table.NestedJoin(
        F_BelowRange, {"instanceID"},
        GPSRef,       {"instanceID"},
        "GPS_Info",   JoinKind.LeftOuter
    ),
    // Drop any pre-existing SurveyStatus_New so the expand can bring in the one from data
    RemoveOld = Table.RemoveColumns(Joined, {"SurveyStatus_New"}),
    Expanded = Table.ExpandTableColumn(RemoveOld, "GPS_Info",
        {"LocationOn", "SurveyStatus_New"}, {"LocationOn", "SurveyStatus_New"}
    ),

    F_GPS = Table.AddColumn(Expanded, "FLAG_MissingGPS", each
        if [LocationOn] = "No" or [LocationOn] = null
        then "✗ Missing GPS"
        else "✓ OK",
        type text),

    // ── TOTAL FLAGS COUNT ─────────────────────────────────────────────────
    F_Count = Table.AddColumn(F_GPS, "Total_Flags", each List.Count(List.Select(
            {
                [FLAG_TooFast],
                [FLAG_TooSlow],
                [FLAG_AppLeftOpen],
                [FLAG_BelowRange],
                [FLAG_MissingGPS]
            },
            each Text.StartsWith(_, "✗")
        ))),

    // ── QA STATUS ─────────────────────────────────────────────────────────
    F_Status = Table.AddColumn(F_Count, "QA_Status", each
        if [Total_Flags] = 0 then "✅ PASS"
        else if [Total_Flags] = 1 then "⚠️ REVIEW"
        else "❌ FAIL",
        type text),

    // ── SELECT FINAL COLUMNS FOR OUTPUT ───────────────────────────────────
    Final = Table.SelectColumns(F_Status, {
        "instanceID",
        "SurveyStatus_New",
        "NameCode",
        "SubmissionDate",
        "apptimemint",
        "Full Time All Sections",
        "TimeApp minus TimeMain",
        "time_demo",
        "time_priorities",
        "time_mutualaid",
        "time_access_trust",
        "time_expectations",
        "time_info",
        "time_future",
        "GAP",
        "time range accepted",
        "LocationOn",
        "FLAG_TooFast",
        "FLAG_TooSlow",
        "FLAG_AppLeftOpen",
        "FLAG_BelowRange",
        "FLAG_MissingGPS",
        "Total_Flags",
        "QA_Status"
    }),

    #"Reordered Columns" = Table.ReorderColumns(Final,{"SurveyStatus_New", "instanceID", "NameCode", "SubmissionDate", "apptimemint", "Full Time All Sections", "TimeApp minus TimeMain", "time_demo", "time_priorities", "time_mutualaid", "time_access_trust", "time_expectations", "time_info", "time_future", "GAP", "time range accepted", "LocationOn", "FLAG_TooFast", "FLAG_TooSlow", "FLAG_AppLeftOpen", "FLAG_BelowRange", "FLAG_MissingGPS", "Total_Flags", "QA_Status"})
in
    #"Reordered Columns"