package api

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"nofx/logger"
	"nofx/store"
)

// handleSeedPropStrategies creates the 5 prop-firm strategies for the current
// user, skipping any whose name already exists. Safe to call multiple times.
func (s *Server) handleSeedPropStrategies(c *gin.Context) {
	userID := c.GetString("user_id")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	lang := c.DefaultQuery("lang", "en")

	existing, err := s.store.Strategy().List(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch strategies"})
		return
	}
	existingNames := make(map[string]bool, len(existing))
	for _, st := range existing {
		existingNames[st.Name] = true
	}

	created, err := s.seedPropStrategiesForUser(userID, lang, existingNames)
	if err != nil {
		logger.Errorf("seedPropStrategies: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"created": created,
		"message": fmt.Sprintf("%d prop-firm strategies added", len(created)),
	})
}

// seedPropStrategiesForUser creates only strategies whose name isn't in existingNames.
func (s *Server) seedPropStrategiesForUser(userID, lang string, existingNames map[string]bool) ([]string, error) {
	type strategyDef struct {
		name        string
		description string
		applyConfig func(*store.StrategyConfig)
	}

	forexBase := func(c *store.StrategyConfig) {
		c.CoinSource.SourceType = "forex"
		c.CoinSource.UseAI500 = false
		c.CoinSource.UseOITop = false
		c.Indicators.EnableEMA = true
		c.Indicators.EMAPeriods = []int{20, 50, 200}
		c.Indicators.EnableMACD = true
		c.Indicators.EnableRSI = true
		c.Indicators.RSIPeriods = []int{7, 14}
		c.Indicators.EnableATR = true
		c.Indicators.ATRPeriods = []int{14}
		c.Indicators.EnableVolume = true
		c.Indicators.EnableOI = false
		c.Indicators.EnableFundingRate = false
		c.Indicators.EnableQuantData = false
		c.Indicators.EnableOIRanking = false
		c.Indicators.EnableNetFlowRanking = false
		c.Indicators.Klines.EnableMultiTimeframe = true
		c.Indicators.Klines.LongerTimeframe = "4h"
		c.Indicators.Klines.LongerCount = 20
		c.RiskControl.MaxPositions = 2
		c.RiskControl.MaxMarginUsage = 0.80
		c.RiskControl.MinRiskRewardRatio = 2.0
		c.RiskControl.MinConfidence = 78
		c.RiskControl.RiskPctPerTrade = 0.0025
		c.RiskControl.MaxDailyLossPct = 0.01
		c.RiskControl.MaxTotalRiskPct = 0.02
		c.RiskControl.AllowedSessions = []string{"london", "new_york"}
		c.RiskControl.ForexTimeframes = []string{"15m", "1h", "4h"}
	}

	iEn := lang != "zh"

	defs := []strategyDef{
		{
			name: map[bool]string{true: "London Breakout (Prop)", false: "伦敦突破策略（道具）"}[iEn],
			description: map[bool]string{
				true:  "FundedNext Stellar Lite S1. Breakout of Asian range at London open, retest entry. Structure SL behind Asian extreme, TP at next 1H S/R. 0.25% risk/trade, -1% daily DD cap.",
				false: "FundedNext道具S1。伦敦开盘亚洲区间突破后回测入场。结构止损在亚洲区间极值外，止盈在下一个1H支撑/阻力位。每笔0.25%风险，日最大回撤-1%。",
			}[iEn],
			applyConfig: func(c *store.StrategyConfig) {
				forexBase(c)
				c.CoinSource.ForexPairs = []string{"EURUSD", "GBPUSD", "USDJPY", "GBPJPY"}
				c.Indicators.Klines.PrimaryTimeframe = "15m"
				c.Indicators.Klines.PrimaryCount = 40
				c.Indicators.Klines.SelectedTimeframes = []string{"15m", "1h", "4h"}
				c.RiskControl.AllowedSessions = []string{"london", "london_ny_overlap"}
				c.PromptSections = store.PromptSectionsConfig{
					RoleDefinition: `# Role Definition

You are a disciplined intraday breakout trader specialising in the London session open (07:00–09:00 UTC). You exploit the surge of institutional flow when London opens, capturing directional momentum after the Asian consolidation range is cleanly broken and retested on 15M. Your stop is placed behind the Asian range extreme — the structural point that invalidates the breakout thesis. Your target is the next visible 1H resistance or support. You never chase the initial move and never enter without a confirmed retest. 0.25% account risk per trade. Stop all trading when daily P&L hits -1%.`,
					TradingFrequency: `# Trading Frequency

- Maximum 2 trades per day
- Active windows: London open 07:00–10:00 UTC and London/NY overlap 12:00–16:00 UTC only
- Hard stops: cease trading at -1% daily DD or +0.75% daily profit
- 1-hour cooldown after any stopped-out trade`,
					EntryStandards: `# Entry Standards — London Breakout

LONG (all must be true):
1. 4H trend bullish: price above EMA50, EMA20 > EMA50
2. 15M candle CLOSES above the Asian session high (00:00–07:00 UTC)
3. Price pulls back and retests the broken Asian high as support
4. 15M MACD histogram positive at the retest candle
5. 15M RSI(14) between 45–68

SHORT (all must be true):
1. 4H trend bearish: price below EMA50, EMA20 < EMA50
2. 15M candle CLOSES below the Asian session low
3. Price retests the broken Asian low as resistance
4. 15M MACD histogram negative at the retest
5. 15M RSI(14) between 32–55

SKIP if: Asian range > 40 pips | no 1H S/R at 2R+ for TP | news within 1 hour | spread > 2 pips`,
					DecisionProcess: `# Decision Process

1. 07:00 UTC: mark the Asian high and low on 15M
2. Mark the nearest 1H resistance (longs) or support (shorts) as the TP zone
3. Wait for a 15M candle CLOSE outside the Asian range — do NOT enter on the breakout candle
4. Wait for the retest of the broken level
5. SL: 3–5 pips beyond the Asian range extreme (structural invalidation)
6. TP: 3–5 pips before the 1H S/R level. Confirm TP >= 2× SL distance. If not, skip.
7. Size so SL distance = 0.25% of account equity (use risk_usd field)
8. TP1: close 60% at the structural target. Trail remaining 40% behind new swing structure.
9. Hard exit any open trade at 16:00 UTC if not in profit.`,
				}
			},
		},
		{
			name: map[bool]string{true: "EMA Trend Rider (Prop)", false: "EMA趋势骑手（道具）"}[iEn],
			description: map[bool]string{
				true:  "FundedNext Stellar Lite S2. Pullback entry in 4H EMA-stack trend direction. SL behind structural swing low/high, TP at next 1H S/R. Win rate 62–70%, R:R 2.5–4:1. 0.25% risk/trade.",
				false: "FundedNext道具S2。在4H EMA趋势方向做回调入场。止损在结构摆动低/高点后，止盈在下一个1H支撑/阻力位。胜率62-70%，R:R 2.5-4:1。每笔0.25%风险。",
			}[iEn],
			applyConfig: func(c *store.StrategyConfig) {
				forexBase(c)
				c.CoinSource.ForexPairs = []string{"EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "XAUUSD"}
				c.Indicators.Klines.PrimaryTimeframe = "15m"
				c.Indicators.Klines.PrimaryCount = 40
				c.Indicators.Klines.SelectedTimeframes = []string{"15m", "1h", "4h"}
				c.PromptSections = store.PromptSectionsConfig{
					RoleDefinition: `# Role Definition

You are an institutional-grade multi-timeframe trend trader with 15 years of live market experience. You enter pullbacks in the direction of the dominant 4H EMA trend at structural support or resistance levels. Your stop goes behind the swing low/high that anchors the pullback — the structural invalidation point. Your target is the next opposing structural level on 1H. You never average down, never trade against a clear EMA stack, and treat every stopped trade as proof the thesis was wrong. 0.25% risk per trade. Stop when daily P&L reaches -1%.`,
					TradingFrequency: `# Trading Frequency

- 1–2 trades per day
- London 07:00–16:00 UTC and NY 12:00–21:00 UTC only
- Hard stops: -1% daily DD or +0.75% daily profit
- 1-hour cooldown after any loss`,
					EntryStandards: `# Entry Standards — EMA Trend Rider

LONG (all must be true):
1. 4H: EMA20 > EMA50 > EMA200, price above EMA20 (full bullish stack)
2. 1H: pullback to EMA20, EMA50, or prior swing high turned support
3. 1H RSI(14) reset to 40–55 during the pullback
4. 15M: bullish engulfing or pin bar at the pullback zone
5. 15M MACD histogram crosses negative → positive
6. 15M RSI(7) > 45 and rising

SHORT (all must be true):
1. 4H: EMA20 < EMA50 < EMA200, price below EMA20 (full bearish stack)
2. 1H: rally to EMA20, EMA50, or prior swing low turned resistance
3. 1H RSI(14) reset to 45–60
4. 15M: bearish engulfing or shooting star at the rally zone
5. 15M MACD crosses positive → negative
6. 15M RSI(7) < 55 and falling

SKIP if: 4H EMAs entangled | no clear S/R at 2R+ for TP | news within 30 min | Friday after 18:00 UTC`,
					DecisionProcess: `# Decision Process

1. Check 4H EMA stack — all three clearly aligned? If not, no trade.
2. On 1H identify the pullback zone and next opposing S/R for TP.
3. Set an alert at the pullback zone. Wait.
4. Alert fires — switch to 15M. Wait for trigger candle CLOSE.
5. Confirm MACD cross and RSI(7) on 15M.
6. SL: 3–5 pips below the lowest 15M pullback candle low (longs) or above the highest high (shorts). If > 30 pips on majors, skip.
7. TP: next 1H resistance/support, 3–5 pips before the level. Confirm TP >= 2× SL. If not, skip.
8. Size so SL = 0.25% account risk (use risk_usd field).
9. TP1 close 60%. Trail the remaining 40% behind new 15M swing structure.
10. Two trades taken or -1% DD reached — stop for the day.`,
				}
			},
		},
		{
			name: map[bool]string{true: "NY Kill Zone Reversal (Prop)", false: "纽约猎杀区反转（道具）"}[iEn],
			description: map[bool]string{
				true:  "FundedNext Stellar Lite S3. Institutional liquidity sweep reversal in NY kill zone 12:00–15:00 UTC. SL beyond sweep wick tip, TP at sweep origin. Win rate 58–65%, R:R 3–5:1. 0.25% risk/trade.",
				false: "FundedNext道具S3。纽约猎杀区12:00-15:00 UTC机构流动性扫除反转。止损在扫除尾针顶部外，止盈在扫除起源位置。胜率58-65%，R:R 3-5:1。每笔0.25%风险。",
			}[iEn],
			applyConfig: func(c *store.StrategyConfig) {
				forexBase(c)
				c.CoinSource.ForexPairs = []string{"EURUSD", "GBPUSD", "USDCAD", "USDJPY"}
				c.Indicators.Klines.PrimaryTimeframe = "15m"
				c.Indicators.Klines.PrimaryCount = 40
				c.Indicators.Klines.SelectedTimeframes = []string{"15m", "1h", "4h"}
				c.RiskControl.MaxPositions = 1
				c.RiskControl.AllowedSessions = []string{"new_york"}
				c.RiskControl.MinRiskRewardRatio = 3.0
				c.PromptSections = store.PromptSectionsConfig{
					RoleDefinition: `# Role Definition

You are a precision reversal trader hunting institutional liquidity grabs in the New York kill zone (12:00–15:00 UTC). Institutions sweep retail stop clusters above obvious equal highs or below obvious equal lows before reversing sharply. The sweep wick tip is your structural SL anchor — your stop sits just beyond it. Your TP targets the consolidation zone that existed before the sweep push. Because you enter at the extremity of a fake-out and target the structural reversion, R:R is naturally 3:1 or better. One clean setup per day is sufficient. 0.25% risk per trade. Stop when daily P&L hits -1%.`,
					TradingFrequency: `# Trading Frequency

- Maximum 1 trade per day, strictly 12:00–15:00 UTC
- If no clean sweep forms by 15:00 UTC, no trade today
- Hard stop: -1% daily DD`,
					EntryStandards: `# Entry Standards — NY Kill Zone Reversal

LONG (all must be true):
1. 4H bias bullish: price above 4H EMA50 or at a major 4H support zone
2. 1H has clearly visible equal lows or a prior significant low (liquidity target)
3. 12:00–15:00 UTC: price sweeps aggressively BELOW that level with a wick
4. The sweeping 15M candle CLOSES back ABOVE the swept level (fake-out confirmed)
5. 15M RSI(14) bullish divergence or crosses above 40
6. 15M MACD turns positive within 1–2 candles of the sweep

SHORT (all must be true):
1. 4H bias bearish: price below 4H EMA50 or at a major 4H resistance zone
2. 1H has clearly visible equal highs or a prior significant high (liquidity target)
3. 12:00–15:00 UTC: price sweeps above that level with a wick
4. The 15M candle closes back BELOW the swept level
5. 15M RSI(14) bearish divergence or crosses below 60
6. 15M MACD turns negative within 1–2 candles

SKIP if: no clear equal highs/lows on 1H | sweep wick < 7 pips | news caused the move | after 15:00 UTC`,
					DecisionProcess: `# Decision Process

1. 11:45 UTC: on 1H, mark the Asian high/low and prior London session high/low
2. Identify the most obvious stop cluster (equal highs/lows preferred)
3. 12:00–15:00 UTC: watch for an aggressive wick through that level
4. Sweep confirmed: wick beyond level AND 15M candle CLOSES back inside
5. SL: 3–5 pips beyond the TIP of the sweep wick (the structural extreme)
6. TP: the 1H consolidation zone before the sweep push, 3–5 pips before the near edge. Confirm TP >= 2× SL. If not, skip.
7. Size so SL = 0.25% account risk (use risk_usd field).
8. TP1: close 60% at the consolidation zone origin. Trail remainder behind new swing structure.
9. No setup by 15:00 UTC: log no trade and stop for the day.`,
				}
			},
		},
		{
			name: map[bool]string{true: "XAUUSD Trend Swing (Prop)", false: "黄金趋势摆动（道具）"}[iEn],
			description: map[bool]string{
				true:  "FundedNext Stellar Lite S4. Gold pullback entries in 4H EMA trend direction. SL behind 1H structural swing low/high, TP at next 1H S/R. Win rate 60–67%, R:R 2–3.5:1. 0.25% risk/trade.",
				false: "FundedNext道具S4。黄金在4H EMA趋势方向做回调入场。止损在1H结构摆动低/高点后，止盈在下一个1H支撑/阻力位。胜率60-67%，R:R 2-3.5:1。每笔0.25%风险。",
			}[iEn],
			applyConfig: func(c *store.StrategyConfig) {
				forexBase(c)
				c.CoinSource.ForexPairs = []string{"XAUUSD"}
				c.Indicators.Klines.PrimaryTimeframe = "15m"
				c.Indicators.Klines.PrimaryCount = 40
				c.Indicators.Klines.SelectedTimeframes = []string{"15m", "1h", "4h"}
				c.Indicators.EnableVolume = false
				c.RiskControl.MaxPositions = 1
				c.PromptSections = store.PromptSectionsConfig{
					RoleDefinition: `# Role Definition

You are a specialist XAUUSD swing trader exploiting gold's strong trending behaviour during macro and USD-driven moves. Gold reliably returns to 4H EMA levels and 1H structural S/R during trend pullbacks. Your stop goes behind the most recent 1H swing low or high — the structural level proving the pullback has turned into a full reversal. Your target is the next significant 1H resistance or support. You never trade gold in the Asian session and always flatten before major US data (CPI, NFP, FOMC). 0.25% risk per trade. Stop when daily P&L hits -1%.`,
					TradingFrequency: `# Trading Frequency

- 1 trade per day maximum
- London open 07:00–10:00 UTC and NY open 12:00–16:00 UTC only
- No trades on Fridays after 16:00 UTC
- Hard stop: -1% daily DD`,
					EntryStandards: `# Entry Standards — XAUUSD Trend Swing

LONG (all must be true):
1. 4H: EMA20 > EMA50 > EMA200, price above EMA20 (confirmed uptrend)
2. 1H: pullback to a prior 1H swing high (now support), EMA20, or EMA50
3. 1H RSI(14) reset to 40–55 during the pullback
4. 15M: bullish engulfing or strong pin bar at the pullback zone
5. 15M MACD histogram turns positive; 15M RSI(7) > 45

SHORT (all must be true):
1. 4H: EMA20 < EMA50 < EMA200, price below EMA20 (confirmed downtrend)
2. 1H: rally to a prior 1H swing low (now resistance), EMA20, or EMA50
3. 1H RSI(14) reset to 45–60
4. 15M: bearish engulfing or shooting star at the rally zone
5. 15M MACD turns negative; 15M RSI(7) < 55

SKIP if: US CPI/NFP/FOMC within 2 hours | 4H EMAs flat | structural SL > 45 pips | spread > $0.50 | Friday after 16:00 UTC`,
					DecisionProcess: `# Decision Process

1. Confirm 4H EMA stack — all three clearly aligned.
2. On 1H, identify the swing high/low that created the pullback — the SL anchor.
3. Identify the next opposing 1H resistance (longs) or support (shorts) as TP.
4. Set alert when price approaches the pullback zone. Wait.
5. At the zone: check 15M for trigger candle + MACD cross + RSI(7).
6. SL: 5 pips below the 1H swing low (longs) or above the 1H swing high (shorts). If > 45 pips, skip.
7. TP: 5 pips before the 1H resistance/support. Confirm TP >= 2× SL. If not, skip.
8. Size so SL = 0.25% account risk (use risk_usd field).
9. TP1 close 60% at the structural target. Trail remaining 40% behind new 15M swing structure.
10. At -1% daily DD, close all gold positions immediately.`,
				}
			},
		},
		{
			name: map[bool]string{true: "Conservative Slow Grind (Prop)", false: "稳健慢磨策略（道具）"}[iEn],
			description: map[bool]string{
				true:  "FundedNext Stellar Lite S5. 1H confirmation entries only, 1 trade/day. SL behind 1H structural swing, TP at next 1H S/R. Win rate 65–72%, R:R 2–3:1. 0.25% risk/trade. Best for Phase 2 and funded accounts.",
				false: "FundedNext道具S5。仅1H确认入场，每天最多1笔。止损在1H结构摆动点后，止盈在下一个1H支撑/阻力位。胜率65-72%，R:R 2-3:1。每笔0.25%风险。最适合第二阶段和已资助账户。",
			}[iEn],
			applyConfig: func(c *store.StrategyConfig) {
				forexBase(c)
				c.CoinSource.ForexPairs = []string{"EURUSD", "GBPUSD", "USDJPY", "AUDUSD"}
				c.Indicators.Klines.PrimaryTimeframe = "1h"
				c.Indicators.Klines.PrimaryCount = 30
				c.Indicators.Klines.SelectedTimeframes = []string{"1h", "4h"}
				c.Indicators.EnableVolume = false
				c.RiskControl.MaxPositions = 1
				c.RiskControl.MinRiskRewardRatio = 2.0
				c.RiskControl.MinConfidence = 80
				c.PromptSections = store.PromptSectionsConfig{
					RoleDefinition: `# Role Definition

You are a conservative institutional swing trader whose sole objective is protecting the account while grinding profit slowly. You enter once per day at most, only on 1H candle confirmation at a clearly defined structural level. Your stop goes behind the 1H swing low or high that anchors the pullback. Your target is the next 1H structural resistance or support. A 2:1 structure R:R on a clean, unambiguous setup is the entire strategy. You never take borderline setups, never trade twice in a day, and treat a stopped-out trade as confirmation your discipline is working. 0.25% risk per trade. Stop at -1% daily DD.`,
					TradingFrequency: `# Trading Frequency

- Maximum 1 trade per day
- Hard stops: -1% daily DD or +0.75% daily profit
- After any loss: no trades the following calendar day
- Weekly self-limit: -2% drawdown`,
					EntryStandards: `# Entry Standards — Conservative Slow Grind

LONG (all must be true):
1. 4H: EMA20 > EMA50, price cleanly above both — zero ambiguity
2. 4H RSI(14): 45–65 (trend running, not extended)
3. 1H: clean pullback to 1H EMA50 or a clearly defined prior resistance-turned-support
4. 1H candle CLOSES bullish at the zone (engulfing or pin bar with close above midpoint)
5. 1H MACD histogram crosses negative → positive on or after the entry candle

SHORT (all must be true):
1. 4H: EMA20 < EMA50, price cleanly below both — zero ambiguity
2. 4H RSI(14): 35–55
3. 1H: clean rally to 1H EMA50 or a clearly defined prior support-turned-resistance
4. 1H candle CLOSES bearish at the zone
5. 1H MACD crosses positive → negative

SKIP if: any 4H trend ambiguity | 1H pullback zone unclear | no S/R at 2R+ for TP | already traded today | within 0.25% of -1% DD limit`,
					DecisionProcess: `# Decision Process

1. Before London open: review 4H — is the trend unambiguous? Identify today's pullback zone and TP target.
2. Set a price alert at the 1H zone. Do not watch until the alert fires.
3. Alert fires: switch to 1H. Wait for the current 1H candle to fully CLOSE.
4. Clean confirmation candle? If borderline, skip.
5. SL: 3–5 pips below the lowest pullback candle low (longs) or above the highest high (shorts). If > 30 pips on majors, skip.
6. TP: next visible 1H resistance/support, 3–5 pips before the level. Confirm TP >= 2× SL. If not, skip.
7. Size so SL = 0.25% account risk (use risk_usd field).
8. Enter on the next 1H candle open. Place SL and TP. Walk away.
9. TP hit: done for the day. SL hit: done for the day — no second attempt.`,
				}
			},
		},
	}

	configLang := lang
	if lang == "id" {
		configLang = "en"
	}

	var toCreate []*store.Strategy
	var createdNames []string
	for _, def := range defs {
		if existingNames[def.name] {
			logger.Infof("  · Skipping prop strategy %q — already exists", def.name)
			continue
		}
		config := store.GetDefaultStrategyConfig(configLang)
		def.applyConfig(&config)
		st := &store.Strategy{
			ID:          uuid.New().String(),
			UserID:      userID,
			Name:        def.name,
			Description: def.description,
			IsActive:    false,
			IsDefault:   false,
		}
		if err := st.SetConfig(&config); err != nil {
			return nil, fmt.Errorf("failed to set config for %q: %w", def.name, err)
		}
		toCreate = append(toCreate, st)
		createdNames = append(createdNames, def.name)
	}

	if len(toCreate) == 0 {
		return createdNames, nil
	}

	err := s.store.Transaction(func(tx *gorm.DB) error {
		for _, st := range toCreate {
			if err := tx.Create(st).Error; err != nil {
				return fmt.Errorf("failed to create %q: %w", st.Name, err)
			}
			logger.Infof("  ✓ Created prop firm strategy: %s", st.Name)
		}
		return nil
	})
	return createdNames, err
}

// createPropFirmStrategies is called at registration time.
func (s *Server) createPropFirmStrategies(userID string, lang string) error {
	_, err := s.seedPropStrategiesForUser(userID, lang, map[string]bool{})
	return err
}
