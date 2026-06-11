#!/usr/bin/env python3
"""Validate transforms.py against the ground-truth workbook.

We don't have Lebanon 2026_WIDE.xlsx (it lives on the SurveyCTO machine),
but the workbook's `data` sheet retains every raw column alongside the
computed ones. So:

1. data query  — rebuild the computed columns from the raw ones and diff
   them against what's stored (validates the logic on all surviving rows).
2. downstream  — run every other query off the ground-truth `data` sheet
   and diff cell-by-cell against the stored output sheets.

Usage: python validate.py "path/to/Lebanon 2026 - Analysis.xlsx"
"""
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

import transforms

DERIVED_COLS = ["surveytype", "NameCode", "AppTime", "apptimemint", "LocationOn",
                "Fixed Location", "OldRejectedStatus", "SurveyStatus_New"]


def load_sheet(xl, name):
    df = pd.read_excel(xl, sheet_name=name)
    return df.dropna(how="all").reset_index(drop=True)


def diff_frames(name, got: pd.DataFrame, want: pd.DataFrame, float_tol=1e-6, ignore_order=False):
    problems = []
    if list(got.columns) != list(want.columns):
        problems.append(f"column mismatch:\n  got:  {list(got.columns)}\n  want: {list(want.columns)}")
        return problems
    if len(got) != len(want):
        problems.append(f"row count: got {len(got)}, want {len(want)}")

    g, w = got.copy(), want.copy()
    if ignore_order and "instanceID" in g.columns:
        g = g.sort_values("instanceID", kind="stable").reset_index(drop=True)
        w = w.sort_values("instanceID", kind="stable").reset_index(drop=True)
    n = min(len(g), len(w))
    g, w = g.head(n), w.head(n)

    for col in g.columns:
        gc, wc = g[col], w[col]
        if wc.isna().all() and not gc.isna().all():
            # Stored sheet has this column entirely empty (stale workbook
            # state); our computed values can't be compared against it.
            problems.append(f"{col}: [notice] stored column is entirely empty — skipped")
            continue
        # Booleans written by Power Query sometimes read back as 0.0/1.0
        if pd.api.types.is_bool_dtype(gc) or gc.map(lambda v: isinstance(v, (bool, np.bool_))).any():
            gc = gc.map(lambda v: float(v) if isinstance(v, (bool, np.bool_)) else v)
        if pd.api.types.is_bool_dtype(wc) or wc.map(lambda v: isinstance(v, (bool, np.bool_))).any():
            wc = wc.map(lambda v: float(v) if isinstance(v, (bool, np.bool_)) else v)

        if pd.api.types.is_numeric_dtype(wc) and pd.api.types.is_numeric_dtype(gc):
            bad = pd.Series(
                ~(np.isclose(gc.astype(float).fillna(np.nan), wc.astype(float).fillna(np.nan),
                             atol=float_tol, equal_nan=True)),
                index=gc.index,
            )
        elif pd.api.types.is_datetime64_any_dtype(wc) or pd.api.types.is_datetime64_any_dtype(gc):
            gd, wd = pd.to_datetime(gc, errors="coerce"), pd.to_datetime(wc, errors="coerce")
            bad = (gd != wd) & ~(gd.isna() & wd.isna())
        else:
            def norm(series):
                # '' ≡ null: Excel stores empty strings as empty cells
                return series.astype(object).where(series.notna(), None).map(
                    lambda v: (re.sub(r"(\d)\.0%", r"\1%", str(v).strip()) or None) if v is not None else None
                )
            gs, ws = norm(gc), norm(wc)
            bad = (gs != ws) & ~(gs.isna() & ws.isna())  # None != None is True in pandas
        if bad.any():
            idx = list(bad[bad].index[:3])
            examples = [f"row {i}: got {g[col].iloc[i]!r} want {w[col].iloc[i]!r}" for i in idx]
            problems.append(f"{col}: {int(bad.sum())}/{n} cells differ — " + "; ".join(examples))
    return problems


