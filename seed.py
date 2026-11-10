#!/usr/bin/env python3
"""Generate synthetic data and the report for the governed BI starter demo.

1. Builds a SQLite database from schema.sql and fills it with made-up sales lines.
2. Runs every measure in semantic_model.json (the same SQL the page shows) for each
   month, for the whole company and for each region.
3. Runs reconciliation checks on the data and the results.
4. Exports everything the page needs as report.json.

Usage:  python3 seed.py OUTPUT_JSON
All names, prices and quantities are invented. Seeded, so output is repeatable.
"""
import calendar
import json
import random
import sqlite3
import sys
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).parent
SEED = 7
REGIONS = ["East", "Central", "West"]
# (sku, name, family, unit_price, unit_cost, qty_low, qty_high)
PRODUCTS = [
    ("BRK-100", "Steel bracket, small", "Brackets", 4.80, 3.10, 40, 400),
    ("BRK-200", "Steel bracket, large", "Brackets", 7.90, 5.00, 30, 300),
    ("PNL-310", "Enclosure panel", "Enclosures", 42.00, 27.50, 5, 60),
    ("FRM-420", "Mounting frame", "Frames and racks", 65.00, 44.00, 4, 40),
    ("HNG-150", "Heavy-duty hinge", "Hardware", 12.50, 7.80, 20, 200),
    ("CVR-260", "Access cover", "Enclosures", 18.00, 11.40, 10, 120),
    ("RCK-540", "Rack rail set", "Frames and racks", 96.00, 66.50, 2, 24),
    ("SHD-330", "Machine guard", "Guarding", 140.00, 99.00, 1, 14),
]
QTY_SCALE = 3  # scales order quantities so the made-up plant is a realistic size
REPORT_MONTHS = [f"2025-{m:02d}" for m in range(1, 13)]
DATA_END = date(2025, 12, 31)
# Seasonality of order volume, Dec 2024 (warm-up) then Jan to Dec 2025.
VOLUME = [0.95, 0.9, 0.92, 1.0, 1.0, 1.05, 1.05, 0.95, 0.9, 1.05, 1.1, 1.1, 0.95]
LATE_BASE = {"East": 0.15, "Central": 0.20, "West": 0.27}
LATE_BUMP = {"2025-03": 0.05, "2025-08": 0.11}  # a couple of rough months, by ship date
DISCOUNTS = [0.0, 0.0, 0.03, 0.05, 0.08]


def month_end(ym):
    y, m = int(ym[:4]), int(ym[5:])
    return date(y, m, calendar.monthrange(y, m)[1])


def build(db, rng):
    db.executescript((HERE / "schema.sql").read_text())
    db.executemany("INSERT INTO regions VALUES (?, ?)", list(enumerate(REGIONS, 1)))
    customers = []
    for i in range(1, 25):
        region_id = (i - 1) % 3 + 1
        db.execute("INSERT INTO customers VALUES (?, ?, ?)", (i, f"Customer {i:02d}", region_id))
        customers.append((i, REGIONS[region_id - 1], rng.choice(DISCOUNTS)))
    for pid, (sku, name, fam, price, cost, *_rest) in enumerate(PRODUCTS, 1):
        db.execute("INSERT INTO products VALUES (?, ?, ?, ?, ?, ?)", (pid, sku, name, fam, price, cost))

    months = ["2024-12"] + REPORT_MONTHS
    line_id = order_id = 0
    for idx, ym in enumerate(months):
        y, m = int(ym[:4]), int(ym[5:])
        for _ in range(round(rng.randint(100, 125) * VOLUME[idx])):
            order_id += 1
            cust_id, region, tier_discount = rng.choice(customers)
            order_date = date(y, m, rng.randint(1, 28))
            promised = order_date + timedelta(days=rng.choice([7, 10, 14, 14, 21]))
            for _line in range(rng.randint(1, 4)):
                line_id += 1
                pid = rng.randint(1, len(PRODUCTS))
                sku, name, fam, price, cost, qlo, qhi = PRODUCTS[pid - 1]
                qty = rng.randint(qlo, qhi) * QTY_SCALE
                discount = tier_discount if rng.random() < 0.8 else rng.choice(DISCOUNTS)
                promised_ym = promised.strftime("%Y-%m")
                late_p = LATE_BASE[region] + LATE_BUMP.get(promised_ym, 0.0)
                delay = rng.randint(1, 7) if rng.random() < late_p else rng.randint(-3, 0)
                ship = max(promised + timedelta(days=delay), order_date + timedelta(days=1))
                invoice = ship + timedelta(days=rng.randint(0, 2))
                returned = 0
                if ship <= DATA_END and rng.random() < 0.04:
                    returned = max(1, int(qty * rng.uniform(0.05, 0.30)))
                ship_s = ship.isoformat() if ship <= DATA_END else None
                inv_s = invoice.isoformat() if (ship <= DATA_END and invoice <= DATA_END) else None
                if ship_s is None:
                    returned = 0
                db.execute(
                    "INSERT INTO sales_lines VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    (line_id, order_id, order_date.isoformat(), cust_id, pid, qty, price,
                     discount, promised.isoformat(), ship_s, inv_s, returned),
                )
    db.commit()


