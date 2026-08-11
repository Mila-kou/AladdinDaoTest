# Test-only contracts

这里预留 Mock Token、Mock Oracle 和 Synthetic Market 初始化合约/脚本。

当前不创建 Solidity 实现，因为需要先确认生产 Oracle 的真实接口、签名路径、市场注册方式和前端市场发现方式。确定后遵循：

1. 复用已部署核心协议，不重复部署整套协议；
2. Mock Token 支持明确 decimals、mint 和 burn；
3. Mock Oracle 能设置 `min/max/timestamp`，并支持 normal/stale/freeze/revert；
4. 测 Oracle 自身时走真实验证路径；只测试下游反应时才允许直接构造状态；
5. 部署完成后生成地址和 ABI，写入对应 Fork 的 deployment manifest；
6. 部署与市场初始化发生在 baseline 之前，不在单条用例中重复执行。
