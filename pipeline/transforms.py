"""Python ports of the 9 Power Query transformations from
`Lebanon 2026 - Analysis.xlsx` (M source in queries_m/, extracted from
Moe's .odc files). Each function takes/returns pandas DataFrames; sheet
names and column orders match the workbook exactly — the dashboard
depends on them.

Faithfulness notes:
- Number.Round in M is banker's rounding; Python round() matches.
- Target_Tracker counts `excluded because respondent is not displaced`,
  but the data uses `respondent is not displaced` — so that column is
  always 0. Replicated as-is, bug-for-bug.
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

CONFIG_DIR = Path(__file__).parent / "config"


def load_config():
    overrides = json.loads((CONFIG_DIR / "overrides.json").read_text())
    columns = json.loads((CONFIG_DIR / "columns.json").read_text())
    return overrides, columns


# ──────────────────────────────────────────────────────────────────
# Query: data  (reads Lebanon 2026_WIDE.xlsx)
# ──────────────────────────────────────────────────────────────────

def _parse_cto_datetime(value):
    """Parses SurveyCTO start/end timestamps from either source format:

    - Excel WIDE export: 'Wed Jun 10 2026 15:19:08 GMT+0300 (Eastern
      European Summer Time)' — already in local (Beirut, UTC+3) time. The
      M code drops the weekday and everything from ' GMT' on, then parses
      'Jun 10 2026 15:19:08'.
    - SurveyCTO REST API (json, with `key=` decryption): 'May 19, 2026
      5:11:04 PM' — in UTC, so it needs +3h to match the Excel/local time
      the rest of the pipeline (and overrides.json thresholds) expect.
    """
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None
    s = str(value).strip()
    if " GMT" in s:
        after = s.split(" ", 1)
        if len(after) < 2:
            return None
        core = after[1].split(" GMT", 1)[0].strip()
        try:
            return datetime.strptime(core, "%b %d %Y %H:%M:%S")
        except ValueError:
            return None
    try:
        from datetime import timedelta
        return datetime.strptime(s, "%b %d, %Y %I:%M:%S %p") + timedelta(hours=3)
    except ValueError:
        return None


def _apply_uuid_chain(ids: pd.Series, chain: dict, fallback: pd.Series | str) -> pd.Series:
    """Replicates `if List.Contains({...}) then "v" else if ... else fallback`.
    Earlier groups win, matching M's if/else-if ordering."""
    if isinstance(fallback, pd.Series):
        result = fallback.copy().astype(object)
    else:
        result = pd.Series(fallback, index=ids.index, dtype=object)
    assigned = pd.Series(False, index=ids.index)
    for group in chain["groups"]:
        mask = ids.isin(group["uuids"]) & ~assigned
        result[mask] = group["value"]
        assigned |= mask
    return result


def data_query(wide: pd.DataFrame, overrides: dict, column_order: list[str]) -> pd.DataFrame:
    df = wide.copy()
    df["SubmissionDate"] = pd.to_datetime(df["SubmissionDate"])

    # surveytype: Testing before the cutoff or for listed uuids, else Real
    cutoff = pd.Timestamp(overrides["testing_cutoff"])
    df["surveytype"] = np.where(
        (df["SubmissionDate"] < cutoff) | df["instanceID"].isin(overrides["testing_uuids"]),
        "Testing", "Real",
    )

    # NameCode from enumerator code
    df["NameCode"] = df["enumerator"].map(overrides["enumerator_namecode"])

    # AppTime (minutes) from start/end; apptimemint = round(AppTime, 2)
    start = df["start"].map(_parse_cto_datetime)
    end = df["end"].map(_parse_cto_datetime)
    df["AppTime"] = [
        (e - s).total_seconds() / 60 if (s is not None and e is not None) else None
        for s, e in zip(start, end)
    ]
    df["apptimemint"] = df["AppTime"].map(lambda v: round(v, 2) if v is not None else None)

    # LocationOn from GPS latitude
    df["LocationOn"] = np.where(df["gps-Latitude"].notna(), "Yes", "No")

    # Fixed Location: per-uuid camp overrides, else loc_4; beddaoui typo fix
    df["Fixed Location"] = _apply_uuid_chain(
        df["instanceID"], overrides["fixed_location"], df["loc_4"]
    )
    df["Fixed Location"] = df["Fixed Location"].replace(overrides["fixed_location_replacements"])

    # Status: first chain becomes OldRejectedStatus, second is SurveyStatus_New
    df["OldRejectedStatus"] = _apply_uuid_chain(
        df["instanceID"], overrides["old_status"], overrides["old_status"]["fallback"]
    )
    df["SurveyStatus_New"] = _apply_uuid_chain(
        df["instanceID"].astype(str).str.strip(), overrides["new_status"],
        overrides["new_status"]["fallback"],
    )

    # Final sort (stable, matching the M sort sequence) and filter
    df = df.sort_values(["SubmissionDate", "NameCode"], ascending=[True, True], kind="stable")
    df = df.sort_values("NameCode", ascending=True, kind="stable")
    df = df[df["surveytype"] == "Real"]

    missing = [c for c in column_order if c not in df.columns]
    if missing:
        raise ValueError(f"data query: WIDE input lacks expected columns: {missing[:8]}")
    return df[column_order].reset_index(drop=True)


