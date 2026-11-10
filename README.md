# Governed BI starter demo

A small demo of what "one definition per number" looks like in practice, built from scratch on **synthetic data**. It answers the same revenue question three ways, then shows a shared model of certified measures, a report built only from those measures, and the checks that run before the report refreshes.

Every customer, product, order and number is invented. Nothing here comes from a real company's database, system or code.

## How it works

1. **`schema.sql`**: a small made-up star schema (`regions`, `customers`, `products`, `sales_lines`) and one shared view, `v_sales`, that every measure starts from.
2. **`semantic_model.json`**: the shared model. Each certified measure has a name, a plain-language definition, an owner, a status and the SQL that computes it (net revenue, gross margin %, on-time delivery %, open orders). Two "not certified" alternatives show how one question gets three answers.
3. **`seed.py`**: builds the schema in an in-memory SQLite database, generates 14 months of order lines with a fixed random seed (so output is repeatable), runs every measure in the model for each month and region, runs six reconciliation checks, and writes `web/report.json`.
4. **`web/`**: plain HTML, CSS and JavaScript. The page reads `report.json` and draws it. It displays the SQL from the model, so the SQL you see is the SQL that produced the numbers. No frameworks, no build step, no tracking.

The checks: regions add up to the company total; every sales line joins to a customer, product and region; dates run in order; quantities make sense; every measure has a value for every month; net revenue never exceeds invoiced revenue.

Accessibility notes: status is shown in words and symbols, not colour alone; light and dark mode; keyboard accessible; the chart has a table alternative.

## Run it

You need Python 3 (standard library only).

```bash
python3 seed.py web/report.json      # optional: regenerate the synthetic data and report
cd web && python3 -m http.server 8000
```

Then open http://localhost:8000. (Use a local server rather than opening the file directly, because the page fetches `report.json`.)

## Change a definition

Edit the SQL or the wording of a measure in `semantic_model.json`, then run the seed command again. Every figure and the checks follow, which is the point: a definition lives in one place.

## Change the data

Edit the constants at the top of `seed.py` (late-delivery rates, discounts, volume, quantity scale), then run the seed command again.

## Using this for a real business

A real version points the same measures at your system's actual data, and the definitions are agreed with the people who own each number before anything is built. The idea carries over to any BI tool. The part that matters is the discipline: one name, one definition, one owner, and tests that run before anyone sees the numbers.

## Author

Vaughn Dewar, [Ideal Consulting](https://www.idealconsulting.ca/), Toronto. Released under the MIT License.
