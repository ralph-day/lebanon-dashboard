let
    // Load Data sheet
    DataSheet = Excel.CurrentWorkbook(){[Name="Data"]}[Content],
    DataCols = Table.SelectColumns(DataSheet, {
        "SurveyStatus_New", "instanceID", "NameCode", "Fixed Location", 
        "LocationOn", "surveytype", "apptimemint", "AppTime", "enumerator", 
        "SubmissionDate", "start", "end", "loc_1", "loc_2", "loc_3", "loc_4", 
        "sampling_source", "gps-Latitude", "gps-Longitude", "gps-Altitude", "gps-Accuracy"
    }),

    // Load QA_Dashboard sheet
    QASheet = Excel.CurrentWorkbook(){[Name="QA_Dashboard"]}[Content],
    QACols = Table.SelectColumns(QASheet, {
        "instanceID", "apptimemint", "Full Time All Sections", "QA_Status"
    }),

    // Reference existing GTS DATA query directly
    GTSCols = Table.SelectColumns(#"GTS DATA", {
        "keep", "ID", "Comment", "loc_1", "loc_2", "loc_3", "loc_4", 
        "gender", "SubmissionDate", "KEY", "enumerator", "status", 
        "full_duration", "aid_recipient", "duration_check"
    }),

    // Merge Data with QA on instanceID
    MergeQA = Table.NestedJoin(DataCols, "instanceID", QACols, "instanceID", "QA", JoinKind.LeftOuter),
    ExpandQA = Table.ExpandTableColumn(MergeQA, "QA", {"Full Time All Sections", "QA_Status"}),

    // Merge with GTS DATA on instanceID = KEY
    MergeGTS = Table.NestedJoin(ExpandQA, "instanceID", GTSCols, "KEY", "GTS", JoinKind.LeftOuter),
    ExpandGTS = Table.ExpandTableColumn(MergeGTS, "GTS", {
        "keep", "ID", "Comment", "loc_1", "loc_2", "loc_3", "loc_4",
        "gender", "SubmissionDate", "KEY", "enumerator", "status",
        "full_duration", "aid_recipient", "duration_check"
    }, {
        "GTS_keep", "GTS_ID", "GTS_Comment", "GTS_loc_1", "GTS_loc_2", "GTS_loc_3", "GTS_loc_4",
        "GTS_gender", "GTS_SubmissionDate", "GTS_KEY", "GTS_enumerator", "GTS_status",
        "GTS_full_duration", "GTS_aid_recipient", "GTS_duration_check"
    }),

    // Add Comment column - use keep if Comment is empty, flag if not in GTS
    AddComment = Table.AddColumn(ExpandGTS, "GTS_Match_Comment", each 
        if [GTS_KEY] = null then "Not Available in GTS Data"
        else if [GTS_Comment] = null or [GTS_Comment] = "" then [GTS_keep]
        else [GTS_Comment]
    ),
    #"Reordered Columns" = Table.ReorderColumns(AddComment,{"GTS_Match_Comment", "SurveyStatus_New", "instanceID", "NameCode", "Fixed Location", "LocationOn", "surveytype", "apptimemint", "AppTime", "enumerator", "SubmissionDate", "start", "end", "loc_1", "loc_2", "loc_3", "loc_4", "sampling_source", "gps-Latitude", "gps-Longitude", "gps-Altitude", "gps-Accuracy", "Full Time All Sections", "QA_Status", "GTS_keep", "GTS_ID", "GTS_Comment", "GTS_loc_1", "GTS_loc_2", "GTS_loc_3", "GTS_loc_4", "GTS_gender", "GTS_SubmissionDate", "GTS_KEY", "GTS_enumerator", "GTS_status", "GTS_full_duration", "GTS_aid_recipient", "GTS_duration_check"}),
    #"Sorted Rows" = Table.Sort(#"Reordered Columns",{{"GTS_Match_Comment", Order.Ascending}})

in
    #"Sorted Rows"