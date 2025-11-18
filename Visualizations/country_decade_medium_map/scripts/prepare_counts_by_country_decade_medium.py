"""Prepare counts_by_country_decade_medium.csv from master objects.

This script:
- Asks you to pick your combinedMuseumObjects (1).csv
- (Optionally) asks you to pick flows_country_to_museum.csv for region mapping
- Normalizes medium into a small set of groups
- Computes creation decade from start/end year
- Aggregates to (region, country, decade, medium_group) with n_objects
"""

import pandas as pd
import numpy as np
import tkinter as tk
from tkinter import filedialog, messagebox

# ------------- CONFIG: tweak if your columns differ -------------

MASTER_COUNTRY_COL = "origin_country_std"
MASTER_START_YEAR_COL = "creation_start_year_std"
MASTER_END_YEAR_COL = "creation_end_year_std"
MASTER_CLASS_COL = "classification_std"
MASTER_MEDIUM_COL = "medium_std"

FLOWS_COUNTRY_COL = "origin_country"
FLOWS_REGION_COL = "region"

MIN_DECADE = 1400
MAX_DECADE = 2020


def pick_file(title, pattern="*.csv"):
    return filedialog.askopenfilename(
        title=title,
        filetypes=[("CSV files", pattern), ("All files", "*.*")],
    )


def save_file(title, default_name):
    return filedialog.asksaveasfilename(
        title=title,
        initialfile=default_name,
        defaultextension=".csv",
        filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
    )


def categorize_medium(classification, medium):
    """Map raw classification/medium to a small set of medium groups."""
    c = str(classification or "").lower()
    m = str(medium or "").lower()
    combo = f"{c} {m}"

    # Photographs
    if any(k in combo for k in ["photograph", "gelatin silver", "albumen print", "photo "]):
        return "Photographs"

    # Prints
    if any(k in combo for k in ["print", "engraving", "etching", "lithograph", "woodcut", "screenprint"]):
        return "Prints"

    # Drawings
    if any(k in combo for k in ["drawing", "graphite", "pencil", "pen and ink", "watercolor", "watercolour"]):
        return "Drawings"

    # Paintings
    if any(k in combo for k in ["painting", "oil on canvas", "tempera", "acrylic"]):
        return "Paintings"

    # Sculpture
    if any(k in combo for k in ["sculpture", "bronze", "marble", "carved stone"]):
        return "Sculpture"

    # Textiles
    if any(k in combo for k in ["textile", "tapestry", "silk", "cotton", "linen", "wool"]):
        return "Textiles"

    # Decorative arts / ceramics
    if any(
        k in combo
        for k in [
            "ceramic",
            "porcelain",
            "earthenware",
            "stoneware",
            "pottery",
            "glass",
            "furniture",
            "decorative art",
        ]
    ):
        return "Decorative arts"

    # Fallback
    return "Other"


def compute_decade(row):
    start = row.get(MASTER_START_YEAR_COL)
    end = row.get(MASTER_END_YEAR_COL)

    year = pd.to_numeric(start, errors="coerce")
    if pd.isna(year):
        year = pd.to_numeric(end, errors="coerce")

    if pd.isna(year):
        return np.nan

    decade = int(np.floor(year / 10.0) * 10)
    if decade < MIN_DECADE or decade > MAX_DECADE:
        return np.nan
    return decade


