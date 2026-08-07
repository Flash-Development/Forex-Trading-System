function fmt(n: number | undefined | null, d = 2) { return (n ?? 0).toFixed(d) }
function fmtPct(n: number | undefined | null) { const v = n ?? 0; return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` }


export {fmt, fmtPct};