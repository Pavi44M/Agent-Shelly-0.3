-- Weekly sales, margin and week-on-week change by category (last 8 weeks)
WITH wk AS (
  SELECT p.category,
         CAST((julianday(:asof) - julianday(f.date)) / 7 AS INTEGER) AS weeks_ago,
         SUM(f.net_sales) AS sales,
         SUM(f.net_sales - f.cost) AS gross_margin
  FROM fact_sales f JOIN dim_product p ON p.sku = f.sku
  WHERE f.date > date(:asof, '-56 days') AND f.date <= :asof
  GROUP BY 1, 2
)
SELECT category, weeks_ago, ROUND(sales, 2) AS sales,
       ROUND(100.0 * gross_margin / sales, 1) AS gm_pct,
       ROUND(100.0 * (sales / LAG(sales) OVER (PARTITION BY category ORDER BY weeks_ago DESC) - 1), 1) AS wow_pct
FROM wk
ORDER BY category, weeks_ago;
