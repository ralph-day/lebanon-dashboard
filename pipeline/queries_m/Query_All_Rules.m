let
    Source = data,

    // ── COLUMN GROUPS ─────────────────────────────────────────────────────
    TrustCols = {
        "trust_natl_ngo", "trust_civil_soc", "trust_intl_ngo",
        "trust_un", "trust_red_cross", "trust_govt",
        "trust_local_auth", "trust_religion", "trust_community_leaders"
    },

    PerceptionCols = {
        "perception_consult", "perception_involve", "perception_reach",
        "perception_dignity", "perception_local_power",
        "perception_transparenvy", "perception_communicate",
        "perception_feedback", "perception_action"
    },

    ExpectCols = {
        "expect_consult", "expect_involve", "expect_reach",
        "expect_dignity", "expect_local_power", "expect_transparenvy",
        "expect_communicate", "expect_feedback", "expect_action"
    },

    OtherLikert = {
        "perception_coping", "perception_incontrol",
        "perception_coverneeds", "community_relations"
    },

    AllLikertCols = List.Combine({TrustCols, PerceptionCols, ExpectCols, OtherLikert}),

    // ── LABEL MAPS ────────────────────────────────────────────────────────
    Map9899 = [
        #"1" = "1 - Not at all",
        #"2" = "2 - Not really",
        #"3" = "3 - Somewhat",
        #"4" = "4 - Mostly yes",
        #"5" = "5 - Yes completely",
        #"98" = "98 - Don't know",
        #"99" = "99 - Don't want to answer"
    ],

    MapAgree = [
        #"1" = "1 - Strongly disagree",
        #"2" = "2 - Disagree",
        #"3" = "3 - Neither agree nor disagree",
        #"4" = "4 - Agree",
        #"5" = "5 - Strongly agree",
        #"98" = "98 - Don't know",
        #"99" = "99 - Don't want to answer"
    ],

    MapImportance = [
        #"1" = "1 - Not important at all",
        #"2" = "2 - Not very important",
        #"3" = "3 - Somewhat important",
        #"4" = "4 - Very important",
        #"5" = "5 - Extremely important",
        #"98" = "98 - Don't know",
        #"99" = "99 - Don't want to answer"
    ],

    MapPositive = [
        #"1" = "1 - Very tense",
        #"2" = "2 - Often tense",
        #"3" = "3 - Mixed",
        #"4" = "4 - Mostly positive",
        #"5" = "5 - Very positive",
        #"98" = "98 - Don't know",
        #"99" = "99 - Don't want to answer"
    ],

    // ── HELPERS ───────────────────────────────────────────────────────────
    GetLabel = (val as any, map as record) as text =>
        let key = try Text.From(Number.From(val)) otherwise null
        in if key = null then "Missing"
           else if Record.HasFields(map, key) then Record.Field(map, key)
           else Text.From(val),

    GetValid = (row as record, cols as list) as list =>
        List.Select(
            List.Transform(cols, each
                let v = try Number.From(Record.Field(row, _)) otherwise null
                in if v = null or v = 98 or v = 99 then null else v
            ),
            each _ <> null
        ),

    IsStraightLine = (vals as list) as logical =>
        if List.Count(vals) < 3 then false
        else List.Count(List.Distinct(vals)) = 1,

    IsSeesaw = (vals as list) as logical =>
        if List.Count(vals) < 4 then false
        else
            let
                pairs = List.Transform({0..List.Count(vals) - 2}, each {vals{_}, vals{_ + 1}}),
                alternating = List.Count(List.Select(pairs, each
                    let a = _{0}, b = _{1}
                    in (a <= 2 and b >= 4) or (a >= 4 and b <= 2)
                ))
            in alternating = List.Count(pairs),

    ExtremeRate = (vals as list) as number =>
        if List.Count(vals) = 0 then 0
        else List.Count(List.Select(vals, each _ = 1 or _ = 5)) / List.Count(vals),

    // ── KEEP KEY + LIKERT + EXTRA COLS FROM DATA ──────────────────────────
    // SurveyStatus_New kept straight from data
    KeyCols = {"instanceID", "NameCode", "SubmissionDate", "Fixed Location", "LocationOn", "apptimemint"},
    KeepCols = List.Combine({KeyCols, AllLikertCols, {"SurveyStatus_New"}}),
    Filtered = Table.SelectColumns(Source, KeepCols, MissingField.Ignore),

    // ── MERGE QA_DASHBOARD (QA_Status, GAP, time range accepted) ─────────
    QA_DB = Table.SelectColumns(
        QA_Dashboard,
        {"instanceID", "QA_Status", "GAP", "time range accepted"},
        MissingField.Ignore
    ),
    MergedQA = Table.NestedJoin(Filtered, {"instanceID"}, QA_DB, {"instanceID"}, "QA_DB_Expand", JoinKind.LeftOuter),
    ExpandedQA = Table.ExpandTableColumn(MergedQA, "QA_DB_Expand", {"QA_Status", "GAP", "time range accepted"}),

    // ── MERGE QA_TIMIGSECTIONS (Full Time All Sections) ───────────────────
    QA_TS = Table.SelectColumns(
        QA_TimingSections,
        {"instanceID", "Full Time All Sections"},
        MissingField.Ignore
    ),
    MergedTS = Table.NestedJoin(ExpandedQA, {"instanceID"}, QA_TS, {"instanceID"}, "QA_TS_Expand", JoinKind.LeftOuter),
    ExpandedTS = Table.ExpandTableColumn(MergedTS, "QA_TS_Expand", {"Full Time All Sections"}),

    // ── MERGE QA_BYGROUPSECTION (Overall_Status) ──────────────────────────
    QA_GS = Table.SelectColumns(
        QA_ByGroupSection,
        {"instanceID", "Overall_Status"},
        MissingField.Ignore
    ),
    MergedGS = Table.NestedJoin(ExpandedTS, {"instanceID"}, QA_GS, {"instanceID"}, "QA_GS_Expand", JoinKind.LeftOuter),
    ExpandedGS = Table.ExpandTableColumn(MergedGS, "QA_GS_Expand", {"Overall_Status"}),

    // ── LIKERT FLAGS ──────────────────────────────────────────────────────
    F1 = Table.AddColumn(ExpandedGS, "FLAG_StraightLine_Trust", each
        let vals = GetValid(_, TrustCols)
        in if IsStraightLine(vals)
           then "✗ Straight-line (" & Text.From(vals{0}) & " repeated " & Text.From(List.Count(vals)) & "x)"
           else "✓ OK", type text),

    F2 = Table.AddColumn(F1, "FLAG_StraightLine_Perception", each
        let vals = GetValid(_, PerceptionCols)
        in if IsStraightLine(vals)
           then "✗ Straight-line (" & Text.From(vals{0}) & " repeated " & Text.From(List.Count(vals)) & "x)"
           else "✓ OK", type text),

    F3 = Table.AddColumn(F2, "FLAG_StraightLine_Expect", each
        let vals = GetValid(_, ExpectCols)
        in if IsStraightLine(vals)
           then "✗ Straight-line (" & Text.From(vals{0}) & " repeated " & Text.From(List.Count(vals)) & "x)"
           else "✓ OK", type text),

    F4 = Table.AddColumn(F3, "FLAG_AllExtreme", each
        let
            vals  = GetValid(_, AllLikertCols),
            cnt   = List.Count(vals),
            cnt1s = List.Count(List.Select(vals, each _ = 1)),
            cnt5s = List.Count(List.Select(vals, each _ = 5))
        in
            if cnt < 5 then "– Not enough rated answers to assess"
            else if cnt1s = cnt then "✗ All 1s (" & Text.From(cnt) & " questions)"
            else if cnt5s = cnt then "✗ All 5s (" & Text.From(cnt) & " questions)"
            else "✓ OK", type text),

    F5 = Table.AddColumn(F4, "FLAG_HighExtremeRate", each
        let
            vals = GetValid(_, AllLikertCols),
            rate = ExtremeRate(vals)
        in
            if List.Count(vals) < 5 then "– Not enough rated answers to assess"
            else if rate > 0.7
            then "✗ " & Text.From(Number.Round(rate * 100, 0)) & "% extreme (1s or 5s)"
            else "✓ OK (" & Text.From(Number.Round(rate * 100, 0)) & "% extreme)", type text),

    // ── NEW: DODGE RATE (twin of HighExtremeRate, for 98/99 only) ─────────
    // % of "Don't know"/"Don't want to answer" among questions actually
    // presented. Blanks are ignored entirely. Warns above 70%.
    F5b = Table.AddColumn(F5, "FLAG_DodgeRate", (row) =>
        let
            nums      = List.Transform(AllLikertCols, each try Number.From(Record.Field(row, _)) otherwise null),
            presented = List.Select(nums, each _ <> null),
            dodges    = List.Select(presented, each _ = 98 or _ = 99),
            total     = List.Count(presented),
            rate      = if total = 0 then 0 else List.Count(dodges) / total
        in
            if total = 0 then "– No answers presented"
            else if rate > 0.7
            then "⚠️ " & Text.From(Number.Round(rate * 100, 0)) & "% don't know / declined"
            else "✓ OK (" & Text.From(Number.Round(rate * 100, 0)) & "% don't know / declined)", type text),

    F6 = Table.AddColumn(F5b, "FLAG_Seesaw_Trust", each
        let vals = GetValid(_, TrustCols)
        in if IsSeesaw(vals)
           then "✗ Seesaw pattern detected"
           else "✓ OK", type text),

    F7 = Table.AddColumn(F6, "FLAG_PercExp_AllMatch", each
        let
            pairs = List.Zip({PerceptionCols, ExpectCols}),
            validCount = List.Count(List.Select(pairs, each
                let
                    p = try Number.From(Record.Field(_, _{0})) otherwise null,
                    e = try Number.From(Record.Field(_, _{1})) otherwise null
                in p <> null and e <> null and p <> 98 and e <> 98
            )),
            matchCount = List.Count(List.Select(pairs, each
                let
                    p = try Number.From(Record.Field(_, _{0})) otherwise null,
                    e = try Number.From(Record.Field(_, _{1})) otherwise null
                in p <> null and e <> null and p <> 98 and e <> 98 and p = e
            ))
        in
            if validCount < 5 then "– Not enough rated answers to assess"
            else if matchCount = validCount
            then "✗ All " & Text.From(validCount) & " perception = expectation pairs match"
            else "✓ OK (" & Text.From(matchCount) & "/" & Text.From(validCount) & " pairs match)", type text),

    // ── SUSPICION SCORE ───────────────────────────────────────────────────
    WithScore = Table.AddColumn(F7, "Suspicion_Score", each
        List.Count(List.Select({
            [FLAG_StraightLine_Trust], [FLAG_StraightLine_Perception],
            [FLAG_StraightLine_Expect], [FLAG_AllExtreme],
            [FLAG_HighExtremeRate], [FLAG_Seesaw_Trust], [FLAG_PercExp_AllMatch]
        }, each Text.StartsWith(_, "✗"))), type number),

    WithLabel = Table.AddColumn(WithScore, "Suspicion_Level", each
        if [Suspicion_Score] = 0      then "✅ Clean"
        else if [Suspicion_Score] = 1 then "⚠️ Low suspicion"
        else if [Suspicion_Score] = 2 then "🔶 Medium suspicion"
        else                               "❌ High suspicion — review", type text),

    WithCount1s = Table.AddColumn(WithLabel, "Count_1s", each
        List.Count(List.Select(GetValid(_, AllLikertCols), each _ = 1)), type number),

    WithCount5s = Table.AddColumn(WithCount1s, "Count_5s", each
        List.Count(List.Select(GetValid(_, AllLikertCols), each _ = 5)), type number),

    WithCountValid = Table.AddColumn(WithCount5s, "Count_Valid_Answers", each
        List.Count(GetValid(_, AllLikertCols)), type number),

    // ── TRANSLATE LIKERT COLUMNS ──────────────────────────────────────────
    TransTrust = List.Accumulate(TrustCols, WithCountValid, (tbl, col) =>
        Table.TransformColumns(tbl, {{col, each GetLabel(_, Map9899), type text}}, null, MissingField.Ignore)),

    TransPerception = List.Accumulate(PerceptionCols, TransTrust, (tbl, col) =>
        Table.TransformColumns(tbl, {{col, each GetLabel(_, MapAgree), type text}}, null, MissingField.Ignore)),

    TransExpect = List.Accumulate(ExpectCols, TransPerception, (tbl, col) =>
        Table.TransformColumns(tbl, {{col, each GetLabel(_, MapImportance), type text}}, null, MissingField.Ignore)),

    TransOther1 = List.Accumulate(
        {"perception_coping", "perception_incontrol", "perception_coverneeds"},
        TransExpect,
        (tbl, col) => Table.TransformColumns(tbl, {{col, each GetLabel(_, Map9899), type text}}, null, MissingField.Ignore)),

    TransOther2 = Table.TransformColumns(TransOther1, {
        {"community_relations", each GetLabel(_, MapPositive), type text}
    }, null, MissingField.Ignore),

    // ── FINAL COLUMN ORDER ────────────────────────────────────────────────
    Final = Table.SelectColumns(TransOther2, {
        "instanceID", "NameCode", "SubmissionDate", "Fixed Location",
        "LocationOn", "apptimemint", "Full Time All Sections",
        "QA_Status", "GAP", "time range accepted", "Overall_Status",
        "Suspicion_Level", "Suspicion_Score",
        "Count_1s", "Count_5s", "Count_Valid_Answers",
        "FLAG_StraightLine_Trust", "FLAG_StraightLine_Perception",
        "FLAG_StraightLine_Expect", "FLAG_AllExtreme",
        "FLAG_HighExtremeRate", "FLAG_DodgeRate", "FLAG_Seesaw_Trust", "FLAG_PercExp_AllMatch",
        "trust_natl_ngo", "trust_civil_soc", "trust_intl_ngo",
        "trust_un", "trust_red_cross", "trust_govt",
        "trust_local_auth", "trust_religion", "trust_community_leaders",
        "perception_consult", "perception_involve", "perception_reach",
        "perception_dignity", "perception_local_power",
        "perception_transparenvy", "perception_communicate",
        "perception_feedback", "perception_action",
        "expect_consult", "expect_involve", "expect_reach",
        "expect_dignity", "expect_local_power", "expect_transparenvy",
        "expect_communicate", "expect_feedback", "expect_action",
        "perception_coping", "perception_incontrol",
        "perception_coverneeds", "community_relations",
        "SurveyStatus_New"
    }),

    Sorted = Table.Sort(Final,{{"Suspicion_Score", Order.Descending}, {"Count_1s", Order.Descending}, {"SubmissionDate", Order.Ascending}})
in
    Sorted