# ──────────────────────────────────────────────────────────────────
# Query: GTS DATA  (reads GTS Master sheet / Google Sheet "Query1")
# ──────────────────────────────────────────────────────────────────

def gts_query(gts: pd.DataFrame, column_order: list[str]) -> pd.DataFrame:
    df = gts.copy()
    df["SubmissionDate"] = pd.to_datetime(df["SubmissionDate"], errors="coerce")
    for col in ("full_duration",):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return df[column_order].reset_index(drop=True)


# ──────────────────────────────────────────────────────────────────
# Query: QA_TimingSections
# ──────────────────────────────────────────────────────────────────

def qa_timing_sections(data: pd.DataFrame, column_order: list[str]) -> pd.DataFrame:
    df = data.sort_values("SubmissionDate", ascending=False, kind="stable").copy()
    df["Full Time All Sections"] = df["time_demo"] + df["time_main"]
    df["TimeApp minus TimeMain"] = df["apptimemint"] - df["Full Time All Sections"]
    df["GAP"] = np.where(df["TimeApp minus TimeMain"] > 20, "App left open / long pause", "OK")
    df["time range accepted"] = np.where(df["Full Time All Sections"] < 19, "Below 19 mins", "OK")
    return df[column_order].reset_index(drop=True)


# ──────────────────────────────────────────────────────────────────
# Query: QA_Dashboard
# ──────────────────────────────────────────────────────────────────

def qa_dashboard(qa_timing: pd.DataFrame, data: pd.DataFrame, column_order: list[str]) -> pd.DataFrame:
    df = qa_timing.copy()
    full = df["Full Time All Sections"]

    df["FLAG_TooFast"] = np.where(full < 19, "✗ Too Fast", "✓ OK")
    df["FLAG_TooSlow"] = np.where(full > 90, "✗ Too Slow", "✓ OK")
    df["FLAG_AppLeftOpen"] = np.where(df["GAP"] == "App left open / long pause", "✗ App Left Open", "✓ OK")
    df["FLAG_BelowRange"] = np.where(df["time range accepted"] == "Below 19 mins", "✗ Below Range", "✓ OK")

    # LocationOn + SurveyStatus_New re-joined fresh from data
    df = df.drop(columns=["SurveyStatus_New"], errors="ignore")
    gps = data[["instanceID", "LocationOn", "SurveyStatus_New"]]
    df = df.merge(gps, on="instanceID", how="left")

    df["FLAG_MissingGPS"] = np.where(
        (df["LocationOn"] == "No") | df["LocationOn"].isna(), "✗ Missing GPS", "✓ OK"
    )

    flag_cols = ["FLAG_TooFast", "FLAG_TooSlow", "FLAG_AppLeftOpen", "FLAG_BelowRange", "FLAG_MissingGPS"]
    df["Total_Flags"] = sum((df[c].str.startswith("✗")).astype(int) for c in flag_cols)
    df["QA_Status"] = np.select(
        [df["Total_Flags"] == 0, df["Total_Flags"] == 1],
        ["✅ PASS", "⚠️ REVIEW"],
        default="❌ FAIL",
    )
    return df[column_order].reset_index(drop=True)


# ──────────────────────────────────────────────────────────────────
# Query: QA_ByGroupSection
# ──────────────────────────────────────────────────────────────────

