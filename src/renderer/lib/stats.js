export function median(sorted) {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n % 2) return sorted[(n - 1) / 2];
  return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

export function mean(arr) {
  if (arr.length === 0) return NaN;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function stdDev(arr) {
  if (arr.length <= 1) return 0;
  const m = mean(arr);
  const sumSq = arr.reduce((s, v) => s + (v - m) ** 2, 0);
  return Math.sqrt(sumSq / (arr.length - 1));
}

export function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    min: sorted[0] ?? NaN,
    max: sorted[sorted.length - 1] ?? NaN,
    median: median(sorted),
    mean: mean(sorted),
    stdDev: stdDev(sorted),
  };
}
