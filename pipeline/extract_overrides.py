#!/usr/bin/env python3
"""Parse the Power Query M code of the `data` query into overrides.json.

The M code (extracted from Moe's .odc files) embeds hardcoded per-UUID
override lists: testing-survey flags, fixed-location corrections, and
accept/reject status overrides. This script pulls them out mechanically so
the Python pipeline never has to hand-maintain UUID lists. Re-run it with a
fresh data.m whenever Moe edits the query logic in Excel.

Usage: python extract_overrides.py path/to/data.m [-o config/overrides.json]
"""
import argparse
import json
import re
import sys
from pathlib import Path


def parse_contains_chain(expr: str):
    """Parse `if List.Contains({uuids}, X) then "value" else if ... else <fallback>`
    into ([(uuid_list, value), ...], fallback_expression)."""
    groups = []
    pattern = re.compile(
        r'List\.Contains\(\s*\{(.*?)\}\s*,\s*(?:\[instanceID\]|CurrentID)\s*\)\s*'
        r'\)?\s*then\s*"([^"]*)"',
        re.S,
    )
    for m in pattern.finditer(expr):
        uuids = re.findall(r'"(uuid:[0-9a-f-]+)"', m.group(1))
        groups.append({"value": m.group(2), "uuids": uuids})

    # Fallback = expression after the last `else` that isn't an `else if`
    fallback = None
    for m in re.finditer(r'else\s+(?!if\b)([^\n,]+)', expr):
        fallback = m.group(1).strip().rstrip(')').strip()
    return groups, fallback


def extract_step(mcode: str, step_name: str) -> str:
    """Return the M expression for one let-binding (up to the next binding)."""
    start = mcode.index(step_name)
    # next top-level binding starts with `\n    #"` or `\n    <ident> =`
    tail = mcode[start:]
    # Exclude inner let-bindings (CurrentID) and keyword lines (`if X = ...`)
    # that would otherwise look like the start of the next top-level step.
    next_step = re.search(
        r'\n\s{4}#?"?(?!(?:CurrentID|if|else|then|in|let|each|try)\b)[A-Za-z][\w ]*"?\s*=',
        tail[len(step_name):],
    )
    end = start + len(step_name) + (next_step.start() if next_step else len(tail))
    return mcode[start:end]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("data_m", type=Path)
    ap.add_argument("-o", "--out", type=Path, default=Path(__file__).parent / "config" / "overrides.json")
    args = ap.parse_args()

    mcode = args.data_m.read_text(encoding="utf-8", errors="replace")
    out = {}

    # ── Testing cutoff + testing UUIDs ─────────────────────────────
    testing_expr = extract_step(mcode, '#"testing-real"')
    cutoff = re.search(r'#datetime\((\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\)', testing_expr)
    if not cutoff:
        sys.exit("FATAL: testing cutoff datetime not found")
    y, mo, d, h, mi, s = map(int, cutoff.groups())
    out["testing_cutoff"] = f"{y:04d}-{mo:02d}-{d:02d}T{h:02d}:{mi:02d}:{s:02d}"
    out["testing_uuids"] = re.findall(r'\[instanceID\]\s*=\s*"(uuid:[0-9a-f-]+)"', testing_expr)

    # ── Enumerator → NameCode map ──────────────────────────────────
    enum_expr = extract_step(mcode, "enumName")
    out["enumerator_namecode"] = dict(re.findall(r'\[enumerator\]\s*=\s*"([^"]+)"\s*then\s*"([^"]+)"', enum_expr))

    # ── Fixed Location override chain ──────────────────────────────
    loc_expr = extract_step(mcode, '#"Added Custom fixed location"')
    groups, fallback = parse_contains_chain(loc_expr)
    out["fixed_location"] = {"groups": groups, "fallback": fallback}  # fallback: [loc_4]

    # ── Beddawi spelling fix ───────────────────────────────────────
    bed = re.search(r'Table\.ReplaceValue\([^,]+,"([^"]+)","([^"]+)"', extract_step(mcode, '#"Replaced Value fixed Beddawi"'))
    out["fixed_location_replacements"] = {bed.group(1): bed.group(2)} if bed else {}

    # ── SurveyStatus_New chain (first pass — kept as OldRejectedStatus) ──
    status_expr = extract_step(mcode, '#"Added CustomSurvey status"')
    groups, fallback = parse_contains_chain(status_expr)
    out["old_status"] = {"groups": groups, "fallback": fallback.strip('"') if fallback else "Accepted"}

    # ── NewRejectedStatus chain (final SurveyStatus_New) ───────────
    swap_expr = extract_step(mcode, '#"surveyststua_new coloumn also sawped names"')
    groups, fallback = parse_contains_chain(swap_expr)
    out["new_status"] = {"groups": groups, "fallback": fallback.strip('"') if fallback else "accepted"}

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, indent=2, ensure_ascii=False))

    # Summary
    print(f"testing_cutoff:  {out['testing_cutoff']}")
    print(f"testing_uuids:   {len(out['testing_uuids'])}")
    print(f"enumerators:     {len(out['enumerator_namecode'])}")
    print(f"fixed_location:  {len(out['fixed_location']['groups'])} groups, "
          f"{sum(len(g['uuids']) for g in out['fixed_location']['groups'])} uuids, fallback={out['fixed_location']['fallback']}")
    print(f"old_status:      {len(out['old_status']['groups'])} groups, "
          f"{sum(len(g['uuids']) for g in out['old_status']['groups'])} uuids, fallback={out['old_status']['fallback']!r}")
    print(f"new_status:      {len(out['new_status']['groups'])} groups, "
          f"{sum(len(g['uuids']) for g in out['new_status']['groups'])} uuids, fallback={out['new_status']['fallback']!r}")
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