def run_one(db, sql, month, region):
    params = {"month": month, "month_end": month_end(month).isoformat(), "region": region}
    return db.execute(sql, params).fetchone()[0]


def main(out_path):
    rng = random.Random(SEED)
    db = sqlite3.connect(":memory:")
    build(db, rng)
    model = json.loads((HERE / "semantic_model.json").read_text())

    values = {}
    for ms in model["measures"]:
        values[ms["id"]] = {
            ym: {"all": run_one(db, ms["sql"], ym, None),
                 **{r: run_one(db, ms["sql"], ym, r) for r in REGIONS}}
            for ym in REPORT_MONTHS
        }
    ways = {}
    alt = {a["id"]: a["sql"] for a in model["alternatives"]}
    for ym in REPORT_MONTHS:
        ways[ym] = {
            "booked": run_one(db, alt["booked"], ym, None),
            "invoiced": run_one(db, alt["invoiced"], ym, None),
            "net": values["net_revenue"][ym]["all"],
        }

    # ---- Checks -------------------------------------------------------------
    checks = []

    def add(cid, title, detail, passed, observed):
        checks.append({"id": cid, "title": title, "detail": detail, "passed": bool(passed), "observed": observed})

    # 1. Regions add up to the company total, for every month and every measure that adds.
    worst = 0.0
    for mid in ("net_revenue", "open_orders"):
        for ym in REPORT_MONTHS:
            cell = values[mid][ym]
            worst = max(worst, abs(cell["all"] - sum(cell[r] for r in REGIONS)))
    add("regions_add_up", "Regions add up to the company total",
        "Net revenue and open orders by region, summed, equal the company figure for all 12 months, to the cent (each figure is rounded separately).",
        worst <= 0.02, f"largest difference ${worst:.2f} (rounding)")

    n_lines = db.execute("SELECT COUNT(*) FROM sales_lines").fetchone()[0]
    n_view = db.execute("SELECT COUNT(*) FROM v_sales").fetchone()[0]
    add("no_orphans", "Every sales line joins to a customer, product and region",
        "The shared view returns as many rows as the sales table, so no line is silently dropped by a join.",
        n_lines == n_view, f"{n_lines:,} lines in the table, {n_view:,} in the view")

    bad_dates = db.execute(
        "SELECT COUNT(*) FROM sales_lines WHERE ship_date < order_date OR invoice_date < ship_date"
    ).fetchone()[0]
    add("date_order", "Dates run in order",
        "No line ships before it was ordered or is invoiced before it shipped.", bad_dates == 0,
        f"{bad_dates} lines out of order")

    bad_ret = db.execute("SELECT COUNT(*) FROM sales_lines WHERE returned_qty > qty OR returned_qty < 0 OR qty <= 0").fetchone()[0]
    add("quantities", "Quantities make sense",
        "Quantities are positive and no more is returned than was shipped.", bad_ret == 0,
        f"{bad_ret} lines out of range")

    nulls = sum(1 for mid in values for ym in REPORT_MONTHS if values[mid][ym]["all"] is None)
    add("measures_complete", "Every certified measure has a value for every month",
        "A blank would otherwise show up as a gap or a zero in a report.", nulls == 0,
        f"{len(model['measures']) * len(REPORT_MONTHS) - nulls} of {len(model['measures']) * len(REPORT_MONTHS)} values present")

    add("net_not_above_invoiced", "Net revenue never exceeds invoiced revenue",
        "Net revenue is invoiced revenue less returns, so it can only be equal or lower.",
        all(ways[ym]["net"] <= ways[ym]["invoiced"] + 0.005 for ym in REPORT_MONTHS),
        "holds in all 12 months")

    report = {
        "about": "Synthetic data, seed %d. Generated by seed.py from schema.sql and semantic_model.json." % SEED,
        "model": {"name": model["name"], "description": model["description"]},
        "months": REPORT_MONTHS,
        "regions": REGIONS,
        "featured_month": "2025-11",
        "measures": model["measures"],
        "alternatives": model["alternatives"],
        "values": values,
        "three_ways": ways,
        "checks": checks,
        "row_counts": {
            "sales_lines": n_lines,
            "customers": db.execute("SELECT COUNT(*) FROM customers").fetchone()[0],
            "products": db.execute("SELECT COUNT(*) FROM products").fetchone()[0],
        },
    }
    Path(out_path).write_text(json.dumps(report, separators=(",", ":")))
    print(f"wrote {out_path}: {n_lines} lines, {len(checks)} checks, "
          f"{sum(c['passed'] for c in checks)} passed")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: seed.py OUTPUT_JSON")
    main(sys.argv[1])
