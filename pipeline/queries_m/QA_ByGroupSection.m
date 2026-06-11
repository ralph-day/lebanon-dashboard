let
    Source = #"data",

    // Keep only the requested identification columns
    BasicColumns = {
        "instanceID",
        "NameCode",
        "Fixed Location",
        "LocationOn",
        "apptimemint",
        "SubmissionDate"
    },

    // Expected timing ranges in minutes for each questionnaire group
    Thresholds = {
        [Column = "time_demo",         Low = 3.0, High = 11.0],
        [Column = "time_priorities",   Low = 2.5, High = 5.0],
        [Column = "time_mutualaid",    Low = 1.5, High = 2.5],
        [Column = "time_access_trust", Low = 2.0, High = 3.5],
        [Column = "time_expectations", Low = 5.0, High = 17.0],
        [Column = "time_info",         Low = 3.0, High = 8.5],
        [Column = "time_future",       Low = 3.0, High = 6.5]
    },

    SectionColumns = List.Transform(
        Thresholds,
        each _[Column]
    ),

    // Keep basic + section columns + SurveyStatus_New (straight from data)
    ColumnsToKeep = List.Combine({
        BasicColumns,
        SectionColumns,
        {"SurveyStatus_New"}
    }),

    // Keep only the requested columns
    KeptColumns = Table.SelectColumns(
        Source,
        ColumnsToKeep,
        MissingField.Ignore
    ),

    // Detailed category for each section
    SectionCategory = (
        Value as any,
        Low as number,
        High as number
    ) as text =>
        let
            Minutes = try Number.From(Value) otherwise null
        in
            if Minutes = null then
                "Missing"
            else if Minutes < Low * 0.50 then
                "Very fast"
            else if Minutes < Low * 0.75 then
                "Too fast"
            else if Minutes < Low then
                "A bit fast"
            else if Minutes <= High then
                "Normal"
            else if Minutes <= High * 1.25 then
                "Slightly long"
            else if Minutes <= High * 1.75 then
                "Short pause"
            else if Minutes <= High * 2.50 then
                "Long pause"
            else
                "Very long pause",

    // Overall status: keep the original agreed logic unchanged
    AddedOverallStatus = Table.AddColumn(
        KeptColumns,
        "Overall_Status",
        (CurrentRow) =>
            let
                TooFastCount =
                    List.Count(
                        List.Select(
                            Thresholds,
                            (CurrentThreshold) =>
                                let
                                    Minutes =
                                        try Number.From(
                                            Record.Field(
                                                CurrentRow,
                                                CurrentThreshold[Column]
                                            )
                                        )
                                        otherwise null
                                in
                                    Minutes <> null
                                    and Minutes < CurrentThreshold[Low]
                        )
                    ),

                AboveExpectedCount =
                    List.Count(
                        List.Select(
                            Thresholds,
                            (CurrentThreshold) =>
                                let
                                    Minutes =
                                        try Number.From(
                                            Record.Field(
                                                CurrentRow,
                                                CurrentThreshold[Column]
                                            )
                                        )
                                        otherwise null
                                in
                                    Minutes <> null
                                    and Minutes > CurrentThreshold[High]
                        )
                    )
            in
                if TooFastCount >= 2 and AboveExpectedCount >= 2 then
                    "Review - fast and above expected sections"
                else if TooFastCount >= 2 then
                    "Review - multiple fast sections"
                else if AboveExpectedCount >= 2 then
                    "Review - multiple above expected sections"
                else
                    "OK",
        type text
    ),

    // Show actual minutes, category, arrow, and difference in the same cell
    FormatSection = (
        Value as any,
        Low as number,
        High as number
    ) as text =>
        let
            Minutes = try Number.From(Value) otherwise null,
            Category = SectionCategory(Value, Low, High),

            Difference =
                if Minutes = null then
                    null
                else if Minutes < Low then
                    Low - Minutes
                else if Minutes > High then
                    Minutes - High
                else
                    0
        in
            if Minutes = null then
                "Missing"
            else if Category = "Normal" then
                Number.ToText(
                    Number.Round(Minutes, 2),
                    "0.00"
                )
                & " min | Normal"
            else if Minutes < Low then
                Number.ToText(
                    Number.Round(Minutes, 2),
                    "0.00"
                )
                & " min | "
                & Category
                & " ↓ "
                & Number.ToText(
                    Number.Round(Difference, 2),
                    "0.00"
                )
                & " min"
            else
                Number.ToText(
                    Number.Round(Minutes, 2),
                    "0.00"
                )
                & " min | "
                & Category
                & " ↑ "
                & Number.ToText(
                    Number.Round(Difference, 2),
                    "0.00"
                )
                & " min",

    // Replace each timing value with the readable result
    FormattedSectionColumns = List.Accumulate(
        Thresholds,
        AddedOverallStatus,
        (CurrentTable, CurrentThreshold) =>
            Table.TransformColumns(
                CurrentTable,
                {
                    {
                        CurrentThreshold[Column],
                        each FormatSection(
                            _,
                            CurrentThreshold[Low],
                            CurrentThreshold[High]
                        ),
                        type text
                    }
                },
                null,
                MissingField.Ignore
            )
    ),

    // Final clean column order — SurveyStatus_New kept last, like before
    FinalColumnOrder = List.Combine({
        BasicColumns,
        SectionColumns,
        {"Overall_Status", "SurveyStatus_New"}
    }),

    ReorderedColumns = Table.ReorderColumns(
        FormattedSectionColumns,
        List.Select(
            FinalColumnOrder,
            each List.Contains(
                Table.ColumnNames(FormattedSectionColumns),
                _
            )
        ),
        MissingField.Ignore
    )
in
    ReorderedColumns