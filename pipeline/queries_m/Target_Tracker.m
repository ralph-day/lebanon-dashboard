let
    // ── STEP 1: Keep one row only per interview ───────────────────────────
    DataSource = Table.Distinct(data, {"instanceID"}),

    // ── STEP 2: Separate accepted and rejected interviews ─────────────────
    AcceptedRows = Table.SelectRows(
        DataSource,
        each [SurveyStatus_New] = "accepted"
    ),

    RejectedRows = Table.SelectRows(
        DataSource,
        each [SurveyStatus_New] <> "accepted"
    ),

    TooShortRows = Table.SelectRows(DataSource, each [SurveyStatus_New] = "too_short"),
    TooCloseRows = Table.SelectRows(DataSource, each [SurveyStatus_New] = "too_close"),
    WrongNationalityRows = Table.SelectRows(DataSource, each [SurveyStatus_New] = "wrong_nationality"),
    ITPRows = Table.SelectRows(DataSource, each [SurveyStatus_New] = "ITP"),
    TestingRows = Table.SelectRows(DataSource, each [SurveyStatus_New] = "testing"),
    ExcludedRows = Table.SelectRows(DataSource, each [SurveyStatus_New] = "excluded because respondent is not displaced"),

    // ── STEP 3: Create loc_2 and loc_3 mapping ────────────────────────────
    GroupedLocationHierarchy = Table.Group(
        DataSource,
        {"Fixed Location"},
        {
            {"loc_2", each let Values = List.Distinct(List.Select(List.Transform(List.RemoveNulls([loc_2]), each Text.Trim(Text.From(_))), each _ <> "")) in Text.Combine(Values, ", "), type text},
            {"loc_3", each let Values = List.Distinct(List.Select(List.Transform(List.RemoveNulls([loc_3]), each Text.Trim(Text.From(_))), each _ <> "")) in Text.Combine(Values, ", "), type text}
        }
    ),
    GroupedLocationHierarchyClean = Table.AddColumn(GroupedLocationHierarchy, "join_key", each Text.Lower(Text.Trim([Fixed Location])), type text),

    // ── STEP 4: Count ALL interviews (Completed) ──────────────────────────
    GroupedCompleted = Table.Group(
        DataSource,
        {"Fixed Location"},
        {{"Completed", each Table.RowCount(_), Int64.Type}}
    ),
    GroupedCompletedClean = Table.AddColumn(GroupedCompleted, "join_key", each Text.Lower(Text.Trim([Fixed Location])), type text),

    // ── STEP 5: Count Accepted ────────────────────────────────────────────
    GroupedAccepted = Table.Group(
        AcceptedRows,
        {"Fixed Location"},
        {
            {"Accepted", each Table.RowCount(_), Int64.Type},
            {"LocationOn", each Table.RowCount(Table.SelectRows(_, each [#"gps-Latitude"] <> null)), Int64.Type},
            {"man", each Table.RowCount(Table.SelectRows(_, each Text.Lower(Text.Trim([gender])) = "man")), Int64.Type},
            {"woman", each Table.RowCount(Table.SelectRows(_, each Text.Lower(Text.Trim([gender])) = "woman")), Int64.Type},
            {"Palestinian", each Table.RowCount(Table.SelectRows(_, each Text.Lower(Text.Trim([nationality])) = "palestinian")), Int64.Type},
            {"Lebanese", each Table.RowCount(Table.SelectRows(_, each Text.Lower(Text.Trim([nationality])) = "lebanese")), Int64.Type},
            {"Syrian", each Table.RowCount(Table.SelectRows(_, each Text.Lower(Text.Trim([nationality])) = "syrian")), Int64.Type}
        }
    ),
    GroupedAcceptedClean = Table.AddColumn(GroupedAccepted, "join_key", each Text.Lower(Text.Trim([Fixed Location])), type text),

    // ── STEP 6: Count Rejected (total) ───────────────────────────────────
    GroupedRejected = Table.Group(
        RejectedRows,
        {"Fixed Location"},
        {{"Rejected", each Table.RowCount(_), Int64.Type}}
    ),
    GroupedRejectedClean = Table.AddColumn(GroupedRejected, "join_key", each Text.Lower(Text.Trim([Fixed Location])), type text),

    // ── STEP 7: Count each rejection reason ──────────────────────────────
    GroupedTooShort = Table.Group(TooShortRows, {"Fixed Location"}, {{"too_short", each Table.RowCount(_), Int64.Type}}),
    GroupedTooShortClean = Table.AddColumn(GroupedTooShort, "join_key", each Text.Lower(Text.Trim([Fixed Location])), type text),

    GroupedTooClose = Table.Group(TooCloseRows, {"Fixed Location"}, {{"too_close", each Table.RowCount(_), Int64.Type}}),
    GroupedTooCloseClean = Table.AddColumn(GroupedTooClose, "join_key", each Text.Lower(Text.Trim([Fixed Location])), type text),

    GroupedWrongNationality = Table.Group(WrongNationalityRows, {"Fixed Location"}, {{"wrong_nationality", each Table.RowCount(_), Int64.Type}}),
    GroupedWrongNationalityClean = Table.AddColumn(GroupedWrongNationality, "join_key", each Text.Lower(Text.Trim([Fixed Location])), type text),

    GroupedITP = Table.Group(ITPRows, {"Fixed Location"}, {{"ITP", each Table.RowCount(_), Int64.Type}}),
    GroupedITPClean = Table.AddColumn(GroupedITP, "join_key", each Text.Lower(Text.Trim([Fixed Location])), type text),

    GroupedTesting = Table.Group(TestingRows, {"Fixed Location"}, {{"testing", each Table.RowCount(_), Int64.Type}}),
    GroupedTestingClean = Table.AddColumn(GroupedTesting, "join_key", each Text.Lower(Text.Trim([Fixed Location])), type text),

    GroupedExcluded = Table.Group(ExcludedRows, {"Fixed Location"}, {{"excluded_not_displaced", each Table.RowCount(_), Int64.Type}}),
    GroupedExcludedClean = Table.AddColumn(GroupedExcluded, "join_key", each Text.Lower(Text.Trim([Fixed Location])), type text),

    // ── STEP 8: Load target table ─────────────────────────────────────────
    TargetHeaders = Excel.CurrentWorkbook(){[Name="Target"]}[Content],
    TargetTyped = Table.TransformColumnTypes(TargetHeaders, {{"location", type text}, {"target", Int64.Type}}),
    TargetNoNull = Table.SelectRows(TargetTyped, each [location] <> null and Text.Trim([location]) <> ""),
    TargetClean = Table.AddColumn(TargetNoNull, "join_key", each Text.Lower(Text.Trim([location])), type text),

    // ── STEP 9–10: Join loc hierarchy + Completed ─────────────────────────
    JoinedHierarchy = Table.NestedJoin(TargetClean, {"join_key"}, GroupedLocationHierarchyClean, {"join_key"}, "HierarchyData", JoinKind.LeftOuter),
    ExpandedHierarchy = Table.ExpandTableColumn(JoinedHierarchy, "HierarchyData", {"loc_2", "loc_3"}, {"loc_2", "loc_3"}),

    JoinedCompleted = Table.NestedJoin(ExpandedHierarchy, {"join_key"}, GroupedCompletedClean, {"join_key"}, "CompletedData", JoinKind.LeftOuter),
    ExpandedCompleted = Table.ExpandTableColumn(JoinedCompleted, "CompletedData", {"Completed"}, {"Completed"}),

    // ── STEP 11: Join Accepted ────────────────────────────────────────────
    JoinedAccepted = Table.NestedJoin(ExpandedCompleted, {"join_key"}, GroupedAcceptedClean, {"join_key"}, "AcceptedData", JoinKind.LeftOuter),
    ExpandedAccepted = Table.ExpandTableColumn(JoinedAccepted, "AcceptedData", {"Accepted", "LocationOn", "man", "woman", "Palestinian", "Lebanese", "Syrian"}, {"Accepted", "LocationOn", "man", "woman", "Palestinian", "Lebanese", "Syrian"}),

    // ── STEP 12: Join Rejected total ──────────────────────────────────────
    JoinedRejected = Table.NestedJoin(ExpandedAccepted, {"join_key"}, GroupedRejectedClean, {"join_key"}, "RejectedData", JoinKind.LeftOuter),
    ExpandedRejected = Table.ExpandTableColumn(JoinedRejected, "RejectedData", {"Rejected"}, {"Rejected"}),

    // ── STEP 13: Join each rejection reason ──────────────────────────────
    J1 = Table.NestedJoin(ExpandedRejected, {"join_key"}, GroupedTooShortClean, {"join_key"}, "d1", JoinKind.LeftOuter),
    E1 = Table.ExpandTableColumn(J1, "d1", {"too_short"}, {"too_short"}),

    J2 = Table.NestedJoin(E1, {"join_key"}, GroupedTooCloseClean, {"join_key"}, "d2", JoinKind.LeftOuter),
    E2 = Table.ExpandTableColumn(J2, "d2", {"too_close"}, {"too_close"}),

    J3 = Table.NestedJoin(E2, {"join_key"}, GroupedWrongNationalityClean, {"join_key"}, "d3", JoinKind.LeftOuter),
    E3 = Table.ExpandTableColumn(J3, "d3", {"wrong_nationality"}, {"wrong_nationality"}),

    J4 = Table.NestedJoin(E3, {"join_key"}, GroupedITPClean, {"join_key"}, "d4", JoinKind.LeftOuter),
    E4 = Table.ExpandTableColumn(J4, "d4", {"ITP"}, {"ITP"}),

    J5 = Table.NestedJoin(E4, {"join_key"}, GroupedTestingClean, {"join_key"}, "d5", JoinKind.LeftOuter),
    E5 = Table.ExpandTableColumn(J5, "d5", {"testing"}, {"testing"}),

    J6 = Table.NestedJoin(E5, {"join_key"}, GroupedExcludedClean, {"join_key"}, "d6", JoinKind.LeftOuter),
    E6 = Table.ExpandTableColumn(J6, "d6", {"excluded_not_displaced"}, {"excluded_not_displaced"}),

    // ── STEP 14: Fill nulls ───────────────────────────────────────────────
    Filled = Table.TransformColumns(E6, {
        {"loc_2", each if _ = null then "" else _, type text},
        {"loc_3", each if _ = null then "" else _, type text},
        {"Completed", each if _ = null then 0 else _, Int64.Type},
        {"Accepted", each if _ = null then 0 else _, Int64.Type},
        {"Rejected", each if _ = null then 0 else _, Int64.Type},
        {"too_short", each if _ = null then 0 else _, Int64.Type},
        {"too_close", each if _ = null then 0 else _, Int64.Type},
        {"wrong_nationality", each if _ = null then 0 else _, Int64.Type},
        {"ITP", each if _ = null then 0 else _, Int64.Type},
        {"testing", each if _ = null then 0 else _, Int64.Type},
        {"excluded_not_displaced", each if _ = null then 0 else _, Int64.Type},
        {"LocationOn", each if _ = null then 0 else _, Int64.Type},
        {"man", each if _ = null then 0 else _, Int64.Type},
        {"woman", each if _ = null then 0 else _, Int64.Type},
        {"Palestinian", each if _ = null then 0 else _, Int64.Type},
        {"Lebanese", each if _ = null then 0 else _, Int64.Type},
        {"Syrian", each if _ = null then 0 else _, Int64.Type}
    }),

    // ── STEP 15–21: Target, Remaining, Pct, Status, Bar, GPS, Final ───────
    WithTarget = Table.TransformColumns(Filled, {{"target", each if _ = null then 0 else Number.From(_), Int64.Type}}),

    WithRemaining = Table.AddColumn(WithTarget, "Remaining", each [target] - [Completed], Int64.Type),
    WithActualRemaining = Table.AddColumn(WithRemaining, "Actual Remaining", each [target] - [Accepted], Int64.Type),

    WithPct = Table.AddColumn(WithActualRemaining, "Pct_Complete", each if [target] = 0 then 0 else Number.Round([Accepted] / [target], 3), type number),

    WithStatus = Table.AddColumn(WithPct, "Status", each
        if [Pct_Complete] >= 1 then "✅ Complete"
        else if [Pct_Complete] >= 0.75 then "🟢 On Track"
        else if [Pct_Complete] >= 0.5 then "🟡 In Progress"
        else if [Pct_Complete] > 0 then "🟠 Started"
        else "🔴 Not Started", type text),

    WithBar = Table.AddColumn(WithStatus, "Progress_Bar", each
        let pct = List.Min({1, List.Max({0, [Pct_Complete]})}), filled = Number.RoundDown(pct * 20), empty = 20 - filled
        in Text.Repeat("█", filled) & Text.Repeat("░", empty), type text),

    WithLocationPct = Table.AddColumn(WithBar, "LocationOn_Pct", each if [Accepted] = 0 then 0 else Number.Round([LocationOn] / [Accepted], 3), type number),

    // ── FINAL: Select and sort ────────────────────────────────────────────
    Final = Table.SelectColumns(WithLocationPct, {
        "loc_2", "loc_3", "location", "target",
        "Completed", "Accepted", "Actual Remaining",
        "Palestinian", "Lebanese", "Syrian",
        "Rejected", "too_short", "too_close", "wrong_nationality", "ITP", "testing", "excluded_not_displaced",
        "Remaining", "Pct_Complete", "Progress_Bar", "Status",
        "LocationOn", "LocationOn_Pct", "man", "woman"
    }),

    Sorted = Table.Sort(Final, {{"Pct_Complete", Order.Descending}, {"target", Order.Descending}})

in
    Sorted