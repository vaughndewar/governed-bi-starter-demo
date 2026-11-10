-- Governed BI starter: a small, made-up sales star schema.
-- Nothing here comes from any real company. All names and numbers are invented.

CREATE TABLE regions (
  region_id INTEGER PRIMARY KEY,
  name      TEXT NOT NULL UNIQUE
);

CREATE TABLE customers (
  customer_id INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  region_id   INTEGER NOT NULL REFERENCES regions(region_id)
);

CREATE TABLE products (
  product_id INTEGER PRIMARY KEY,
  sku        TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  family     TEXT NOT NULL,
  unit_price REAL NOT NULL,
  unit_cost  REAL NOT NULL
);

-- One row per order line. ship_date and invoice_date are NULL while the line is still open.
CREATE TABLE sales_lines (
  line_id       INTEGER PRIMARY KEY,
  order_id      INTEGER NOT NULL,
  order_date    TEXT NOT NULL,
  customer_id   INTEGER NOT NULL REFERENCES customers(customer_id),
  product_id    INTEGER NOT NULL REFERENCES products(product_id),
  qty           INTEGER NOT NULL,
  unit_price    REAL NOT NULL,
  discount_pct  REAL NOT NULL,
  promised_date TEXT NOT NULL,
  ship_date     TEXT,
  invoice_date  TEXT,
  returned_qty  INTEGER NOT NULL DEFAULT 0
);

-- The one place the tables are joined, so every measure starts from the same rows.
CREATE VIEW v_sales AS
SELECT l.*,
       r.name AS region,
       p.unit_cost,
       p.family,
       strftime('%Y-%m', l.order_date)   AS order_month,
       strftime('%Y-%m', l.ship_date)    AS ship_month,
       strftime('%Y-%m', l.invoice_date) AS invoice_month
FROM sales_lines l
JOIN customers c ON c.customer_id = l.customer_id
JOIN regions   r ON r.region_id   = c.region_id
JOIN products  p ON p.product_id  = l.product_id;
