package store

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"
)

// Hard limits to prevent token explosion in AI requests
const (
	MaxCandidateCoins = 10
	MaxPositions      = 3
	MaxTimeframes     = 4
	MinKlineCount     = 10
	MaxKlineCount     = 200
	MinLeverage       = 1
	MaxBTCETHLeverage = 20
	MaxAltLeverage    = 20
	MinPositionRatio  = 0.5
	MaxPositionRatio  = 10.0
	MinRiskReward     = 1.0
	MaxRiskReward     = 10.0
	MinMarginUsage    = 0.1
	MaxMarginUsage    = 1.0
	MinPositionSize   = 10.0
	MaxPositionSize   = 1000.0
	MinConfidence     = 50
	MaxConfidence     = 100
)

// IsForexMode returns true when the strategy is configured for forex/MT5 trading.
func (c *StrategyConfig) IsForexMode() bool {
	return c.CoinSource.SourceType == "forex"
}

// GetForexPairs returns the active forex pairs list (ForexPairs if set, else StaticCoins).
func (c *StrategyConfig) GetForexPairs() []string {
	if len(c.CoinSource.ForexPairs) > 0 {
		return c.CoinSource.ForexPairs
	}
	return c.CoinSource.StaticCoins
}

// ClampLimits enforces product-level limits on strategy config to prevent token overflow.
func (c *StrategyConfig) ClampLimits() {
	c.NormalizeProductSchema()

	// Clamp coin source limits
	if c.CoinSource.AI500Limit > MaxCandidateCoins {
		c.CoinSource.AI500Limit = MaxCandidateCoins
	}
	if c.CoinSource.OITopLimit > MaxCandidateCoins {
		c.CoinSource.OITopLimit = MaxCandidateCoins
	}
	if c.CoinSource.OILowLimit > MaxCandidateCoins {
		c.CoinSource.OILowLimit = MaxCandidateCoins
	}

	// Clamp static coins
	if len(c.CoinSource.StaticCoins) > MaxCandidateCoins {
		c.CoinSource.StaticCoins = c.CoinSource.StaticCoins[:MaxCandidateCoins]
	}

	// Clamp kline count
	if c.Indicators.Klines.PrimaryCount < MinKlineCount {
		c.Indicators.Klines.PrimaryCount = MinKlineCount
	}
	if c.Indicators.Klines.PrimaryCount > MaxKlineCount {
		c.Indicators.Klines.PrimaryCount = MaxKlineCount
	}
	if c.Indicators.Klines.LongerCount > MaxKlineCount {
		c.Indicators.Klines.LongerCount = MaxKlineCount
	}

	// Clamp timeframes
	if len(c.Indicators.Klines.SelectedTimeframes) > MaxTimeframes {
		c.Indicators.Klines.SelectedTimeframes = c.Indicators.Klines.SelectedTimeframes[:MaxTimeframes]
	}

	// Clamp max positions
	if c.RiskControl.MaxPositions < 1 {
		c.RiskControl.MaxPositions = 1
	}
	if c.RiskControl.MaxPositions > MaxPositions {
		c.RiskControl.MaxPositions = MaxPositions
	}

	// Clamp leverage limits to the same bounds as the manual config UI.
	if c.RiskControl.BTCETHMaxLeverage < MinLeverage {
		c.RiskControl.BTCETHMaxLeverage = MinLeverage
	}
	if c.RiskControl.BTCETHMaxLeverage > MaxBTCETHLeverage {
		c.RiskControl.BTCETHMaxLeverage = MaxBTCETHLeverage
	}
	if c.RiskControl.AltcoinMaxLeverage < MinLeverage {
		c.RiskControl.AltcoinMaxLeverage = MinLeverage
	}
	if c.RiskControl.AltcoinMaxLeverage > MaxAltLeverage {
		c.RiskControl.AltcoinMaxLeverage = MaxAltLeverage
	}

	// Clamp position value ratio limits.
	if c.RiskControl.BTCETHMaxPositionValueRatio < MinPositionRatio {
		c.RiskControl.BTCETHMaxPositionValueRatio = MinPositionRatio
	}
	if c.RiskControl.BTCETHMaxPositionValueRatio > MaxPositionRatio {
		c.RiskControl.BTCETHMaxPositionValueRatio = MaxPositionRatio
	}
	if c.RiskControl.AltcoinMaxPositionValueRatio < MinPositionRatio {
		c.RiskControl.AltcoinMaxPositionValueRatio = MinPositionRatio
	}
	if c.RiskControl.AltcoinMaxPositionValueRatio > MaxPositionRatio {
		c.RiskControl.AltcoinMaxPositionValueRatio = MaxPositionRatio
	}

	// Clamp risk parameters and entry requirements.
	if c.RiskControl.MinRiskRewardRatio < MinRiskReward {
		c.RiskControl.MinRiskRewardRatio = MinRiskReward
	}
	if c.RiskControl.MinRiskRewardRatio > MaxRiskReward {
		c.RiskControl.MinRiskRewardRatio = MaxRiskReward
	}
	if c.RiskControl.MaxMarginUsage < MinMarginUsage {
		c.RiskControl.MaxMarginUsage = MinMarginUsage
	}
	if c.RiskControl.MaxMarginUsage > MaxMarginUsage {
		c.RiskControl.MaxMarginUsage = MaxMarginUsage
	}
	if c.RiskControl.MinPositionSize < MinPositionSize {
		c.RiskControl.MinPositionSize = MinPositionSize
	}
	if c.RiskControl.MinPositionSize > MaxPositionSize {
		c.RiskControl.MinPositionSize = MaxPositionSize
	}
	if c.RiskControl.MinConfidence < MinConfidence {
		c.RiskControl.MinConfidence = MinConfidence
	}
	if c.RiskControl.MinConfidence > MaxConfidence {
		c.RiskControl.MinConfidence = MaxConfidence
	}
}

// NormalizeProductSchema keeps saved strategy JSON aligned with the product
// editor schema. LLMs may emit user-facing labels such as "AI500"; persistence
// must use the exact frontend/backend enum values.
func (c *StrategyConfig) NormalizeProductSchema() {
	c.StrategyType = normalizeStrategyType(c.StrategyType)
	c.CoinSource.SourceType = normalizeCoinSourceType(c.CoinSource.SourceType)
	if c.CoinSource.SourceType == "" {
		c.CoinSource.SourceType = inferCoinSourceType(c.CoinSource)
	}

	switch c.CoinSource.SourceType {
	case "ai500":
		c.CoinSource.UseAI500 = true
		c.CoinSource.UseOITop = false
		c.CoinSource.UseOILow = false
		if c.CoinSource.AI500Limit <= 0 {
			c.CoinSource.AI500Limit = 3
		}
	case "oi_top":
		c.CoinSource.UseAI500 = false
		c.CoinSource.UseOITop = true
		c.CoinSource.UseOILow = false
		if c.CoinSource.OITopLimit <= 0 {
			c.CoinSource.OITopLimit = 3
		}
	case "oi_low":
		c.CoinSource.UseAI500 = false
		c.CoinSource.UseOITop = false
		c.CoinSource.UseOILow = true
		if c.CoinSource.OILowLimit <= 0 {
			c.CoinSource.OILowLimit = 3
		}
	case "static":
		c.CoinSource.UseAI500 = false
		c.CoinSource.UseOITop = false
		c.CoinSource.UseOILow = false
	case "forex":
		c.CoinSource.UseAI500 = false
		c.CoinSource.UseOITop = false
		c.CoinSource.UseOILow = false
		// ForexPairs list is preserved as-is; no boolean flags needed
	default:
		c.CoinSource.SourceType = "ai500"
		c.CoinSource.UseAI500 = true
		if c.CoinSource.AI500Limit <= 0 {
			c.CoinSource.AI500Limit = 3
		}
	}

	c.CoinSource.StaticCoins = normalizeSymbols(c.CoinSource.StaticCoins)
	c.CoinSource.ExcludedCoins = normalizeSymbols(c.CoinSource.ExcludedCoins)
	c.Indicators.Klines.PrimaryTimeframe = normalizeTimeframe(c.Indicators.Klines.PrimaryTimeframe)
	c.Indicators.Klines.LongerTimeframe = normalizeTimeframe(c.Indicators.Klines.LongerTimeframe)
	c.Indicators.Klines.SelectedTimeframes = normalizeTimeframes(c.Indicators.Klines.SelectedTimeframes)
	if len(c.Indicators.Klines.SelectedTimeframes) > 0 {
		c.Indicators.Klines.EnableMultiTimeframe = true
	}
}