THRESHOLDS = [
    ("time_demo", 3.0, 11.0),
    ("time_priorities", 2.5, 5.0),
    ("time_mutualaid", 1.5, 2.5),
    ("time_access_trust", 2.0, 3.5),
    ("time_expectations", 5.0, 17.0),
    ("time_info", 3.0, 8.5),
    ("time_future", 3.0, 6.5),
]


def _section_category(minutes, low, high):
    if minutes is None:
        return "Missing"
    if minutes < low * 0.50:
        return "Very fast"
    if minutes < low * 0.75:
        return "Too fast"
    if minutes < low:
        return "A bit fast"
    if minutes <= high:
        return "Normal"
    if minutes <= high * 1.25:
        return "Slightly long"
    if minutes <= high * 1.75:
        return "Short pause"
    if minutes <= high * 2.50:
        return "Long pause"
    return "Very long pause"


def _to_minutes(value):
    try:
        if value is None or (isinstance(value, float) and np.isnan(value)):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _format_section(value, low, high):
    minutes = _to_minutes(value)
    if minutes is None:
        return "Missing"
    category = _section_category(minutes, low, high)
    shown = f"{round(minutes, 2):.2f}"
    if category == "Normal":
        return f"{shown} min | Normal"
    if minutes < low:
        return f"{shown} min | {category} ↓ {round(low - minutes, 2):.2f} min"
    return f"{shown} min | {category} ↑ {round(minutes - high, 2):.2f} min"


def qa_by_group_section(data: pd.DataFrame, column_order: list[str]) -> pd.DataFrame:
    df = data.copy()

    def overall_status(row):
        too_fast = sum(
            1 for col, low, _ in THRESHOLDS
            if (m := _to_minutes(row[col])) is not None and m < low
        )
        above = sum(
            1 for col, _, high in THRESHOLDS
            if (m := _to_minutes(row[col])) is not None and m > high
        )
        if too_fast >= 2 and above >= 2:
            return "Review - fast and above expected sections"
        if too_fast >= 2:
            return "Review - multiple fast sections"
        if above >= 2:
            return "Review - multiple above expected sections"
        return "OK"

    df["Overall_Status"] = df.apply(overall_status, axis=1)
    for col, low, high in THRESHOLDS:
        df[col] = df[col].map(lambda v: _format_section(v, low, high))
    return df[column_order].reset_index(drop=True)


# ──────────────────────────────────────────────────────────────────
# Query: Query_All_Rules
# ──────────────────────────────────────────────────────────────────

TRUST_COLS = ["trust_natl_ngo", "trust_civil_soc", "trust_intl_ngo", "trust_un",
              "trust_red_cross", "trust_govt", "trust_local_auth", "trust_religion",
              "trust_community_leaders"]
PERCEPTION_COLS = ["perception_consult", "perception_involve", "perception_reach",
                   "perception_dignity", "perception_local_power", "perception_transparenvy",
                   "perception_communicate", "perception_feedback", "perception_action"]
EXPECT_COLS = ["expect_consult", "expect_involve", "expect_reach", "expect_dignity",
               "expect_local_power", "expect_transparenvy", "expect_communicate",
               "expect_feedback", "expect_action"]
OTHER_LIKERT = ["perception_coping", "perception_incontrol", "perception_coverneeds",
                "community_relations"]
ALL_LIKERT = TRUST_COLS + PERCEPTION_COLS + EXPECT_COLS + OTHER_LIKERT

MAP_9899 = {1: "1 - Not at all", 2: "2 - Not really", 3: "3 - Somewhat",
            4: "4 - Mostly yes", 5: "5 - Yes completely",
            98: "98 - Don't know", 99: "99 - Don't want to answer"}
MAP_AGREE = {1: "1 - Strongly disagree", 2: "2 - Disagree",
             3: "3 - Neither agree nor disagree", 4: "4 - Agree", 5: "5 - Strongly agree",
             98: "98 - Don't know", 99: "99 - Don't want to answer"}
MAP_IMPORTANCE = {1: "1 - Not important at all", 2: "2 - Not very important",
                  3: "3 - Somewhat important", 4: "4 - Very important",
                  5: "5 - Extremely important",
                  98: "98 - Don't know", 99: "99 - Don't want to answer"}