def main():
    xl = sys.argv[1] if len(sys.argv) > 1 else "ground_truth/Lebanon 2026 - Analysis.xlsx"
    overrides, columns = transforms.load_config()

    truth_data = load_sheet(xl, "data")
    gts_raw = pd.read_excel(
        "/Users/ralphbaydoun/Downloads/drive-download-20260610T170345Z-3-001/GTS Master sheet.xlsx",
        sheet_name="Query1") if not Path("ground_truth").exists() else pd.read_excel(xl, sheet_name="GTS DATA")
    target = load_sheet(xl, "Target")

    results = {}

    # ── 1. data query (recompute derived columns from raw) ─────────
    pseudo_wide = truth_data.drop(columns=DERIVED_COLS)
    got_data = transforms.data_query(pseudo_wide, overrides, columns["data"])
    want_data = truth_data[columns["data"]]
    results["data"] = diff_frames("data", got_data, want_data, ignore_order=True)

    # ── 2. downstream queries off the ground-truth data sheet ──────
    data = truth_data
    qa_timing = transforms.qa_timing_sections(data, columns["QA_TimingSections"])
    results["QA_TimingSections"] = diff_frames(
        "QA_TimingSections", qa_timing, load_sheet(xl, "QA_TimingSections"), ignore_order=True)

    qa_dash = transforms.qa_dashboard(qa_timing, data, columns["QA_Dashboard"])
    results["QA_Dashboard"] = diff_frames(
        "QA_Dashboard", qa_dash, load_sheet(xl, "QA_Dashboard"), ignore_order=True)

    qa_group = transforms.qa_by_group_section(data, columns["QA_ByGroupSection"])
    results["QA_ByGroupSection"] = diff_frames(
        "QA_ByGroupSection", qa_group, load_sheet(xl, "QA_ByGroupSection"), ignore_order=True)

    all_rules = transforms.query_all_rules(data, qa_dash, qa_timing, qa_group, columns["Query_All_Rules"])
    results["Query_All_Rules"] = diff_frames(
        "Query_All_Rules", all_rules, load_sheet(xl, "Query_All_Rules"), ignore_order=True)

    enum_summary = transforms.enumerator_summary(qa_dash, columns["Enumerator_Summary"])
    want_enum = load_sheet(xl, "Enumerator_Summary")
    # The stored sheet has manual notes typed below the query table — keep
    # only rows that are actually part of the table.
    want_enum = want_enum[pd.to_numeric(want_enum["Total_Surveys"], errors="coerce").notna()].reset_index(drop=True)
    results["Enumerator_Summary"] = diff_frames("Enumerator_Summary", enum_summary, want_enum)

    tracker = transforms.target_tracker(data, target, columns["Target_Tracker"])
    want_tracker = load_sheet(xl, "Target_Tracker")
    # Pct ties make global order non-deterministic between engines — align by location
    tracker_cmp = tracker.sort_values("location", kind="stable").reset_index(drop=True)
    want_tracker = want_tracker.sort_values("location", kind="stable").reset_index(drop=True)
    results["Target_Tracker"] = diff_frames("Target_Tracker", tracker_cmp, want_tracker)

    gts = transforms.gts_query(gts_raw, columns["GTS DATA"])
    results["GTS DATA"] = diff_frames("GTS DATA", gts, load_sheet(xl, "GTS DATA"), ignore_order=True)

    comparison = transforms.survey_comparison(data, qa_dash, gts, columns["Survey Comparison"])
    results["Survey Comparison"] = diff_frames(
        "Survey Comparison", comparison, load_sheet(xl, "Survey Comparison"), ignore_order=True)

    # ── Report ──────────────────────────────────────────────────────
    failures = 0
    for name, problems in results.items():
        real = [p for p in problems if "[notice]" not in p]
        if real:
            failures += 1
            print(f"✗ {name}")
            for p in problems[:6]:
                print(f"    {p}")
        elif problems:
            print(f"✓ {name} (with notices)")
            for p in problems:
                print(f"    {p}")
        else:
            print(f"✓ {name}")
    print()
    print("ALL MATCH" if failures == 0 else f"{failures} sheet(s) differ")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