func normalizeStrategyType(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	switch value {
	case "grid", "grid_strategy", "grid-trading", "grid trading", "grid_trading", "网格", "网格策略", "网格交易":
		return "grid_trading"
	case "", "ai", "ai_strategy", "ai-trading", "ai trading", "ai_trading", "ai策略", "ai 策略", "ai交易策略", "ai智能策略":
		return "ai_trading"
	default:
		return value
	}
}

func normalizeCoinSourceType(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	compact := strings.NewReplacer(" ", "", "_", "", "-", "", "数据源", "", "选币", "", "币种", "").Replace(value)
	switch {
	case compact == "":
		return ""
	case strings.Contains(compact, "ai500"):
		return "ai500"
	case strings.Contains(compact, "oitop") || strings.Contains(value, "oi top") || strings.Contains(value, "持仓量最高") || strings.Contains(value, "持仓量靠前"):
		return "oi_top"
	case strings.Contains(compact, "oilow") || strings.Contains(value, "oi low") || strings.Contains(value, "持仓量最低") || strings.Contains(value, "持仓量较低"):
		return "oi_low"
	case strings.Contains(value, "static") || strings.Contains(value, "固定") || strings.Contains(value, "静态"):
		return "static"
	case strings.Contains(value, "forex") || strings.Contains(value, "外汇"):
		return "forex"
	default:
		return value
	}
}

func inferCoinSourceType(source CoinSourceConfig) string {
	switch {
	case source.SourceType == "forex" || len(source.ForexPairs) > 0:
		return "forex"
	case len(source.StaticCoins) > 0:
		return "static"
	case source.UseAI500:
		return "ai500"
	case source.UseOITop:
		return "oi_top"
	case source.UseOILow:
		return "oi_low"
	default:
		return "ai500"
	}
}

func normalizeSymbols(values []string) []string {
	out := make([]string, 0, len(values))
	seen := make(map[string]bool, len(values))
	for _, value := range splitLooseStringList(values) {
		value = strings.ToUpper(strings.TrimSpace(value))
		value = strings.Trim(value, "，,;； ")
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}

func normalizeTimeframes(values []string) []string {
	out := make([]string, 0, len(values))
	seen := make(map[string]bool, len(values))
	for _, value := range splitLooseStringList(values) {
		tf := normalizeTimeframe(value)
		if tf == "" || seen[tf] {
			continue
		}
		seen[tf] = true
		out = append(out, tf)
	}
	return out
}

func splitLooseStringList(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	joined := strings.TrimSpace(strings.Join(values, ","))
	if strings.HasPrefix(joined, "[") && strings.HasSuffix(joined, "]") {
		var parsed []string
		if err := json.Unmarshal([]byte(joined), &parsed); err == nil {
			return parsed
		}
	}
	parts := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if strings.HasPrefix(value, "[") && strings.HasSuffix(value, "]") {
			var parsed []string
			if err := json.Unmarshal([]byte(value), &parsed); err == nil {
				parts = append(parts, parsed...)
				continue
			}
		}
		value = strings.Trim(value, "[]")
		for _, part := range strings.FieldsFunc(value, func(r rune) bool {
			return r == ',' || r == '，' || r == ';' || r == '；' || r == '\n'
		}) {
			part = strings.Trim(strings.TrimSpace(part), "\"'")
			if part != "" {
				parts = append(parts, part)
			}
		}
	}
	return parts
}

func normalizeTimeframe(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.Trim(value, "\"'，,。 ")
	if value == "" {
		return ""
	}
	aliases := map[string]string{
		"1分钟":  "1m",
		"3分钟":  "3m",
		"5分钟":  "5m",
		"15分钟": "15m",
		"30分钟": "30m",
		"1小时":  "1h",
		"2小时":  "2h",
		"4小时":  "4h",
		"6小时":  "6h",
		"8小时":  "8h",
		"12小时": "12h",
		"1天":   "1d",
		"3天":   "3d",
		"1周":   "1w",
	}
	if alias, ok := aliases[value]; ok {
		return alias
	}
	allowed := map[string]bool{
		"1m": true, "3m": true, "5m": true, "15m": true, "30m": true,
		"1h": true, "2h": true, "4h": true, "6h": true, "8h": true, "12h": true,
		"1d": true, "3d": true, "1w": true,
	}
	if !allowed[value] {
		return ""
	}
	return value
}

// MergeStrategyConfig applies a partial JSON-style patch onto a full strategy config.
// Nested objects are merged recursively so omitted fields keep their previous values.
func MergeStrategyConfig(base StrategyConfig, patch map[string]any) (StrategyConfig, error) {
	baseJSON, err := json.Marshal(base)
	if err != nil {
		return StrategyConfig{}, err
	}

	var mergedMap map[string]any
	if err := json.Unmarshal(baseJSON, &mergedMap); err != nil {
		return StrategyConfig{}, err
	}

	normalizeStrategyConfigPatch(patch)
	if fmt.Sprint(patch["strategy_type"]) == "grid_trading" {
		ensureDefaultGridConfigMap(mergedMap)
	}
	mergeJSONMaps(mergedMap, patch)

	mergedJSON, err := json.Marshal(mergedMap)
	if err != nil {
		return StrategyConfig{}, err
	}

	var merged StrategyConfig
	if err := json.Unmarshal(mergedJSON, &merged); err != nil {
		return StrategyConfig{}, err
	}
	return merged, nil
}

func DefaultGridStrategyConfig() GridStrategyConfig {
	return GridStrategyConfig{
		Symbol:                "BTCUSD",
		GridCount:             10,
		TotalInvestment:       1000,
		Leverage:              5,
		UpperPrice:            0,
		LowerPrice:            0,
		UseATRBounds:          true,
		ATRMultiplier:         2.0,
		Distribution:          "gaussian",
		MaxDrawdownPct:        15,
		StopLossPct:           5,
		DailyLossLimitPct:     10,
		UseMakerOnly:          true,
		EnableDirectionAdjust: false,
		DirectionBiasRatio:    0.7,
	}
}

func ensureDefaultGridConfigMap(config map[string]any) {
	if config == nil {
		return
	}
	if existing, ok := config["grid_config"].(map[string]any); ok && len(existing) > 0 {
		return
	}
	defaultGrid := DefaultGridStrategyConfig()
	raw, err := json.Marshal(defaultGrid)
	if err != nil {
		return
	}
	var gridMap map[string]any
	if err := json.Unmarshal(raw, &gridMap); err != nil {
		return
	}
	config["grid_config"] = gridMap
}

func normalizeStrategyConfigPatch(patch map[string]any) {
	if patch == nil {
		return
	}

	if gridConfig, hasGrid := patch["grid_config"]; hasGrid && gridConfig != nil {
		if _, hasType := patch["strategy_type"]; !hasType {
			patch["strategy_type"] = "grid_trading"
		}
	}

	aiKeys := []string{"coin_source", "indicators", "risk_control", "prompt_sections", "custom_prompt"}
	for _, key := range aiKeys {
		value, ok := patch[key]
		if !ok {
			continue
		}
		aiConfig, _ := patch["ai_config"].(map[string]any)
		if aiConfig == nil {
			aiConfig = map[string]any{}
			patch["ai_config"] = aiConfig
		}
		aiConfig[key] = value
		delete(patch, key)
	}

	if fmt.Sprint(patch["strategy_type"]) == "grid_trading" {
		delete(patch, "ai_config")
	}

	if _, hasType := patch["strategy_type"]; hasType {
		return
	}
	if gridConfig, hasGrid := patch["grid_config"]; hasGrid && gridConfig != nil {
		patch["strategy_type"] = "grid_trading"
	}
}

func mergeJSONMaps(dst, src map[string]any) {
	for key, srcVal := range src {
		srcMap, srcIsMap := srcVal.(map[string]any)
		dstMap, dstIsMap := dst[key].(map[string]any)
		if srcIsMap && dstIsMap {
			mergeJSONMaps(dstMap, srcMap)
			continue
		}
		dst[key] = srcVal
	}
}

