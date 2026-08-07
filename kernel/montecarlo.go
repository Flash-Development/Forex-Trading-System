package kernel

import (
	"math"
	"math/rand"
	"sort"
)

// ============================================================================
// Monte Carlo Simulation
// ============================================================================

// MonteCarloResult holds the output of a Monte Carlo simulation.
type MonteCarloResult struct {
	Runs              int
	MedianReturnPct   float64
	P5ReturnPct       float64  // 5th percentile (worst 5%)
	P95ReturnPct      float64  // 95th percentile (best 5%)
	MedianMaxDD       float64  // median max drawdown
	P95MaxDD          float64  // 95th percentile max drawdown (worst-case)
	RuinProbability   float64  // fraction of runs that lost > 50% of equity
	EquityCurves      [][]float64 // sampled equity curves (up to 100 stored)
}

// RunMonteCarlo shuffles the trade sequence `runs` times and computes
// distribution statistics for return and drawdown.
func RunMonteCarlo(trades []BacktestTrade, initialEquity float64, runs int) *MonteCarloResult {
	if len(trades) == 0 || initialEquity <= 0 {
		return nil
	}

	pnls := make([]float64, len(trades))
	for i, t := range trades {
		pnls[i] = t.PnLUSD
	}

	returns := make([]float64, runs)
	maxDDs := make([]float64, runs)
	ruinCount := 0

	storeCurves := runs
	if storeCurves > 100 {
		storeCurves = 100
	}
	curves := make([][]float64, 0, storeCurves)

	shuffled := make([]float64, len(pnls))
	for i := 0; i < runs; i++ {
		copy(shuffled, pnls)
		rand.Shuffle(len(shuffled), func(a, b int) { shuffled[a], shuffled[b] = shuffled[b], shuffled[a] })

		eq := initialEquity
		peak := eq
		maxDD := 0.0

		var curve []float64
		if i < storeCurves {
			curve = make([]float64, 0, len(shuffled)+1)
			curve = append(curve, eq)
		}

		for _, p := range shuffled {
			eq += p
			if eq > peak {
				peak = eq
			}
			dd := (peak - eq) / peak
			if dd > maxDD {
				maxDD = dd
			}
			if i < storeCurves {
				curve = append(curve, eq)
			}
		}

		returns[i] = (eq - initialEquity) / initialEquity
		maxDDs[i] = maxDD
		if eq < initialEquity*0.5 {
			ruinCount++
		}
		if i < storeCurves {
			curves = append(curves, curve)
		}
	}

	sort.Float64s(returns)
	sort.Float64s(maxDDs)

	p5Idx := int(math.Floor(float64(runs) * 0.05))
	p95Idx := int(math.Floor(float64(runs) * 0.95))
	medIdx := runs / 2

	return &MonteCarloResult{
		Runs:            runs,
		MedianReturnPct: returns[medIdx],
		P5ReturnPct:     returns[p5Idx],
		P95ReturnPct:    returns[p95Idx],
		MedianMaxDD:     maxDDs[medIdx],
		P95MaxDD:        maxDDs[p95Idx],
		RuinProbability: float64(ruinCount) / float64(runs),
		EquityCurves:    curves,
	}
}
