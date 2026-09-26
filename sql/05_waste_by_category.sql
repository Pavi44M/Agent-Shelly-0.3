-- Waste value as % of sales by category, last 28 days
WITH s AS (SELECT p.category, SUM(f.net_sales) AS sales FROM fact_sales f JOIN dim_product p ON p.sku = f.sku
           WHERE f.date > date(:asof, '-28 days') AND f.date <= :asof GROUP BY 1),
     w AS (SELECT p.category, SUM(w.waste_value) AS waste FROM fact_waste w JOIN dim_product p ON p.sku = w.sku
           WHERE w.date > date(:asof, '-28 days') AND w.date <= :asof GROUP BY 1)
SELECT s.category, ROUND(s.sales, 0) AS sales, ROUND(COALESCE(w.waste, 0), 0) AS waste,
       ROUND(100.0 * COALESCE(w.waste, 0) / s.sales, 2) AS waste_pct
FROM s LEFT JOIN w ON w.category = s.category
ORDER BY waste_pct DESC;