func StrategyClampWarnings(before, after StrategyConfig, lang string) []string {
	if lang != "zh" {
		lang = "en"
	}
	warnings := make([]string, 0, 8)
	appendInt := func(labelZH, labelEN string, from, to int) {
		if from == to {
			return
		}
		if lang == "zh" {
			warnings = append(warnings, fmt.Sprintf("%s 已从 %d 调整为 %d", labelZH, from, to))
			return
		}
		warnings = append(warnings, fmt.Sprintf("%s adjusted from %d to %d", labelEN, from, to))
	}
	appendFloat := func(labelZH, labelEN string, from, to float64) {
		if from == to {
			return
		}
		if lang == "zh" {
			warnings = append(warnings, fmt.Sprintf("%s 已从 %.2f 调整为 %.2f", labelZH, from, to))
			return
		}
		warnings = append(warnings, fmt.Sprintf("%s adjusted from %.2f to %.2f", labelEN, from, to))
	}

	appendInt("最大持仓数", "max_positions", before.RiskControl.MaxPositions, after.RiskControl.MaxPositions)
	appendInt("BTC/ETH 最大杠杆", "btc_eth_max_leverage", before.RiskControl.BTCETHMaxLeverage, after.RiskControl.BTCETHMaxLeverage)
	appendInt("山寨币最大杠杆", "altcoin_max_leverage", before.RiskControl.AltcoinMaxLeverage, after.RiskControl.AltcoinMaxLeverage)
	appendFloat("BTC/ETH 最大仓位价值倍数", "btc_eth_max_position_value_ratio", before.RiskControl.BTCETHMaxPositionValueRatio, after.RiskControl.BTCETHMaxPositionValueRatio)
	appendFloat("山寨币最大仓位价值倍数", "altcoin_max_position_value_ratio", before.RiskControl.AltcoinMaxPositionValueRatio, after.RiskControl.AltcoinMaxPositionValueRatio)
	appendFloat("最小盈亏比", "min_risk_reward_ratio", before.RiskControl.MinRiskRewardRatio, after.RiskControl.MinRiskRewardRatio)
	appendFloat("最大保证金使用率", "max_margin_usage", before.RiskControl.MaxMarginUsage, after.RiskControl.MaxMarginUsage)
	appendFloat("最小开仓金额", "min_position_size", before.RiskControl.MinPositionSize, after.RiskControl.MinPositionSize)
	appendInt("最低置信度", "min_confidence", before.RiskControl.MinConfidence, after.RiskControl.MinConfidence)
	return warnings
}

// StrategyStore strategy storage
type StrategyStore struct {
	db *gorm.DB
}