def main():
    root = tk.Tk()
    root.withdraw()

    # ---- Step 1: master objects ----
    messagebox.showinfo(
        "Step 1",
        "Select your master objects CSV (e.g. combinedMuseumObjects (1).csv).",
    )
    master_path = pick_file("Select master objects CSV")
    if not master_path:
        messagebox.showwarning("Cancelled", "No master file selected.")
        return

    # ---- Step 2: optional flows (for region) ----
    messagebox.showinfo(
        "Step 2 (optional)",
        "Select flows_country_to_museum.csv to map countries to regions."
        "You may cancel this if you don't want regions.",
    )
    flows_path = pick_file("Select flows_country_to_museum.csv")
    use_flows = bool(flows_path)

    try:
        master_df = pd.read_csv(master_path, low_memory=False)
    except Exception as e:
        messagebox.showerror("Error", f"Could not read master CSV:\n{e}")
        return

    if use_flows:
        try:
            flows_df = pd.read_csv(flows_path, low_memory=False)
        except Exception as e:
            messagebox.showerror("Error", f"Could not read flows CSV:\n{e}")
            return
    else:
        flows_df = None

    # ---- Check columns ----
    missing_master = [
        col
        for col in [
            MASTER_COUNTRY_COL,
            MASTER_START_YEAR_COL,
            MASTER_END_YEAR_COL,
        ]
        if col not in master_df.columns
    ]
    if missing_master:
        messagebox.showerror(
            "Missing columns in master file",
            f"Missing: {missing_master}\nAvailable: {', '.join(master_df.columns)}",
        )
        return

    # ---- Region mapping ----
    country_to_region = {}
    if use_flows:
        if FLOWS_COUNTRY_COL not in flows_df.columns or FLOWS_REGION_COL not in flows_df.columns:
            messagebox.showwarning(
                "Flows columns missing",
                f"Expected {FLOWS_COUNTRY_COL} and {FLOWS_REGION_COL} in flows file, "
                "but could not find them. Region mapping will be skipped.",
            )
        else:
            flows_clean = flows_df.dropna(subset=[FLOWS_COUNTRY_COL, FLOWS_REGION_COL])
            country_region = (
                flows_clean.groupby(FLOWS_COUNTRY_COL)[FLOWS_REGION_COL]
                .agg(lambda s: s.value_counts().idxmax())
            )
            country_to_region = country_region.to_dict()

    # ---- Prepare master data ----
    subset_cols = [MASTER_COUNTRY_COL, MASTER_START_YEAR_COL, MASTER_END_YEAR_COL]
    if MASTER_CLASS_COL in master_df.columns:
        subset_cols.append(MASTER_CLASS_COL)
    if MASTER_MEDIUM_COL in master_df.columns:
        subset_cols.append(MASTER_MEDIUM_COL)

    df = master_df[subset_cols].copy()

    # Compute region + country
    df[MASTER_COUNTRY_COL] = df[MASTER_COUNTRY_COL].astype(str).str.strip()
    df["region"] = df[MASTER_COUNTRY_COL].map(country_to_region) if country_to_region else "Unknown"
    df["region"] = df["region"].fillna("Unknown")

    df["country"] = df[MASTER_COUNTRY_COL].copy()
    df.loc[df["country"].eq(""), "country"] = "Unknown"

    # Compute decade
    df["decade"] = df.apply(compute_decade, axis=1)
    df = df[df["decade"].notna()].copy()
    df["decade"] = df["decade"].astype(int)

    if df.empty:
        messagebox.showwarning(
            "No data", "No rows remain after computing decades within the valid range."
        )
        return

    # Medium grouping
    classification = master_df[MASTER_CLASS_COL] if MASTER_CLASS_COL in master_df.columns else ""
    medium_raw = master_df[MASTER_MEDIUM_COL] if MASTER_MEDIUM_COL in master_df.columns else ""
    df["medium_group"] = [
        categorize_medium(c, m)
        for c, m in zip(
            classification.reindex(df.index, fill_value=""),
            medium_raw.reindex(df.index, fill_value=""),
        )
    ]

    # Aggregate
    grouped = (
        df.groupby(["region", "country", "decade", "medium_group"], dropna=False)
        .size()
        .reset_index(name="n_objects")
    )

    if grouped.empty:
        messagebox.showwarning("No data", "No rows produced after grouping.")
        return

    # ---- Save ----
    messagebox.showinfo(
        "Step 3",
        "Choose where to save counts_by_country_decade_medium.csv",
    )
    out_path = save_file(
        "Save counts_by_country_decade_medium.csv",
        "counts_by_country_decade_medium.csv",
    )
    if not out_path:
        messagebox.showwarning("Cancelled", "No output path selected.")
        return

    try:
        grouped.to_csv(out_path, index=False)
    except Exception as e:
        messagebox.showerror("Error", f"Could not write CSV:\n{e}")
        return

    messagebox.showinfo(
        "Done",
        f"Wrote {len(grouped):,} rows to:\n{out_path}",
    )


if __name__ == "__main__":
    main()
