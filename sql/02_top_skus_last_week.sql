-- Top 15 SKUs by sales last 7 days, with rank inside their category
SELECT p.category, p.product_name, SUM(f.units) AS units, ROUND(SUM(f.net_sales), 2) AS sales,
       RANK() OVER (PARTITION BY p.category ORDER BY SUM(f.net_sales) DESC) AS rank_in_category
FROM fact_sales f JOIN dim_product p ON p.sku = f.sku
WHERE f.date > date(:asof, '-7 days') AND f.date <= :asof
GROUP BY p.category, p.product_name
ORDER BY sales DESC
LIMIT 15;
