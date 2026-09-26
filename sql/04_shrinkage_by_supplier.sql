-- Stock-count variance (shrinkage) by supplier over the last 12 weeks
SELECT p.supplier, COUNT(*) AS counts,
       SUM(c.variance_units) AS variance_units,
       ROUND(SUM(c.variance_value), 2) AS variance_value,
       SUM(CASE WHEN ABS(c.variance_units) > 5 THEN 1 ELSE 0 END) AS counts_over_tolerance
FROM fact_stock_count c JOIN dim_product p ON p.sku = c.sku
WHERE c.count_date > date(:asof, '-84 days')
GROUP BY p.supplier
ORDER BY variance_value;
