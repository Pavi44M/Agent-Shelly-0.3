# ---------------------------------------------------------------------------
# Independent cross-validation of the Python agent in R (base R only).
#   Rscript r/validate.R outputs
#
# 1. Segmentation: re-run K-means, silhouette, gap statistic and MANOVA on the
#    exact features the agent used, to check the segments aren't an artefact.
# 2. Forecasting: re-run the seasonal-naive and SARIMA (stats::arima) backtest
#    on the same category series and compare WAPE with the Python leaderboard.
# ---------------------------------------------------------------------------
args <- commandArgs(trailingOnly = TRUE)
out <- if (length(args)) args[1] else "outputs"
set.seed(42)

feat_cols <- c("avg_daily_units", "gm_pct", "demand_cv", "waste_rate_pct",
               "delivery_share_pct", "promo_uplift")
seg <- read.csv(file.path(out, "segment_features.csv"))
X <- scale(seg[, feat_cols])
k_py <- length(unique(seg$cluster))

silhouette_mean <- function(X, cl) {
  D <- as.matrix(dist(X))
  s <- sapply(seq_len(nrow(X)), function(i) {
    own <- cl == cl[i]
    a <- if (sum(own) > 1) mean(D[i, own & seq_along(cl) != i]) else 0
    b <- min(sapply(setdiff(unique(cl), cl[i]), function(k) mean(D[i, cl == k])))
    if (max(a, b) == 0) 0 else (b - a) / max(a, b)
  })
  mean(s)
}

cat("== Segmentation ==\n")
sil <- sapply(2:5, function(k) silhouette_mean(X, kmeans(X, k, nstart = 25)$cluster))
names(sil) <- paste0("k=", 2:5)
print(round(sil, 3))
cat(sprintf("R picks k=%d by silhouette; Python picked k=%d\n", which.max(sil) + 1, k_py))

# Gap statistic (Tibshirani et al. 2001), uniform reference over the data range
log_wk <- function(X, k) log(if (k == 1) sum(scale(X, scale = FALSE)^2) else kmeans(X, k, nstart = 10)$tot.withinss)
B <- 30
gap <- sapply(1:6, function(k) {
  ref <- replicate(B, { R <- apply(X, 2, function(c) runif(length(c), min(c), max(c))); log_wk(R, k) })
  c(gap = mean(ref) - log_wk(X, k), se = sd(ref) * sqrt(1 + 1 / B))
})
colnames(gap) <- paste0("k=", 1:6)
print(round(gap, 3))
k_gap <- which(sapply(1:5, function(k) gap["gap", k] >= gap["gap", k + 1] - gap["se", k + 1]))[1]
cat(sprintf("Gap statistic (1-SE rule) suggests k=%d\n", k_gap))

fit <- manova(as.matrix(seg[, feat_cols]) ~ factor(seg$cluster))
cat("MANOVA (Pillai) - do segments differ on the features jointly?\n")
print(summary(fit, test = "Pillai"))

cat("\n== Forecast backtest ==\n")
d <- read.csv(file.path(out, "daily_category_sales.csv"))
d$date <- as.Date(d$date)
h <- 7; folds <- 4
res <- do.call(rbind, lapply(split(d, d$category), function(g) {
  g <- g[order(g$date), ]
  y <- g$net_sales
  n <- length(y)
  do.call(rbind, lapply(folds:1, function(f) {
    cut <- n - h * f
    train <- tail(y[1:cut], 364)
    act <- y[(cut + 1):(cut + h)]
    sn <- rep(tail(train, 7), length.out = h)
    ar <- tryCatch(as.numeric(predict(arima(train, order = c(1, 0, 1),
                     seasonal = list(order = c(1, 1, 1), period = 7), method = "CSS-ML"), n.ahead = h)$pred),
                   error = function(e) sn)
    data.frame(category = g$category[1], model = c("Seasonal Naive", "SARIMA"),
               abs_err = c(sum(abs(act - sn)), sum(abs(act - pmax(ar, 0)))), actual = sum(act))
  }))
}))
agg <- aggregate(cbind(abs_err, actual) ~ model, res, sum)
agg$wape_R <- round(100 * agg$abs_err / agg$actual, 2)
py <- read.csv(file.path(out, "backtest_detail.csv"))
pya <- aggregate(cbind(abs_err, actual) ~ model, py, sum)
pya$wape_Python <- round(100 * pya$abs_err / pya$actual, 2)
pya$model[pya$model == "SARIMA-X"] <- "SARIMA"
print(merge(agg[, c("model", "wape_R")], pya[, c("model", "wape_Python")], by = "model"))
cat("R's SARIMA has no holiday regressor, so expect small differences from Python's SARIMA-X.\n")
