-- Channel mix by weekday (last 28 days) - feeds rostering and delivery-cover decisions
SELECT CASE strftime('%w', date) WHEN '0' THEN 'Sun' WHEN '1' THEN 'Mon' WHEN '2' THEN 'Tue'
         WHEN '3' THEN 'Wed' WHEN '4' THEN 'Thu' WHEN '5' THEN 'Fri' ELSE 'Sat' END AS weekday,
       ROUND(SUM(CASE WHEN channel = 'in_store' THEN net_sales END) / 4, 0) AS in_store_avg,
       ROUND(SUM(CASE WHEN channel = 'uber_eats' THEN net_sales END) / 4, 0) AS uber_eats_avg,
       ROUND(SUM(CASE WHEN channel = 'on_demand' THEN net_sales END) / 4, 0) AS on_demand_avg,
       ROUND(100.0 * SUM(CASE WHEN channel <> 'in_store' THEN net_sales END) / SUM(net_sales), 1) AS delivery_pct
FROM fact_sales
WHERE date > date(:asof, '-28 days') AND date <= :asof
GROUP BY strftime('%w', date)
ORDER BY strftime('%w', date);
