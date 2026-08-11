# Deployment manifest

1. 复制 `base-sepolia-v0.3.1.example.json` 为同目录下的 `*.local.json`；
2. 填入已部署合约、角色账户、真实市场和固定 fork 区块；
3. 在 `.env.local` 的 `E2E_DEPLOYMENT_MANIFEST` 指向该文件；
4. 执行 `npm run config:validate -- <manifest-path>`；
5. 执行 `npm run doctor` 检查 chainId、bytecode、市场 token 和页面。

`*.local.json` 默认不会提交。示例中的零地址只是结构占位，不能用于实际运行。