MAP_POSITIVE = {1: "1 - Very tense", 2: "2 - Often tense", 3: "3 - Mixed",
                4: "4 - Mostly positive", 5: "5 - Very positive",
                98: "98 - Don't know", 99: "99 - Don't want to answer"}


def _num(value):
    try:
        if value is None or (isinstance(value, float) and np.isnan(value)):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _get_label(value, mapping):
    n = _num(value)
    if n is None:
        return "Missing"
    key = int(n)
    if key in mapping:
        return mapping[key]
    return str(value)


def _valid_values(row, cols):
    vals = []
    for c in cols:
        v = _num(row[c])
        if v is not None and v not in (98.0, 99.0):
            vals.append(v)
    return vals


def _fmt_count(n: float) -> str:
    """Text.From on a whole number prints no decimals."""
    return str(int(n)) if float(n).is_integer() else str(n)


def query_all_rules(data: pd.DataFrame, qa_dash: pd.DataFrame, qa_timing: pd.DataFrame,
                    qa_group: pd.DataFrame, column_order: list[str]) -> pd.DataFrame:
    key_cols = ["instanceID", "NameCode", "SubmissionDate", "Fixed Location", "LocationOn", "apptimemint"]
    df = data[key_cols + ALL_LIKERT + ["SurveyStatus_New"]].copy()

    df = df.merge(qa_dash[["instanceID", "QA_Status", "GAP", "time range accepted"]],
                  on="instanceID", how="left")
    df = df.merge(qa_timing[["instanceID", "Full Time All Sections"]], on="instanceID", how="left")
    df = df.merge(qa_group[["instanceID", "Overall_Status"]], on="instanceID", how="left")

    def straightline_flag(row, cols):
        vals = _valid_values(row, cols)
        if len(vals) >= 3 and len(set(vals)) == 1:
            return f"✗ Straight-line ({_fmt_count(vals[0])} repeated {len(vals)}x)"
        return "✓ OK"

    df["FLAG_StraightLine_Trust"] = df.apply(lambda r: straightline_flag(r, TRUST_COLS), axis=1)
    df["FLAG_StraightLine_Perception"] = df.apply(lambda r: straightline_flag(r, PERCEPTION_COLS), axis=1)
    df["FLAG_StraightLine_Expect"] = df.apply(lambda r: straightline_flag(r, EXPECT_COLS), axis=1)

    def all_extreme(row):
        vals = _valid_values(row, ALL_LIKERT)
        cnt = len(vals)
        if cnt < 5:
            return "– Not enough rated answers to assess"
        ones = sum(1 for v in vals if v == 1)
        fives = sum(1 for v in vals if v == 5)
        if ones == cnt:
            return f"✗ All 1s ({cnt} questions)"
        if fives == cnt:
            return f"✗ All 5s ({cnt} questions)"
        return "✓ OK"

    df["FLAG_AllExtreme"] = df.apply(all_extreme, axis=1)

    def high_extreme(row):
        vals = _valid_values(row, ALL_LIKERT)
        if len(vals) < 5:
            return "– Not enough rated answers to assess"
        rate = sum(1 for v in vals if v in (1.0, 5.0)) / len(vals)
        pct = _fmt_count(round(rate * 100, 0))
        if rate > 0.7:
            return f"✗ {pct}% extreme (1s or 5s)"
        return f"✓ OK ({pct}% extreme)"

    df["FLAG_HighExtremeRate"] = df.apply(high_extreme, axis=1)

    def dodge_rate(row):
        nums = [_num(row[c]) for c in ALL_LIKERT]
        presented = [v for v in nums if v is not None]
        if not presented:
            return "– No answers presented"
        dodges = [v for v in presented if v in (98.0, 99.0)]
        rate = len(dodges) / len(presented)
        pct = _fmt_count(round(rate * 100, 0))
        if rate > 0.7:
            return f"⚠️ {pct}% don't know / declined"
        return f"✓ OK ({pct}% don't know / declined)"

    df["FLAG_DodgeRate"] = df.apply(dodge_rate, axis=1)

    def seesaw(row):
        vals = _valid_values(row, TRUST_COLS)
        if len(vals) < 4:
            return "✓ OK"
        pairs = list(zip(vals, vals[1:]))
        alternating = sum(1 for a, b in pairs if (a <= 2 and b >= 4) or (a >= 4 and b <= 2))
        return "✗ Seesaw pattern detected" if alternating == len(pairs) else "✓ OK"

    df["FLAG_Seesaw_Trust"] = df.apply(seesaw, axis=1)

    # The M version of this flag is broken: inside its List.Select, `_` is
    # the {perception, expect} column-name PAIR (a list, not the row record),
    # so Record.Field(_, _{0}) always errors into the `try ... otherwise
    # null` and validCount is always 0 — every row gets "not enough rated
    # answers". Replicated bug-for-bug so output matches the workbook; the
    # correct logic is preserved below for the day Moe fixes the M.
    df["FLAG_PercExp_AllMatch"] = "– Not enough rated answers to assess"

    def perc_exp_match_fixed(row):  # noqa: F841 — intentionally unused
        valid = match = 0
        for p_col, e_col in zip(PERCEPTION_COLS, EXPECT_COLS):
            p, e = _num(row[p_col]), _num(row[e_col])
            if p is not None and e is not None and p != 98.0 and e != 98.0:
                valid += 1
                if p == e:
                    match += 1
        if valid < 5:
            return "– Not enough rated answers to assess"
        if match == valid:
            return f"✗ All {valid} perception = expectation pairs match"
        return f"✓ OK ({match}/{valid} pairs match)"

    suspicion_flags = ["FLAG_StraightLine_Trust", "FLAG_StraightLine_Perception",
                       "FLAG_StraightLine_Expect", "FLAG_AllExtreme",
                       "FLAG_HighExtremeRate", "FLAG_Seesaw_Trust", "FLAG_PercExp_AllMatch"]
    df["Suspicion_Score"] = sum((df[c].str.startswith("✗")).astype(int) for c in suspicion_flags)
    df["Suspicion_Level"] = np.select(
        [df["Suspicion_Score"] == 0, df["Suspicion_Score"] == 1, df["Suspicion_Score"] == 2],
        ["✅ Clean", "⚠️ Low suspicion", "🔶 Medium suspicion"],
        default="❌ High suspicion — review",
    )
    df["Count_1s"] = df.apply(lambda r: sum(1 for v in _valid_values(r, ALL_LIKERT) if v == 1), axis=1)
    df["Count_5s"] = df.apply(lambda r: sum(1 for v in _valid_values(r, ALL_LIKERT) if v == 5), axis=1)
    df["Count_Valid_Answers"] = df.apply(lambda r: len(_valid_values(r, ALL_LIKERT)), axis=1)

    for col in TRUST_COLS:
        df[col] = df[col].map(lambda v: _get_label(v, MAP_9899))
    for col in PERCEPTION_COLS:
        df[col] = df[col].map(lambda v: _get_label(v, MAP_AGREE))
    for col in EXPECT_COLS:
        df[col] = df[col].map(lambda v: _get_label(v, MAP_IMPORTANCE))
    for col in ["perception_coping", "perception_incontrol", "perception_coverneeds"]:
        df[col] = df[col].map(lambda v: _get_label(v, MAP_9899))
    df["community_relations"] = df["community_relations"].map(lambda v: _get_label(v, MAP_POSITIVE))

    df = df.sort_values(["Suspicion_Score", "Count_1s", "SubmissionDate"],
                        ascending=[False, False, True], kind="stable")
    return df[column_order].reset_index(drop=True)


