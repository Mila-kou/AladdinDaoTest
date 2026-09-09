# Price Impact 负 Spread 文案与前端联动

> Notion 页面：[原文](https://app.notion.com/p/3ac3d7873f2c812e924bee04b7af6b15)
> 创建时间：2026-07-29 13:26 UTC
> Reporter：Gordon
> Priority：High
> Status：Closed
> 最新性：取代本条此前“改名为 Spread”及“always >= 0”的候选方案。

## 定案

1. 页面标签继续使用 **Price Impact**，不改名为 Spread。
2. 重写两处 tooltip。
3. 删除“Price Impact 永远大于等于 0 / 不会优于 oracle”的旧描述。
4. 新口径支持未来合约返回负 Dynamic Spread。

## 最新业务口径

- Price Impact 是施加在成交价上的动态点差。
- 由订单规模以及订单对多空平衡的影响决定。
- 正值：成交价劣于 oracle，订单加剧失衡。
- 负值：成交价优于 oracle，是改善平衡获得的 rebate。
- 已包含在 Est. execution price 中，不额外扣除。
- 页面按订单规模的百分比显示。

## 四语文案状态

英文、中文、日文、韩文长短两版 tooltip 已更新。

2026-07-29 已验证修复：

- develop commit：`d04fe5d2`
- 合入：`b38b4463`
- TypeScript 源码检查通过

## 前端待联动

文案已经完成，但负 spread 数值链路仍需与合约同步：

1. 删除 `OrderPreview.tsx` 将 `spread < 0` 强制显示为 0 的逻辑。
2. 确认本地执行价计算不再 floor-at-0。
3. Reader / SDK 按 `int256` 解析。
4. Total Spread、Price Impact、Est. execution price 三处必须使用同一个带符号结果。
5. 清算 / ADL 不适用负 spread；普通用户开平仓适用。

## 测试关注点

- 正 spread 显示正数和不利颜色。
- 负 spread 显示负数、绿色和 rebate 文案。
- 中英日韩四语一致。
- tooltip 明确“已计入执行价”。
- 合约未上线负 spread 前，文案先行不应影响现有交易。
