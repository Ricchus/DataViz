# Country × Decade × Medium Map – Treasure Trackers

This mini-project shows a world map where **countries** are shaded according to
the number of objects created there in a given **decade**, with an optional
filter for the top 5 medium categories.

You also get a Python script that prepares the aggregated data file from your
master object table.

---

## 1. Data preparation (Python)

Use the script in `scripts/` to create the required CSV file:

- `scripts/prepare_counts_by_country_decade_medium.py`

### Steps

1. Make sure you have Python and `pandas` installed:

   ```bash
   pip install pandas
   ```

2. Run the script:

   ```bash
   python scripts/prepare_counts_by_country_decade_medium.py
   ```

3. Follow the dialogs:

   - **Step 1:** Select your master objects file
     (e.g. `combinedMuseumObjects (1).csv`).

   - **Step 2 (optional):** Select `flows_country_to_museum.csv` so the script
     can attach region labels. If you cancel this step, region will be set to
     `"Unknown"`.

   - **Step 3:** Choose where to save
     `counts_by_country_decade_medium.csv`.

4. Copy the resulting `counts_by_country_decade_medium.csv` into:

   ```text
   country_decade_medium_map/data/counts_by_country_decade_medium.csv
   ```

The script expects the following columns in your master file (you can tweak
the names at the top of the script if needed):

- `origin_country_std`
- `creation_start_year_std`
- `creation_end_year_std`
- `classification_std` (optional but recommended)
- `medium_std` (optional but recommended)

For each object, it:

- infers a **decade** from the creation year
- groups the raw classification/medium into a **medium_group**
- attaches a **region** via the flows file (if provided)
- aggregates to `(region, country, decade, medium_group)` with `n_objects`

The final CSV has:

- `region`
- `country`
- `decade`
- `medium_group`
- `n_objects`

---

## 2. Running the visualization

Once `counts_by_country_decade_medium.csv` is in the `data/` folder:

1. From inside the `country_decade_medium_map` folder, start a local server:

   ```bash
   python3 -m http.server 8000
   ```

2. Open the visualization in your browser:

   ```text
   http://localhost:8000/index.html
   ```

3. Interact:

   - Move the **decade slider** to scrub through time.
   - Use the **medium dropdown** to switch between:
     - **All media**
     - The top 5 medium groups (by total count in your dataset).

   - The map will:
     - shade each country according to its count for that decade/medium, and
     - show a small centroid dot whose size encodes the same value.

4. Read the **summary panel** for a textual breakdown of the top contributing
   countries in the current decade and medium.

---

## 3. Notes

- Decades are clamped to the range 1400–2020. Any objects outside that
  range are ignored for this visualization.
- Country names are lightly normalized (e.g. “United States” →
  “United States of America”, “Democratic Republic of the Congo” →
  “Dem. Rep. Congo”) so they line up with the world-atlas country names.
- Medium groups are derived heuristically from `classification_std` and
  `medium_std` – feel free to refine the categorization logic if certain
  categories deserve their own buckets in your project.
