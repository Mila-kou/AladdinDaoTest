# Deployment manifest

Deployment manifest 是一次部署的不可变快照；环境选择统一由
[`../environment-bindings.json`](../environment-bindings.json) 完成，不再使用全局
`E2E_DEPLOYMENT_MANIFEST`。

1. 生成或填写 deployment manifest（合约、角色、市场、来源目录与固定 fork 区块）；
2. 在 `environment-bindings.json` 对目标环境登记 `deploymentId`、manifest、release、commit、
   环境/部署 Chain ID、参数 registry 和 artifact 目录；
3. 同步 `Docs/contract-releases/CURRENT.json environments.<env>.forkOf`；
4. 执行 `npm run config:validate` 校验所有环境绑定；也可用
   `npm run config:validate -- <manifest-path>` 只检查单个 manifest schema；
5. 执行 `npm run doctor` 检查 RPC Chain ID、关键 bytecode、市场 token 和页面。

推荐通过 `npm run deploy:contracts` 自动完成前 3 步。新建 Tenderly VNet 时，工具会先将该
环境复位绑定到 Base Sepolia 部署；VNet 上另行部署成功后才切到新的私有部署。

`*.local.json` 默认不会提交。示例中的零地址只是结构占位，不能用于实际运行。
