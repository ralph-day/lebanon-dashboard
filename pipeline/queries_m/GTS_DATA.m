let
    Source = Excel.Workbook(File.Contents("C:\Users\moha.issa\OneDrive - UNRWA\Desktop\Ralph GTS\cto\exported data gts\GTS Master sheet.xlsx"), null, true),
    Query1_Sheet = Source{[Item="Query1",Kind="Sheet"]}[Data],
    #"Promoted Headers" = Table.PromoteHeaders(Query1_Sheet, [PromoteAllScalars=true]),
    #"Changed Type" = Table.TransformColumnTypes(#"Promoted Headers",{{"Source.Name", type text}, {"keep", type logical}, {"ID", type text}, {"Comment", type text}, {"loc_1", type text}, {"loc_2", type text}, {"loc_3", type text}, {"loc_4", type text}, {"gender", type text}, {"SubmissionDate", type datetime}, {"KEY", type text}, {"enumerator", type text}, {"status", type text}, {"full_duration", type number}, {"aid_recipient", Int64.Type}, {"duration_check", type text}})
in
    #"Changed Type"