# ──────────────────────────────────────────────────────────────────
# Query: Enumerator_Summary
# ──────────────────────────────────────────────────────────────────

def enumerator_summary(qa_dash: pd.DataFrame, column_order: list[str]) -> pd.DataFrame:
    rows = []
    # M groups the data query, which is NameCode-ascending — so ties on
    # Total_Surveys stay alphabetical after the stable sort below.
    for name_code, g in qa_dash.groupby("NameCode", dropna=False, sort=True):
        total = len(g)
        too_fast = int((g["Full Time All Sections"] < 19).sum())
        too_slow = int((g["Full Time All Sections"] > 90).sum())
        rows.append({
            "NameCode": name_code,
            "Total_Surveys": total,
            "Avg_Duration": round(g["apptimemint"].mean(), 1),
            "Min_Duration": round(g["apptimemint"].min(), 1),
            "Max_Duration": round(g["apptimemint"].max(), 1),
            "Too_Fast": too_fast,
            "Too_Slow": too_slow,
            "App_Left_Open": int((g["GAP"] == "App left open / long pause").sum()),
            "Missing_GPS": int((g["LocationOn"] == "No").sum()),
            "Last_Submission": g["SubmissionDate"].max(),
            "Quality_%": 0 if total == 0 else round((total - too_fast - too_slow) / total, 3),
        })
    df = pd.DataFrame(rows).sort_values("Total_Surveys", ascending=False, kind="stable")
    return df[column_order].reset_index(drop=True)