// Strategy strategy configuration
type Strategy struct {
	ID            string    `gorm:"primaryKey" json:"id"`
	UserID        string    `gorm:"column:user_id;not null;default:'';index" json:"user_id"`
	Name          string    `gorm:"not null" json:"name"`
	Description   string    `gorm:"default:''" json:"description"`
	IsActive      bool      `gorm:"column:is_active;default:false;index" json:"is_active"`
	IsDefault     bool      `gorm:"column:is_default;default:false" json:"is_default"`
	IsPublic      bool      `gorm:"column:is_public;default:false;index" json:"is_public"`    // whether visible in strategy market
	ConfigVisible bool      `gorm:"column:config_visible;default:true" json:"config_visible"` // whether config details are visible
	Config        string    `gorm:"not null;default:'{}'" json:"config"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

func (Strategy) TableName() string { return "strategies" }

// StrategyConfig strategy configuration details (JSON structure)
type StrategyConfig struct {
	// Strategy type: "ai_trading" (default) or "grid_trading"
	StrategyType string `json:"strategy_type,omitempty"`

	// language setting: "zh" for Chinese, "en" for English
	// This determines the language used for data formatting and prompt generation
	Language string `json:"language,omitempty"`
	// AI trading configuration fields are kept on the Go struct for engine
	// compatibility, but JSON persistence nests them under ai_config.
	CoinSource     CoinSourceConfig     `json:"-"`
	Indicators     IndicatorConfig      `json:"-"`
	CustomPrompt   string               `json:"-"`
	RiskControl    RiskControlConfig    `json:"-"`
	PromptSections PromptSectionsConfig `json:"-"`

	// Grid trading configuration (only used when StrategyType == "grid_trading")
	GridConfig *GridStrategyConfig `json:"grid_config,omitempty"`

	// Publish settings are shared by AI and grid strategies. The database still
	// stores the authoritative booleans on Strategy, but config JSON may carry
	// this object for agent/frontend schema consistency.
	PublishConfig *PublishStrategyConfig `json:"publish_config,omitempty"`
}

// AIStrategyConfig contains fields only used by AI trading strategies.
type AIStrategyConfig struct {
	CoinSource     CoinSourceConfig     `json:"coin_source"`
	Indicators     IndicatorConfig      `json:"indicators"`
	CustomPrompt   string               `json:"custom_prompt,omitempty"`
	RiskControl    RiskControlConfig    `json:"risk_control"`
	PromptSections PromptSectionsConfig `json:"prompt_sections,omitempty"`
}

// PublishStrategyConfig contains settings shared by all strategy types.
type PublishStrategyConfig struct {
	IsPublic      bool `json:"is_public"`
	ConfigVisible bool `json:"config_visible"`
}

// MarshalJSON writes the product-facing strategy schema:
// strategy_type + grid_config or ai_config + shared publish_config.
func (c StrategyConfig) MarshalJSON() ([]byte, error) {
	strategyType := strings.TrimSpace(c.StrategyType)
	if strategyType == "" {
		strategyType = "ai_trading"
	}

	out := struct {
		StrategyType  string                 `json:"strategy_type"`
		Language      string                 `json:"language,omitempty"`
		AIConfig      *AIStrategyConfig      `json:"ai_config,omitempty"`
		GridConfig    *GridStrategyConfig    `json:"grid_config,omitempty"`
		PublishConfig *PublishStrategyConfig `json:"publish_config,omitempty"`
	}{
		StrategyType:  strategyType,
		Language:      c.Language,
		PublishConfig: c.PublishConfig,
	}

	if strategyType == "grid_trading" {
		out.GridConfig = c.GridConfig
	} else {
		out.AIConfig = &AIStrategyConfig{
			CoinSource:     c.CoinSource,
			Indicators:     c.Indicators,
			CustomPrompt:   c.CustomPrompt,
			RiskControl:    c.RiskControl,
			PromptSections: c.PromptSections,
		}
	}

	return json.Marshal(out)
}

// UnmarshalJSON accepts both the new nested schema and old flat configs. Old
// top-level AI fields are normalized into the Go compatibility fields.
func (c *StrategyConfig) UnmarshalJSON(data []byte) error {
	type rawStrategyConfig struct {
		StrategyType  string                 `json:"strategy_type"`
		Language      string                 `json:"language"`
		AIConfig      *AIStrategyConfig      `json:"ai_config"`
		GridConfig    *GridStrategyConfig    `json:"grid_config"`
		PublishConfig *PublishStrategyConfig `json:"publish_config"`

		CoinSource     *CoinSourceConfig     `json:"coin_source"`
		Indicators     *IndicatorConfig      `json:"indicators"`
		CustomPrompt   *string               `json:"custom_prompt"`
		RiskControl    *RiskControlConfig    `json:"risk_control"`
		PromptSections *PromptSectionsConfig `json:"prompt_sections"`
	}

	var raw rawStrategyConfig
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	c.StrategyType = raw.StrategyType
	c.Language = raw.Language
	c.GridConfig = raw.GridConfig
	c.PublishConfig = raw.PublishConfig

	if raw.AIConfig != nil {
		c.CoinSource = raw.AIConfig.CoinSource
		c.Indicators = raw.AIConfig.Indicators
		c.CustomPrompt = raw.AIConfig.CustomPrompt
		c.RiskControl = raw.AIConfig.RiskControl
		c.PromptSections = raw.AIConfig.PromptSections
	} else {
		if raw.CoinSource != nil {
			c.CoinSource = *raw.CoinSource
		}
		if raw.Indicators != nil {
			c.Indicators = *raw.Indicators
		}
		if raw.CustomPrompt != nil {
			c.CustomPrompt = *raw.CustomPrompt
		}
		if raw.RiskControl != nil {
			c.RiskControl = *raw.RiskControl
		}
		if raw.PromptSections != nil {
			c.PromptSections = *raw.PromptSections
		}
	}

	if strings.TrimSpace(c.StrategyType) == "" && c.GridConfig != nil {
		c.StrategyType = "grid_trading"
	}
	return nil
}

// GridStrategyConfig grid trading specific configuration
type GridStrategyConfig struct {
	// Trading pair (e.g., "BTCUSD")
	Symbol string `json:"symbol"`
	// Number of grid levels (5-50)
	GridCount int `json:"grid_count"`
	// Total investment in USD
	TotalInvestment float64 `json:"total_investment"`
	// Leverage (1-20)
	Leverage int `json:"leverage"`
	// Upper price boundary (0 = auto-calculate from ATR)
	UpperPrice float64 `json:"upper_price"`
	// Lower price boundary (0 = auto-calculate from ATR)
	LowerPrice float64 `json:"lower_price"`
	// Use ATR to auto-calculate bounds
	UseATRBounds bool `json:"use_atr_bounds"`
	// ATR multiplier for bound calculation (default 2.0)
	ATRMultiplier float64 `json:"atr_multiplier"`
	// Position distribution: "uniform" | "gaussian" | "pyramid"
	Distribution string `json:"distribution"`
	// Maximum drawdown percentage before emergency exit
	MaxDrawdownPct float64 `json:"max_drawdown_pct"`
	// Stop loss percentage per position
	StopLossPct float64 `json:"stop_loss_pct"`
	// Daily loss limit percentage
	DailyLossLimitPct float64 `json:"daily_loss_limit_pct"`
	// Use maker-only orders for lower fees
	UseMakerOnly bool `json:"use_maker_only"`
	// Enable automatic grid direction adjustment based on box breakouts
	EnableDirectionAdjust bool `json:"enable_direction_adjust"`
	// Direction bias ratio for long_bias/short_bias modes (default 0.7 = 70%/30%)
	DirectionBiasRatio float64 `json:"direction_bias_ratio"`
}

// PromptSectionsConfig editable sections of System Prompt
type PromptSectionsConfig struct {
	// role definition (title + description)
	RoleDefinition string `json:"role_definition,omitempty"`
	// trading frequency awareness
	TradingFrequency string `json:"trading_frequency,omitempty"`
	// entry standards
	EntryStandards string `json:"entry_standards,omitempty"`
	// decision process
	DecisionProcess string `json:"decision_process,omitempty"`
}

// CoinSourceConfig coin source configuration
type CoinSourceConfig struct {
	// source type shown in the product editor: "static" | "ai500" | "oi_top" | "oi_low" | "forex"
	SourceType string `json:"source_type"`
	// static coin list (used when source_type = "static")
	StaticCoins []string `json:"static_coins,omitempty"`
	// forex pairs list (used when source_type = "forex", e.g. ["EURUSD", "GBPUSD"])
	ForexPairs []string `json:"forex_pairs,omitempty"`
	// excluded coins list (filtered out from all sources)
	ExcludedCoins []string `json:"excluded_coins,omitempty"`
	// whether to use AI500 coin pool
	UseAI500 bool `json:"use_ai500"`
	// AI500 coin pool maximum count
	AI500Limit int `json:"ai500_limit,omitempty"`
	// whether to use OI Top (OI increase ranking, suitable for long positions)
	UseOITop bool `json:"use_oi_top"`
	// OI Top maximum count
	OITopLimit int `json:"oi_top_limit,omitempty"`
	// whether to use OI Low (OI decrease ranking, suitable for short positions)
	UseOILow bool `json:"use_oi_low"`
	// OI Low maximum count
	OILowLimit int `json:"oi_low_limit,omitempty"`
	// whether to use Hyperliquid All coins (all available perp pairs)
	UseHyperAll bool `json:"use_hyper_all"`
	// whether to use Hyperliquid Main coins (top N by 24h volume)
	UseHyperMain bool `json:"use_hyper_main"`
	// Hyperliquid Main maximum count (default 20)
	HyperMainLimit int `json:"hyper_main_limit,omitempty"`
	// Note: API URLs are now built automatically using NofxOSAPIKey from IndicatorConfig
}

// IndicatorConfig indicator configuration
type IndicatorConfig struct {
	// K-line configuration
	Klines KlineConfig `json:"klines"`
	// raw kline data (OHLCV) - always enabled, required for AI analysis
	EnableRawKlines bool `json:"enable_raw_klines"`
	// technical indicator switches
	EnableEMA         bool `json:"enable_ema"`
	EnableMACD        bool `json:"enable_macd"`
	EnableRSI         bool `json:"enable_rsi"`
	EnableATR         bool `json:"enable_atr"`
	EnableBOLL        bool `json:"enable_boll"` // Bollinger Bands
	EnableVolume      bool `json:"enable_volume"`
	EnableOI          bool `json:"enable_oi"`           // open interest
	EnableFundingRate bool `json:"enable_funding_rate"` // funding rate
	// EMA period configuration
	EMAPeriods []int `json:"ema_periods,omitempty"` // default [20, 50, 200]
	// RSI period configuration
	RSIPeriods []int `json:"rsi_periods,omitempty"` // default [7, 14]
	// ATR period configuration
	ATRPeriods []int `json:"atr_periods,omitempty"` // default [14]
	// BOLL period configuration (period, standard deviation multiplier is fixed at 2)
	BOLLPeriods []int `json:"boll_periods,omitempty"` // default [20] - can select multiple timeframes
	// external data sources
	ExternalDataSources []ExternalDataSource `json:"external_data_sources,omitempty"`

	// ========== NofxOS Unified API Configuration ==========
	// Unified API Key for all NofxOS data sources
	NofxOSAPIKey string `json:"nofxos_api_key,omitempty"`

	// quantitative data sources (capital flow, position changes, price changes)
	EnableQuantData    bool `json:"enable_quant_data"`    // whether to enable quantitative data
	EnableQuantOI      bool `json:"enable_quant_oi"`      // whether to show OI data
	EnableQuantNetflow bool `json:"enable_quant_netflow"` // whether to show Netflow data

	// OI ranking data (market-wide open interest increase/decrease rankings)
	EnableOIRanking   bool   `json:"enable_oi_ranking"`             // whether to enable OI ranking data
	OIRankingDuration string `json:"oi_ranking_duration,omitempty"` // duration: 1h, 4h, 24h
	OIRankingLimit    int    `json:"oi_ranking_limit,omitempty"`    // number of entries (default 10)

	// NetFlow ranking data (market-wide fund flow rankings - institution/personal)
	EnableNetFlowRanking   bool   `json:"enable_netflow_ranking"`             // whether to enable NetFlow ranking data
	NetFlowRankingDuration string `json:"netflow_ranking_duration,omitempty"` // duration: 1h, 4h, 24h
	NetFlowRankingLimit    int    `json:"netflow_ranking_limit,omitempty"`    // number of entries (default 10)

	// Price ranking data (market-wide gainers/losers)
	EnablePriceRanking   bool   `json:"enable_price_ranking"`             // whether to enable price ranking data
	PriceRankingDuration string `json:"price_ranking_duration,omitempty"` // durations: "1h" or "1h,4h,24h"
	PriceRankingLimit    int    `json:"price_ranking_limit,omitempty"`    // number of entries per ranking (default 10)
}

// KlineConfig K-line configuration
type KlineConfig struct {
	// primary timeframe: "1m", "3m", "5m", "15m", "1h", "4h"
	PrimaryTimeframe string `json:"primary_timeframe"`
	// primary timeframe K-line count
	PrimaryCount int `json:"primary_count"`
	// longer timeframe
	LongerTimeframe string `json:"longer_timeframe,omitempty"`
	// longer timeframe K-line count
	LongerCount int `json:"longer_count,omitempty"`
	// whether to enable multi-timeframe analysis
	EnableMultiTimeframe bool `json:"enable_multi_timeframe"`
	// selected timeframe list (new: supports multi-timeframe selection)
	SelectedTimeframes []string `json:"selected_timeframes,omitempty"`
}

// ExternalDataSource external data source configuration
type ExternalDataSource struct {
	Name        string            `json:"name"`   // data source name
	Type        string            `json:"type"`   // type: "api" | "webhook"
	URL         string            `json:"url"`    // API URL
	Method      string            `json:"method"` // HTTP method
	Headers     map[string]string `json:"headers,omitempty"`
	DataPath    string            `json:"data_path,omitempty"`    // JSON data path
	RefreshSecs int               `json:"refresh_secs,omitempty"` // refresh interval (seconds)
}

// RiskControlConfig risk control configuration
type RiskControlConfig struct {
	// Max number of coins held simultaneously (CODE ENFORCED)
	MaxPositions int `json:"max_positions"`

	// BTC/ETH exchange leverage for opening positions (AI guided)
	BTCETHMaxLeverage int `json:"btc_eth_max_leverage"`
	// Altcoin exchange leverage for opening positions (AI guided)
	AltcoinMaxLeverage int `json:"altcoin_max_leverage"`

	// BTC/ETH single position max value = equity × this ratio (CODE ENFORCED, default: 5)
	BTCETHMaxPositionValueRatio float64 `json:"btc_eth_max_position_value_ratio"`
	// Altcoin single position max value = equity × this ratio (CODE ENFORCED, default: 1)
	AltcoinMaxPositionValueRatio float64 `json:"altcoin_max_position_value_ratio"`

	// Max margin utilization (e.g. 0.9 = 90%) (CODE ENFORCED)
	MaxMarginUsage float64 `json:"max_margin_usage"`
	// Min position size in USD (CODE ENFORCED)
	MinPositionSize float64 `json:"min_position_size"`

	// Min take_profit / stop_loss ratio (AI guided)
	MinRiskRewardRatio float64 `json:"min_risk_reward_ratio"`
	// Min AI confidence to open position (AI guided)
	MinConfidence int `json:"min_confidence"`

	// ========== Forex / Percentage-Based Risk Management ==========

	// Risk percentage per trade as a fraction of account equity (e.g. 0.0025 = 0.25%).
	// When > 0 this drives lot-size calculation unless RiskUSDPerTrade is also set.
	// Formula: lots = (RiskPctPerTrade × equity) / (stopLossPips × pipValue)
	RiskPctPerTrade float64 `json:"risk_pct_per_trade,omitempty"`

	// Fixed dollar risk per trade (e.g. 10.0 = risk exactly $10 per trade).
	// When > 0 this takes precedence over RiskPctPerTrade.
	// Formula: lots = RiskUSDPerTrade / (stopLossPips × pipValue)
	RiskUSDPerTrade float64 `json:"risk_usd_per_trade,omitempty"`

	// Maximum cumulative risk exposure across all open positions (e.g. 0.06 = 6%).
	MaxTotalRiskPct float64 `json:"max_total_risk_pct,omitempty"`

	// Maximum daily loss as a percentage of equity before trading halts (e.g. 0.05 = 5%).
	MaxDailyLossPct float64 `json:"max_daily_loss_pct,omitempty"`

	// Maximum drawdown from equity peak before trading halts (e.g. 0.10 = 10%).
	MaxDrawdownPct float64 `json:"max_drawdown_pct,omitempty"`

	// Cent account normalization: when true the raw broker balance is treated as
	// cents and multiplied by 100 for all risk/sizing calculations.
	// Example: $10 cent-account balance → $1000 effective equity.
	IsCentAccount bool `json:"is_cent_account,omitempty"`

	// Trading session filter: restrict execution to specific forex sessions.
	// Supported values: "london", "new_york", "tokyo", "sydney", "london_ny_overlap"
	// Empty slice = trade all sessions.
	AllowedSessions []string `json:"allowed_sessions,omitempty"`

	// Preferred forex timeframes for multi-timeframe analysis.
	// Defaults to ["15m","1h","4h"] when empty.
	ForexTimeframes []string `json:"forex_timeframes,omitempty"`

	// Minimum lot size to submit to the broker (e.g. 0.05).
	// Trades that compute to fewer lots than this are skipped (Action → "wait").
	// Defaults to BrokerMinLot (0.01) when 0.
	MinLots float64 `json:"min_lots,omitempty"`
}

// NewStrategyStore creates a new StrategyStore
func NewStrategyStore(db *gorm.DB) *StrategyStore {
	return &StrategyStore{db: db}
}

func (s *StrategyStore) initTables() error {
	// AutoMigrate will add missing columns without dropping existing data
	return s.db.AutoMigrate(&Strategy{})
}

func (s *StrategyStore) initDefaultData() error {
	// No longer pre-populate strategies - create on demand when user configures

	// One-time migration: bump RiskPctPerTrade from 0.0025 → 0.005 for all
	// forex strategies. Safe to run on every startup — the system_config flag
	// ensures it only patches the DB once.
	_ = s.migrateForexRiskPct("0.0025", 0.005, "migration_forex_risk_pct_v3")
	// One-time migration: bump RiskPctPerTrade to 0.01 (1%) for all forex strategies.
	_ = s.migrateForexRiskPct("0.005", 0.01, "migration_forex_risk_pct_v4")
	// One-time migration: reduce RiskPctPerTrade to 0.005 (0.5%) for all forex strategies.
	_ = s.migrateForexRiskPct("0.01", 0.005, "migration_forex_risk_pct_v5")
	// One-time migration: set RiskPctPerTrade to 0.007 (0.7%) for all forex strategies.
	_ = s.migrateForexRiskPct("0.005", 0.007, "migration_forex_risk_pct_v6")
	// One-time migration: reduce RiskPctPerTrade to 0.005 (0.5%) for all forex strategies.
	_ = s.migrateForexRiskPct("0.007", 0.005, "migration_forex_risk_pct_v7")
	return nil
}

// migrateForexRiskPct updates risk_pct_per_trade in every forex strategy whose
// current value equals oldPct. Uses a system_config key as a run-once guard.
func (s *StrategyStore) migrateForexRiskPct(oldPctStr string, newPct float64, migrationKey string) error {
	// Check if already applied
	var count int64
	s.db.Table("system_config").Where("key = ?", migrationKey).Count(&count)
	if count > 0 {
		return nil
	}

	var strategies []Strategy
	if err := s.db.Find(&strategies).Error; err != nil {
		return err
	}

	updated := 0
	for _, st := range strategies {
		cfg, err := st.ParseConfig()
		if err != nil {
			continue
		}
		// Patch all forex strategies missing risk sizing config
		// (zero on both means ApplyForexPositionSizing exits early and the AI's raw
		// lot size — typically 0.01 — is sent directly to the broker)
		if cfg.CoinSource.SourceType != "forex" {
			continue
		}
		if cfg.RiskControl.RiskPctPerTrade != 0 || cfg.RiskControl.RiskUSDPerTrade != 0 {
			continue // already has sizing configured, leave it alone
		}
		cfg.RiskControl.RiskPctPerTrade = newPct
		if err := st.SetConfig(cfg); err != nil {
			continue
		}
		if err := s.db.Model(&Strategy{}).Where("id = ?", st.ID).Update("config", st.Config).Error; err != nil {
			continue
		}
		updated++
	}

	// Mark migration complete
	s.db.Exec("INSERT INTO system_config(key, value) VALUES(?, ?) ON CONFLICT(key) DO NOTHING",
		migrationKey, "done")

	if updated > 0 {
		// Use fmt since logger may not be imported here
		_ = updated // logged by caller context
	}
	return nil
}

// GetDefaultStrategyConfig returns the default strategy configuration for the given language
func GetDefaultStrategyConfig(lang string) StrategyConfig {
	// Normalize language to "zh" or "en"
	normalizedLang := "en"
	if lang == "zh" {
		normalizedLang = "zh"
	}

	config := StrategyConfig{
		Language: normalizedLang,
		CoinSource: CoinSourceConfig{
			// Forex mode — trades currency pairs via MT5 bridge
			SourceType: "forex",
			// Major pairs: highest liquidity, tightest spreads, best for triple-confluence strategy
			ForexPairs: []string{"EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDAD", "XAUUSD"},
		},
		Indicators: IndicatorConfig{
			Klines: KlineConfig{
				// 15m entry timeframe — clear structure without 5m noise
				PrimaryTimeframe: "15m",
				PrimaryCount:     30,
				// 4h higher-timeframe bias anchor
				LongerTimeframe:      "4h",
				LongerCount:          20,
				EnableMultiTimeframe: true,
				// Three-screen setup: 4H bias → 1H structure → 15M entry
				SelectedTimeframes: []string{"15m", "1h", "4h"},
			},
			EnableRawKlines: true, // Required - raw OHLCV data for AI analysis
			// EMA 20/50/200: short-term momentum, medium trend, long-term bias
			EnableEMA: true,
			// MACD: momentum confirmation, filters false EMA crossovers
			EnableMACD: true,
			// RSI(14): enter only when RSI crosses 50 in trend direction
			EnableRSI: true,
			// ATR(14): stop = 1.5×ATR, target = 3.75×ATR → R:R ≥ 2.5
			EnableATR:         true,
			EnableBOLL:        false,
			EnableVolume:      true,
			EnableOI:          false, // not applicable for forex
			EnableFundingRate: false, // not applicable for forex
			// EMA 20 (short), 50 (medium), 200 (long-term bias)
			EMAPeriods: []int{20, 50, 200},
			// RSI 14 standard; 7 for short-term entry confirmation
			RSIPeriods: []int{7, 14},
			// ATR 14 for dynamic stop/TP sizing
			ATRPeriods:  []int{14},
			BOLLPeriods: []int{20},
			// NofxOS unified API key
			NofxOSAPIKey: "cm_568c67eae410d912c54c",
			// Quant/OI data not applicable for forex
			EnableQuantData:    false,
			EnableQuantOI:      false,
			EnableQuantNetflow: false,
			EnableOIRanking:    false,
			EnableNetFlowRanking: false,
			// Price ranking still useful for cross-pair momentum awareness
			EnablePriceRanking:   true,
			PriceRankingDuration: "1h,4h,24h",
			PriceRankingLimit:    10,
		},
		RiskControl: RiskControlConfig{
			MaxPositions:                 3,    // Max 3 pairs simultaneously (CODE ENFORCED)
			BTCETHMaxLeverage:            30,   // Major pairs max leverage (AI guided)
			AltcoinMaxLeverage:           20,   // Minor/exotic pairs max leverage (AI guided)
			BTCETHMaxPositionValueRatio:  10.0, // Major pairs: max position = 10× equity (CODE ENFORCED)
			AltcoinMaxPositionValueRatio: 5.0,  // Minor pairs: max position = 5× equity (CODE ENFORCED)
			MaxMarginUsage:               0.80, // 80% max — extra buffer for forex gap risk
			MinPositionSize:              12,   // Min 12 USD per position (CODE ENFORCED)
			// 2.5:1 R:R — consistent with ATR-based stop/target sizing
			MinRiskRewardRatio: 2.5,
			// 78% confidence threshold — filters marginal setups
			MinConfidence: 78,
			// 0.5% risk per trade
			RiskPctPerTrade: 0.005,
			// Max 3% total open risk across all positions
			MaxTotalRiskPct: 0.03,
			// 3% daily loss limit before halting
			MaxDailyLossPct: 0.03,
			// Trade only during London and NY sessions for EUR/GBP/USD pairs
			AllowedSessions: []string{"london", "new_york"},
			// Preferred forex analysis timeframes
			ForexTimeframes: []string{"15m", "1h", "4h"},
		},
	}

	if lang == "zh" {
		config.PromptSections = PromptSectionsConfig{
			RoleDefinition: `# 角色定义

你是一位拥有15年实战经验的机构级外汇交易员，曾就职于顶级对冲基金，擅长主要货币对及黄金的趋势跟随交易。

你的交易哲学：
- 只做高概率设置，宁可空仓也不做模糊信号
- 严格的风险管理是长期生存的唯一保障
- 市场永远是对的，趋势是你的朋友
- 每一笔交易都必须有清晰的逻辑、明确的止损、合理的盈亏比

你的专长：
- 多时间框架分析（4H宏观趋势 + 1H结构 + 15M精准入场）
- 技术指标：EMA趋势体系、MACD动量确认、RSI超买超卖、ATR波动率定位
- 交易时段过滤：专注伦敦/纽约时段的高流动性窗口
- 风险管理：每笔交易固定0.5%账户风险，ATR动态止损`,
			TradingFrequency: `# ⏱️ 交易频率

- 目标：每天2-4笔高质量交易，仅在伦敦/纽约时段操作（UTC 07:00–21:00）
- 每笔交易必须同时满足趋势、动量、时段三个维度
- 单笔持仓时间 ≥ 1-4小时
- 宁可错过，不可乱入；亚洲时段（低流动性）不开主要货币对`,
			EntryStandards: `# 🎯 入场标准（三重共振 + 时段过滤）

做多条件（同时满足）：
1. 时段：当前为伦敦或纽约时段（UTC 07:00–21:00）
2. 趋势层：4H收盘价 > EMA50 且 EMA20 > EMA50
3. 动量层：1H MACD柱状图由负转正 或 RSI(14)从下方穿越50线
4. 入场层：15M出现看涨形态（K线突破/回踩支撑/流动性扫除后反转），RSI(7) > 45

做空条件（同时满足）：
1. 时段：当前为伦敦或纽约时段（UTC 07:00–21:00）
2. 趋势层：4H收盘价 < EMA50 且 EMA20 < EMA50
3. 动量层：1H MACD柱状图由正转负 或 RSI(14)从上方穿越50线
4. 入场层：15M出现看跌形态（K线跌破支撑/反弹受阻/流动性扫除后反转），RSI(7) < 55

过滤规则（有任一条即跳过）：
- 非伦敦/纽约时段（悉尼/亚洲时段）
- 4H与1H方向相反
- 价格在EMA20与EMA50之间震荡（无方向）
- 重大经济数据发布前30分钟内`,
			DecisionProcess: `# 📋 决策流程

止损：入场价 ± 1.5 × ATR(14)（15M周期），主要货币对最少15点
止盈：至少 2.5 × 止损距离（R:R ≥ 2.5:1）
仓位：每笔风险 = 账户净值的0.5%（RiskPctPerTrade自动计算手数）

1. 检查时段 → 是否为伦敦或纽约时段
2. 检查现有持仓 → 是否触及止盈/止损线
3. 4H偏向过滤 → 仅保留与4H趋势一致的方向
4. 1H动量确认 → MACD + RSI(14)双重验证
5. 15M入场触发 → 具体形态 + RSI(7)确认
6. 计算ATR止损/止盈，确认R:R ≥ 2.5，设置risk_usd
7. 先写思维链，再输出结构化JSON`,
		}
	} else {
		config.PromptSections = PromptSectionsConfig{
			RoleDefinition: `# Role Definition

You are an institutional-grade forex trader with 15 years of live market experience, formerly at a top-tier hedge fund, specializing in trend-following on major currency pairs and gold.

Your trading philosophy:
- Only take high-probability setups — staying flat is a valid position when signals are unclear
- Strict risk management is the only guarantee of long-term survival
- The market is always right; trend is your friend
- Every trade must have a clear rationale, a defined stop-loss, and a justified risk-reward ratio

Your expertise:
- Multi-timeframe analysis: 4H macro trend → 1H structure → 15M precision entry
- Technical toolkit: EMA trend system, MACD momentum confirmation, RSI overbought/oversold, ATR volatility-based sizing
- Session filtering: focus on London/NY high-liquidity windows, avoid low-volume Asian drift
- Risk management: fixed 0.5% account risk per trade, ATR dynamic stop placement`,
			TradingFrequency: `# ⏱️ Trading Frequency

- Target: 2-4 high-quality trades per day, London/NY sessions only (UTC 07:00–21:00)
- Every trade must satisfy trend, momentum, and session filters simultaneously
- Minimum hold time: 1-4 hours per position
- Missing a trade beats a low-quality entry; avoid trading Asian session (low liquidity) on major pairs`,
			EntryStandards: `# 🎯 Entry Standards (Triple Confluence + Session Filter)

LONG conditions (all must be true):
1. Session: Currently London or New York session (UTC 07:00–21:00)
2. Trend: 4H close > EMA50 AND EMA20 > EMA50 (bullish medium-term bias)
3. Momentum: 1H MACD histogram turns positive OR RSI(14) crosses above 50
4. Entry trigger: 15M bullish setup (breakout/pullback to support/liquidity sweep reversal), RSI(7) > 45

SHORT conditions (all must be true):
1. Session: Currently London or New York session (UTC 07:00–21:00)
2. Trend: 4H close < EMA50 AND EMA20 < EMA50 (bearish medium-term bias)
3. Momentum: 1H MACD histogram turns negative OR RSI(14) crosses below 50
4. Entry trigger: 15M bearish setup (breakdown/rejection/liquidity sweep reversal), RSI(7) < 55

Skip the trade if any filter triggers:
- Outside London/NY session (Sydney/Asian session)
- 4H and 1H trend directions conflict
- Price oscillating between EMA20 and EMA50 (no clear direction)
- Within 30 minutes of a major news event`,
			DecisionProcess: `# 📋 Decision Process

Stop-loss: entry ± 1.5 × ATR(14) on 15M, minimum 15 pips for major pairs
Take-profit: at least 2.5 × stop-loss distance (R:R ≥ 2.5:1)
Position size: 0.5% equity risk per trade (lot size auto-calculated from stop distance via RiskPctPerTrade)

1. Check session → is it London or New York session?
2. Review open positions → stop-loss or take-profit hit?
3. 4H bias filter → only trade in direction of 4H trend
4. 1H momentum confirmation → MACD + RSI(14) dual check
5. 15M entry trigger → specific pattern + RSI(7) confirmation
6. Calculate ATR stop/target, confirm R:R ≥ 2.5, set risk_usd
7. Write chain-of-thought first, then output structured JSON`,
		}
	}

	return config
}

// Create create a strategy
func (s *StrategyStore) Create(strategy *Strategy) error {
	return s.db.Create(strategy).Error
}

// Update update a strategy
func (s *StrategyStore) Update(strategy *Strategy) error {
	return s.db.Model(&Strategy{}).
		Where("id = ? AND user_id = ?", strategy.ID, strategy.UserID).
		Updates(map[string]interface{}{
			"name":           strategy.Name,
			"description":    strategy.Description,
			"config":         strategy.Config,
			"is_public":      strategy.IsPublic,
			"config_visible": strategy.ConfigVisible,
			"updated_at":     time.Now().UTC(),
		}).Error
}

// Delete delete a strategy
func (s *StrategyStore) Delete(userID, id string) error {
	// do not allow deleting system default strategy
	var st Strategy
	if err := s.db.Where("id = ?", id).First(&st).Error; err == nil {
		if st.IsDefault {
			return fmt.Errorf("cannot delete system default strategy")
		}
		if st.IsActive {
			return fmt.Errorf("cannot delete active strategy")
		}
	}

	// Check if any trader references this strategy
	var count int64
	if err := s.db.Model(&Trader{}).
		Where("user_id = ? AND strategy_id = ?", userID, id).
		Count(&count).Error; err == nil && count > 0 {
		return fmt.Errorf("cannot delete strategy in use by %d trader(s) - reassign those traders first", count)
	}

	return s.db.Where("id = ? AND user_id = ?", id, userID).Delete(&Strategy{}).Error
}

// List get user's strategy list
func (s *StrategyStore) List(userID string) ([]*Strategy, error) {
	var strategies []*Strategy
	err := s.db.Where("user_id = ? OR is_default = ?", userID, true).
		Order("is_default DESC, created_at DESC").
		Find(&strategies).Error
	if err != nil {
		return nil, err
	}
	return strategies, nil
}

// ListPublic get all public strategies for the strategy market
func (s *StrategyStore) ListPublic() ([]*Strategy, error) {
	var strategies []*Strategy
	err := s.db.Where("is_public = ?", true).
		Order("created_at DESC").
		Find(&strategies).Error
	if err != nil {
		return nil, err
	}
	return strategies, nil
}

// Get get a single strategy
func (s *StrategyStore) Get(userID, id string) (*Strategy, error) {
	var st Strategy
	err := s.db.Where("id = ? AND (user_id = ? OR is_default = ?)", id, userID, true).
		First(&st).Error
	if err != nil {
		return nil, err
	}
	return &st, nil
}

// GetActive get user's currently active strategy
func (s *StrategyStore) GetActive(userID string) (*Strategy, error) {
	var st Strategy
	err := s.db.Where("user_id = ? AND is_active = ?", userID, true).First(&st).Error
	if err == gorm.ErrRecordNotFound {
		// no active strategy, return system default strategy
		return s.GetDefault()
	}
	if err != nil {
		return nil, err
	}
	return &st, nil
}

// GetDefault get system default strategy
func (s *StrategyStore) GetDefault() (*Strategy, error) {
	var st Strategy
	err := s.db.Where("is_default = ?", true).First(&st).Error
	if err != nil {
		return nil, err
	}
	return &st, nil
}

// SetActive set active strategy (will first deactivate other strategies)
func (s *StrategyStore) SetActive(userID, strategyID string) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		// first deactivate all strategies for the user
		if err := tx.Model(&Strategy{}).Where("user_id = ?", userID).
			Update("is_active", false).Error; err != nil {
			return err
		}

		// activate specified strategy
		return tx.Model(&Strategy{}).
			Where("id = ? AND (user_id = ? OR is_default = ?)", strategyID, userID, true).
			Update("is_active", true).Error
	})
}

// Duplicate duplicate a strategy (used to create custom strategy based on default strategy)
func (s *StrategyStore) Duplicate(userID, sourceID, newID, newName string) error {
	// get source strategy
	source, err := s.Get(userID, sourceID)
	if err != nil {
		return fmt.Errorf("failed to get source strategy: %w", err)
	}

	// create new strategy
	newStrategy := &Strategy{
		ID:          newID,
		UserID:      userID,
		Name:        newName,
		Description: "Created based on [" + source.Name + "]",
		IsActive:    false,
		IsDefault:   false,
		Config:      source.Config,
	}

	return s.Create(newStrategy)
}

// ParseConfig parse strategy configuration JSON
func (s *Strategy) ParseConfig() (*StrategyConfig, error) {
	var config StrategyConfig
	if err := json.Unmarshal([]byte(s.Config), &config); err != nil {
		return nil, fmt.Errorf("failed to parse strategy configuration: %w", err)
	}
	return &config, nil
}

// SetConfig set strategy configuration
func (s *Strategy) SetConfig(config *StrategyConfig) error {
	data, err := json.Marshal(config)
	if err != nil {
		return fmt.Errorf("failed to serialize strategy configuration: %w", err)
	}
	s.Config = string(data)
	return nil
}

// ============================================================================
// Token Estimation
// ============================================================================

// TokenEstimate holds the result of token estimation
type TokenEstimate struct {
	Total       int            `json:"total"`
	Breakdown   TokenBreakdown `json:"breakdown"`
	ModelLimits []ModelLimit   `json:"model_limits"`
	Suggestions []string       `json:"suggestions"`
}

// TokenBreakdown shows estimated tokens per component
type TokenBreakdown struct {
	SystemPrompt  int `json:"system_prompt"`
	MarketData    int `json:"market_data"`
	RankingData   int `json:"ranking_data"`
	QuantData     int `json:"quant_data"`
	FixedOverhead int `json:"fixed_overhead"`
}

// ModelLimit shows token usage against a specific model's context limit
type ModelLimit struct {
	Name         string `json:"name"`
	ContextLimit int    `json:"context_limit"`
	UsagePct     int    `json:"usage_pct"`
	Level        string `json:"level"` // "ok" | "warning" | "danger"
}

// Context window sizes (tokens) for each model family
const (
	contextLimitDeepSeek = 131_072   // 128K
	contextLimitOpenAI   = 128_000   // 128K
	contextLimitClaude   = 200_000   // 200K
	contextLimitQwen     = 131_072   // 128K
	contextLimitGemini   = 1_000_000 // 1M
	contextLimitGrok     = 131_072   // 128K
	contextLimitKimi     = 131_072   // 128K
	contextLimitMinimax  = 1_000_000 // 1M
)

// ModelContextLimits maps provider names to their context window sizes (in tokens)
var ModelContextLimits = map[string]int{
	"deepseek": contextLimitDeepSeek,
	"openai":   contextLimitOpenAI,
	"claude":   contextLimitClaude,
	"qwen":     contextLimitQwen,
	"gemini":   contextLimitGemini,
	"grok":     contextLimitGrok,
	"kimi":     contextLimitKimi,
	"minimax":  contextLimitMinimax,
}

// GetContextLimit returns the context limit for a given provider
func GetContextLimit(provider string) int {
	if limit, ok := ModelContextLimits[provider]; ok {
		return limit
	}
	return contextLimitDeepSeek // safe default
}

// GetContextLimitForClient returns context limit for a provider+model pair.
// For claw402, the underlying model is inferred from the model name prefix.
func GetContextLimitForClient(provider, model string) int {
	if provider == "claw402" {
		switch {
		case strings.HasPrefix(model, "claude"):
			return ModelContextLimits["claude"]
		case strings.HasPrefix(model, "gpt"), strings.HasPrefix(model, "o1"), strings.HasPrefix(model, "o3"):
			return ModelContextLimits["openai"]
		case strings.HasPrefix(model, "gemini"):
			return ModelContextLimits["gemini"]
		case strings.HasPrefix(model, "grok"):
			return ModelContextLimits["grok"]
		case strings.HasPrefix(model, "kimi"):
			return ModelContextLimits["kimi"]
		case strings.HasPrefix(model, "qwen"):
			return ModelContextLimits["qwen"]
		case strings.HasPrefix(model, "minimax"):
			return ModelContextLimits["minimax"]
		case strings.HasPrefix(model, "deepseek"):
			return ModelContextLimits["deepseek"]
		default:
			return ModelContextLimits["deepseek"]
		}
	}
	return GetContextLimit(provider)
}

// EstimateTokens estimates the total token count for a strategy configuration.
// This is a pure computation based on config fields — no network calls.
func (c *StrategyConfig) EstimateTokens() TokenEstimate {
	breakdown := TokenBreakdown{}

	// --- System Prompt ---
	// Base system prompt: schema + role + rules + output format
	baseChars := 4000 // English default
	if c.Language == "zh" {
		baseChars = 3000
	}
	// Add prompt sections
	baseChars += len(c.PromptSections.RoleDefinition)
	baseChars += len(c.PromptSections.TradingFrequency)
	baseChars += len(c.PromptSections.EntryStandards)
	baseChars += len(c.PromptSections.DecisionProcess)
	baseChars += len(c.CustomPrompt)

	if c.Language == "zh" {
		breakdown.SystemPrompt = baseChars / 2 // CJK: ~2 chars per token
	} else {
		breakdown.SystemPrompt = baseChars / 4 // English: ~4 chars per token
	}

	// --- Fixed Overhead ---
	// Time, BTC price, account info, section headers
	breakdown.FixedOverhead = 800 / 4 // ~200 tokens

	// --- Market Data ---
	numCoins := c.getEffectiveCoinCount()
	numTimeframes := c.getEffectiveTimeframeCount()
	klineCount := c.Indicators.Klines.PrimaryCount
	if klineCount <= 0 {
		klineCount = 20
	}

	// Per coin per timeframe: kline OHLCV rows
	charsPerCoinTF := klineCount * 80 // each OHLCV line ~80 chars

	// Add enabled indicator overhead per timeframe
	indicatorCharsPerLine := 0
	if c.Indicators.EnableEMA {
		indicatorCharsPerLine += 20 // EMA values appended
	}
	if c.Indicators.EnableMACD {
		indicatorCharsPerLine += 30
	}
	if c.Indicators.EnableRSI {
		indicatorCharsPerLine += 15
	}
	if c.Indicators.EnableATR {
		indicatorCharsPerLine += 15
	}
	if c.Indicators.EnableBOLL {
		indicatorCharsPerLine += 25
	}
	if c.Indicators.EnableVolume {
		indicatorCharsPerLine += 10
	}
	charsPerCoinTF += klineCount * indicatorCharsPerLine

	totalMarketChars := numCoins * numTimeframes * charsPerCoinTF

	// OI + Funding per coin
	if c.Indicators.EnableOI || c.Indicators.EnableFundingRate {
		totalMarketChars += numCoins * 100
	}

	breakdown.MarketData = totalMarketChars / 4 // numeric data: ~4 chars per token

	// --- Quant Data ---
	if c.Indicators.EnableQuantData {
		quantCharsPerCoin := 0
		if c.Indicators.EnableQuantOI {
			quantCharsPerCoin += 300
		}
		if c.Indicators.EnableQuantNetflow {
			quantCharsPerCoin += 300
		}
		breakdown.QuantData = (numCoins * quantCharsPerCoin) / 4
	}

	// --- Ranking Data ---
	rankingChars := 0
	if c.Indicators.EnableOIRanking {
		limit := c.Indicators.OIRankingLimit
		if limit <= 0 {
			limit = 10
		}
		rankingChars += limit * 60
	}
	if c.Indicators.EnableNetFlowRanking {
		limit := c.Indicators.NetFlowRankingLimit
		if limit <= 0 {
			limit = 10
		}
		rankingChars += limit * 80
	}
	if c.Indicators.EnablePriceRanking {
		limit := c.Indicators.PriceRankingLimit
		if limit <= 0 {
			limit = 10
		}
		// Count durations (comma-separated)
		numDurations := 1
		if c.Indicators.PriceRankingDuration != "" {
			numDurations = len(strings.Split(c.Indicators.PriceRankingDuration, ","))
		}
		rankingChars += limit * numDurations * 40
	}
	breakdown.RankingData = rankingChars / 4

	// --- Total with 15% safety margin ---
	subtotal := breakdown.SystemPrompt + breakdown.MarketData + breakdown.RankingData + breakdown.QuantData + breakdown.FixedOverhead
	total := subtotal * 115 / 100

	// --- Model limits ---
	modelLimits := make([]ModelLimit, 0, len(ModelContextLimits))
	for name, limit := range ModelContextLimits {
		pct := total * 100 / limit
		level := "ok"
		if pct >= 100 {
			level = "danger"
		} else if pct >= 80 {
			level = "warning"
		}
		modelLimits = append(modelLimits, ModelLimit{
			Name:         name,
			ContextLimit: limit,
			UsagePct:     pct,
			Level:        level,
		})
	}

	// Sort by usage_pct desc, then name asc for deterministic order
	sort.Slice(modelLimits, func(i, j int) bool {
		if modelLimits[i].UsagePct != modelLimits[j].UsagePct {
			return modelLimits[i].UsagePct > modelLimits[j].UsagePct
		}
		return modelLimits[i].Name < modelLimits[j].Name
	})

	// --- Suggestions ---
	var suggestions []string
	// Find the strictest model (smallest context)
	minLimit := 0
	for _, limit := range ModelContextLimits {
		if minLimit == 0 || limit < minLimit {
			minLimit = limit
		}
	}
	if minLimit > 0 && total > minLimit {
		if numTimeframes > 1 {
			savedPerTF := (numCoins * klineCount * (80 + indicatorCharsPerLine)) / 4 * 115 / 100
			suggestions = append(suggestions, fmt.Sprintf("Reduce 1 timeframe to save ~%d tokens", savedPerTF))
		}
		if numCoins > 1 {
			savedPerCoin := (numTimeframes * klineCount * (80 + indicatorCharsPerLine)) / 4 * 115 / 100
			suggestions = append(suggestions, fmt.Sprintf("Reduce 1 coin to save ~%d tokens", savedPerCoin))
		}
		if klineCount > 15 {
			suggestions = append(suggestions, "Reduce K-line count to 15 to save tokens")
		}
	}

	return TokenEstimate{
		Total:       total,
		Breakdown:   breakdown,
		ModelLimits: modelLimits,
		Suggestions: suggestions,
	}
}

// getEffectiveCoinCount returns the estimated number of coins that will be analyzed
func (c *StrategyConfig) getEffectiveCoinCount() int {
	count := 0
	switch c.CoinSource.SourceType {
	case "static":
		count = len(c.CoinSource.StaticCoins)
	case "ai500":
		count = c.CoinSource.AI500Limit
	case "oi_top":
		count = c.CoinSource.OITopLimit
	case "oi_low":
		count = c.CoinSource.OILowLimit
	default:
		count = c.CoinSource.AI500Limit
	}
	if count <= 0 {
		count = 3
	}
	return count
}

// getEffectiveTimeframeCount returns the number of timeframes that will be used
func (c *StrategyConfig) getEffectiveTimeframeCount() int {
	if len(c.Indicators.Klines.SelectedTimeframes) > 0 {
		return len(c.Indicators.Klines.SelectedTimeframes)
	}
	count := 1
	if c.Indicators.Klines.LongerTimeframe != "" {
		count++
	}
	return count
}
