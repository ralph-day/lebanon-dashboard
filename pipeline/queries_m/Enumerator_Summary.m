let
    Source = data,
 
    // ── Group by enumerator ───────────────────────────────────────────────
    Grouped = Table.Group(Source, {"NameCode"}, {
        {"Total_Surveys",   each Table.RowCount(_),                              type number},
        {"Avg_Duration",    each Number.Round(List.Average([apptimemint]), 1),   type number},
        {"Min_Duration",    each Number.Round(List.Min([apptimemint]), 1),       type number},
        {"Max_Duration",    each Number.Round(List.Max([apptimemint]), 1),       type number},
        {"Too_Fast",        each Table.RowCount(Table.SelectRows(_, each [Full Time All Sections] < 19)),  type number},
        {"Too_Slow",        each Table.RowCount(Table.SelectRows(_, each [Full Time All Sections] > 90)),  type number},
        {"App_Left_Open",   each Table.RowCount(Table.SelectRows(_, each [GAP] = "App left open / long pause")), type number},
        {"Missing_GPS",     each Table.RowCount(Table.SelectRows(_, each [LocationOn] = "No")),            type number},
        {"Last_Submission", each List.Max([SubmissionDate]),                     type datetime}
    }),
 
    // ── Quality % = surveys with zero speed flags ─────────────────────────
    WithQuality = Table.AddColumn(Grouped, "Quality_%", each
        if [Total_Surveys] = 0 then 0
        else Number.Round(
            ([Total_Surveys] - [Too_Fast] - [Too_Slow]) / [Total_Surveys],
            3),
        type number),
 
    // Sort: most surveys first
    Sorted = Table.Sort(WithQuality, {{"Total_Surveys", Order.Descending}})
 
in
    Sorted