# ──────────────────────────────────────────────────────────────────
# Query: Target_Tracker
# ──────────────────────────────────────────────────────────────────

def target_tracker(data: pd.DataFrame, target: pd.DataFrame, column_order: list[str]) -> pd.DataFrame:
    src = data.drop_duplicates(subset="instanceID", keep="first")
    src = src.assign(join_key=src["Fixed Location"].astype(str).str.strip().str.lower())

    accepted = src[src["SurveyStatus_New"] == "accepted"]
    rejected = src[src["SurveyStatus_New"] != "accepted"]

    def counts(frame, col_name):
        return frame.groupby("join_key").size().rename(col_name)

    def joined_distinct(series_col):
        def agg(values):
            uniques = []
            for v in values:
                if pd.isna(v):
                    continue
                s = str(v).strip()
                if s and s not in uniques:
                    uniques.append(s)
            return ", ".join(uniques)
        return src.groupby("join_key")[series_col].apply(agg)

    tgt = target[["location", "target"]].copy()
    tgt = tgt[tgt["location"].notna() & (tgt["location"].astype(str).str.strip() != "")]
    tgt["join_key"] = tgt["location"].astype(str).str.strip().str.lower()
    tgt["target"] = pd.to_numeric(tgt["target"], errors="coerce").fillna(0).astype(int)

    out = tgt.set_index("join_key")
    out["loc_2"] = joined_distinct("loc_2")
    out["loc_3"] = joined_distinct("loc_3")
    out["Completed"] = counts(src, "Completed")
    out["Accepted"] = counts(accepted, "Accepted")
    out["LocationOn"] = accepted[accepted["gps-Latitude"].notna()].groupby("join_key").size()
    for label, col in [("man", "man"), ("woman", "woman")]:
        out[col] = accepted[accepted["gender"].astype(str).str.strip().str.lower() == label].groupby("join_key").size()
    for label, col in [("palestinian", "Palestinian"), ("lebanese", "Lebanese"), ("syrian", "Syrian")]:
        out[col] = accepted[accepted["nationality"].astype(str).str.strip().str.lower() == label].groupby("join_key").size()
    out["Rejected"] = counts(rejected, "Rejected")
    for status, col in [("too_short", "too_short"), ("too_close", "too_close"),
                        ("wrong_nationality", "wrong_nationality"), ("ITP", "ITP"),
                        ("testing", "testing"),
                        ("excluded because respondent is not displaced", "excluded_not_displaced")]:
        out[col] = counts(src[src["SurveyStatus_New"] == status], col)

    int_cols = ["Completed", "Accepted", "Rejected", "too_short", "too_close",
                "wrong_nationality", "ITP", "testing", "excluded_not_displaced",
                "LocationOn", "man", "woman", "Palestinian", "Lebanese", "Syrian"]
    out[int_cols] = out[int_cols].fillna(0).astype(int)
    out[["loc_2", "loc_3"]] = out[["loc_2", "loc_3"]].fillna("")

    out["Remaining"] = out["target"] - out["Completed"]
    out["Actual Remaining"] = out["target"] - out["Accepted"]
    out["Pct_Complete"] = np.where(out["target"] == 0, 0,
                                   (out["Accepted"] / out["target"].replace(0, np.nan)).round(3))
    out["Status"] = np.select(
        [out["Pct_Complete"] >= 1, out["Pct_Complete"] >= 0.75,
         out["Pct_Complete"] >= 0.5, out["Pct_Complete"] > 0],
        ["✅ Complete", "🟢 On Track", "🟡 In Progress", "🟠 Started"],
        default="🔴 Not Started",
    )

    def bar(pct):
        pct = min(1, max(0, pct))
        filled = int(np.floor(pct * 20))
        return "█" * filled + "░" * (20 - filled)

    out["Progress_Bar"] = out["Pct_Complete"].map(bar)
    out["LocationOn_Pct"] = np.where(out["Accepted"] == 0, 0,
                                     (out["LocationOn"] / out["Accepted"].replace(0, np.nan)).round(3))

    out = out.reset_index(drop=True)
    out = out.sort_values(["Pct_Complete", "target"], ascending=[False, False], kind="stable")
    return out[column_order].reset_index(drop=True)


# ──────────────────────────────────────────────────────────────────
# Query: Survey Comparison
# ──────────────────────────────────────────────────────────────────

def survey_comparison(data: pd.DataFrame, qa_dash: pd.DataFrame, gts: pd.DataFrame,
                      column_order: list[str]) -> pd.DataFrame:
    data_cols = data[["SurveyStatus_New", "instanceID", "NameCode", "Fixed Location",
                      "LocationOn", "surveytype", "apptimemint", "AppTime", "enumerator",
                      "SubmissionDate", "start", "end", "loc_1", "loc_2", "loc_3", "loc_4",
                      "sampling_source", "gps-Latitude", "gps-Longitude", "gps-Altitude",
                      "gps-Accuracy"]].copy()
    qa_cols = qa_dash[["instanceID", "Full Time All Sections", "QA_Status"]]
    df = data_cols.merge(qa_cols, on="instanceID", how="left")

    gts_cols = gts[["keep", "ID", "Comment", "loc_1", "loc_2", "loc_3", "loc_4", "gender",
                    "SubmissionDate", "KEY", "enumerator", "status", "full_duration",
                    "aid_recipient", "duration_check"]].copy()
    gts_cols.columns = [f"GTS_{c}" for c in gts_cols.columns]
    df = df.merge(gts_cols, left_on="instanceID", right_on="GTS_KEY", how="left")

    def match_comment(row):
        if pd.isna(row["GTS_KEY"]):
            return "Not Available in GTS Data"
        comment = row["GTS_Comment"]
        if pd.isna(comment) or comment == "":
            return row["GTS_keep"]
        return comment

    df["GTS_Match_Comment"] = df.apply(match_comment, axis=1)
    # Column mixes booleans (from GTS keep) and text; Power Query sorts
    # null < logical < text, so emulate that type-ranked ordering.
    def sort_key(v):
        if pd.isna(v):
            return (0, "")
        if isinstance(v, (bool, np.bool_)):
            return (1, str(bool(v)))
        return (2, str(v))

    df = df.sort_values("GTS_Match_Comment", ascending=True, kind="stable", key=lambda s: s.map(sort_key))
    return df[column_order].reset_index(drop=True)


# ──────────────────────────────────────────────────────────────────
# Orchestrator
# ──────────────────────────────────────────────────────────────────

def run_all(wide: pd.DataFrame, gts_raw: pd.DataFrame, target: pd.DataFrame) -> dict[str, pd.DataFrame]:
    """WIDE survey export + raw GTS rows + Target sheet → all 9 output frames,
    keyed by their exact workbook sheet names."""
    overrides, columns = load_config()

    data = data_query(wide, overrides, columns["data"])
    gts = gts_query(gts_raw, columns["GTS DATA"])
    qa_timing = qa_timing_sections(data, columns["QA_TimingSections"])
    qa_dash = qa_dashboard(qa_timing, data, columns["QA_Dashboard"])
    qa_group = qa_by_group_section(data, columns["QA_ByGroupSection"])
    all_rules = query_all_rules(data, qa_dash, qa_timing, qa_group, columns["Query_All_Rules"])
    enum_summary = enumerator_summary(qa_dash, columns["Enumerator_Summary"])
    tracker = target_tracker(data, target, columns["Target_Tracker"])
    comparison = survey_comparison(data, qa_dash, gts, columns["Survey Comparison"])

    return {
        "data": data,
        "GTS DATA": gts,
        "QA_TimingSections": qa_timing,
        "QA_Dashboard": qa_dash,
        "QA_ByGroupSection": qa_group,
        "Query_All_Rules": all_rules,
        "Enumerator_Summary": enum_summary,
        "Target_Tracker": tracker,
        "Survey Comparison": comparison,
    }
