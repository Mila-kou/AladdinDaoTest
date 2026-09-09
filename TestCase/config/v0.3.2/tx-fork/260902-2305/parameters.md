# fx100 合约参数快照 — tx-fork-v0.3.2-260902-2305

> 本文件由 `TestCode/tools/config-dump/dump-config.mjs` 生成，请勿手工编辑。
> 重新生成时必须由环境绑定表显式传入 deployment、registry 与 expected-chain-id；钉定 block 46296650 可复现本表。

## 快照坐标

| 项 | 值 |
|---|---|
| chainId | 99911 |
| blockNumber | 46296650 |
| blockTimestamp | 1788362927（2026-09-02T15:28:47.000Z） |
| DataStore | `0x6212A7361276915108aDe471caBF03484c5C2380` |
| 部署产物 | tx-fork-v0.3.2-260902-2305 |
| 合约分支/commit | release/v0.3.2 @ 13880f241691 |
| RPC | tx-fork admin RPC |
| 生成时间 | 2026-09-02T15:29:35.857Z |

## 市场

| marketIndex | indexToken | collateralToken | vault |
|---|---|---|---|
| 1 | `0x0555e30da8f98308edb960aa94c0db47230d2b9c` | `undefined` | `0x227621e4bb53b9bb70c05f5a2266626baf7c4ee9` |
| 2 | `0x4200000000000000000000000000000000000006` | `undefined` | `0x227621e4bb53b9bb70c05f5a2266626baf7c4ee9` |

## 角色成员（DataStore AccessControl）

| 角色 | 成员数 | 地址 |
|---|---|---|
| TIMELOCK_ADMIN | 1 | `0xf82cf35c5c0019861c2cdc65041c8ac32970d403` |
| CONFIG_KEEPER | 2 | `0x75ac424036f140e07b50b651bbe307467462749e`<br>`0xf82cf35c5c0019861c2cdc65041c8ac32970d403` |
| LIMITED_CONFIG_KEEPER | 2 | `0x75ac424036f140e07b50b651bbe307467462749e`<br>`0xf82cf35c5c0019861c2cdc65041c8ac32970d403` |
| CONTROLLER | 17 | `0x75ac424036f140e07b50b651bbe307467462749e`<br>`0x2290f5dbfba70402cb7e71325de0dec5fb84e015`<br>`0xa85dfd8a34a71bded807cff356105b43bde3a20e`<br>`0xe15a6130b6336f96b698d6fad4732a7acc0cc110`<br>`0x0012a438e47d601a23445a1f6c8d68d73cf1584b`<br>`0x6e40251fcfe6c72e58479168d8e6c98568bbd5e1`<br>`0x6ddd896834adee794c24dde8d80b26e7eaad7051`<br>`0x093f79772c4dff4e6c0698fcba9d969619522b42`<br>`0xc3b304939d1c419cc61133d64f1a2879bd0fec23`<br>`0x83ce4d17c531f08957b4eb941523367c54d8bd39`<br>`0x0f2ca080532a9db408f156e4c0efb2571216b257`<br>`0x9f9bf801c980b3f7280809a2cfbd6eb84eefc948`<br>`0x5af00c801c0ec0c2214a19d270b7e666a7dcfef8`<br>`0x734ddb9052166633ffa7d068447c0308592a65bd`<br>`0x7bb9e0f021ab1509d1af65b5ded76ef037ca79b9`<br>`0x0a430d766ff421709321ff2f9594d21ea9f112fa`<br>`0xf82cf35c5c0019861c2cdc65041c8ac32970d403` |
| ROUTER_PLUGIN | 4 | `0xc3b304939d1c419cc61133d64f1a2879bd0fec23`<br>`0x734ddb9052166633ffa7d068447c0308592a65bd`<br>`0x7bb9e0f021ab1509d1af65b5ded76ef037ca79b9`<br>`0x0a430d766ff421709321ff2f9594d21ea9f112fa` |
| MARKET_KEEPER | 2 | `0x75ac424036f140e07b50b651bbe307467462749e`<br>`0xf82cf35c5c0019861c2cdc65041c8ac32970d403` |
| FEE_KEEPER | 1 | `0xf82cf35c5c0019861c2cdc65041c8ac32970d403` |
| ORDER_KEEPER | 1 | `0x542fe841228416f6a3d65eb534a90ebc5cc36354` |
| FROZEN_ORDER_KEEPER | 1 | `0x542fe841228416f6a3d65eb534a90ebc5cc36354` |
| LIQUIDATION_KEEPER | 1 | `0x542fe841228416f6a3d65eb534a90ebc5cc36354` |
| ADL_KEEPER | 1 | `0x542fe841228416f6a3d65eb534a90ebc5cc36354` |

## 全局参数（无维度）（227 项）

| key 基名 | 维度 | 类型 | 原始值 | 可读值 | 状态 | 设置路径 | key hash |
|---|---|---|---|---|---|---|---|
| BORROWING_FEE_RECEIVER_FACTOR ⚠探测 | - | uint | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x174a3ec23a145772…` |
| BORROWING_FEE_RECEIVER_FACTOR ⚠探测 | - | int | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x174a3ec23a145772…` |
| BORROWING_FEE_RECEIVER_FACTOR ⚠探测 | - | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x174a3ec23a145772…` |
| BORROWING_FEE_RECEIVER_FACTOR ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x174a3ec23a145772…` |
| BORROWING_FEE_RECEIVER_FACTOR ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x174a3ec23a145772…` |
| CHAINLINK_PAYMENT_TOKEN | - | address | `0xe4ab69c077896252fafbd49efd26b5d171a32410` |  | 已设置 | Config(CONFIG_KEEPER) | `0x03f726650f8538e1…` |
| CLAIM_TERMS ⚠探测 | - | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x4f361fcb5ebf8c34…` |
| CLAIM_TERMS ⚠探测 | - | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x4f361fcb5ebf8c34…` |
| CLAIM_TERMS ⚠探测 | - | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x4f361fcb5ebf8c34…` |
| CLAIM_TERMS ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x4f361fcb5ebf8c34…` |
| CLAIM_TERMS ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x4f361fcb5ebf8c34…` |
| CLAIM_TERMS_BACKREF ⚠探测 | - | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x86938ba482f6d2d6…` |
| CLAIM_TERMS_BACKREF ⚠探测 | - | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x86938ba482f6d2d6…` |
| CLAIM_TERMS_BACKREF ⚠探测 | - | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x86938ba482f6d2d6…` |
| CLAIM_TERMS_BACKREF ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x86938ba482f6d2d6…` |
| CLAIM_TERMS_BACKREF ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x86938ba482f6d2d6…` |
| CLAIMABLE_FUNDING_AMOUNT ⚠探测 | - | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x06fc3f5466c17572…` |
| CLAIMABLE_FUNDING_AMOUNT ⚠探测 | - | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x06fc3f5466c17572…` |
| CLAIMABLE_FUNDING_AMOUNT ⚠探测 | - | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x06fc3f5466c17572…` |
| CLAIMABLE_FUNDING_AMOUNT ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x06fc3f5466c17572…` |
| CLAIMABLE_FUNDING_AMOUNT ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x06fc3f5466c17572…` |
| CLAIMABLE_FUNDS_AMOUNT ⚠探测 | - | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x6a651f3cefdf0b7c…` |
| CLAIMABLE_FUNDS_AMOUNT ⚠探测 | - | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x6a651f3cefdf0b7c…` |
| CLAIMABLE_FUNDS_AMOUNT ⚠探测 | - | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x6a651f3cefdf0b7c…` |
| CLAIMABLE_FUNDS_AMOUNT ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x6a651f3cefdf0b7c…` |
| CLAIMABLE_FUNDS_AMOUNT ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x6a651f3cefdf0b7c…` |
| COLLATERAL_SUM ⚠探测 | - | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe27f5ccaade489de…` |
| COLLATERAL_SUM ⚠探测 | - | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe27f5ccaade489de…` |
| COLLATERAL_SUM ⚠探测 | - | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe27f5ccaade489de…` |
| COLLATERAL_SUM ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe27f5ccaade489de…` |
| COLLATERAL_SUM ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe27f5ccaade489de…` |
| COLLATERAL_TOKEN | - | address | `0x09e1c105e1476f7f1592a1ff129d797572c383c7` |  | 已设置 | DataStore 直写(CONTROLLER) | `0xd890cedaab800f07…` |
| CONTRIBUTOR_FUNDING_ACCOUNT ⚠探测 | - | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xfbfce7afde079f26…` |
| CONTRIBUTOR_FUNDING_ACCOUNT ⚠探测 | - | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xfbfce7afde079f26…` |
| CONTRIBUTOR_FUNDING_ACCOUNT ⚠探测 | - | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xfbfce7afde079f26…` |
| CONTRIBUTOR_FUNDING_ACCOUNT ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xfbfce7afde079f26…` |
| CONTRIBUTOR_FUNDING_ACCOUNT ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xfbfce7afde079f26…` |
| CONTRIBUTOR_LAST_PAYMENT_AT ⚠探测 | - | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x5b1043fcfd55b3ec…` |
| CONTRIBUTOR_LAST_PAYMENT_AT ⚠探测 | - | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x5b1043fcfd55b3ec…` |
| CONTRIBUTOR_LAST_PAYMENT_AT ⚠探测 | - | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x5b1043fcfd55b3ec…` |
| CONTRIBUTOR_LAST_PAYMENT_AT ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x5b1043fcfd55b3ec…` |
| CONTRIBUTOR_LAST_PAYMENT_AT ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x5b1043fcfd55b3ec…` |
| CONTRIBUTOR_TOKEN_AMOUNT ⚠探测 | - | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x948d759fedd620f2…` |
| CONTRIBUTOR_TOKEN_AMOUNT ⚠探测 | - | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x948d759fedd620f2…` |
| CONTRIBUTOR_TOKEN_AMOUNT ⚠探测 | - | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x948d759fedd620f2…` |
| CONTRIBUTOR_TOKEN_AMOUNT ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x948d759fedd620f2…` |
| CONTRIBUTOR_TOKEN_AMOUNT ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x948d759fedd620f2…` |
| CREATE_DEPOSIT_GAS_LIMIT ⚠探测 | - | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2720ebeb701a49a5…` |
| CREATE_DEPOSIT_GAS_LIMIT ⚠探测 | - | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2720ebeb701a49a5…` |
| CREATE_DEPOSIT_GAS_LIMIT ⚠探测 | - | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2720ebeb701a49a5…` |
| CREATE_DEPOSIT_GAS_LIMIT ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2720ebeb701a49a5…` |
| CREATE_DEPOSIT_GAS_LIMIT ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2720ebeb701a49a5…` |
| CREATE_WITHDRAWAL_GAS_LIMIT ⚠探测 | - | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x06c83fd46ee00458…` |
| CREATE_WITHDRAWAL_GAS_LIMIT ⚠探测 | - | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x06c83fd46ee00458…` |
| CREATE_WITHDRAWAL_GAS_LIMIT ⚠探测 | - | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x06c83fd46ee00458…` |
| CREATE_WITHDRAWAL_GAS_LIMIT ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x06c83fd46ee00458…` |
| CREATE_WITHDRAWAL_GAS_LIMIT ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x06c83fd46ee00458…` |
| CUSTOM_CONTRIBUTOR_FUNDING_ACCOUNT ⚠探测 | - | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe59ac7b985b64d05…` |
| CUSTOM_CONTRIBUTOR_FUNDING_ACCOUNT ⚠探测 | - | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe59ac7b985b64d05…` |
| CUSTOM_CONTRIBUTOR_FUNDING_ACCOUNT ⚠探测 | - | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe59ac7b985b64d05…` |
| CUSTOM_CONTRIBUTOR_FUNDING_ACCOUNT ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe59ac7b985b64d05…` |
| CUSTOM_CONTRIBUTOR_FUNDING_ACCOUNT ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe59ac7b985b64d05…` |
| DECREASE_ORDER_GAS_LIMIT | - | uint | `3900000` |  | 已设置 | Config(CONFIG_KEEPER) | `0xfce7a3444b72c2d3…` |
| DEPOSIT_GAS_LIMIT ⚠探测 | - | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x584e21a67b50948d…` |
| DEPOSIT_GAS_LIMIT ⚠探测 | - | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x584e21a67b50948d…` |
| DEPOSIT_GAS_LIMIT ⚠探测 | - | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x584e21a67b50948d…` |
| DEPOSIT_GAS_LIMIT ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x584e21a67b50948d…` |
| DEPOSIT_GAS_LIMIT ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x584e21a67b50948d…` |
| EID_TO_SRC_CHAIN_ID ⚠探测 | - | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc629f9d0bbea9474…` |
| EID_TO_SRC_CHAIN_ID ⚠探测 | - | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc629f9d0bbea9474…` |
| EID_TO_SRC_CHAIN_ID ⚠探测 | - | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc629f9d0bbea9474…` |
| EID_TO_SRC_CHAIN_ID ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc629f9d0bbea9474…` |
| EID_TO_SRC_CHAIN_ID ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc629f9d0bbea9474…` |
| ESTIMATED_GAS_FEE_BASE_AMOUNT_V2_1 | - | uint | `600000` |  | 已设置 | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x39288f227e5db9a7…` |
| ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR | - | uint | `1000000000000000000000000000000` | 1 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0xce135f2a886cf6d8…` |
| ESTIMATED_GAS_FEE_PER_ORACLE_PRICE | - | uint | `250000` |  | 已设置 | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0xf95915378e4358fb…` |
| EXECUTION_GAS_FEE_BASE_AMOUNT_V2_1 | - | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x3f6fa256a0f23dce…` |
| EXECUTION_GAS_FEE_MULTIPLIER_FACTOR | - | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x65b1cbab23a5e245…` |
| EXECUTION_GAS_FEE_PER_ORACLE_PRICE | - | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x335c1af4f0f3344a…` |
| FEE_DISTRIBUTOR_SWAP_FEE_BATCH ⚠探测 | - | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe5ad0718f6580beb…` |
| FEE_DISTRIBUTOR_SWAP_FEE_BATCH ⚠探测 | - | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe5ad0718f6580beb…` |
| FEE_DISTRIBUTOR_SWAP_FEE_BATCH ⚠探测 | - | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe5ad0718f6580beb…` |
| FEE_DISTRIBUTOR_SWAP_FEE_BATCH ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe5ad0718f6580beb…` |
| FEE_DISTRIBUTOR_SWAP_FEE_BATCH ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe5ad0718f6580beb…` |
| FEE_DISTRIBUTOR_SWAP_TOKEN_INDEX ⚠探测 | - | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x28b2bbdb54181baf…` |
| FEE_DISTRIBUTOR_SWAP_TOKEN_INDEX ⚠探测 | - | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x28b2bbdb54181baf…` |
| FEE_DISTRIBUTOR_SWAP_TOKEN_INDEX ⚠探测 | - | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x28b2bbdb54181baf…` |
| FEE_DISTRIBUTOR_SWAP_TOKEN_INDEX ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x28b2bbdb54181baf…` |
| FEE_DISTRIBUTOR_SWAP_TOKEN_INDEX ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x28b2bbdb54181baf…` |
| FEE_RECEIVER | - | address | `0x8ccc3233100c43b678313e3163b5b642bb015008` |  | 已设置 | DataStore 直写(CONTROLLER) | `0x27b063950f8f840e…` |
| GMX_DATA_ACTION ⚠探测 | - | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x1e00e1bfa18454bf…` |
| GMX_DATA_ACTION ⚠探测 | - | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x1e00e1bfa18454bf…` |
| GMX_DATA_ACTION ⚠探测 | - | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x1e00e1bfa18454bf…` |
| GMX_DATA_ACTION ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x1e00e1bfa18454bf…` |
| GMX_DATA_ACTION ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x1e00e1bfa18454bf…` |
| HOLDING_ADDRESS | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xedb1530fc28f3062…` |
| INCREASE_ORDER_GAS_LIMIT | - | uint | `3900000` |  | 已设置 | Config(CONFIG_KEEPER) | `0x983e0a7f5307213e…` |
| IS_ADL_ENABLED | - | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x42d606829004e41f…` |
| IS_MULTICHAIN_ENDPOINT_ENABLED ※命名推断 | - | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xfe74bac295538d4a…` |
| IS_MULTICHAIN_PROVIDER_ENABLED ※命名推断 | - | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xed4e6b58afae719c…` |
| IS_SRC_CHAIN_ID_ENABLED ※命名推断 | - | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2718ce5cab7ee3f5…` |
| LATEST_ADL_AT | - | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x9f5222d0036fe7d4…` |
| LIQUIDATION_FEE_RECEIVER_FACTOR | - | uint | `500000000000000000000000000000` | 0.5 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0x218f21fe1eab2a2e…` |
| MAX_AUTO_CANCEL_ORDERS | - | uint | `64` |  | 已设置 | Config(CONFIG_KEEPER) | `0xef2fbe4143b9a96a…` |
| MAX_CALLBACK_GAS_LIMIT | - | uint | `2000000` |  | 已设置 | Config(CONFIG_KEEPER) | `0x96db769bd846fd25…` |
| MAX_COLLATERAL_SUM ⚠探测 | - | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x60cc22b6a728415d…` |
| MAX_COLLATERAL_SUM ⚠探测 | - | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x60cc22b6a728415d…` |
| MAX_COLLATERAL_SUM ⚠探测 | - | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x60cc22b6a728415d…` |
| MAX_COLLATERAL_SUM ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x60cc22b6a728415d…` |
| MAX_COLLATERAL_SUM ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x60cc22b6a728415d…` |
| MAX_DATA_LENGTH | - | uint | `32` |  | 已设置 | Config(CONFIG_KEEPER) | `0xefa49304bafedb99…` |
| MAX_EXECUTION_FEE_MULTIPLIER_FACTOR | - | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa88c33e1f94a413d…` |
| MAX_ORACLE_PRICE_AGE | - | uint | `60` | 60 seconds | 已设置 | Config(CONFIG_KEEPER) | `0x2498be75403c5326…` |
| MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR | - | uint | `20000000000000000000000000000` | 0.02 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0x6ae871e17942129c…` |
| MAX_ORACLE_TIMESTAMP_RANGE | - | uint | `60` | 60 seconds | 已设置 | Config(CONFIG_KEEPER) | `0xfd601530e028bbf3…` |
| MAX_PNL_FACTOR_FOR_ADL | - | uint | `750000000000000000000000000000` | 0.75 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0x95024a223e128da6…` |
| MAX_PNL_FACTOR_FOR_TRADERS ⚠探测 | - | uint | `0` | 0 (factor(1e30)) | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xab15365d3aa743e7…` |
| MAX_PNL_FACTOR_FOR_TRADERS ⚠探测 | - | int | `0` | 0 (factor(1e30)) | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xab15365d3aa743e7…` |
| MAX_PNL_FACTOR_FOR_TRADERS ⚠探测 | - | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xab15365d3aa743e7…` |
| MAX_PNL_FACTOR_FOR_TRADERS ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xab15365d3aa743e7…` |
| MAX_PNL_FACTOR_FOR_TRADERS ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xab15365d3aa743e7…` |
| MAX_PNL_FACTOR_FOR_WITHDRAWALS | - | uint | `650000000000000000000000000000` | 0.65 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0xdd8747ceca84c843…` |
| MAX_PRICE_IMPACT_SPREAD | - | uint | `5000000000000000` | 0.005 (spread(1e18)) | 已设置 | DataStore 直写(CONTROLLER) | `0x9f71064f4d31ede0…` |
| MAX_RECORDED_PRICE_AGE | - | uint | `86400` | 86400 seconds | 已设置 | Config(CONFIG_KEEPER) | `0xc83c444bcd119490…` |
| MAX_RELAY_FEE_SWAP_USD_FOR_SUBACCOUNT ⚠探测 | - | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb63bc7370967dcd0…` |
| MAX_RELAY_FEE_SWAP_USD_FOR_SUBACCOUNT ⚠探测 | - | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb63bc7370967dcd0…` |
| MAX_RELAY_FEE_SWAP_USD_FOR_SUBACCOUNT ⚠探测 | - | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb63bc7370967dcd0…` |
| MAX_RELAY_FEE_SWAP_USD_FOR_SUBACCOUNT ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb63bc7370967dcd0…` |
| MAX_RELAY_FEE_SWAP_USD_FOR_SUBACCOUNT ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb63bc7370967dcd0…` |
| MAX_RELAY_SWAP_WNT_CAP | - | uint | `50000000000000` |  | 已设置 | Config(CONFIG_KEEPER) | `0x8400beecb6c4fc41…` |
| MAX_SWAP_PATH_LENGTH ⚠探测 | - | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x697374e09b987132…` |
| MAX_SWAP_PATH_LENGTH ⚠探测 | - | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x697374e09b987132…` |
| MAX_SWAP_PATH_LENGTH ⚠探测 | - | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x697374e09b987132…` |
| MAX_SWAP_PATH_LENGTH ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x697374e09b987132…` |
| MAX_SWAP_PATH_LENGTH ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x697374e09b987132…` |
| MAX_TOTAL_CALLBACK_GAS_LIMIT_FOR_AUTO_CANCEL_ORDERS | - | uint | `2000000` |  | 已设置 | Config(CONFIG_KEEPER) | `0xcd2f7ab10b6b4b1c…` |
| MAX_TOTAL_CONTRIBUTOR_TOKEN_AMOUNT ⚠探测 | - | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xfc4843ae5b95543b…` |
| MAX_TOTAL_CONTRIBUTOR_TOKEN_AMOUNT ⚠探测 | - | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xfc4843ae5b95543b…` |
| MAX_TOTAL_CONTRIBUTOR_TOKEN_AMOUNT ⚠探测 | - | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xfc4843ae5b95543b…` |
| MAX_TOTAL_CONTRIBUTOR_TOKEN_AMOUNT ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xfc4843ae5b95543b…` |
| MAX_TOTAL_CONTRIBUTOR_TOKEN_AMOUNT ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xfc4843ae5b95543b…` |
| MAX_UI_FEE_FACTOR | - | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xab045c9d202ad7ee…` |
| MIN_ADDITIONAL_GAS_FOR_EXECUTION | - | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1bd286d5d2339da9…` |
| MIN_COLLATERAL_USD | - | uint | `0` | 0 (USD(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6497f0f2c47edc68…` |
| MIN_CONTRIBUTOR_PAYMENT_INTERVAL ⚠探测 | - | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x549358ca6261b677…` |
| MIN_CONTRIBUTOR_PAYMENT_INTERVAL ⚠探测 | - | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x549358ca6261b677…` |
| MIN_CONTRIBUTOR_PAYMENT_INTERVAL ⚠探测 | - | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x549358ca6261b677…` |
| MIN_CONTRIBUTOR_PAYMENT_INTERVAL ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x549358ca6261b677…` |
| MIN_CONTRIBUTOR_PAYMENT_INTERVAL ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x549358ca6261b677…` |
| MIN_HANDLE_EXECUTION_ERROR_GAS | - | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf65cd06b72dca04f…` |
| MIN_HANDLE_EXECUTION_ERROR_GAS_TO_FORWARD | - | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8f89c5181fb3126c…` |
| MIN_ORACLE_BLOCK_CONFIRMATIONS ⚠探测 | - | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x445ca54e2bbcedf3…` |
| MIN_ORACLE_BLOCK_CONFIRMATIONS ⚠探测 | - | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x445ca54e2bbcedf3…` |
| MIN_ORACLE_BLOCK_CONFIRMATIONS ⚠探测 | - | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x445ca54e2bbcedf3…` |
| MIN_ORACLE_BLOCK_CONFIRMATIONS ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x445ca54e2bbcedf3…` |
| MIN_ORACLE_BLOCK_CONFIRMATIONS ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x445ca54e2bbcedf3…` |
| MIN_ORACLE_SIGNERS ⚠探测 | - | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xca743b6c74c562e0…` |
| MIN_ORACLE_SIGNERS ⚠探测 | - | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xca743b6c74c562e0…` |
| MIN_ORACLE_SIGNERS ⚠探测 | - | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xca743b6c74c562e0…` |
| MIN_ORACLE_SIGNERS ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xca743b6c74c562e0…` |
| MIN_ORACLE_SIGNERS ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xca743b6c74c562e0…` |
| MIN_PNL_FACTOR_AFTER_ADL | - | uint | `500000000000000000000000000000` | 0.5 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0x87d8ac296048efc6…` |
| MIN_POSITION_SIZE_USD | - | uint | `10000000000000000000000000000000` | 10 (USD(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0x48faddd525cc6e21…` |
| MULTICHAIN_BALANCE ⚠探测 | - | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3150e34ed2bc2912…` |
| MULTICHAIN_BALANCE ⚠探测 | - | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3150e34ed2bc2912…` |
| MULTICHAIN_BALANCE ⚠探测 | - | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3150e34ed2bc2912…` |
| MULTICHAIN_BALANCE ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3150e34ed2bc2912…` |
| MULTICHAIN_BALANCE ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3150e34ed2bc2912…` |
| NATIVE_TOKEN_TRANSFER_GAS_LIMIT | - | uint | `200000` |  | 已设置 | Config(CONFIG_KEEPER) | `0xba4ba3faa47eef5c…` |
| NONCE | - | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x61d7b15962e47499…` |
| ORACLE_PROVIDER_MIN_CHANGE_DELAY | - | uint | `0` | 0 seconds | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd25bff94e6d7ea91…` |
| POSITION_FEE_RECEIVER_FACTOR | - | uint | `500000000000000000000000000000` | 0.5 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0x2b88ca05099085c4…` |
| POSITION_LAST_SRC_CHAIN_ID ⚠探测 | - | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x320c46139096ee40…` |
| POSITION_LAST_SRC_CHAIN_ID ⚠探测 | - | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x320c46139096ee40…` |
| POSITION_LAST_SRC_CHAIN_ID ⚠探测 | - | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x320c46139096ee40…` |
| POSITION_LAST_SRC_CHAIN_ID ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x320c46139096ee40…` |
| POSITION_LAST_SRC_CHAIN_ID ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x320c46139096ee40…` |
| REENTRANCY_GUARD_STATUS ⚠探测 | - | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x146a497980efd3d6…` |
| REENTRANCY_GUARD_STATUS ⚠探测 | - | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x146a497980efd3d6…` |
| REENTRANCY_GUARD_STATUS ⚠探测 | - | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x146a497980efd3d6…` |
| REENTRANCY_GUARD_STATUS ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x146a497980efd3d6…` |
| REENTRANCY_GUARD_STATUS ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x146a497980efd3d6…` |
| REFUND_EXECUTION_FEE_GAS_LIMIT | - | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3d67aec8986df82b…` |
| REGISTER_CODE_GAS_LIMIT | - | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x712662605dc7e7cf…` |
| RELAY_FEE_ADDRESS ⚠探测 | - | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xcd295147effa9826…` |
| RELAY_FEE_ADDRESS ⚠探测 | - | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xcd295147effa9826…` |
| RELAY_FEE_ADDRESS ⚠探测 | - | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xcd295147effa9826…` |
| RELAY_FEE_ADDRESS ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xcd295147effa9826…` |
| RELAY_FEE_ADDRESS ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xcd295147effa9826…` |
| RELAY_FEE_BASE_GAS_LIMIT | - | uint | `30000` |  | 已设置 | Config(CONFIG_KEEPER) | `0xd4dfe3d351f80044…` |
| RELAY_FEE_MULTIPLIER_FACTOR | - | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8acb85545a5e0961…` |
| REQUEST_EXPIRATION_TIME | - | uint | `3600` | 3600 seconds | 已设置 | Config(CONFIG_KEEPER) | `0xf664ba0f4e5389df…` |
| SEQUENCER_GRACE_DURATION | - | uint | `0` | 0 seconds | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3e49c0cd228c0b76…` |
| SET_TRADER_REFERRAL_CODE_GAS_LIMIT | - | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf4c79b92861083d4…` |
| SINGLE_SWAP_GAS_LIMIT ⚠探测 | - | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3be28fb346f7abc4…` |
| SINGLE_SWAP_GAS_LIMIT ⚠探测 | - | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3be28fb346f7abc4…` |
| SINGLE_SWAP_GAS_LIMIT ⚠探测 | - | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3be28fb346f7abc4…` |
| SINGLE_SWAP_GAS_LIMIT ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3be28fb346f7abc4…` |
| SINGLE_SWAP_GAS_LIMIT ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3be28fb346f7abc4…` |
| SKIP_BORROWING_FEE_FOR_SMALLER_SIDE ※命名推断 | - | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6b11e342f6958fd7…` |
| SUBACCOUNT_ORDER_ACTION ⚠探测 | - | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x2a0791687fd34f20…` |
| SUBACCOUNT_ORDER_ACTION ⚠探测 | - | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x2a0791687fd34f20…` |
| SUBACCOUNT_ORDER_ACTION ⚠探测 | - | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x2a0791687fd34f20…` |
| SUBACCOUNT_ORDER_ACTION ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x2a0791687fd34f20…` |
| SUBACCOUNT_ORDER_ACTION ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x2a0791687fd34f20…` |
| SWAP_FEE_RECEIVER_FACTOR ⚠探测 | - | uint | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x450288e023dbbe63…` |
| SWAP_FEE_RECEIVER_FACTOR ⚠探测 | - | int | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x450288e023dbbe63…` |
| SWAP_FEE_RECEIVER_FACTOR ⚠探测 | - | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x450288e023dbbe63…` |
| SWAP_FEE_RECEIVER_FACTOR ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x450288e023dbbe63…` |
| SWAP_FEE_RECEIVER_FACTOR ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x450288e023dbbe63…` |
| SWAP_ORDER_GAS_LIMIT ⚠探测 | - | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1df34600e0072da6…` |
| SWAP_ORDER_GAS_LIMIT ⚠探测 | - | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1df34600e0072da6…` |
| SWAP_ORDER_GAS_LIMIT ⚠探测 | - | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1df34600e0072da6…` |
| SWAP_ORDER_GAS_LIMIT ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1df34600e0072da6…` |
| SWAP_ORDER_GAS_LIMIT ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1df34600e0072da6…` |
| SYNC_CONFIG_LATEST_UPDATE_ID | - | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x161afdac3166e7c6…` |
| TOTAL_CLAIMABLE_FUNDS_AMOUNT ⚠探测 | - | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3c5306ceb0609800…` |
| TOTAL_CLAIMABLE_FUNDS_AMOUNT ⚠探测 | - | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3c5306ceb0609800…` |
| TOTAL_CLAIMABLE_FUNDS_AMOUNT ⚠探测 | - | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3c5306ceb0609800…` |
| TOTAL_CLAIMABLE_FUNDS_AMOUNT ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3c5306ceb0609800…` |
| TOTAL_CLAIMABLE_FUNDS_AMOUNT ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3c5306ceb0609800…` |
| USE_OPEN_INTEREST_IN_TOKENS_FOR_BALANCE ※命名推断 | - | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x75a3957e02e41190…` |
| WITHDRAWAL_GAS_LIMIT ⚠探测 | - | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2e365620be682b0e…` |
| WITHDRAWAL_GAS_LIMIT ⚠探测 | - | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2e365620be682b0e…` |
| WITHDRAWAL_GAS_LIMIT ⚠探测 | - | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2e365620be682b0e…` |
| WITHDRAWAL_GAS_LIMIT ⚠探测 | - | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2e365620be682b0e…` |
| WITHDRAWAL_GAS_LIMIT ⚠探测 | - | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2e365620be682b0e…` |

## 市场属性（6 项）

| key 基名 | 维度 | 类型 | 原始值 | 可读值 | 状态 | 设置路径 | key hash |
|---|---|---|---|---|---|---|---|
| INDEX_TOKEN | marketIndex=market#1 · BTC/UNKNOWN | address | `0x0555e30da8f98308edb960aa94c0db47230d2b9c` |  | 已设置 | - | `0x4f89517b5d5eb157…` |
| INDEX_TOKEN | marketIndex=market#2 · WETH/UNKNOWN | address | `0x4200000000000000000000000000000000000006` |  | 已设置 | - | `0x3ee1b38f1913fdbe…` |
| MARKET_INDEX | marketIndex=market#1 · BTC/UNKNOWN | uint | `1` |  | 已设置 | - | `0x8f06d4777d644b77…` |
| MARKET_INDEX | marketIndex=market#2 · WETH/UNKNOWN | uint | `2` |  | 已设置 | - | `0xa565cfc012356d9d…` |
| VAULT | marketIndex=market#1 · BTC/UNKNOWN | address | `0x227621e4bb53b9bb70c05f5a2266626baf7c4ee9` |  | 已设置 | - | `0xf07b374179aac87b…` |
| VAULT | marketIndex=market#2 · WETH/UNKNOWN | address | `0x227621e4bb53b9bb70c05f5a2266626baf7c4ee9` |  | 已设置 | - | `0x899162fe52097f8c…` |

## 集合型 key（元素个数）（24 项）

| key 基名 | 维度 | 类型 | 原始值 | 可读值 | 状态 | 设置路径 | key hash |
|---|---|---|---|---|---|---|---|
| CONTRIBUTOR_ACCOUNT_LIST | addressCount | addressCount | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x50b0e78c3e0339a1…` |
| CONTRIBUTOR_ACCOUNT_LIST | bytes32Count | bytes32Count | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x50b0e78c3e0339a1…` |
| CONTRIBUTOR_ACCOUNT_LIST | uintCount | uintCount | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x50b0e78c3e0339a1…` |
| CONTRIBUTOR_TOKEN_LIST | addressCount | addressCount | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xeab8251c23d59572…` |
| CONTRIBUTOR_TOKEN_LIST | bytes32Count | bytes32Count | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xeab8251c23d59572…` |
| CONTRIBUTOR_TOKEN_LIST | uintCount | uintCount | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xeab8251c23d59572…` |
| DEPOSIT_LIST | addressCount | addressCount | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x2166c7343d4ca73a…` |
| DEPOSIT_LIST | bytes32Count | bytes32Count | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x2166c7343d4ca73a…` |
| DEPOSIT_LIST | uintCount | uintCount | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x2166c7343d4ca73a…` |
| FEE_BATCH_LIST | addressCount | addressCount | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xdf957bfb795e04b4…` |
| FEE_BATCH_LIST | bytes32Count | bytes32Count | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xdf957bfb795e04b4…` |
| FEE_BATCH_LIST | uintCount | uintCount | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xdf957bfb795e04b4…` |
| MARKET_LIST | addressCount | addressCount | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xcdac201abd095989…` |
| MARKET_LIST | bytes32Count | bytes32Count | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xcdac201abd095989…` |
| MARKET_LIST | uintCount | uintCount | `2` |  | 已设置 | DataStore 直写(CONTROLLER) | `0xcdac201abd095989…` |
| ORDER_LIST | addressCount | addressCount | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x86f7cfd5d8f8404e…` |
| ORDER_LIST | bytes32Count | bytes32Count | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x86f7cfd5d8f8404e…` |
| ORDER_LIST | uintCount | uintCount | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x86f7cfd5d8f8404e…` |
| POSITION_LIST | addressCount | addressCount | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3fe95e2be5587b71…` |
| POSITION_LIST | bytes32Count | bytes32Count | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3fe95e2be5587b71…` |
| POSITION_LIST | uintCount | uintCount | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3fe95e2be5587b71…` |
| WITHDRAWAL_LIST | addressCount | addressCount | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xa0e12a7533998e22…` |
| WITHDRAWAL_LIST | bytes32Count | bytes32Count | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xa0e12a7533998e22…` |
| WITHDRAWAL_LIST | uintCount | uintCount | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xa0e12a7533998e22…` |

## 带维度参数（1712 项）

| key 基名 | 维度 | 类型 | 原始值 | 可读值 | 状态 | 设置路径 | key hash |
|---|---|---|---|---|---|---|---|
| ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xea3aaecb2b4c476e…` |
| ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xea3aaecb2b4c476e…` |
| ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xea3aaecb2b4c476e…` |
| ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xea3aaecb2b4c476e…` |
| ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xea3aaecb2b4c476e…` |
| ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x346d3f80d9300f99…` |
| ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x346d3f80d9300f99…` |
| ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x346d3f80d9300f99…` |
| ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x346d3f80d9300f99…` |
| ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x346d3f80d9300f99…` |
| ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8f101ab82320e130…` |
| ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8f101ab82320e130…` |
| ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8f101ab82320e130…` |
| ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8f101ab82320e130…` |
| ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8f101ab82320e130…` |
| ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4f9fd12b42147c0c…` |
| ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4f9fd12b42147c0c…` |
| ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4f9fd12b42147c0c…` |
| ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4f9fd12b42147c0c…` |
| ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4f9fd12b42147c0c…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x449deb1343e932f2…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x449deb1343e932f2…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x449deb1343e932f2…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x449deb1343e932f2…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x449deb1343e932f2…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xef8b34d1e53e9749…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xef8b34d1e53e9749…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xef8b34d1e53e9749…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xef8b34d1e53e9749…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xef8b34d1e53e9749…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x93cfc03e77471d4b…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x93cfc03e77471d4b…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x93cfc03e77471d4b…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x93cfc03e77471d4b…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x93cfc03e77471d4b…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x214d50026db9d2d5…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x214d50026db9d2d5…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x214d50026db9d2d5…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x214d50026db9d2d5…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x214d50026db9d2d5…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x269a950b2736aef9…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x269a950b2736aef9…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x269a950b2736aef9…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x269a950b2736aef9…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x269a950b2736aef9…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x70665f7aa0e05a0c…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x70665f7aa0e05a0c…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x70665f7aa0e05a0c…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x70665f7aa0e05a0c…` |
| AFFILIATE_REWARD ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x70665f7aa0e05a0c…` |
| ASK_ORDER_BOOK_DEPTH | marketIndex=market#1 · BTC/UNKNOWN | uint | `15593281790000000000000000000000000000` | 15593281.79 (USD(1e30)) | 已设置 | DataStore 直写(CONTROLLER) | `0xafc47997cc15e6c2…` |
| ASK_ORDER_BOOK_DEPTH | marketIndex=market#2 · WETH/UNKNOWN | uint | `7923961270000000000000000000000000000` | 7923961.27 (USD(1e30)) | 已设置 | DataStore 直写(CONTROLLER) | `0x72de0839fd2645d4…` |
| ATOMIC_SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc68e9a3e04ff5e37…` |
| ATOMIC_SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc68e9a3e04ff5e37…` |
| ATOMIC_SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc68e9a3e04ff5e37…` |
| ATOMIC_SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc68e9a3e04ff5e37…` |
| ATOMIC_SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc68e9a3e04ff5e37…` |
| ATOMIC_SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x434a884856539d80…` |
| ATOMIC_SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x434a884856539d80…` |
| ATOMIC_SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x434a884856539d80…` |
| ATOMIC_SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x434a884856539d80…` |
| ATOMIC_SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x434a884856539d80…` |
| ATOMIC_WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xab6ef3a5029136e7…` |
| ATOMIC_WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xab6ef3a5029136e7…` |
| ATOMIC_WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xab6ef3a5029136e7…` |
| ATOMIC_WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xab6ef3a5029136e7…` |
| ATOMIC_WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xab6ef3a5029136e7…` |
| ATOMIC_WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6996f2a6bda2594e…` |
| ATOMIC_WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6996f2a6bda2594e…` |
| ATOMIC_WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6996f2a6bda2594e…` |
| ATOMIC_WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6996f2a6bda2594e…` |
| ATOMIC_WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6996f2a6bda2594e…` |
| AVAILABLE_FEE_AMOUNT | feeToken=BTC / market#1 indexToken, feeType=ATOMIC_SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xb7d6613dba822492…` |
| AVAILABLE_FEE_AMOUNT | feeToken=BTC / market#1 indexToken, feeType=DEPOSIT_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe5cde8dbff485a6d…` |
| AVAILABLE_FEE_AMOUNT | feeToken=BTC / market#1 indexToken, feeType=FUNDING_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x8d0d0d310e1a5206…` |
| AVAILABLE_FEE_AMOUNT | feeToken=BTC / market#1 indexToken, feeType=LIQUIDATION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xc7716570436d4889…` |
| AVAILABLE_FEE_AMOUNT | feeToken=BTC / market#1 indexToken, feeType=POSITION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xaac150107ec2836d…` |
| AVAILABLE_FEE_AMOUNT | feeToken=BTC / market#1 indexToken, feeType=SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x131182ea2d720740…` |
| AVAILABLE_FEE_AMOUNT | feeToken=BTC / market#1 indexToken, feeType=UI_DEPOSIT_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xc8adccec2f478275…` |
| AVAILABLE_FEE_AMOUNT | feeToken=BTC / market#1 indexToken, feeType=UI_POSITION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x10d1ec736fbf4c15…` |
| AVAILABLE_FEE_AMOUNT | feeToken=BTC / market#1 indexToken, feeType=UI_SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x578051d24284b1d9…` |
| AVAILABLE_FEE_AMOUNT | feeToken=BTC / market#1 indexToken, feeType=UI_WITHDRAWAL_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xa9eabd55ba8ca763…` |
| AVAILABLE_FEE_AMOUNT | feeToken=BTC / market#1 indexToken, feeType=WITHDRAWAL_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x08e2ab3c21313ff9…` |
| AVAILABLE_FEE_AMOUNT | feeToken=USDC / MockUSDC, feeType=ATOMIC_SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xbe5ac1f4b1c39c33…` |
| AVAILABLE_FEE_AMOUNT | feeToken=USDC / MockUSDC, feeType=DEPOSIT_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x16579ff50d500d37…` |
| AVAILABLE_FEE_AMOUNT | feeToken=USDC / MockUSDC, feeType=FUNDING_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe397d558eb7db5e5…` |
| AVAILABLE_FEE_AMOUNT | feeToken=USDC / MockUSDC, feeType=LIQUIDATION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xa6a0e39908ec9f09…` |
| AVAILABLE_FEE_AMOUNT | feeToken=USDC / MockUSDC, feeType=POSITION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xf6895d4214ea7140…` |
| AVAILABLE_FEE_AMOUNT | feeToken=USDC / MockUSDC, feeType=SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x58791965b076dec9…` |
| AVAILABLE_FEE_AMOUNT | feeToken=USDC / MockUSDC, feeType=UI_DEPOSIT_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x08c861e218efabbe…` |
| AVAILABLE_FEE_AMOUNT | feeToken=USDC / MockUSDC, feeType=UI_POSITION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xac2de041c14a3548…` |
| AVAILABLE_FEE_AMOUNT | feeToken=USDC / MockUSDC, feeType=UI_SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xeedc71c3910996e5…` |
| AVAILABLE_FEE_AMOUNT | feeToken=USDC / MockUSDC, feeType=UI_WITHDRAWAL_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x80d6abbad33fa6df…` |
| AVAILABLE_FEE_AMOUNT | feeToken=USDC / MockUSDC, feeType=WITHDRAWAL_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xd14a5a6b4d461634…` |
| AVAILABLE_FEE_AMOUNT | feeToken=WETH / market#2 indexToken / WNT (Base WETH), feeType=ATOMIC_SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x36dc761e02199a82…` |
| AVAILABLE_FEE_AMOUNT | feeToken=WETH / market#2 indexToken / WNT (Base WETH), feeType=DEPOSIT_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xbd04d2ad9281cf40…` |
| AVAILABLE_FEE_AMOUNT | feeToken=WETH / market#2 indexToken / WNT (Base WETH), feeType=FUNDING_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x2125214a93e52f32…` |
| AVAILABLE_FEE_AMOUNT | feeToken=WETH / market#2 indexToken / WNT (Base WETH), feeType=LIQUIDATION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x7788c2179ba15cf8…` |
| AVAILABLE_FEE_AMOUNT | feeToken=WETH / market#2 indexToken / WNT (Base WETH), feeType=POSITION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xcb28208073bc2f3a…` |
| AVAILABLE_FEE_AMOUNT | feeToken=WETH / market#2 indexToken / WNT (Base WETH), feeType=SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x33c6dd1afbc96660…` |
| AVAILABLE_FEE_AMOUNT | feeToken=WETH / market#2 indexToken / WNT (Base WETH), feeType=UI_DEPOSIT_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x7046be7b4c1155ac…` |
| AVAILABLE_FEE_AMOUNT | feeToken=WETH / market#2 indexToken / WNT (Base WETH), feeType=UI_POSITION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xb6eab5d1e4415e18…` |
| AVAILABLE_FEE_AMOUNT | feeToken=WETH / market#2 indexToken / WNT (Base WETH), feeType=UI_SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x9cffe0236355a13b…` |
| AVAILABLE_FEE_AMOUNT | feeToken=WETH / market#2 indexToken / WNT (Base WETH), feeType=UI_WITHDRAWAL_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xb08c673771284e63…` |
| AVAILABLE_FEE_AMOUNT | feeToken=WETH / market#2 indexToken / WNT (Base WETH), feeType=WITHDRAWAL_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xd9792deb01e77ce4…` |
| BASE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x42ead00251152598…` |
| BASE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x42ead00251152598…` |
| BASE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x42ead00251152598…` |
| BASE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x42ead00251152598…` |
| BASE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x42ead00251152598…` |
| BASE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1eb6ffcd795886d5…` |
| BASE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1eb6ffcd795886d5…` |
| BASE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1eb6ffcd795886d5…` |
| BASE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1eb6ffcd795886d5…` |
| BASE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1eb6ffcd795886d5…` |
| BASE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xda72ec9eb13978fe…` |
| BASE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xda72ec9eb13978fe…` |
| BASE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xda72ec9eb13978fe…` |
| BASE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xda72ec9eb13978fe…` |
| BASE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xda72ec9eb13978fe…` |
| BASE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xdc1a04fdd280ad68…` |
| BASE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xdc1a04fdd280ad68…` |
| BASE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xdc1a04fdd280ad68…` |
| BASE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xdc1a04fdd280ad68…` |
| BASE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xdc1a04fdd280ad68…` |
| BID_ORDER_BOOK_DEPTH | marketIndex=market#1 · BTC/UNKNOWN | uint | `15217320430000000000000000000000000000` | 15217320.43 (USD(1e30)) | 已设置 | DataStore 直写(CONTROLLER) | `0x29df3dcfd0e2ec9a…` |
| BID_ORDER_BOOK_DEPTH | marketIndex=market#2 · WETH/UNKNOWN | uint | `7767179170000000000000000000000000000` | 7767179.17 (USD(1e30)) | 已设置 | DataStore 直写(CONTROLLER) | `0x95bc110ddd749561…` |
| BORROWING_EXPONENT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf813f399d2db15cc…` |
| BORROWING_EXPONENT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf813f399d2db15cc…` |
| BORROWING_EXPONENT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf813f399d2db15cc…` |
| BORROWING_EXPONENT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf813f399d2db15cc…` |
| BORROWING_EXPONENT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf813f399d2db15cc…` |
| BORROWING_EXPONENT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7571d9d3d08abae7…` |
| BORROWING_EXPONENT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7571d9d3d08abae7…` |
| BORROWING_EXPONENT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7571d9d3d08abae7…` |
| BORROWING_EXPONENT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7571d9d3d08abae7…` |
| BORROWING_EXPONENT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7571d9d3d08abae7…` |
| BORROWING_EXPONENT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3109f65391d7e946…` |
| BORROWING_EXPONENT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3109f65391d7e946…` |
| BORROWING_EXPONENT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3109f65391d7e946…` |
| BORROWING_EXPONENT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3109f65391d7e946…` |
| BORROWING_EXPONENT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3109f65391d7e946…` |
| BORROWING_EXPONENT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x267670e511a9b4e3…` |
| BORROWING_EXPONENT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x267670e511a9b4e3…` |
| BORROWING_EXPONENT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x267670e511a9b4e3…` |
| BORROWING_EXPONENT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x267670e511a9b4e3…` |
| BORROWING_EXPONENT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x267670e511a9b4e3…` |
| BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0cd5787e85c1df88…` |
| BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0cd5787e85c1df88…` |
| BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0cd5787e85c1df88…` |
| BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0cd5787e85c1df88…` |
| BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0cd5787e85c1df88…` |
| BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb75edd4010b35c03…` |
| BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb75edd4010b35c03…` |
| BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb75edd4010b35c03…` |
| BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb75edd4010b35c03…` |
| BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb75edd4010b35c03…` |
| BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4ecf00149b26f3b0…` |
| BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4ecf00149b26f3b0…` |
| BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4ecf00149b26f3b0…` |
| BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4ecf00149b26f3b0…` |
| BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4ecf00149b26f3b0…` |
| BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6a36c7fb81953541…` |
| BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6a36c7fb81953541…` |
| BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6a36c7fb81953541…` |
| BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6a36c7fb81953541…` |
| BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6a36c7fb81953541…` |
| CANCEL_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=AdlHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc9bfa9ad9e4e558d…` |
| CANCEL_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x42a18735f384235d…` |
| CANCEL_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=Config | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x32096b356df5aae4…` |
| CANCEL_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb021c31e6d57cbee…` |
| CANCEL_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x93bfb1d55c191a03…` |
| CANCEL_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd00edfce7f618d41…` |
| CANCEL_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=ExternalHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x518d70f7061fda26…` |
| CANCEL_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=FeeHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xdcdaf5fb3c1f646e…` |
| CANCEL_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xedf9dd21fe8d7ecb…` |
| CANCEL_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x37c9c10de064a3ec…` |
| CANCEL_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=MarketFactory | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1510cfc8454075d0…` |
| CANCEL_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=OrderHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x981967793696f6b2…` |
| CANCEL_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=RelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe201dfe0913b1c2c…` |
| CANCEL_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=Router | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9539483cd8ca8880…` |
| CANCEL_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x642f7386e1536589…` |
| CANCEL_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x753df389f1668880…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x67622eae6d4f0671…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc0432b5709f652c3…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x94bda230b585289e…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xcdb7543fffe2e5fd…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xce5a33b97628f46b…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x349be5597306644f…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd304ff280b7f039d…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc8d62fbe9d4a46f5…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9eff8d88a1244b25…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x95682ad077abde7d…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xba1a118050066665…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x87682eafa8cb05fe…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x52e8dc8515a4644b…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x12472394e8f6b7fa…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x316cb8c008490aeb…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x01bcbbe3be75c761…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xed3bb70240a0ea2a…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xdd8b6056f7ca37e7…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x239d46e01f3ed0de…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb57948bcdafe0e72…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xeea83a5cfd01fc68…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1d5588851d1bac1d…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1f8bd0d5e7be42f4…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf0dd5fa4acecba34…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x734c32062b9dffa5…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x486618f3b6ddf869…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe3a1b0548f1cfdcb…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x53ce88c8e61b73af…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb68370581184e4a7…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x40894843eb8d99e6…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x99cad271163fbb7e…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6e4f9f95ae35afef…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4b032ebead81c76e…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xcd262b89e0fde428…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xef7bd2451d22d66c…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1b67ff798ac75159…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x08c03d2c23b35fcd…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf0fda1a7b93862a6…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x26e6ccfd8acd682b…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xea485e41ee5bf135…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x18702d9ac031e7ad…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa4a10dd0152ccbaa…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x10ed2f56a43d6b7d…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x39f388977189ba54…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3744925d0623e770…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5a029cf8fe1b7589…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xdc8ca52e218327dd…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6c592f30f8e16773…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x35c6c931563b00f1…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xad5de568e09d8d1d…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9bf71913ba5e4c81…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5f8d9ecea8835154…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x30a55469a875d4f0…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf3a1459009a0a9b1…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3926e2beaaf95dca…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x44c27d70fb768653…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x60805fcb99b12663…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6c22b61c664c3711…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x276b9423a492e499…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5a091dd9399f01dc…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xdb7efd11ebe1f84d…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5b1373cf8c523773…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf105179b739639e8…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x35ebcfe9d5c464c5…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xae9e97dabbcf6d0e…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x36c3d19d3621dad4…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x49e4cd6c490f9e00…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x52f6dd8d9b93efd4…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf4439cb4a4174725…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc769920b7a12aff6…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1d85c11958abe642…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xaca2a6f54b9455d8…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x77dd2d79a3606f1e…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3a081a261e394def…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd126be01bc6109cb…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xdecab7568acbc96f…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x462eae1639a894b6…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x14da386ccf8af974…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7efb2f3b5c9c6b66…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8860675c3b1aaf09…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x759b20ea1eb88b5f…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb771459d1ce5b4e5…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4c20bbf01f496319…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x46bd1aad31dfd0bc…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5cf7017ac4a4f108…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa780df83efb16e66…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9936384a8199e904…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1237c1019f2c4688…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf4ea52a941802e9a…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf9ae4916587cc47f…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x23756ceaac345a46…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x33bbad8106465f1e…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x612470899abe5006…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5db5b135fa48d225…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5ef83f8c30c0036e…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7fe4d2aa542a79cc…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0bed81072e21b426…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9c637fcd329b1587…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5d6309b426a6969e…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x874f6bd60a9d6446…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x867b79d74371740e…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0469b0bb4c71e332…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x784433b8273b3bc2…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3921a6975cd89eae…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe1183d0d748fd96d…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6032056c40285e81…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x87dacfd1aa770272…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x36c199c3124e9503…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc727e43b8ac7ba64…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa6f13cb9da067ad5…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa55e293145ccbf08…` |
| CANCEL_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7a1fa32493043708…` |
| CANCEL_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=AdlHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x793d9f505ed28081…` |
| CANCEL_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2f4b19196fbdaf24…` |
| CANCEL_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=Config | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2ea485e36cd671a1…` |
| CANCEL_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x83535470c2c44211…` |
| CANCEL_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd8c08af4c98c21c6…` |
| CANCEL_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xfba491927965c8ce…` |
| CANCEL_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=ExternalHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9bee1a9b62f14ca6…` |
| CANCEL_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=FeeHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x43c5d3090ec74079…` |
| CANCEL_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4fecbbf6e02ecc43…` |
| CANCEL_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x97764e9b1180e522…` |
| CANCEL_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=MarketFactory | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x999df486f8744625…` |
| CANCEL_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=OrderHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x16b6e33863d892fc…` |
| CANCEL_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=RelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x56ca263b676b3c95…` |
| CANCEL_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=Router | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x56c4ad4df0d83916…` |
| CANCEL_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa91cf90d070cfce8…` |
| CANCEL_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9cab9116d8c809da…` |
| CLAIM_AFFILIATE_REWARDS_FEATURE_DISABLED ※命名推断 | module=AdlHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1fc6c9c60a93f112…` |
| CLAIM_AFFILIATE_REWARDS_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7a94e6cceb7fede4…` |
| CLAIM_AFFILIATE_REWARDS_FEATURE_DISABLED ※命名推断 | module=Config | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x41731cf88836da9f…` |
| CLAIM_AFFILIATE_REWARDS_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x87ef5e06b54a17ae…` |
| CLAIM_AFFILIATE_REWARDS_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8c23afd91ede5cdd…` |
| CLAIM_AFFILIATE_REWARDS_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x42305d42110d18a7…` |
| CLAIM_AFFILIATE_REWARDS_FEATURE_DISABLED ※命名推断 | module=ExternalHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xcc5152fae6a71710…` |
| CLAIM_AFFILIATE_REWARDS_FEATURE_DISABLED ※命名推断 | module=FeeHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3b23bc34ecddfec0…` |
| CLAIM_AFFILIATE_REWARDS_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf9bb87ac7c6dbb93…` |
| CLAIM_AFFILIATE_REWARDS_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xcb119bab2743f190…` |
| CLAIM_AFFILIATE_REWARDS_FEATURE_DISABLED ※命名推断 | module=MarketFactory | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x77f77e32146237a1…` |
| CLAIM_AFFILIATE_REWARDS_FEATURE_DISABLED ※命名推断 | module=OrderHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5cfb060873395a14…` |
| CLAIM_AFFILIATE_REWARDS_FEATURE_DISABLED ※命名推断 | module=RelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5ae17fee9235a32d…` |
| CLAIM_AFFILIATE_REWARDS_FEATURE_DISABLED ※命名推断 | module=Router | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc3bdd24129a8fbd6…` |
| CLAIM_AFFILIATE_REWARDS_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x801db4410b2981bf…` |
| CLAIM_AFFILIATE_REWARDS_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1ece6310afd70bda…` |
| CLAIM_FUNDING_FEES_FEATURE_DISABLED ※命名推断 | module=AdlHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9f26a9c4fb7cf0fb…` |
| CLAIM_FUNDING_FEES_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb08f18b0c44d552b…` |
| CLAIM_FUNDING_FEES_FEATURE_DISABLED ※命名推断 | module=Config | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1dd0a28b90e866ed…` |
| CLAIM_FUNDING_FEES_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1db51b842254b36d…` |
| CLAIM_FUNDING_FEES_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9e4060ed0da5465b…` |
| CLAIM_FUNDING_FEES_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x60eae4daabfe791d…` |
| CLAIM_FUNDING_FEES_FEATURE_DISABLED ※命名推断 | module=ExternalHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xaa3f9b4a5bb0cec9…` |
| CLAIM_FUNDING_FEES_FEATURE_DISABLED ※命名推断 | module=FeeHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xaa97be3ce9bb592d…` |
| CLAIM_FUNDING_FEES_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb165d99ba621c730…` |
| CLAIM_FUNDING_FEES_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8f597d2f42ae4dbe…` |
| CLAIM_FUNDING_FEES_FEATURE_DISABLED ※命名推断 | module=MarketFactory | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x641835ff30f2bb7c…` |
| CLAIM_FUNDING_FEES_FEATURE_DISABLED ※命名推断 | module=OrderHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x581e0f7696ebea31…` |
| CLAIM_FUNDING_FEES_FEATURE_DISABLED ※命名推断 | module=RelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xde45cba441330067…` |
| CLAIM_FUNDING_FEES_FEATURE_DISABLED ※命名推断 | module=Router | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa3d0d7d9c04cd492…` |
| CLAIM_FUNDING_FEES_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6f8f1cfe5f346869…` |
| CLAIM_FUNDING_FEES_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe106bf6019e3a01a…` |
| CLAIM_UI_FEES_FEATURE_DISABLED ※命名推断 | module=AdlHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xcef9697e2fda3344…` |
| CLAIM_UI_FEES_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xdbcfe5296ac69f24…` |
| CLAIM_UI_FEES_FEATURE_DISABLED ※命名推断 | module=Config | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb87c5d4177b07080…` |
| CLAIM_UI_FEES_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9a839b7602653e43…` |
| CLAIM_UI_FEES_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5bb4ea89acf6e7b8…` |
| CLAIM_UI_FEES_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7b3b43bbce7873f2…` |
| CLAIM_UI_FEES_FEATURE_DISABLED ※命名推断 | module=ExternalHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x915290ebfd440dad…` |
| CLAIM_UI_FEES_FEATURE_DISABLED ※命名推断 | module=FeeHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0138cc1459a3d605…` |
| CLAIM_UI_FEES_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xfd5523ac562423c0…` |
| CLAIM_UI_FEES_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa3c1958a04cd8810…` |
| CLAIM_UI_FEES_FEATURE_DISABLED ※命名推断 | module=MarketFactory | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x636c19fe22504740…` |
| CLAIM_UI_FEES_FEATURE_DISABLED ※命名推断 | module=OrderHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x372eafa6f6c23df3…` |
| CLAIM_UI_FEES_FEATURE_DISABLED ※命名推断 | module=RelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb2206b1e080f0882…` |
| CLAIM_UI_FEES_FEATURE_DISABLED ※命名推断 | module=Router | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3d590e98a4606b98…` |
| CLAIM_UI_FEES_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6a72f757a8fdbf4c…` |
| CLAIM_UI_FEES_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x181261c7eac59b06…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken, feeType=ATOMIC_SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x2fa31c90905e479e…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken, feeType=DEPOSIT_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xd577402cbc472e42…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken, feeType=FUNDING_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x79ed7c7a898b737f…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken, feeType=LIQUIDATION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xc829c29565d680e9…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken, feeType=POSITION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x2ddc34415b920a84…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken, feeType=SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x4bd72fa61c916921…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken, feeType=UI_DEPOSIT_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x5232ef1ccfbb6086…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken, feeType=UI_POSITION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xf2400b87cfc51c97…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken, feeType=UI_SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x56920de733dcae3d…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken, feeType=UI_WITHDRAWAL_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xa0b3e04b9539959c…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken, feeType=WITHDRAWAL_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3d822d87913405fc…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC, feeType=ATOMIC_SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x77ea999bae046f71…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC, feeType=DEPOSIT_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x1126335f13e1a0c4…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC, feeType=FUNDING_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x064a8f2362265e2f…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC, feeType=LIQUIDATION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x7164b0f8e8baebe2…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC, feeType=POSITION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe52a3a2dda2bfe28…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC, feeType=SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x4e1f867924f02015…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC, feeType=UI_DEPOSIT_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x470bf0f6c42a6908…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC, feeType=UI_POSITION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xf5ab31e0808e0c88…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC, feeType=UI_SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xbb0d3c508ee2d9aa…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC, feeType=UI_WITHDRAWAL_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x4f29f5f1459328a2…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC, feeType=WITHDRAWAL_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x72b6f1166c5e9cc1…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH), feeType=ATOMIC_SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x47c6e8a0e2170b2e…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH), feeType=DEPOSIT_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x5bd4b54a948142e0…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH), feeType=FUNDING_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xbf4f7e7850b1b401…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH), feeType=LIQUIDATION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xc4748d05ae2fdca8…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH), feeType=POSITION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x826508a00a7fb95c…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH), feeType=SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x2dc96c11a1433e38…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH), feeType=UI_DEPOSIT_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe288cb1749d83967…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH), feeType=UI_POSITION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xefff0f13195550d9…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH), feeType=UI_SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x0cbc84022c572644…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH), feeType=UI_WITHDRAWAL_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xea2efbb4aa32dbd1…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH), feeType=WITHDRAWAL_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x32900454c6d24370…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken, feeType=ATOMIC_SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x30d2c51437d7dd08…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken, feeType=DEPOSIT_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x199444572a21cc9e…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken, feeType=FUNDING_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x5115dd0267a4c2e0…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken, feeType=LIQUIDATION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xb21523dab1f98d4f…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken, feeType=POSITION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe5020991a920d2e9…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken, feeType=SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xacb36bd38f0c315b…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken, feeType=UI_DEPOSIT_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x037520627e74dfd1…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken, feeType=UI_POSITION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xc8cc8304b3c11058…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken, feeType=UI_SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x378a21bcf9958f63…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken, feeType=UI_WITHDRAWAL_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x671caedb740ce3ba…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken, feeType=WITHDRAWAL_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3cf787f2e91e1d77…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC, feeType=ATOMIC_SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x4352c7896cf11a4b…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC, feeType=DEPOSIT_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x5380e8bbbef8bb8f…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC, feeType=FUNDING_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x5357888dd8e750d1…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC, feeType=LIQUIDATION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xae6c3468a61868c7…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC, feeType=POSITION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x663ccd25475c2328…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC, feeType=SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xf96d0dc080bfa66c…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC, feeType=UI_DEPOSIT_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x21725b6c721c6825…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC, feeType=UI_POSITION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x964692e531358d63…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC, feeType=UI_SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x8931a86d2c936dc2…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC, feeType=UI_WITHDRAWAL_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x55672f2a27a9449e…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC, feeType=WITHDRAWAL_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xeefab8cbb7375ce9…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH), feeType=ATOMIC_SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x7bb80c7c3b6d13a3…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH), feeType=DEPOSIT_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x451e4811ca26e690…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH), feeType=FUNDING_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xf626a68857e86c46…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH), feeType=LIQUIDATION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xd5ac25a3cb5c77e2…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH), feeType=POSITION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x06961120bb349f10…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH), feeType=SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x52d7f62b65d0092a…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH), feeType=UI_DEPOSIT_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x51850688a6c30392…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH), feeType=UI_POSITION_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x440eb4edaaa48f0c…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH), feeType=UI_SWAP_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x2c9444171984bef2…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH), feeType=UI_WITHDRAWAL_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x59f20515b8698bb2…` |
| CLAIMABLE_FEE_AMOUNT | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH), feeType=WITHDRAWAL_FEE_TYPE | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x639cab5ab5d850b3…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3ff31395aa3447fc…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3ff31395aa3447fc…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3ff31395aa3447fc…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3ff31395aa3447fc…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3ff31395aa3447fc…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x6675d351c20e7594…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x6675d351c20e7594…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x6675d351c20e7594…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x6675d351c20e7594…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x6675d351c20e7594…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xb2d58a0f11dd8bad…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xb2d58a0f11dd8bad…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xb2d58a0f11dd8bad…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xb2d58a0f11dd8bad…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xb2d58a0f11dd8bad…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x822a906a8ef88fb9…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x822a906a8ef88fb9…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x822a906a8ef88fb9…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x822a906a8ef88fb9…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x822a906a8ef88fb9…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x7a89063ee610a085…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x7a89063ee610a085…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x7a89063ee610a085…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x7a89063ee610a085…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x7a89063ee610a085…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x951181c94098656b…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x951181c94098656b…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x951181c94098656b…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x951181c94098656b…` |
| CLAIMABLE_UI_FEE_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x951181c94098656b…` |
| CONSTANT_PRICE_SPREAD | marketIndex=market#1 · BTC/UNKNOWN | uint | `100000000000000` | 0.0001 (spread(1e18)) | 已设置 | DataStore 直写(CONTROLLER) | `0x3c0c3a3cf760cb1d…` |
| CONSTANT_PRICE_SPREAD | marketIndex=market#2 · WETH/UNKNOWN | uint | `100000000000000` | 0.0001 (spread(1e18)) | 已设置 | DataStore 直写(CONTROLLER) | `0x14d785e8c68f3cd8…` |
| CREATE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=AdlHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xffd5919b9392160d…` |
| CREATE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xcf46002229cfc04b…` |
| CREATE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=Config | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3fb15b9f417a6445…` |
| CREATE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x24b9765617906e18…` |
| CREATE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8b9a4238090b9d41…` |
| CREATE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x85da86e1362f35d9…` |
| CREATE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=ExternalHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x32b34fee00b76aeb…` |
| CREATE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=FeeHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb1d44da9722cdc01…` |
| CREATE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd641ce2686cf3634…` |
| CREATE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc0a5fc697dcff6ca…` |
| CREATE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=MarketFactory | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x86583e266dac6bb9…` |
| CREATE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=OrderHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6483fd4055f6c1f1…` |
| CREATE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=RelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x852d838834977b92…` |
| CREATE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=Router | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1ef0b30b34303974…` |
| CREATE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9be8692fda3d19f2…` |
| CREATE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x243f64531fbdc558…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2dd96fa209af1333…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xdab507a07813df8c…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x96af0d4f0e074ba6…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x70e7558e4a8f7266…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x13a8453eb931551b…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0036015c0c760a2d…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x371bde1e36999f5a…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x93acae32f1f7a74c…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x593a08b62451b0bf…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x126e667b3de06b3c…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0e3183cb43689ee0…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2da21b20cfad008f…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6855a0f67c5e2d01…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8404d75006195edd…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc32b8f52600d44a1…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe75a717c17124e5d…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xac221741af4de6d6…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd59705738381a08f…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x827ebcae77da0571…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x275c16e85560f43e…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x537aea67f7fa9e06…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1952b8e059e52d79…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x44fe52c9105d3cb8…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xcf3d29efa7bc64a3…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xab2f5eb7571309c1…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4b5eae7912fdae74…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x327debd53b0ad1a5…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x24131cde3f5f9e82…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbff6ff198e88ae3f…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xabf1fa2736a939d9…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xfdf66d12797862c2…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x98b639c6b26d9d1a…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xeadf8f2851c57a2a…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x09d51b3a1f26ba32…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xfb91aec6d854b8bc…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7b17ff113cfe357d…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xabde1cfb15ba91dd…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x952b21dcc530dbf6…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x85d5b071d37e155f…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7462395fda81a364…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x309b3be1e072d545…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf1561940ed17b75b…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa56b4650ab8f45df…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc0a473ffd740cc1d…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x19d3f28033a1dbbd…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7843c1ef7ed3f559…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0db87499afe1b258…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe37962218d7e75e3…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x16c53ec60a724d6b…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x028396d67619fc99…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd294cdfa14221f69…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0ee3bb976f4097fc…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x09b73a57395a2dce…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf9cb3d3ac36c18de…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xfa55a0176d274b6f…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4c800ddbf43fa773…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x047d97bbdec34fd3…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x922c98a4d4a2cf47…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8fd40619f419b324…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x71e5a43d2463d027…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1137d673e6c5ab4c…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x82aab51cf7a3b3f6…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8aa03634f934e366…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x68309bf492b782e3…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xce0186f63dc42adf…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1fc474b12f25de3b…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2ec3705ff3729764…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa0e0df39225022a9…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbcf3575e38fa8005…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x66c83334b4d83a8f…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbf7ad02b34701b2a…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x948e06426795d5c3…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xfc54027f8b20d6f9…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1befa653c8affd16…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0a4a0af4c817fc9b…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe5b1165db30be663…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x34ee5cc988d0e8dd…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x643bf33f88ab7395…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x345b1c4de2dcacb1…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x73eac402e8e0e95b…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd6065b1c9a82476e…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbd3de20ad8773276…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0ce8458e290e3568…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa53204816ba7fad8…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2304370cdd8b2ba5…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd91c453b4f3573d2…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd3e9bc1eb433d72f…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5a0fdc9a27b40cad…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa382b8aa1183f257…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xfe86c632c991ccc8…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe713b718d6a5f43a…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xcd64affdac7a78ab…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x66b74a64c33d01aa…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbf242b1b34861229…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb3a660e59feac025…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7c31229b75bf020b…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x006565bd7a7e736e…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe2855bae86a6c99f…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf01ae89f26ec0437…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9dc65e2ccea8b8cf…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xcad7afa21f41e8df…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4f9032f346181b2e…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x749325cee5643219…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x51e700673e49973f…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xad19c6f0f7b2d644…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd2dde9ef3226ad3a…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf8e041da251f9242…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x859043814057e0b3…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc598660a719fc019…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x11d8dfa31b06d00e…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa8186e2db46e2510…` |
| CREATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3a7574be823b2be0…` |
| CREATE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=AdlHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x71d3142841d54e7d…` |
| CREATE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd5409ae52f786860…` |
| CREATE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=Config | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc699695f9c7831c5…` |
| CREATE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x991d35da9d72aba3…` |
| CREATE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa20212f4778bf543…` |
| CREATE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6d56e22048566987…` |
| CREATE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=ExternalHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe07b5811dd6beec0…` |
| CREATE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=FeeHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x32781696e6635ab6…` |
| CREATE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe04301f65507c935…` |
| CREATE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc9e825d1ae055eeb…` |
| CREATE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=MarketFactory | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc2d6cf0d44e6cd36…` |
| CREATE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=OrderHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7f6109a5cb3620ec…` |
| CREATE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=RelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6c1f873c3a5e7669…` |
| CREATE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=Router | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xcdc6ec3a1909f3d1…` |
| CREATE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe9c10e741dd7a96c…` |
| CREATE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb163368227846e08…` |
| CUMULATIVE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3926c6e60c2f89cb…` |
| CUMULATIVE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3926c6e60c2f89cb…` |
| CUMULATIVE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3926c6e60c2f89cb…` |
| CUMULATIVE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3926c6e60c2f89cb…` |
| CUMULATIVE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3926c6e60c2f89cb…` |
| CUMULATIVE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xdb7879172404ae8c…` |
| CUMULATIVE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xdb7879172404ae8c…` |
| CUMULATIVE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xdb7879172404ae8c…` |
| CUMULATIVE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xdb7879172404ae8c…` |
| CUMULATIVE_BORROWING_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xdb7879172404ae8c…` |
| CUMULATIVE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe2c8e81667571567…` |
| CUMULATIVE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe2c8e81667571567…` |
| CUMULATIVE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe2c8e81667571567…` |
| CUMULATIVE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe2c8e81667571567…` |
| CUMULATIVE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe2c8e81667571567…` |
| CUMULATIVE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x5f6b1f6199b68a27…` |
| CUMULATIVE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x5f6b1f6199b68a27…` |
| CUMULATIVE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x5f6b1f6199b68a27…` |
| CUMULATIVE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x5f6b1f6199b68a27…` |
| CUMULATIVE_BORROWING_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x5f6b1f6199b68a27…` |
| CUMULATIVE_BORROWING_FACTOR_UPDATED_AT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x04dd3c8c7b8c2914…` |
| CUMULATIVE_BORROWING_FACTOR_UPDATED_AT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x04dd3c8c7b8c2914…` |
| CUMULATIVE_BORROWING_FACTOR_UPDATED_AT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x04dd3c8c7b8c2914…` |
| CUMULATIVE_BORROWING_FACTOR_UPDATED_AT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x04dd3c8c7b8c2914…` |
| CUMULATIVE_BORROWING_FACTOR_UPDATED_AT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x04dd3c8c7b8c2914…` |
| CUMULATIVE_BORROWING_FACTOR_UPDATED_AT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3d6afa58f73094db…` |
| CUMULATIVE_BORROWING_FACTOR_UPDATED_AT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3d6afa58f73094db…` |
| CUMULATIVE_BORROWING_FACTOR_UPDATED_AT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3d6afa58f73094db…` |
| CUMULATIVE_BORROWING_FACTOR_UPDATED_AT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3d6afa58f73094db…` |
| CUMULATIVE_BORROWING_FACTOR_UPDATED_AT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x3d6afa58f73094db…` |
| CUMULATIVE_BORROWING_FACTOR_UPDATED_AT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xf2c6886fcfcd67cf…` |
| CUMULATIVE_BORROWING_FACTOR_UPDATED_AT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xf2c6886fcfcd67cf…` |
| CUMULATIVE_BORROWING_FACTOR_UPDATED_AT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xf2c6886fcfcd67cf…` |
| CUMULATIVE_BORROWING_FACTOR_UPDATED_AT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xf2c6886fcfcd67cf…` |
| CUMULATIVE_BORROWING_FACTOR_UPDATED_AT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xf2c6886fcfcd67cf…` |
| CUMULATIVE_BORROWING_FACTOR_UPDATED_AT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xed82e0a6bc3aa797…` |
| CUMULATIVE_BORROWING_FACTOR_UPDATED_AT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xed82e0a6bc3aa797…` |
| CUMULATIVE_BORROWING_FACTOR_UPDATED_AT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xed82e0a6bc3aa797…` |
| CUMULATIVE_BORROWING_FACTOR_UPDATED_AT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xed82e0a6bc3aa797…` |
| CUMULATIVE_BORROWING_FACTOR_UPDATED_AT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xed82e0a6bc3aa797…` |
| CUMULATIVE_OPEN_COSTS | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xc91d9affcb57dab2…` |
| CUMULATIVE_OPEN_COSTS | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x9faef0c3243c9e05…` |
| CUMULATIVE_OPEN_COSTS | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x00e77052eb5b9d93…` |
| CUMULATIVE_OPEN_COSTS | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xd512777cc4879793…` |
| DATA_STREAM_ID | token=BTC / market#1 indexToken | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x38f03dbb82cadc88…` |
| DATA_STREAM_ID | token=USDC / MockUSDC | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x606ecd62ac332ce9…` |
| DATA_STREAM_ID | token=WETH / market#2 indexToken / WNT (Base WETH) | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe4bf13f35cbbeb8d…` |
| DATA_STREAM_MULTIPLIER | token=BTC / market#1 indexToken | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xc04b72b2512172ba…` |
| DATA_STREAM_MULTIPLIER | token=USDC / MockUSDC | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xa8e63cd736ed882b…` |
| DATA_STREAM_MULTIPLIER | token=WETH / market#2 indexToken / WNT (Base WETH) | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x68e110a4a6a46cf9…` |
| DATA_STREAM_SPREAD_REDUCTION_FACTOR | token=BTC / market#1 indexToken | uint | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb45494235073f7f8…` |
| DATA_STREAM_SPREAD_REDUCTION_FACTOR | token=USDC / MockUSDC | uint | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x73f8bd4d271f55f2…` |
| DATA_STREAM_SPREAD_REDUCTION_FACTOR | token=WETH / market#2 indexToken / WNT (Base WETH) | uint | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4dcf2c772d1316bc…` |
| DEPOSIT_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=false | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x318c7b73fa3da4a9…` |
| DEPOSIT_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=false | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x318c7b73fa3da4a9…` |
| DEPOSIT_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=false | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x318c7b73fa3da4a9…` |
| DEPOSIT_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x318c7b73fa3da4a9…` |
| DEPOSIT_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x318c7b73fa3da4a9…` |
| DEPOSIT_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=true | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x30956f2865ce4be2…` |
| DEPOSIT_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=true | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x30956f2865ce4be2…` |
| DEPOSIT_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=true | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x30956f2865ce4be2…` |
| DEPOSIT_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x30956f2865ce4be2…` |
| DEPOSIT_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x30956f2865ce4be2…` |
| DEPOSIT_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=false | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6b8509832dc028d1…` |
| DEPOSIT_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=false | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6b8509832dc028d1…` |
| DEPOSIT_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=false | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6b8509832dc028d1…` |
| DEPOSIT_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6b8509832dc028d1…` |
| DEPOSIT_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6b8509832dc028d1…` |
| DEPOSIT_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=true | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4c2340169992faea…` |
| DEPOSIT_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=true | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4c2340169992faea…` |
| DEPOSIT_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=true | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4c2340169992faea…` |
| DEPOSIT_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4c2340169992faea…` |
| DEPOSIT_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4c2340169992faea…` |
| EDGE_DATA_STREAM_ID | token=BTC / market#1 indexToken | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x67aae6db6cab842e…` |
| EDGE_DATA_STREAM_ID | token=USDC / MockUSDC | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xe12cf51b3cb2b72d…` |
| EDGE_DATA_STREAM_ID | token=WETH / market#2 indexToken / WNT (Base WETH) | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xcd367ebe9ab3201a…` |
| EDGE_DATA_STREAM_TOKEN_DECIMALS | token=BTC / market#1 indexToken | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x59f043cbcb86ca0c…` |
| EDGE_DATA_STREAM_TOKEN_DECIMALS | token=USDC / MockUSDC | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x30e8033e552a546f…` |
| EDGE_DATA_STREAM_TOKEN_DECIMALS | token=WETH / market#2 indexToken / WNT (Base WETH) | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x2da141729786eed1…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc30be16f33c36df9…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x53c1d46e89921e68…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x49de37ef7efc2264…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf328f636419af9c3…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x488809b8b5b300b2…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe1e9346ee1c9a0cd…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x48242f0942ad1d9c…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8d8267c6ce9e204f…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd17b40fb384f98e7…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xdced1e583ac423ae…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb1ea3d798e4ce038…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd9bfa9bd33f62152…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xfee22337d84689f2…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5bc5a94094264db7…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x406d84d754d6c30b…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xfe8cf4d50d615f7b…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd53cf5a6e8d88b4e…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4fdbea1e82ca0172…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf14ada251eb09a34…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x70397d99cf74e952…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0a533577a87b3da5…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5a4687d9b12e7136…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x22b7b7d44e5df7af…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xdd938693323abf41…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb38098e74bce5e0c…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3086071ea058c36e…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe836454b93e3d5d5…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8f5611fd8f05edc1…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb5a6a33d320778c9…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xce06f2a59bd336e3…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xec99e8afe14ef9d6…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa375b7940eab0127…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa080442756a7a784…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xccafd50e3a7c96ae…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x807c2fb0121658d1…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x02dcb900e530c2e7…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x91aae074a1abd08b…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5a227c5fece67144…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9aac36aa5d9d2d38…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8e97c997b325d2ba…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x03c1e8c95ec86eb3…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xfff795f954f34d7d…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1321c91ffe1b787d…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbf474fd9074caae7…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb8f06a48303e4e55…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb653d2937575b706…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x78cc86b770bcc652…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x92f74ca81ba666c4…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x63ea7dd7527c294c…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x54c49d00fface256…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xeb89a47384941371…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6b78cbc5804413e5…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa30babe598bd810e…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x77d49c34bf85eb27…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x520adbedc16140c0…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf667a11fb27adf8b…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x996f4082f9512911…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0358a36ad7919530…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbe590cb9593e8c66…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x039d4bba6e5e0301…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd860a100ead9c0dc…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3976ee5bfea6e4b4…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x88c933328baf9400…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x86afebf9ccf362bb…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x00a37cdcfd623101…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4990982e7d2cf149…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb285a8b7ac7f1d31…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9e4dd41031155b6a…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb2fa23db71b6eaf5…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbe80941c6b466624…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2eaf1fa6d4f3d932…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb5d3132b63ec55fd…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xab13c6a499df3dbe…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa32d22cd6cfb12de…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe5c3a49a285f734b…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0bb015672389e6fd…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf3c176e523468614…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa26b185e99fc055e…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc4aab6ad2c39ba0a…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3a8a7d0d0dd536d2…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xdfd06b5da51626c7…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa8953dcf130d2769…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x946168de987d7a03…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9d86b094706084ad…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8d48390bc50a3680…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xaee055643aff0916…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1e3c8305117792c9…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2edb1ca88b483c4e…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x80fed5d08fa4048a…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2729b766a3655fd6…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x320d540975c6ba72…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x27df81dbaf2b3979…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd8f6e7fe2f2d0c89…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x55288d497b0c2486…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x71cc0297e38736a7…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1ff089405a1d9821…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x781c91965997565b…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7a1833212730666c…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x752e8a2edcb52145…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x089a7e4eda5d1510…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf6aa7ec4e1a440ea…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3f02b64a2b044159…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc5555922a4630de1…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xfe0b610459fa4b57…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbabd86cf9d5fe6c6…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7ca395007403b19f…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xfeb3f6acf5b3d6d9…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x62a31455473d75ce…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9e7fa505b810cc40…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x18747faab5bcafa3…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xdd17082c6552b955…` |
| EXECUTE_ADL_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x799bbc2f6cfb0c4a…` |
| EXECUTE_ATOMIC_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=AdlHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb8ef6b4f2d04fa79…` |
| EXECUTE_ATOMIC_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe42e10c4cb061695…` |
| EXECUTE_ATOMIC_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=Config | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xdaba8e0384056320…` |
| EXECUTE_ATOMIC_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1a740d68d6cfdae6…` |
| EXECUTE_ATOMIC_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x18ea38e9e458ed2b…` |
| EXECUTE_ATOMIC_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x644365c2a1c3a1bd…` |
| EXECUTE_ATOMIC_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=ExternalHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd0c6a128e150dfb4…` |
| EXECUTE_ATOMIC_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=FeeHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf040da35f3f7b077…` |
| EXECUTE_ATOMIC_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf3b5f156ee1334d9…` |
| EXECUTE_ATOMIC_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xdd1e34e981c5b989…` |
| EXECUTE_ATOMIC_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=MarketFactory | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x82049296572d7a6a…` |
| EXECUTE_ATOMIC_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=OrderHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1600366fd68e1940…` |
| EXECUTE_ATOMIC_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=RelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x86b6cd86053a93bc…` |
| EXECUTE_ATOMIC_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=Router | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2a1378adcdff57eb…` |
| EXECUTE_ATOMIC_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf0e558eaa39d3641…` |
| EXECUTE_ATOMIC_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x43f5c035f1471a9f…` |
| EXECUTE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=AdlHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa618b8f075858f1d…` |
| EXECUTE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0d11093c9cc17c66…` |
| EXECUTE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=Config | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9a63818cb0d5e54b…` |
| EXECUTE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x00342cde3abb44d3…` |
| EXECUTE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb43965dcc7d8db1b…` |
| EXECUTE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa6590692256fb8af…` |
| EXECUTE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=ExternalHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc64585e35a659a18…` |
| EXECUTE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=FeeHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb308469e791a459e…` |
| EXECUTE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x30f24cb69b197fff…` |
| EXECUTE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x24c6e8713bc398c5…` |
| EXECUTE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=MarketFactory | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x14a693a33fcb0727…` |
| EXECUTE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=OrderHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x35695d37de936124…` |
| EXECUTE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=RelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb74d1eced1ee90d0…` |
| EXECUTE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=Router | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x32a8549ce7b59620…` |
| EXECUTE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbcdebe3f28fd80e8…` |
| EXECUTE_DEPOSIT_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf7bd3f5d0840fef7…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x496cc5aad4889f6a…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xdab3fc071a65f31d…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x79348e95d0b8ba66…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc1bd6ed7cee7c547…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8ac3bafd80165f92…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf45174c2faf0c7d9…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9fc2ec43c206f383…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x93e2d5122d6af2b4…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x41f8cf2f6e60198b…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9027af11be785f65…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe5be931addd22971…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x14d490995c66f890…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x49b47af1d8e5cfad…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xaa1a0865762903e4…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf8d395830994e5e9…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbb7469343dd1fc41…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5bf38b7299702143…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xaf2b5f9759cf6489…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3f55b3a15500cad9…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x83bcc8af841f7637…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2e4774d12b596abe…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x440bc282b3acd0fc…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1a95c95745eb28aa…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8d1b443972a5b39f…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x28d54e20a9edd568…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4ab8eb092cb0672f…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1d9e78976fed054e…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x51dec494d62dbebf…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb0c01ff8e794cd92…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6cd7cc9ef63458de…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xad4c921808f8af39…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe53a771a49e6741d…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd35e955b76e48233…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc7aa3bfa7ec83c09…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xeac1bab4befcdc36…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa8c4f83db873135f…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa1bfaa345688c37d…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3647f331f139d602…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc8dd35b19612799a…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x75cfb1b6dd32834d…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7b4f36a0dfa6400e…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7b5cb032e0cdffed…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x70d32f15e74723ba…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xfe87b6516972d425…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd56a731ce4bbb268…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa6fe9585ee1a2436…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2bb01371dd924d23…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xdc68286b06fd1963…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x58a56e4ba525a86b…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3c4dd66145f47571…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe0b7803391f938e0…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x50ddd3d8207ab1f5…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x461d4af1af0db4de…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa7a0bb73d547e016…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x780398b47e9e27fe…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xacb754c9dfa7e337…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf1b71770aa7165a6…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x42699ac8db109a4d…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x482c4ac6823126cd…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb091ad3e1543799d…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xda4fc54fc6a3b59f…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa905cc82b4d6a1ec…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7d051c09fdc9ed37…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x040437899084851c…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4fdb4aa9b01788e4…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5edfcf49e4bcc3fa…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xaf9251851bc80929…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x41aa0d4eab4ac651…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb557646861739c89…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe1d175a1ecdf8f16…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0bdfcca914ca74d0…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xaae9f83f1c38f766…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe084d316bb35fbeb…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x119935bea1104ace…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xaab5f4b610ecc5e6…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x343621411c7dffb4…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1b31f214cfbebfba…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5d0226afb4d70c81…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7c5f5e636ae8b099…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc6af72164991a699…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x358d922b4f8aa808…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc110e061d3c8c9f5…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xda892f337709ec4f…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x71b2f401182af96c…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xfde5e6d539f0d0de…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x59debcb23a935f38…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa7a875e22e8f9969…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1fc8c61c40b84c45…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf6c4c0d8ee16fcb4…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa3e207bee182aaf4…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x94c115c2cb13e4d0…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x53039ae976d3c524…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x11cc7fa7b7718a5b…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x70231cfe81b8d6b2…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc7087ed9f3f9d38c…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x86bd78d021d9b046…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa6d3d35482077913…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe6982776510a6f48…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x152643b988fd6036…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xeb501ba147cb2eb9…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6ffbb2e4c1d0146a…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4378e0c55da70fce…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8c2c3325f1d0fff5…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd9887067264b3f37…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf06e2400cec41e61…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x80313a47f3d9d947…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbc69d4e07b1307b7…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x01092aa73fb8eccb…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4cb8958f81a8a6b1…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8269099af14a1123…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9107e5bbdad37065…` |
| EXECUTE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe1d14416dae4c286…` |
| EXECUTE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=AdlHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd20eaf77e0938dd5…` |
| EXECUTE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7a17f49469832349…` |
| EXECUTE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=Config | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbb590f5a6b7750a4…` |
| EXECUTE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x59b6031293dd6491…` |
| EXECUTE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x73edba34ff06fa32…` |
| EXECUTE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5350ab1c03b41444…` |
| EXECUTE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=ExternalHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x46252126f331a17a…` |
| EXECUTE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=FeeHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe6cf33a3aa6e2e10…` |
| EXECUTE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x76b82d5443be440e…` |
| EXECUTE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x335660568205aef3…` |
| EXECUTE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=MarketFactory | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5888dcd6bdf4dbf6…` |
| EXECUTE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=OrderHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe6c9ac5bf04156d0…` |
| EXECUTE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=RelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7e364c3910df3ecb…` |
| EXECUTE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=Router | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xcaf8ea0cbe357641…` |
| EXECUTE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x60529a17e5d0a4e7…` |
| EXECUTE_WITHDRAWAL_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xec6e058ff7355d54…` |
| EXECUTION_FEE_SUBSIDIZE | marketIndex=market#1 · BTC/UNKNOWN | uint | `20000000000000000000000000000000` | 20 (USD(1e30)) | 已设置 | DataStore 直写(CONTROLLER) | `0xc5040f72a63c8693…` |
| EXECUTION_FEE_SUBSIDIZE | marketIndex=market#2 · WETH/UNKNOWN | uint | `20000000000000000000000000000000` | 20 (USD(1e30)) | 已设置 | DataStore 直写(CONTROLLER) | `0x6f5812259c11104a…` |
| EXECUTION_FEE_SUBSIDIZE_SIZE | marketIndex=market#1 · BTC/UNKNOWN | uint | `333333333333333` | 0.000333333333333333 (token(1e18)) | 已设置 | DataStore 直写(CONTROLLER) | `0xdb28d307ba211567…` |
| EXECUTION_FEE_SUBSIDIZE_SIZE | marketIndex=market#2 · WETH/UNKNOWN | uint | `10000000000000000` | 0.01 (token(1e18)) | 已设置 | DataStore 直写(CONTROLLER) | `0xc8fa48d7a726082c…` |
| FUNDING_BASE_FACTOR | marketIndex=market#1 · BTC/UNKNOWN | int | `42672606957128361237950` | 0.00000004267260695712836123795 (per-sec(1e30), 年化≈134.5700%) | 已设置 | Config(CONFIG_KEEPER) | `0xa761d456614f2bb3…` |
| FUNDING_BASE_FACTOR | marketIndex=market#2 · WETH/UNKNOWN | int | `45278306284880771182141` | 0.000000045278306284880771182141 (per-sec(1e30), 年化≈142.7800%) | 已设置 | Config(CONFIG_KEEPER) | `0x20ca7748986aa11d…` |
| FUNDING_FLOOR_FACTOR | marketIndex=market#1 · BTC/UNKNOWN | int | `3472222222222222222222` | 0.000000003472222222222222222222 (per-sec(1e30), 年化≈10.9400%) | 已设置 | Config(CONFIG_KEEPER) | `0x18097692f9c9bbea…` |
| FUNDING_FLOOR_FACTOR | marketIndex=market#2 · WETH/UNKNOWN | int | `3472222222222222222222` | 0.000000003472222222222222222222 (per-sec(1e30), 年化≈10.9400%) | 已设置 | Config(CONFIG_KEEPER) | `0xa4500dd8681ac4cd…` |
| FUNDING_SKEW_EMA | marketIndex=market#1 · BTC/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x4f5c211084aa5333…` |
| FUNDING_SKEW_EMA | marketIndex=market#2 · WETH/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x21564016691bc4f9…` |
| FUNDING_UPDATED_AT | marketIndex=market#1 · BTC/UNKNOWN | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x08300402a9c40555…` |
| FUNDING_UPDATED_AT | marketIndex=market#2 · WETH/UNKNOWN | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xdedc11d3c1240899…` |
| GASLESS_FEATURE_DISABLED ※命名推断 | module=AdlHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x96f2a494de589bc7…` |
| GASLESS_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe7e2d55a005fd170…` |
| GASLESS_FEATURE_DISABLED ※命名推断 | module=Config | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe438db9c683b9327…` |
| GASLESS_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7b40f615be23f533…` |
| GASLESS_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8c5431277c6a2238…` |
| GASLESS_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa9f232dd3aaa084c…` |
| GASLESS_FEATURE_DISABLED ※命名推断 | module=ExternalHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x24367d7e0f6a7eb3…` |
| GASLESS_FEATURE_DISABLED ※命名推断 | module=FeeHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xac08f99355182060…` |
| GASLESS_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x30b5e8f01c294468…` |
| GASLESS_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xdee6571c03b35a3b…` |
| GASLESS_FEATURE_DISABLED ※命名推断 | module=MarketFactory | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x84d2b1e64406092e…` |
| GASLESS_FEATURE_DISABLED ※命名推断 | module=OrderHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0cad520cd73da450…` |
| GASLESS_FEATURE_DISABLED ※命名推断 | module=RelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x236fa52b5bd9bb71…` |
| GASLESS_FEATURE_DISABLED ※命名推断 | module=Router | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x531011108818f811…` |
| GASLESS_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0fad86346add7ae4…` |
| GASLESS_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9d247c57d42d6ecd…` |
| IS_MARKET_DISABLED | marketIndex=market#1 · BTC/UNKNOWN | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x64f966da50c23ec6…` |
| IS_MARKET_DISABLED | marketIndex=market#2 · WETH/UNKNOWN | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc3d530405f96db92…` |
| IS_ORACLE_PROVIDER_ENABLED | provider=ChainlinkDataStreamProvider | bool | `true` |  | 已设置 | DataStore 直写(CONTROLLER) | `0xad6737e9ad4de84e…` |
| IS_ORACLE_PROVIDER_ENABLED | provider=ChainlinkPriceFeedProvider | bool | `true` |  | 已设置 | DataStore 直写(CONTROLLER) | `0xab9c949cfff3153c…` |
| IS_ORACLE_PROVIDER_ENABLED | provider=PythPriceFeedProvider | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xbda818d2983beef4…` |
| JIT_FEATURE_DISABLED ※命名推断 | module=AdlHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6d654710a370543d…` |
| JIT_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x796547c4bf7632cc…` |
| JIT_FEATURE_DISABLED ※命名推断 | module=Config | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2cdb277558a23d87…` |
| JIT_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc9c9efc76ae1e2cb…` |
| JIT_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x31b93d0c1bd0be9e…` |
| JIT_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x56ad897b26983cde…` |
| JIT_FEATURE_DISABLED ※命名推断 | module=ExternalHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3740368c10f7fd9e…` |
| JIT_FEATURE_DISABLED ※命名推断 | module=FeeHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xcd947dbcfdacd9b0…` |
| JIT_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1d91c16fddcfd1f4…` |
| JIT_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xab33cc6c8fb8658a…` |
| JIT_FEATURE_DISABLED ※命名推断 | module=MarketFactory | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9761719f83c8c257…` |
| JIT_FEATURE_DISABLED ※命名推断 | module=OrderHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xab27deb5f9006066…` |
| JIT_FEATURE_DISABLED ※命名推断 | module=RelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf77016f4541bb05c…` |
| JIT_FEATURE_DISABLED ※命名推断 | module=Router | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0abedc9d0196f40e…` |
| JIT_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc10db945f5a0bcb8…` |
| JIT_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9c5342b099cb8a1f…` |
| LENT_POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xa51de66fbf302169…` |
| LENT_POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xa51de66fbf302169…` |
| LENT_POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xa51de66fbf302169…` |
| LENT_POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xa51de66fbf302169…` |
| LENT_POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xa51de66fbf302169…` |
| LENT_POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xa867b47dccb6546e…` |
| LENT_POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xa867b47dccb6546e…` |
| LENT_POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xa867b47dccb6546e…` |
| LENT_POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xa867b47dccb6546e…` |
| LENT_POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xa867b47dccb6546e…` |
| LIQUIDATION_FEE_FACTOR | marketIndex=market#1 · BTC/UNKNOWN | uint | `3000000000000000000000000000` | 0.003 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0xef8f91fbca41737f…` |
| LIQUIDATION_FEE_FACTOR | marketIndex=market#2 · WETH/UNKNOWN | uint | `3000000000000000000000000000` | 0.003 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0xa7379edf4fdbebb6…` |
| LIQUIDATION_GRACE_PERIOD_BASE | marketIndex=market#1 · BTC/UNKNOWN | uint | `900` | 900 seconds | 已设置 | DataStore 直写(CONTROLLER) | `0xe31f45769cf4c350…` |
| LIQUIDATION_GRACE_PERIOD_BASE | marketIndex=market#2 · WETH/UNKNOWN | uint | `900` | 900 seconds | 已设置 | DataStore 直写(CONTROLLER) | `0x4d1c3992c607ef43…` |
| LIQUIDATION_GRACE_PERIOD_TIER_MULTIPLIER | tier=tier0 | uint | `1000000000000000000` | 1 (multiplier(1e18)) | 已设置 | DataStore 直写(CONTROLLER) | `0x01664845e671719b…` |
| LIQUIDATION_GRACE_PERIOD_TIER_MULTIPLIER | tier=tier1 | uint | `0` | 0 (multiplier(1e18)) | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x4dfa7feb67936838…` |
| LIQUIDATION_GRACE_PERIOD_TIER_MULTIPLIER | tier=tier2 | uint | `0` | 0 (multiplier(1e18)) | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xb1e8b618fdaf755a…` |
| LIQUIDATION_GRACE_PERIOD_TIER_MULTIPLIER | tier=tier3 | uint | `0` | 0 (multiplier(1e18)) | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xb3fb870c4ce9ef25…` |
| MAX_DYNAMIC_SPREAD | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | int | `1000000000000000000` |  | 已设置 | Config(CONFIG_KEEPER) | `0x6efa7a2ffb0af105…` |
| MAX_DYNAMIC_SPREAD | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | int | `1000000000000000000` |  | 已设置 | Config(CONFIG_KEEPER) | `0x683b4f4a55f38871…` |
| MAX_DYNAMIC_SPREAD | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | int | `1000000000000000000` |  | 已设置 | Config(CONFIG_KEEPER) | `0x69f78cc7ed3f3c9b…` |
| MAX_DYNAMIC_SPREAD | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | int | `1000000000000000000` |  | 已设置 | Config(CONFIG_KEEPER) | `0x81b0761215c60311…` |
| MAX_FUNDING_FACTOR_PER_SECOND | marketIndex=market#1 · BTC/UNKNOWN | int | `30606957128361237950279` | 0.000000030606957128361237950279 (per-sec(1e30), 年化≈96.5200%) | 已设置 | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0xcc480b24d876582b…` |
| MAX_FUNDING_FACTOR_PER_SECOND | marketIndex=market#2 · WETH/UNKNOWN | int | `35320839675291730086250` | 0.00000003532083967529173008625 (per-sec(1e30), 年化≈111.3800%) | 已设置 | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0xd7407d9dc7294534…` |
| MAX_LENDABLE_IMPACT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2a1d0d0b64d89263…` |
| MAX_LENDABLE_IMPACT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2a1d0d0b64d89263…` |
| MAX_LENDABLE_IMPACT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2a1d0d0b64d89263…` |
| MAX_LENDABLE_IMPACT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2a1d0d0b64d89263…` |
| MAX_LENDABLE_IMPACT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2a1d0d0b64d89263…` |
| MAX_LENDABLE_IMPACT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5c04857ef3e62e2b…` |
| MAX_LENDABLE_IMPACT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5c04857ef3e62e2b…` |
| MAX_LENDABLE_IMPACT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5c04857ef3e62e2b…` |
| MAX_LENDABLE_IMPACT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5c04857ef3e62e2b…` |
| MAX_LENDABLE_IMPACT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5c04857ef3e62e2b…` |
| MAX_LENDABLE_IMPACT_FACTOR_FOR_WITHDRAWALS ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xcd71783a24cbef75…` |
| MAX_LENDABLE_IMPACT_FACTOR_FOR_WITHDRAWALS ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xcd71783a24cbef75…` |
| MAX_LENDABLE_IMPACT_FACTOR_FOR_WITHDRAWALS ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xcd71783a24cbef75…` |
| MAX_LENDABLE_IMPACT_FACTOR_FOR_WITHDRAWALS ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xcd71783a24cbef75…` |
| MAX_LENDABLE_IMPACT_FACTOR_FOR_WITHDRAWALS ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xcd71783a24cbef75…` |
| MAX_LENDABLE_IMPACT_FACTOR_FOR_WITHDRAWALS ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbbe07b250121e405…` |
| MAX_LENDABLE_IMPACT_FACTOR_FOR_WITHDRAWALS ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbbe07b250121e405…` |
| MAX_LENDABLE_IMPACT_FACTOR_FOR_WITHDRAWALS ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbbe07b250121e405…` |
| MAX_LENDABLE_IMPACT_FACTOR_FOR_WITHDRAWALS ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbbe07b250121e405…` |
| MAX_LENDABLE_IMPACT_FACTOR_FOR_WITHDRAWALS ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbbe07b250121e405…` |
| MAX_LENDABLE_IMPACT_USD ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbbe75d697d098f49…` |
| MAX_LENDABLE_IMPACT_USD ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbbe75d697d098f49…` |
| MAX_LENDABLE_IMPACT_USD ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbbe75d697d098f49…` |
| MAX_LENDABLE_IMPACT_USD ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbbe75d697d098f49…` |
| MAX_LENDABLE_IMPACT_USD ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbbe75d697d098f49…` |
| MAX_LENDABLE_IMPACT_USD ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9ec419c047772e58…` |
| MAX_LENDABLE_IMPACT_USD ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9ec419c047772e58…` |
| MAX_LENDABLE_IMPACT_USD ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9ec419c047772e58…` |
| MAX_LENDABLE_IMPACT_USD ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9ec419c047772e58…` |
| MAX_LENDABLE_IMPACT_USD ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9ec419c047772e58…` |
| MAX_OPEN_INTEREST | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | uint | `40000000000000000000000000000000000000` | 40000000 (USD(1e30)) | 已设置 | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0xe4dd33a80e05b504…` |
| MAX_OPEN_INTEREST | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | uint | `40000000000000000000000000000000000000` | 40000000 (USD(1e30)) | 已设置 | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x493ad52198982d70…` |
| MAX_OPEN_INTEREST | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | uint | `30000000000000000000000000000000000000` | 30000000 (USD(1e30)) | 已设置 | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0xdc64facbcdcd5e9e…` |
| MAX_OPEN_INTEREST | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | uint | `30000000000000000000000000000000000000` | 30000000 (USD(1e30)) | 已设置 | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x1e629d1f6e71f704…` |
| MAX_OPEN_INTEREST_FACTOR | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | uint | `400000000000000000000000000000` | 0.4 (factor(1e30)) | 已设置 | DataStore 直写(CONTROLLER) | `0x46f4c8af618936b7…` |
| MAX_OPEN_INTEREST_FACTOR | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | uint | `400000000000000000000000000000` | 0.4 (factor(1e30)) | 已设置 | DataStore 直写(CONTROLLER) | `0x66bd6a16e45e7f56…` |
| MAX_OPEN_INTEREST_FACTOR | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | uint | `300000000000000000000000000000` | 0.3 (factor(1e30)) | 已设置 | DataStore 直写(CONTROLLER) | `0x0cc25e79b4b6b63d…` |
| MAX_OPEN_INTEREST_FACTOR | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | uint | `300000000000000000000000000000` | 0.3 (factor(1e30)) | 已设置 | DataStore 直写(CONTROLLER) | `0x2321f7ff56aefffa…` |
| MAX_PNL_FACTOR | pnlFactorType=MAX_PNL_FACTOR_FOR_ADL, marketIndex=market#1 · BTC/UNKNOWN, isLong=false | uint | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9992f5191cd855d1…` |
| MAX_PNL_FACTOR | pnlFactorType=MAX_PNL_FACTOR_FOR_ADL, marketIndex=market#1 · BTC/UNKNOWN, isLong=true | uint | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe1a9264f9e3fc9ea…` |
| MAX_PNL_FACTOR | pnlFactorType=MAX_PNL_FACTOR_FOR_ADL, marketIndex=market#2 · WETH/UNKNOWN, isLong=false | uint | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd615ae507f4898f7…` |
| MAX_PNL_FACTOR | pnlFactorType=MAX_PNL_FACTOR_FOR_ADL, marketIndex=market#2 · WETH/UNKNOWN, isLong=true | uint | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa57bd346ecaeea23…` |
| MAX_PNL_FACTOR | pnlFactorType=MAX_PNL_FACTOR_FOR_TRADERS, marketIndex=market#1 · BTC/UNKNOWN, isLong=false | uint | `1000000000000000000000000000000` | 1 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0x92c04102d0fc77de…` |
| MAX_PNL_FACTOR | pnlFactorType=MAX_PNL_FACTOR_FOR_TRADERS, marketIndex=market#1 · BTC/UNKNOWN, isLong=true | uint | `1000000000000000000000000000000` | 1 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0x385b0c843e1e7ae8…` |
| MAX_PNL_FACTOR | pnlFactorType=MAX_PNL_FACTOR_FOR_TRADERS, marketIndex=market#2 · WETH/UNKNOWN, isLong=false | uint | `1000000000000000000000000000000` | 1 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0x76b3749f226ba313…` |
| MAX_PNL_FACTOR | pnlFactorType=MAX_PNL_FACTOR_FOR_TRADERS, marketIndex=market#2 · WETH/UNKNOWN, isLong=true | uint | `1000000000000000000000000000000` | 1 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0xca6d3af7d550ebdd…` |
| MAX_PNL_FACTOR | pnlFactorType=MAX_PNL_FACTOR_FOR_WITHDRAWALS, marketIndex=market#1 · BTC/UNKNOWN, isLong=false | uint | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd604a80ec8f20d67…` |
| MAX_PNL_FACTOR | pnlFactorType=MAX_PNL_FACTOR_FOR_WITHDRAWALS, marketIndex=market#1 · BTC/UNKNOWN, isLong=true | uint | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3ae5c7ed1e82ce13…` |
| MAX_PNL_FACTOR | pnlFactorType=MAX_PNL_FACTOR_FOR_WITHDRAWALS, marketIndex=market#2 · WETH/UNKNOWN, isLong=false | uint | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4aa0b523565eb73d…` |
| MAX_PNL_FACTOR | pnlFactorType=MAX_PNL_FACTOR_FOR_WITHDRAWALS, marketIndex=market#2 · WETH/UNKNOWN, isLong=true | uint | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3c3e27795a3d5b05…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0xfb686505a3fa5e82…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0xfb686505a3fa5e82…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0xfb686505a3fa5e82…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0xfb686505a3fa5e82…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0xfb686505a3fa5e82…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x76104cec5c0a54ac…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x76104cec5c0a54ac…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x76104cec5c0a54ac…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x76104cec5c0a54ac…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x76104cec5c0a54ac…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0xdf6f10fdb4e8208f…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0xdf6f10fdb4e8208f…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0xdf6f10fdb4e8208f…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0xdf6f10fdb4e8208f…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0xdf6f10fdb4e8208f…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x48edbd040bbf2520…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x48edbd040bbf2520…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x48edbd040bbf2520…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x48edbd040bbf2520…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x48edbd040bbf2520…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x5d0a05d56c8ba9fd…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x5d0a05d56c8ba9fd…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x5d0a05d56c8ba9fd…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x5d0a05d56c8ba9fd…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x5d0a05d56c8ba9fd…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x2b240e4c90d44ac1…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x2b240e4c90d44ac1…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x2b240e4c90d44ac1…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x2b240e4c90d44ac1…` |
| MAX_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x2b240e4c90d44ac1…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x6a42f9139a4c1434…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x6a42f9139a4c1434…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x6a42f9139a4c1434…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x6a42f9139a4c1434…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x6a42f9139a4c1434…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x055e3b1546470c34…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x055e3b1546470c34…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x055e3b1546470c34…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x055e3b1546470c34…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x055e3b1546470c34…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x65cbc389d4102aec…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x65cbc389d4102aec…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x65cbc389d4102aec…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x65cbc389d4102aec…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x65cbc389d4102aec…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x0579ec2a3f5aa061…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x0579ec2a3f5aa061…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x0579ec2a3f5aa061…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x0579ec2a3f5aa061…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x0579ec2a3f5aa061…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0xae8c1df5699b6701…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0xae8c1df5699b6701…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0xae8c1df5699b6701…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0xae8c1df5699b6701…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0xae8c1df5699b6701…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0xb46879e111a58c6f…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0xb46879e111a58c6f…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0xb46879e111a58c6f…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0xb46879e111a58c6f…` |
| MAX_POOL_USD_FOR_DEPOSIT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0xb46879e111a58c6f…` |
| MAX_POSITION_IMPACT_FACTOR | marketIndex=market#1 · BTC/UNKNOWN, isPositive=false | uint | `1000000000000000000000000000000` | 1 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0x59ff2cdfba82c61e…` |
| MAX_POSITION_IMPACT_FACTOR | marketIndex=market#1 · BTC/UNKNOWN, isPositive=true | uint | `1000000000000000000000000000000` | 1 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0xa2b45d652d4e3054…` |
| MAX_POSITION_IMPACT_FACTOR | marketIndex=market#2 · WETH/UNKNOWN, isPositive=false | uint | `1000000000000000000000000000000` | 1 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0x7314036a59eae535…` |
| MAX_POSITION_IMPACT_FACTOR | marketIndex=market#2 · WETH/UNKNOWN, isPositive=true | uint | `1000000000000000000000000000000` | 1 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0x519fcdd23322d440…` |
| MAX_POSITION_IMPACT_FACTOR_FOR_LIQUIDATIONS | marketIndex=market#1 · BTC/UNKNOWN | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x090abae57f78d37f…` |
| MAX_POSITION_IMPACT_FACTOR_FOR_LIQUIDATIONS | marketIndex=market#2 · WETH/UNKNOWN | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x60f8ecbba27192e7…` |
| MAX_POSITION_SIZE_USD | marketIndex=market#1 · BTC/UNKNOWN | uint | `8000000000000000000000000000000000000` | 8000000 (USD(1e30)) | 已设置 | DataStore 直写(CONTROLLER) | `0x059ecddb79f1fbc2…` |
| MAX_POSITION_SIZE_USD | marketIndex=market#2 · WETH/UNKNOWN | uint | `6000000000000000000000000000000000000` | 6000000 (USD(1e30)) | 已设置 | DataStore 直写(CONTROLLER) | `0x81fb8e26808719e2…` |
| MAX_SKEW_IMPACT | marketIndex=market#1 · BTC/UNKNOWN | int | `5000000000000000` | 0.005 (skew(1e18)) | 已设置 | Config(CONFIG_KEEPER) | `0xeb19a9ff37f39642…` |
| MAX_SKEW_IMPACT | marketIndex=market#2 · WETH/UNKNOWN | int | `5000000000000000` | 0.005 (skew(1e18)) | 已设置 | Config(CONFIG_KEEPER) | `0x21b52342d70330d0…` |
| MIN_AFFILIATE_REWARD_FACTOR | referralTierLevel=referralTier0 | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8be98839b9bf1e5b…` |
| MIN_AFFILIATE_REWARD_FACTOR | referralTierLevel=referralTier1 | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x845528373e93fca1…` |
| MIN_AFFILIATE_REWARD_FACTOR | referralTierLevel=referralTier2 | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xff46395caeda107f…` |
| MIN_AFFILIATE_REWARD_FACTOR | referralTierLevel=referralTier3 | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x791e865e55c10dd6…` |
| MIN_COLLATERAL_FACTOR | marketIndex=market#1 · BTC/UNKNOWN | uint | `10000000000000000000000000000` | 0.01 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0x8966886f66575200…` |
| MIN_COLLATERAL_FACTOR | marketIndex=market#2 · WETH/UNKNOWN | uint | `10000000000000000000000000000` | 0.01 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0xed70c54a9a7199ba…` |
| MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION | marketIndex=market#1 · BTC/UNKNOWN | uint | `4000000000000000000000000000` | 0.004 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0x768837104c389743…` |
| MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION | marketIndex=market#2 · WETH/UNKNOWN | uint | `5000000000000000000000000000` | 0.005 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0x0459447b8ed5de12…` |
| MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa1bb6cea80a22e60…` |
| MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x47602301c9b7d8ab…` |
| MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x74920d7a06507737…` |
| MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5b80ed60130b5ce9…` |
| MIN_DYNAMIC_SPREAD | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | int | `-20000000000000000` |  | 已设置 | Config(CONFIG_KEEPER) | `0xf1ac59963425c971…` |
| MIN_DYNAMIC_SPREAD | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | int | `-20000000000000000` |  | 已设置 | Config(CONFIG_KEEPER) | `0xea35f55e404fafa8…` |
| MIN_DYNAMIC_SPREAD | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | int | `-20000000000000000` |  | 已设置 | Config(CONFIG_KEEPER) | `0x98c94e5bf39c17f4…` |
| MIN_DYNAMIC_SPREAD | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | int | `-20000000000000000` |  | 已设置 | Config(CONFIG_KEEPER) | `0xa530e94986681ad3…` |
| MIN_FUNDING_FACTOR_PER_SECOND | marketIndex=market#1 · BTC/UNKNOWN | int | `-4247209538305428716387` | -0.000000004247209538305428716387 (per-sec(1e30), 年化≈-13.3900%) | 已设置 | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x73bb015d21f0256a…` |
| MIN_FUNDING_FACTOR_PER_SECOND | marketIndex=market#2 · WETH/UNKNOWN | int | `-8722571029934043632673` | -0.000000008722571029934043632673 (per-sec(1e30), 年化≈-27.5000%) | 已设置 | Config(CONFIG_KEEPER) / Config(LIMITED_CONFIG_KEEPER) | `0x2f706374c75039cb…` |
| MIN_MARKET_TOKENS_FOR_FIRST_DEPOSIT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf3d28e3860ea7d1f…` |
| MIN_MARKET_TOKENS_FOR_FIRST_DEPOSIT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf3d28e3860ea7d1f…` |
| MIN_MARKET_TOKENS_FOR_FIRST_DEPOSIT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf3d28e3860ea7d1f…` |
| MIN_MARKET_TOKENS_FOR_FIRST_DEPOSIT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf3d28e3860ea7d1f…` |
| MIN_MARKET_TOKENS_FOR_FIRST_DEPOSIT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf3d28e3860ea7d1f…` |
| MIN_MARKET_TOKENS_FOR_FIRST_DEPOSIT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb80fc5c97da51943…` |
| MIN_MARKET_TOKENS_FOR_FIRST_DEPOSIT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb80fc5c97da51943…` |
| MIN_MARKET_TOKENS_FOR_FIRST_DEPOSIT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb80fc5c97da51943…` |
| MIN_MARKET_TOKENS_FOR_FIRST_DEPOSIT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb80fc5c97da51943…` |
| MIN_MARKET_TOKENS_FOR_FIRST_DEPOSIT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb80fc5c97da51943…` |
| MIN_POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xee2e2a5786d54614…` |
| MIN_POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xee2e2a5786d54614…` |
| MIN_POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xee2e2a5786d54614…` |
| MIN_POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xee2e2a5786d54614…` |
| MIN_POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xee2e2a5786d54614…` |
| MIN_POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x384fd1c70f06f0dd…` |
| MIN_POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x384fd1c70f06f0dd…` |
| MIN_POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x384fd1c70f06f0dd…` |
| MIN_POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x384fd1c70f06f0dd…` |
| MIN_POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x384fd1c70f06f0dd…` |
| MIN_SKEW_IMPACT | marketIndex=market#1 · BTC/UNKNOWN | int | `-5000000000000000` | -0.005 (skew(1e18)) | 已设置 | Config(CONFIG_KEEPER) | `0x12d64cc629c03e0f…` |
| MIN_SKEW_IMPACT | marketIndex=market#2 · WETH/UNKNOWN | int | `-5000000000000000` | -0.005 (skew(1e18)) | 已设置 | Config(CONFIG_KEEPER) | `0xe8883d55022d7f92…` |
| NEGATIVE_FUNDING_FEE_PER_SIZE | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xf0cd33d48d3f495f…` |
| NEGATIVE_FUNDING_FEE_PER_SIZE | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x2f26cae917f14dce…` |
| NEGATIVE_FUNDING_FEE_PER_SIZE | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x537fe5279603b0d4…` |
| NEGATIVE_FUNDING_FEE_PER_SIZE | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x5141f1deeea141cb…` |
| OPEN_INTEREST_IN_TOKENS | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xf732c2fa8c4e7855…` |
| OPEN_INTEREST_IN_TOKENS | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x74b301fc63bbf24f…` |
| OPEN_INTEREST_IN_TOKENS | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xf1db850779f4f066…` |
| OPEN_INTEREST_IN_TOKENS | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x6a0b86db1052b557…` |
| OPTIMAL_USAGE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8090ec7e48a8bb60…` |
| OPTIMAL_USAGE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8090ec7e48a8bb60…` |
| OPTIMAL_USAGE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8090ec7e48a8bb60…` |
| OPTIMAL_USAGE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8090ec7e48a8bb60…` |
| OPTIMAL_USAGE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8090ec7e48a8bb60…` |
| OPTIMAL_USAGE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xce82f548976abab4…` |
| OPTIMAL_USAGE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xce82f548976abab4…` |
| OPTIMAL_USAGE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xce82f548976abab4…` |
| OPTIMAL_USAGE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xce82f548976abab4…` |
| OPTIMAL_USAGE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xce82f548976abab4…` |
| OPTIMAL_USAGE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0813e5cd8b1799a9…` |
| OPTIMAL_USAGE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0813e5cd8b1799a9…` |
| OPTIMAL_USAGE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0813e5cd8b1799a9…` |
| OPTIMAL_USAGE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0813e5cd8b1799a9…` |
| OPTIMAL_USAGE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0813e5cd8b1799a9…` |
| OPTIMAL_USAGE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x51a4c580363cc339…` |
| OPTIMAL_USAGE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x51a4c580363cc339…` |
| OPTIMAL_USAGE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x51a4c580363cc339…` |
| OPTIMAL_USAGE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x51a4c580363cc339…` |
| OPTIMAL_USAGE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x51a4c580363cc339…` |
| ORACLE_PROVIDER_FOR_TOKEN | oracle=Oracle, token=BTC / market#1 indexToken | address | `0x037518f9bfab37cb6ed1270f8721067a224db870` |  | 已设置 | DataStore 直写(CONTROLLER) | `0x8cce879b91520e7b…` |
| ORACLE_PROVIDER_FOR_TOKEN | oracle=Oracle, token=USDC / MockUSDC | address | `0x037518f9bfab37cb6ed1270f8721067a224db870` |  | 已设置 | DataStore 直写(CONTROLLER) | `0xb353d054823d490d…` |
| ORACLE_PROVIDER_FOR_TOKEN | oracle=Oracle, token=WETH / market#2 indexToken / WNT (Base WETH) | address | `0x037518f9bfab37cb6ed1270f8721067a224db870` |  | 已设置 | DataStore 直写(CONTROLLER) | `0x914946b292e798b7…` |
| ORACLE_PROVIDER_FOR_TOKEN | token=BTC / market#1 indexToken | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xbd0955bbabb745b9…` |
| ORACLE_PROVIDER_FOR_TOKEN | token=USDC / MockUSDC | address | `0x037518f9bfab37cb6ed1270f8721067a224db870` |  | 已设置 | DataStore 直写(CONTROLLER) | `0x8f40dec2f49bf0bb…` |
| ORACLE_PROVIDER_FOR_TOKEN | token=WETH / market#2 indexToken / WNT (Base WETH) | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x74c22d34c3f6cb83…` |
| ORACLE_PROVIDER_UPDATED_AT | token=BTC / market#1 indexToken, provider=ChainlinkDataStreamProvider | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xa18d00ecc9902c9c…` |
| ORACLE_PROVIDER_UPDATED_AT | token=BTC / market#1 indexToken, provider=ChainlinkPriceFeedProvider | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x63435280db8e4eb7…` |
| ORACLE_PROVIDER_UPDATED_AT | token=BTC / market#1 indexToken, provider=PythPriceFeedProvider | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x45684ce375c35701…` |
| ORACLE_PROVIDER_UPDATED_AT | token=USDC / MockUSDC, provider=ChainlinkDataStreamProvider | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xc61cd9938814b102…` |
| ORACLE_PROVIDER_UPDATED_AT | token=USDC / MockUSDC, provider=ChainlinkPriceFeedProvider | uint | `1788362587` |  | 已设置 | DataStore 直写(CONTROLLER) | `0xf14240057b31c148…` |
| ORACLE_PROVIDER_UPDATED_AT | token=USDC / MockUSDC, provider=PythPriceFeedProvider | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x13c48f94ab41d4fe…` |
| ORACLE_PROVIDER_UPDATED_AT | token=WETH / market#2 indexToken / WNT (Base WETH), provider=ChainlinkDataStreamProvider | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xf1986175eb4b35cf…` |
| ORACLE_PROVIDER_UPDATED_AT | token=WETH / market#2 indexToken / WNT (Base WETH), provider=ChainlinkPriceFeedProvider | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x5f1556b86c72481f…` |
| ORACLE_PROVIDER_UPDATED_AT | token=WETH / market#2 indexToken / WNT (Base WETH), provider=PythPriceFeedProvider | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xddba9b68ca7dd557…` |
| ORACLE_TIMESTAMP_ADJUSTMENT | provider=ChainlinkDataStreamProvider, token=BTC / market#1 indexToken | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x27015f0b62dde825…` |
| ORACLE_TIMESTAMP_ADJUSTMENT | provider=ChainlinkDataStreamProvider, token=USDC / MockUSDC | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x45262c1b71455a93…` |
| ORACLE_TIMESTAMP_ADJUSTMENT | provider=ChainlinkDataStreamProvider, token=WETH / market#2 indexToken / WNT (Base WETH) | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x04b1b9811d50436a…` |
| ORACLE_TIMESTAMP_ADJUSTMENT | provider=ChainlinkPriceFeedProvider, token=BTC / market#1 indexToken | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe8a1118b3cca7093…` |
| ORACLE_TIMESTAMP_ADJUSTMENT | provider=ChainlinkPriceFeedProvider, token=USDC / MockUSDC | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x524989626b37c26a…` |
| ORACLE_TIMESTAMP_ADJUSTMENT | provider=ChainlinkPriceFeedProvider, token=WETH / market#2 indexToken / WNT (Base WETH) | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x43e4910d1539b717…` |
| ORACLE_TIMESTAMP_ADJUSTMENT | provider=PythPriceFeedProvider, token=BTC / market#1 indexToken | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb53009d11fc4b943…` |
| ORACLE_TIMESTAMP_ADJUSTMENT | provider=PythPriceFeedProvider, token=USDC / MockUSDC | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb4903b090a46738a…` |
| ORACLE_TIMESTAMP_ADJUSTMENT | provider=PythPriceFeedProvider, token=WETH / market#2 indexToken / WNT (Base WETH) | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7358200b1df178ac…` |
| ORACLE_TYPE ⚠探测 | token=BTC / market#1 indexToken | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x17be19956be91020…` |
| ORACLE_TYPE ⚠探测 | token=BTC / market#1 indexToken | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x17be19956be91020…` |
| ORACLE_TYPE ⚠探测 | token=BTC / market#1 indexToken | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x17be19956be91020…` |
| ORACLE_TYPE ⚠探测 | token=BTC / market#1 indexToken | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x17be19956be91020…` |
| ORACLE_TYPE ⚠探测 | token=BTC / market#1 indexToken | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x17be19956be91020…` |
| ORACLE_TYPE ⚠探测 | token=USDC / MockUSDC | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4e5a807a6cad54f8…` |
| ORACLE_TYPE ⚠探测 | token=USDC / MockUSDC | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4e5a807a6cad54f8…` |
| ORACLE_TYPE ⚠探测 | token=USDC / MockUSDC | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4e5a807a6cad54f8…` |
| ORACLE_TYPE ⚠探测 | token=USDC / MockUSDC | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4e5a807a6cad54f8…` |
| ORACLE_TYPE ⚠探测 | token=USDC / MockUSDC | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4e5a807a6cad54f8…` |
| ORACLE_TYPE ⚠探测 | token=WETH / market#2 indexToken / WNT (Base WETH) | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x303007465b284a31…` |
| ORACLE_TYPE ⚠探测 | token=WETH / market#2 indexToken / WNT (Base WETH) | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x303007465b284a31…` |
| ORACLE_TYPE ⚠探测 | token=WETH / market#2 indexToken / WNT (Base WETH) | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x303007465b284a31…` |
| ORACLE_TYPE ⚠探测 | token=WETH / market#2 indexToken / WNT (Base WETH) | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x303007465b284a31…` |
| ORACLE_TYPE ⚠探测 | token=WETH / market#2 indexToken / WNT (Base WETH) | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x303007465b284a31…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x33496439e4dd5a99…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x33496439e4dd5a99…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x33496439e4dd5a99…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x33496439e4dd5a99…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x33496439e4dd5a99…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x92f29b52acf34e19…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x92f29b52acf34e19…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x92f29b52acf34e19…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x92f29b52acf34e19…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x92f29b52acf34e19…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x863607abf90b7d1b…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x863607abf90b7d1b…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x863607abf90b7d1b…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x863607abf90b7d1b…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x863607abf90b7d1b…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xf432a2b0c3ea428f…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xf432a2b0c3ea428f…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xf432a2b0c3ea428f…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xf432a2b0c3ea428f…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xf432a2b0c3ea428f…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x7d4eaf523d66433b…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x7d4eaf523d66433b…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x7d4eaf523d66433b…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x7d4eaf523d66433b…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x7d4eaf523d66433b…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xa41216d7c807e0a3…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xa41216d7c807e0a3…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xa41216d7c807e0a3…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xa41216d7c807e0a3…` |
| POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xa41216d7c807e0a3…` |
| POSITION_FEE_FACTOR | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=false | uint | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3b0236897b889bae…` |
| POSITION_FEE_FACTOR | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=true | uint | `500000000000000000000000000` | 0.0005 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0x89618fec30c1b8fb…` |
| POSITION_FEE_FACTOR | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=false | uint | `500000000000000000000000000` | 0.0005 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0xe3c57c52372bed63…` |
| POSITION_FEE_FACTOR | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=true | uint | `500000000000000000000000000` | 0.0005 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0x21dee952d11e96a0…` |
| POSITION_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=false | uint | `1000000000000000000000000000000` | 1 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0x802fac6a1a840fef…` |
| POSITION_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=false | int | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x802fac6a1a840fef…` |
| POSITION_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=false | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x802fac6a1a840fef…` |
| POSITION_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x802fac6a1a840fef…` |
| POSITION_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x802fac6a1a840fef…` |
| POSITION_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=true | uint | `1000000000000000000000000000000` | 1 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0x9f3df721fee95ff8…` |
| POSITION_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=true | int | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9f3df721fee95ff8…` |
| POSITION_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=true | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9f3df721fee95ff8…` |
| POSITION_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9f3df721fee95ff8…` |
| POSITION_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9f3df721fee95ff8…` |
| POSITION_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=false | uint | `1000000000000000000000000000000` | 1 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0x5bdd7b2eda45c33f…` |
| POSITION_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=false | int | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5bdd7b2eda45c33f…` |
| POSITION_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=false | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5bdd7b2eda45c33f…` |
| POSITION_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5bdd7b2eda45c33f…` |
| POSITION_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5bdd7b2eda45c33f…` |
| POSITION_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=true | uint | `1000000000000000000000000000000` | 1 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0x11b893f6e5e6e5c3…` |
| POSITION_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=true | int | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x11b893f6e5e6e5c3…` |
| POSITION_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=true | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x11b893f6e5e6e5c3…` |
| POSITION_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x11b893f6e5e6e5c3…` |
| POSITION_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x11b893f6e5e6e5c3…` |
| POSITION_IMPACT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=false | uint | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf9c8bc3c1492018a…` |
| POSITION_IMPACT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=false | int | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf9c8bc3c1492018a…` |
| POSITION_IMPACT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=false | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf9c8bc3c1492018a…` |
| POSITION_IMPACT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf9c8bc3c1492018a…` |
| POSITION_IMPACT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf9c8bc3c1492018a…` |
| POSITION_IMPACT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=true | uint | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0bd02b529e165f77…` |
| POSITION_IMPACT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=true | int | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0bd02b529e165f77…` |
| POSITION_IMPACT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=true | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0bd02b529e165f77…` |
| POSITION_IMPACT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0bd02b529e165f77…` |
| POSITION_IMPACT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0bd02b529e165f77…` |
| POSITION_IMPACT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=false | uint | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe9951cedf2d93bd9…` |
| POSITION_IMPACT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=false | int | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe9951cedf2d93bd9…` |
| POSITION_IMPACT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=false | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe9951cedf2d93bd9…` |
| POSITION_IMPACT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe9951cedf2d93bd9…` |
| POSITION_IMPACT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe9951cedf2d93bd9…` |
| POSITION_IMPACT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=true | uint | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x37cfc53da5159040…` |
| POSITION_IMPACT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=true | int | `0` | 0 (factor(1e30)) | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x37cfc53da5159040…` |
| POSITION_IMPACT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=true | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x37cfc53da5159040…` |
| POSITION_IMPACT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x37cfc53da5159040…` |
| POSITION_IMPACT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x37cfc53da5159040…` |
| POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x232bfb1b48f7161c…` |
| POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x232bfb1b48f7161c…` |
| POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x232bfb1b48f7161c…` |
| POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x232bfb1b48f7161c…` |
| POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x232bfb1b48f7161c…` |
| POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x61ce40d6f02299b5…` |
| POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x61ce40d6f02299b5…` |
| POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x61ce40d6f02299b5…` |
| POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x61ce40d6f02299b5…` |
| POSITION_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x61ce40d6f02299b5…` |
| POSITION_IMPACT_POOL_DISTRIBUTED_AT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x720b26059fa0a4f8…` |
| POSITION_IMPACT_POOL_DISTRIBUTED_AT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x720b26059fa0a4f8…` |
| POSITION_IMPACT_POOL_DISTRIBUTED_AT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x720b26059fa0a4f8…` |
| POSITION_IMPACT_POOL_DISTRIBUTED_AT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x720b26059fa0a4f8…` |
| POSITION_IMPACT_POOL_DISTRIBUTED_AT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x720b26059fa0a4f8…` |
| POSITION_IMPACT_POOL_DISTRIBUTED_AT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x32cbf2cb8b66519b…` |
| POSITION_IMPACT_POOL_DISTRIBUTED_AT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x32cbf2cb8b66519b…` |
| POSITION_IMPACT_POOL_DISTRIBUTED_AT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x32cbf2cb8b66519b…` |
| POSITION_IMPACT_POOL_DISTRIBUTED_AT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x32cbf2cb8b66519b…` |
| POSITION_IMPACT_POOL_DISTRIBUTED_AT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x32cbf2cb8b66519b…` |
| POSITION_IMPACT_POOL_DISTRIBUTION_RATE ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xad3ea4db71dbf9f9…` |
| POSITION_IMPACT_POOL_DISTRIBUTION_RATE ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xad3ea4db71dbf9f9…` |
| POSITION_IMPACT_POOL_DISTRIBUTION_RATE ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xad3ea4db71dbf9f9…` |
| POSITION_IMPACT_POOL_DISTRIBUTION_RATE ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xad3ea4db71dbf9f9…` |
| POSITION_IMPACT_POOL_DISTRIBUTION_RATE ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xad3ea4db71dbf9f9…` |
| POSITION_IMPACT_POOL_DISTRIBUTION_RATE ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xc7137bbc2e53a208…` |
| POSITION_IMPACT_POOL_DISTRIBUTION_RATE ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xc7137bbc2e53a208…` |
| POSITION_IMPACT_POOL_DISTRIBUTION_RATE ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xc7137bbc2e53a208…` |
| POSITION_IMPACT_POOL_DISTRIBUTION_RATE ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xc7137bbc2e53a208…` |
| POSITION_IMPACT_POOL_DISTRIBUTION_RATE ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xc7137bbc2e53a208…` |
| POSITIVE_FUNDING_FEE_PER_SIZE | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xba76c0b37cf3872a…` |
| POSITIVE_FUNDING_FEE_PER_SIZE | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x598576db2a606a9d…` |
| POSITIVE_FUNDING_FEE_PER_SIZE | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x8585e5915f993f64…` |
| POSITIVE_FUNDING_FEE_PER_SIZE | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xc6fe528b95560966…` |
| PRICE_FEED | token=BTC / market#1 indexToken | address | `0x03d3d2b5c4ae0a214197aba3520c74768d204968` |  | 已设置 | DataStore 直写(CONTROLLER) | `0xafade91aab9d7927…` |
| PRICE_FEED | token=USDC / MockUSDC | address | `0xe80611dbe0d3e6b3b36af4348430fc058a202bda` |  | 已设置 | DataStore 直写(CONTROLLER) | `0x028284c6f3de1a27…` |
| PRICE_FEED | token=WETH / market#2 indexToken / WNT (Base WETH) | address | `0x8e4529c5c7ba8e1ab87acf9937477c31c89301f1` |  | 已设置 | DataStore 直写(CONTROLLER) | `0x1e32bc88c78e9f0e…` |
| PRICE_FEED_HEARTBEAT_DURATION | token=BTC / market#1 indexToken | uint | `86400` | 86400 seconds | 已设置 | Config(CONFIG_KEEPER) | `0xd4e908ba79b57cea…` |
| PRICE_FEED_HEARTBEAT_DURATION | token=USDC / MockUSDC | uint | `86400` | 86400 seconds | 已设置 | Config(CONFIG_KEEPER) | `0xff3236d8a01adf70…` |
| PRICE_FEED_HEARTBEAT_DURATION | token=WETH / market#2 indexToken / WNT (Base WETH) | uint | `86400` | 86400 seconds | 已设置 | Config(CONFIG_KEEPER) | `0x4f0ffc6e027cb44d…` |
| PRICE_FEED_MULTIPLIER | token=BTC / market#1 indexToken | uint | `10000000000000000000000000000000000` |  | 已设置 | DataStore 直写(CONTROLLER) | `0x513c5b49aca7fb9a…` |
| PRICE_FEED_MULTIPLIER | token=USDC / MockUSDC | uint | `1000000000000000000000000000000000000` |  | 已设置 | DataStore 直写(CONTROLLER) | `0x16925fcca675c920…` |
| PRICE_FEED_MULTIPLIER | token=WETH / market#2 indexToken / WNT (Base WETH) | uint | `10000000000000000000000000000000000` |  | 已设置 | DataStore 直写(CONTROLLER) | `0x4d61b0a46405a440…` |
| PRICE_IMPACT_PARAMETER | marketIndex=market#1 · BTC/UNKNOWN | uint | `500000000000000000` | 0.5 (spread(1e18)) | 已设置 | DataStore 直写(CONTROLLER) | `0x135cd0e2b5116a81…` |
| PRICE_IMPACT_PARAMETER | marketIndex=market#2 · WETH/UNKNOWN | uint | `600000000000000000` | 0.6 (spread(1e18)) | 已设置 | DataStore 直写(CONTROLLER) | `0x266a3505c9708b92…` |
| PRO_DISCOUNT_FACTOR | proTier=proTier0 | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x00b1ff8319e9484b…` |
| PRO_DISCOUNT_FACTOR | proTier=proTier1 | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x83a0debc6628608a…` |
| PRO_DISCOUNT_FACTOR | proTier=proTier2 | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3f63d37750668b38…` |
| PRO_DISCOUNT_FACTOR | proTier=proTier3 | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb7f128a183778200…` |
| PYTH_PRICE_FEED | token=BTC / market#1 indexToken | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xbf02e1c9133f2647…` |
| PYTH_PRICE_FEED | token=USDC / MockUSDC | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x499d3b999d085634…` |
| PYTH_PRICE_FEED | token=WETH / market#2 indexToken / WNT (Base WETH) | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x7a477ba0ee0a767b…` |
| PYTH_PRICE_FEED_MULTIPLIER | token=BTC / market#1 indexToken | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x9bb406c955d19b46…` |
| PYTH_PRICE_FEED_MULTIPLIER | token=USDC / MockUSDC | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xdb8fd3e9df451c8e…` |
| PYTH_PRICE_FEED_MULTIPLIER | token=WETH / market#2 indexToken / WNT (Base WETH) | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xc4891c94d42a0660…` |
| RESERVE_FACTOR | marketIndex=market#1 · BTC/UNKNOWN | uint | `400000000000000000000000000000` | 0.4 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0x946f34a3874c32fd…` |
| RESERVE_FACTOR | marketIndex=market#2 · WETH/UNKNOWN | uint | `300000000000000000000000000000` | 0.3 (factor(1e30)) | 已设置 | Config(CONFIG_KEEPER) | `0x11ba2f80af6fc836…` |
| SKEW_IMPACT_FACTOR | marketIndex=market#1 · BTC/UNKNOWN | int | `10000000000000000` | 0.01 (skew(1e18)) | 已设置 | Config(CONFIG_KEEPER) | `0xf65a6723320effb8…` |
| SKEW_IMPACT_FACTOR | marketIndex=market#2 · WETH/UNKNOWN | int | `2500000000000000` | 0.0025 (skew(1e18)) | 已设置 | Config(CONFIG_KEEPER) | `0x789e4982d7b23f9f…` |
| STABLE_PRICE | token=BTC / market#1 indexToken | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x6767c1cb86f8d5f8…` |
| STABLE_PRICE | token=USDC / MockUSDC | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x1ed5bb48f7abda7c…` |
| STABLE_PRICE | token=WETH / market#2 indexToken / WNT (Base WETH) | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x1e78d5506e36342c…` |
| SUBACCOUNT_FEATURE_DISABLED ※命名推断 | module=AdlHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6f2c6c4bdda1d872…` |
| SUBACCOUNT_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1c1f599f114f1b4c…` |
| SUBACCOUNT_FEATURE_DISABLED ※命名推断 | module=Config | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x993cf9fb3dae8e47…` |
| SUBACCOUNT_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc8ecaac261a39ea4…` |
| SUBACCOUNT_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf7ddc41b36ff5936…` |
| SUBACCOUNT_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4f313a38390ea46f…` |
| SUBACCOUNT_FEATURE_DISABLED ※命名推断 | module=ExternalHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x14358b57c84cd181…` |
| SUBACCOUNT_FEATURE_DISABLED ※命名推断 | module=FeeHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xaf98601fe0095cab…` |
| SUBACCOUNT_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xebd749f0081a0e81…` |
| SUBACCOUNT_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9382c8755d139d1a…` |
| SUBACCOUNT_FEATURE_DISABLED ※命名推断 | module=MarketFactory | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x51e7b874b951fac6…` |
| SUBACCOUNT_FEATURE_DISABLED ※命名推断 | module=OrderHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe118d389d5a2ca01…` |
| SUBACCOUNT_FEATURE_DISABLED ※命名推断 | module=RelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc6e29510846feb8f…` |
| SUBACCOUNT_FEATURE_DISABLED ※命名推断 | module=Router | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1580468a14c7390a…` |
| SUBACCOUNT_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x37ed6aa6350293eb…` |
| SUBACCOUNT_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x03f00d9acdef30c1…` |
| SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=false | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3fae2948da0bb119…` |
| SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=false | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3fae2948da0bb119…` |
| SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=false | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3fae2948da0bb119…` |
| SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3fae2948da0bb119…` |
| SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3fae2948da0bb119…` |
| SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=true | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4cc800b6af75c787…` |
| SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=true | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4cc800b6af75c787…` |
| SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=true | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4cc800b6af75c787…` |
| SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4cc800b6af75c787…` |
| SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4cc800b6af75c787…` |
| SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=false | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0e90d66769cfb615…` |
| SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=false | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0e90d66769cfb615…` |
| SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=false | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0e90d66769cfb615…` |
| SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0e90d66769cfb615…` |
| SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0e90d66769cfb615…` |
| SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=true | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x62ef0941ba5b3ce3…` |
| SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=true | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x62ef0941ba5b3ce3…` |
| SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=true | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x62ef0941ba5b3ce3…` |
| SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x62ef0941ba5b3ce3…` |
| SWAP_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x62ef0941ba5b3ce3…` |
| SWAP_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x968cec2483585488…` |
| SWAP_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x968cec2483585488…` |
| SWAP_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x968cec2483585488…` |
| SWAP_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x968cec2483585488…` |
| SWAP_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x968cec2483585488…` |
| SWAP_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x661cd4da94b2ee95…` |
| SWAP_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x661cd4da94b2ee95…` |
| SWAP_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x661cd4da94b2ee95…` |
| SWAP_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x661cd4da94b2ee95…` |
| SWAP_IMPACT_EXPONENT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x661cd4da94b2ee95…` |
| SWAP_IMPACT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=false | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x28f24865fb71ff14…` |
| SWAP_IMPACT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=false | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x28f24865fb71ff14…` |
| SWAP_IMPACT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=false | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x28f24865fb71ff14…` |
| SWAP_IMPACT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x28f24865fb71ff14…` |
| SWAP_IMPACT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x28f24865fb71ff14…` |
| SWAP_IMPACT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=true | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x704f34a51cd40519…` |
| SWAP_IMPACT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=true | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x704f34a51cd40519…` |
| SWAP_IMPACT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=true | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x704f34a51cd40519…` |
| SWAP_IMPACT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x704f34a51cd40519…` |
| SWAP_IMPACT_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isPositive=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x704f34a51cd40519…` |
| SWAP_IMPACT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=false | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x78a72a0757ccbf86…` |
| SWAP_IMPACT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=false | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x78a72a0757ccbf86…` |
| SWAP_IMPACT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=false | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x78a72a0757ccbf86…` |
| SWAP_IMPACT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x78a72a0757ccbf86…` |
| SWAP_IMPACT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x78a72a0757ccbf86…` |
| SWAP_IMPACT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=true | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1b33b994a3e28db9…` |
| SWAP_IMPACT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=true | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1b33b994a3e28db9…` |
| SWAP_IMPACT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=true | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1b33b994a3e28db9…` |
| SWAP_IMPACT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1b33b994a3e28db9…` |
| SWAP_IMPACT_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isPositive=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1b33b994a3e28db9…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x8bf5ae251cc4c849…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x8bf5ae251cc4c849…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x8bf5ae251cc4c849…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x8bf5ae251cc4c849…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=BTC / market#1 indexToken | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x8bf5ae251cc4c849…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x9afdea27e4097ccb…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x9afdea27e4097ccb…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x9afdea27e4097ccb…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x9afdea27e4097ccb…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=USDC / MockUSDC | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x9afdea27e4097ccb…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x291a9f3b0f04acd4…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x291a9f3b0f04acd4…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x291a9f3b0f04acd4…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x291a9f3b0f04acd4…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x291a9f3b0f04acd4…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xff86ffe9fdf5ab38…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xff86ffe9fdf5ab38…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xff86ffe9fdf5ab38…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xff86ffe9fdf5ab38…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=BTC / market#1 indexToken | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xff86ffe9fdf5ab38…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x62f60f0598fb8551…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x62f60f0598fb8551…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x62f60f0598fb8551…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x62f60f0598fb8551…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=USDC / MockUSDC | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x62f60f0598fb8551…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xda57164bf8049735…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xda57164bf8049735…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xda57164bf8049735…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xda57164bf8049735…` |
| SWAP_IMPACT_POOL_AMOUNT ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, token=WETH / market#2 indexToken / WNT (Base WETH) | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xda57164bf8049735…` |
| SWAP_PATH_MARKET_FLAG ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xb267b680fde290a0…` |
| SWAP_PATH_MARKET_FLAG ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xb267b680fde290a0…` |
| SWAP_PATH_MARKET_FLAG ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xb267b680fde290a0…` |
| SWAP_PATH_MARKET_FLAG ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xb267b680fde290a0…` |
| SWAP_PATH_MARKET_FLAG ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xb267b680fde290a0…` |
| SWAP_PATH_MARKET_FLAG ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x4f201144869d8e3f…` |
| SWAP_PATH_MARKET_FLAG ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x4f201144869d8e3f…` |
| SWAP_PATH_MARKET_FLAG ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x4f201144869d8e3f…` |
| SWAP_PATH_MARKET_FLAG ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x4f201144869d8e3f…` |
| SWAP_PATH_MARKET_FLAG ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x4f201144869d8e3f…` |
| SYNC_CONFIG_FEATURE_DISABLED ※命名推断 | module=AdlHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x963b4e1751eca613…` |
| SYNC_CONFIG_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd349239713ec4322…` |
| SYNC_CONFIG_FEATURE_DISABLED ※命名推断 | module=Config | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa11bdf122819f9b7…` |
| SYNC_CONFIG_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x35974dd720813499…` |
| SYNC_CONFIG_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x25a208e19f6b428d…` |
| SYNC_CONFIG_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4f146d2ac9bb6025…` |
| SYNC_CONFIG_FEATURE_DISABLED ※命名推断 | module=ExternalHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xceb260a02c264095…` |
| SYNC_CONFIG_FEATURE_DISABLED ※命名推断 | module=FeeHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7050f04004327573…` |
| SYNC_CONFIG_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb97c68a6424f83a9…` |
| SYNC_CONFIG_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xdcd27e5e23d23c02…` |
| SYNC_CONFIG_FEATURE_DISABLED ※命名推断 | module=MarketFactory | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x6f4a724e853c001b…` |
| SYNC_CONFIG_FEATURE_DISABLED ※命名推断 | module=OrderHandler | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa4c7e0030cbb9e0c…` |
| SYNC_CONFIG_FEATURE_DISABLED ※命名推断 | module=RelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3617f23686da79cc…` |
| SYNC_CONFIG_FEATURE_DISABLED ※命名推断 | module=Router | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe99aabea7e9d03f4…` |
| SYNC_CONFIG_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xdb4e24c9a9188d3e…` |
| SYNC_CONFIG_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4467e60dc1c613f7…` |
| SYNC_CONFIG_MARKET_DISABLED | marketIndex=market#1 · BTC/UNKNOWN | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2a5d4ff101af5b78…` |
| SYNC_CONFIG_MARKET_DISABLED | marketIndex=market#2 · WETH/UNKNOWN | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7912ba97617a4ba4…` |
| THRESHOLD_FOR_DECREASE_FUNDING ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x15652b585ddcc07f…` |
| THRESHOLD_FOR_DECREASE_FUNDING ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x15652b585ddcc07f…` |
| THRESHOLD_FOR_DECREASE_FUNDING ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x15652b585ddcc07f…` |
| THRESHOLD_FOR_DECREASE_FUNDING ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x15652b585ddcc07f…` |
| THRESHOLD_FOR_DECREASE_FUNDING ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x15652b585ddcc07f…` |
| THRESHOLD_FOR_DECREASE_FUNDING ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc2fb588c68e70bf8…` |
| THRESHOLD_FOR_DECREASE_FUNDING ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc2fb588c68e70bf8…` |
| THRESHOLD_FOR_DECREASE_FUNDING ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc2fb588c68e70bf8…` |
| THRESHOLD_FOR_DECREASE_FUNDING ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc2fb588c68e70bf8…` |
| THRESHOLD_FOR_DECREASE_FUNDING ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc2fb588c68e70bf8…` |
| THRESHOLD_FOR_STABLE_FUNDING ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9c2261c75bd70934…` |
| THRESHOLD_FOR_STABLE_FUNDING ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9c2261c75bd70934…` |
| THRESHOLD_FOR_STABLE_FUNDING ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9c2261c75bd70934…` |
| THRESHOLD_FOR_STABLE_FUNDING ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9c2261c75bd70934…` |
| THRESHOLD_FOR_STABLE_FUNDING ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9c2261c75bd70934…` |
| THRESHOLD_FOR_STABLE_FUNDING ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x10905b066710ef2a…` |
| THRESHOLD_FOR_STABLE_FUNDING ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x10905b066710ef2a…` |
| THRESHOLD_FOR_STABLE_FUNDING ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x10905b066710ef2a…` |
| THRESHOLD_FOR_STABLE_FUNDING ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x10905b066710ef2a…` |
| THRESHOLD_FOR_STABLE_FUNDING ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x10905b066710ef2a…` |
| TOKEN_TRANSFER_GAS_LIMIT | token=BTC / market#1 indexToken | uint | `200000` |  | 已设置 | Config(CONFIG_KEEPER) | `0x35d69f4065796b8b…` |
| TOKEN_TRANSFER_GAS_LIMIT | token=USDC / MockUSDC | uint | `200000` |  | 已设置 | Config(CONFIG_KEEPER) | `0xe4b90dcd9d061753…` |
| TOKEN_TRANSFER_GAS_LIMIT | token=WETH / market#2 indexToken / WNT (Base WETH) | uint | `200000` |  | 已设置 | Config(CONFIG_KEEPER) | `0x7ce501baf08e3ca9…` |
| TOTAL_BORROWING ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xb96c61ed95aafd9e…` |
| TOTAL_BORROWING ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xb96c61ed95aafd9e…` |
| TOTAL_BORROWING ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xb96c61ed95aafd9e…` |
| TOTAL_BORROWING ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xb96c61ed95aafd9e…` |
| TOTAL_BORROWING ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xb96c61ed95aafd9e…` |
| TOTAL_BORROWING ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x67001c9ff53ffc0d…` |
| TOTAL_BORROWING ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x67001c9ff53ffc0d…` |
| TOTAL_BORROWING ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x67001c9ff53ffc0d…` |
| TOTAL_BORROWING ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x67001c9ff53ffc0d…` |
| TOTAL_BORROWING ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, isLong=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x67001c9ff53ffc0d…` |
| TOTAL_BORROWING ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x52f3d9d2cfd80421…` |
| TOTAL_BORROWING ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x52f3d9d2cfd80421…` |
| TOTAL_BORROWING ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x52f3d9d2cfd80421…` |
| TOTAL_BORROWING ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x52f3d9d2cfd80421…` |
| TOTAL_BORROWING ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0x52f3d9d2cfd80421…` |
| TOTAL_BORROWING ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | uint | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xdf027964e36a847d…` |
| TOTAL_BORROWING ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | int | `0` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xdf027964e36a847d…` |
| TOTAL_BORROWING ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | bool | `false` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xdf027964e36a847d…` |
| TOTAL_BORROWING ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xdf027964e36a847d…` |
| TOTAL_BORROWING ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, isLong=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | DataStore 直写(CONTROLLER) | `0xdf027964e36a847d…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x97828cc331c8b9e9…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0363d6da6cdd182b…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf77293a2e48b0eb3…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5f9d73ba07de4559…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xec65661c3f9be49b…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2770522fbf233314…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AdlHandler, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc7982c014150e1fe…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5fa2f9e0a3914dd7…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x91caa00f9e247ed3…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbbe3c4df60e1f3b8…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc489cc0edf757190…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9bed06bc2f5efea4…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2464b895cd7c33ec…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=AutoCancelSyncer, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbfd5016e968374b8…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xde2d2d9bbbe609ee…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x292ef1e60a3a4980…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd3a5b78445332560…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe05b90dbceca9b83…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb93de488aef1b18a…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xeeff52ea696defef…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Config, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9c26f9c83c9606e0…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb8c56c8edea53114…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa96080768c1bf288…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8be5d6f2686f26a9…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x24b139cf587605d7…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x36efba5e52247778…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x058c70acb567effd…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ConfigSyncer, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3c2c35080b88a5d2…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5636982e3a707db7…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x84d9ddb29ce11af1…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd2bc424e5edb5e79…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe932ca0d3cb8f39c…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x775fe4ba61130d82…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc4fe9a44ca830c5e…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=DecreaseOrderExecutor, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8d7e3f92cccc9182…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x48856a2902909c9f…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3a082d06b3d66e7f…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd087d9ef8c5a1fbb…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x349f093f614782f9…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x85a9077bcdffa964…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x58f842c718a484a1…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExchangeRouter, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x904a48dbcc7c0a3c…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x2b09158a1e3ab4ef…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1a176cae7895e2f5…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5f9d0b4b55b18651…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd8c6c19694f994c6…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xeb51048e3450e11b…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xba20634e4e83c2d7…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=ExternalHandler, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb9ac80ea2eda3e5d…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x01c955c2367403ab…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbf73d52fbb565c07…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x4d41a292ed1ec09e…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x686b592529311e2d…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7de3592f94541614…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x235521f9e2e1a55f…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=FeeHandler, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x490e3322455f7f46…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x553814ae258bc391…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe9ebf772af473dd0…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8074a9c133f78bf3…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x174e233a8602cff3…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0a3dbc91b5a85f2f…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb942312abffcbfd5…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=IncreaseOrderExecutor, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x944552158dcf0c17…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xef1ffc500892df21…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9abde90f585915b7…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0a2c2a5e674cb5b1…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xbe091081d97e37ce…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x835e6f8788d752cb…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1936ddddcf6c4924…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=LiquidationHandler, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1791442268b6bc50…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x3a6fe03fc8e14605…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9b2467444c72f794…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1d25dfed80ef3626…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf9108eb4e5ca7f2c…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x86bf9e2cd7e6a4d6…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x92329d5b0f40b6b8…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=MarketFactory, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xdd50db09b98c40fb…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x65df539c1859f4f5…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x52e57ec2097be413…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x013a6d7d729cfe48…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd310ae9b5ce6ec90…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf607c282864a4775…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa2e5f4d43452855d…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=OrderHandler, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x66232701e5f049df…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x731675c2b5dc51e5…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5c9000244c9ce01c…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x90f97ec4622134bd…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x88a0f0d2260ea5e5…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x33ba492a7356239e…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x64ecf0a582f5f326…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=RelayRouter, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x90713d1646a96638…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf8018aec309989e3…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf7fa31dece925fd4…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x7d84e76191c4fe40…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x29e0b381e3fd97d8…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xa7c33202f6d8f73d…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5e73b9c7fc7b06a6…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=Router, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x86624ff05c4cb0fb…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1ad4102a64b0a649…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xab7155b1d3fe0ba8…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8f6f565e82f88da9…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x611d5d1c415b9a8a…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x9cd498224a9543dd…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x83a701b26b7d2e5d…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRelayRouter, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x54452af4dd0d4aef…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#0 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xf7648853252d5c1d…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#1 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x8f3523ddcfc26ba2…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#2 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xe45db872f0972257…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#3 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xd6e27fe6010c9c89…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#4 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x84543a88d0d1b473…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#5 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x1af6eb9d1f666c7b…` |
| UPDATE_ORDER_FEATURE_DISABLED ※命名推断 | module=SubaccountRouter, orderType=orderType#6 | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0d8cdb612996f4fb…` |
| VIRTUAL_MARKET_ID ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb7e689f1a6434f81…` |
| VIRTUAL_MARKET_ID ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb7e689f1a6434f81…` |
| VIRTUAL_MARKET_ID ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb7e689f1a6434f81…` |
| VIRTUAL_MARKET_ID ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb7e689f1a6434f81…` |
| VIRTUAL_MARKET_ID ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xb7e689f1a6434f81…` |
| VIRTUAL_MARKET_ID ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc6c3928be5f26e09…` |
| VIRTUAL_MARKET_ID ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc6c3928be5f26e09…` |
| VIRTUAL_MARKET_ID ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc6c3928be5f26e09…` |
| VIRTUAL_MARKET_ID ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc6c3928be5f26e09…` |
| VIRTUAL_MARKET_ID ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0xc6c3928be5f26e09…` |
| VIRTUAL_TOKEN_ID ⚠探测 | token=BTC / market#1 indexToken | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x84719fe36f57e323…` |
| VIRTUAL_TOKEN_ID ⚠探测 | token=BTC / market#1 indexToken | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x84719fe36f57e323…` |
| VIRTUAL_TOKEN_ID ⚠探测 | token=BTC / market#1 indexToken | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x84719fe36f57e323…` |
| VIRTUAL_TOKEN_ID ⚠探测 | token=BTC / market#1 indexToken | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x84719fe36f57e323…` |
| VIRTUAL_TOKEN_ID ⚠探测 | token=BTC / market#1 indexToken | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x84719fe36f57e323…` |
| VIRTUAL_TOKEN_ID ⚠探测 | token=USDC / MockUSDC | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x712c2c3cc024094b…` |
| VIRTUAL_TOKEN_ID ⚠探测 | token=USDC / MockUSDC | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x712c2c3cc024094b…` |
| VIRTUAL_TOKEN_ID ⚠探测 | token=USDC / MockUSDC | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x712c2c3cc024094b…` |
| VIRTUAL_TOKEN_ID ⚠探测 | token=USDC / MockUSDC | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x712c2c3cc024094b…` |
| VIRTUAL_TOKEN_ID ⚠探测 | token=USDC / MockUSDC | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x712c2c3cc024094b…` |
| VIRTUAL_TOKEN_ID ⚠探测 | token=WETH / market#2 indexToken / WNT (Base WETH) | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0585ee8f04d41fba…` |
| VIRTUAL_TOKEN_ID ⚠探测 | token=WETH / market#2 indexToken / WNT (Base WETH) | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0585ee8f04d41fba…` |
| VIRTUAL_TOKEN_ID ⚠探测 | token=WETH / market#2 indexToken / WNT (Base WETH) | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0585ee8f04d41fba…` |
| VIRTUAL_TOKEN_ID ⚠探测 | token=WETH / market#2 indexToken / WNT (Base WETH) | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0585ee8f04d41fba…` |
| VIRTUAL_TOKEN_ID ⚠探测 | token=WETH / market#2 indexToken / WNT (Base WETH) | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x0585ee8f04d41fba…` |
| WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=false | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5c141a81dd7be640…` |
| WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=false | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5c141a81dd7be640…` |
| WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=false | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5c141a81dd7be640…` |
| WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5c141a81dd7be640…` |
| WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x5c141a81dd7be640…` |
| WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=true | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x891e39a63238b9f3…` |
| WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=true | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x891e39a63238b9f3…` |
| WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=true | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x891e39a63238b9f3…` |
| WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x891e39a63238b9f3…` |
| WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#1 · BTC/UNKNOWN, balanceWasImproved=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x891e39a63238b9f3…` |
| WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=false | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x323a552106a79e3c…` |
| WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=false | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x323a552106a79e3c…` |
| WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=false | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x323a552106a79e3c…` |
| WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=false | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x323a552106a79e3c…` |
| WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=false | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x323a552106a79e3c…` |
| WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=true | uint | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x22d6062e4ebb2103…` |
| WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=true | int | `0` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x22d6062e4ebb2103…` |
| WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=true | bool | `false` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x22d6062e4ebb2103…` |
| WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=true | address | `0x0000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x22d6062e4ebb2103…` |
| WITHDRAWAL_FEE_FACTOR ⚠探测 | marketIndex=market#2 · WETH/UNKNOWN, balanceWasImproved=true | bytes32 | `0x0000000000000000000000000000000000000000000000000000000000000000` |  | 未设置(默认值) | Config(CONFIG_KEEPER) | `0x22d6062e4ebb2103…` |

## 未取数的 key（38 项）

这些 key 的维度不可穷举（账户地址、时间片、任意字符串等），必须由具体用例给定入参后单独读。

| 派生函数 | 基键 | 参数 | 原因 |
|---|---|---|---|
| `accountDepositListKey` | ACCOUNT_DEPOSIT_LIST | address account | 维度 account 无可枚举取值 |
| `accountOrderListKey` | ACCOUNT_ORDER_LIST | address account | 维度 account 无可枚举取值 |
| `accountPositionListKey` | ACCOUNT_POSITION_LIST | address account | 维度 account 无可枚举取值 |
| `accountWithdrawalListKey` | ACCOUNT_WITHDRAWAL_LIST | address account | 维度 account 无可枚举取值 |
| `affiliateRewardKey` | AFFILIATE_REWARD | uint256 marketIndex, address token, address account | 维度 account 无可枚举取值 |
| `-` | ATOMIC_SWAP_FEE_TYPE |  | 费用类型标识常量，作为子键传参使用，自身不存储值 |
| `autoCancelOrderListKey` | AUTO_CANCEL_ORDER_LIST | bytes32 positionKey | 维度 positionKey 无可枚举取值 |
| `claimableUiFeeAmountKey` | CLAIMABLE_UI_FEE_AMOUNT | uint256 marketIndex, address token, address account | 维度 account 无可枚举取值 |
| `-` | DEPOSIT_FEE_TYPE |  | 费用类型标识常量，作为子键传参使用，自身不存储值 |
| `-` | FUNDING_FEE_TYPE |  | 费用类型标识常量，作为子键传参使用，自身不存储值 |
| `generalClaimFeatureDisabled` | GENERAL_CLAIM_FEATURE_DISABLED | uint256 distributionId | 维度 distributionId 无可枚举取值 |
| `isRelayFeeExcludedKey` | IS_RELAY_FEE_EXCLUDED | address sender | 维度 account 无可枚举取值 |
| `-` | LIQUIDATION_FEE_TYPE |  | 费用类型标识常量，作为子键传参使用，自身不存储值 |
| `maxAllowedSubaccountActionCountKey` | MAX_ALLOWED_SUBACCOUNT_ACTION_COUNT | address account, address subaccount, bytes32 actionType | 维度 account 无可枚举取值 |
| `-` | POSITION_FEE_TYPE |  | 费用类型标识常量，作为子键传参使用，自身不存储值 |
| `proTraderTierKey` | PRO_TRADER_TIER | address account | 维度 account 无可枚举取值 |
| `savedCallbackContract` | SAVED_CALLBACK_CONTRACT | address account, uint256 marketIndex | 维度 account 无可枚举取值 |
| `subaccountActionCountKey` | SUBACCOUNT_ACTION_COUNT | address account, address subaccount, bytes32 actionType | 维度 account 无可枚举取值 |
| `subaccountAutoTopUpAmountKey` | SUBACCOUNT_AUTO_TOP_UP_AMOUNT | address account, address subaccount | 维度 account 无可枚举取值 |
| `subaccountExpiresAtKey` | SUBACCOUNT_EXPIRES_AT | address account, address subaccount, bytes32 actionType | 维度 account 无可枚举取值 |
| `subaccountIntegrationDisabledKey` | SUBACCOUNT_INTEGRATION_DISABLED | bytes32 integrationId | 维度 integrationId 无可枚举取值 |
| `subaccountIntegrationIdKey` | SUBACCOUNT_INTEGRATION_ID | address account, address subaccount | 维度 account 无可枚举取值 |
| `subaccountSlotKey` | SUBACCOUNT_SLOT | address account, uint256 index | 维度 account 无可枚举取值 |
| `subaccountSlotActiveKey` | SUBACCOUNT_SLOT_ACTIVE | address account, uint256 index | 维度 account 无可枚举取值 |
| `subaccountSlotSubaccountKey` | SUBACCOUNT_SLOT_SUBACCOUNT | address account, uint256 index | 维度 account 无可枚举取值 |
| `-` | SWAP_FEE_TYPE |  | 费用类型标识常量，作为子键传参使用，自身不存储值 |
| `syncConfigMarketParameterDisabledKey` | SYNC_CONFIG_MARKET_PARAMETER_DISABLED | uint256 marketIndex, string parameter | 维度 configParameterName 无可枚举取值 |
| `syncConfigParameterDisabledKey` | SYNC_CONFIG_PARAMETER_DISABLED | string parameter | 维度 configParameterName 无可枚举取值 |
| `syncConfigUpdateCompletedKey` | SYNC_CONFIG_UPDATE_COMPLETED | uint256 updateId | 维度 updateId 无可枚举取值 |
| `-` | UI_DEPOSIT_FEE_TYPE |  | 费用类型标识常量，作为子键传参使用，自身不存储值 |
| `uiFeeFactorKey` | UI_FEE_FACTOR | address account | 维度 account 无可枚举取值 |
| `-` | UI_POSITION_FEE_TYPE |  | 费用类型标识常量，作为子键传参使用，自身不存储值 |
| `-` | UI_SWAP_FEE_TYPE |  | 费用类型标识常量，作为子键传参使用，自身不存储值 |
| `-` | UI_WITHDRAWAL_FEE_TYPE |  | 费用类型标识常量，作为子键传参使用，自身不存储值 |
| `virtualInventoryForPositionsKey` | VIRTUAL_INVENTORY_FOR_POSITIONS | bytes32 virtualTokenId | 维度 virtualTokenId 无可枚举取值 |
| `virtualInventoryForPositionsInTokensKey` | VIRTUAL_INVENTORY_FOR_POSITIONS_IN_TOKENS | bytes32 virtualTokenId | 维度 virtualTokenId 无可枚举取值 |
| `virtualInventoryForSwapsKey` | VIRTUAL_INVENTORY_FOR_SWAPS | bytes32 virtualMarketId, bool isLongToken | 维度 virtualMarketId 无可枚举取值 |
| `-` | WITHDRAWAL_FEE_TYPE |  | 费用类型标识常量，作为子键传参使用，自身不存储值 |

## 维度取值域

- **market**（2）：1 (market#1 · BTC/UNKNOWN)、2 (market#2 · WETH/UNKNOWN)
- **bool**（2）：true (true)、false (false)
- **token**（3）：0x0555e30da8f98308edb960aa94c0db47230d2b9c (BTC / market#1 indexToken)、0x4200000000000000000000000000000000000006 (WETH / market#2 indexToken / WNT (Base WETH))、0x09E1C105E1476F7F1592a1Ff129d797572c383c7 (USDC / MockUSDC)
- **module**（16）：0xA0473C0F4f694ED55ea1bD2C6844de6432DB9AFD (ExternalHandler)、0x469a1758e1Cf1C5776BAE26f82C28e54bDF1319a (Router)、0x2290f5DbFBa70402cb7E71325DE0dEC5fB84e015 (Config)、0x093F79772C4Dff4E6c0698fcba9d969619522B42 (DecreaseOrderExecutor)、0x83Ce4d17C531f08957B4Eb941523367C54d8Bd39 (FeeHandler)、0x0F2ca080532a9db408f156e4c0Efb2571216B257 (IncreaseOrderExecutor)、0x0012A438e47d601a23445A1f6C8d68D73cf1584b (AutoCancelSyncer)、0x65DD14Df574d01ac54CD03D5F25De3F19fA8F2a8 (ConfigSyncer)、0x6e40251fcFe6C72E58479168d8E6C98568bbd5e1 (MarketFactory)、0x6Ddd896834adEE794C24DDe8D80b26E7EAAd7051 (AdlHandler)、0x9F9bF801C980B3f7280809A2CFBd6eB84eEFC948 (LiquidationHandler)、0x5aF00C801C0Ec0C2214a19D270b7E666a7dCFEf8 (OrderHandler)、0xC3b304939d1c419cC61133D64F1a2879bD0feC23 (ExchangeRouter)、0x734ddb9052166633fFa7d068447c0308592A65bd (RelayRouter)、0x7BB9e0f021ab1509d1Af65B5Ded76Ef037ca79b9 (SubaccountRelayRouter)、0x0a430d766fF421709321fF2f9594D21EA9F112fA (SubaccountRouter)
- **orderType**（7）：0 (orderType#0)、1 (orderType#1)、2 (orderType#2)、3 (orderType#3)、4 (orderType#4)、5 (orderType#5)、6 (orderType#6)
- **pnlFactorType**（3）：0xab15365d3aa743e766355e2557c230d8f943e195dc84d9b2b05928a07b635ee1 (MAX_PNL_FACTOR_FOR_TRADERS)、0x95024a223e128da6224cc271671896642c5acb9ebf2f0432e71fcd87205177cf (MAX_PNL_FACTOR_FOR_ADL)、0xdd8747ceca84c84319e46661e0ee4095cc511df8c2208b6ff4e9d2b2e6930bb6 (MAX_PNL_FACTOR_FOR_WITHDRAWALS)
- **feeType**（11）：0x39226eb4fed85317aa310fa53f734c7af59274c49325ab568f9c4592250e8cc5 (DEPOSIT_FEE_TYPE)、0xda1ac8fcb4f900f8ab7c364d553e5b6b8bdc58f74160df840be80995056f3838 (WITHDRAWAL_FEE_TYPE)、0x7ad0b6f464d338ea140ff9ef891b4a69cf89f107060a105c31bb985d9e532214 (SWAP_FEE_TYPE)、0x0715366437cc1f9a874eb5c6cd8111dcbea3677598c568f8b8d013d6c4380688 (ATOMIC_SWAP_FEE_TYPE)、0x17c8136795f108c881c75741acd4fdd0da0c0490014b2a5478cb0af71af53d39 (POSITION_FEE_TYPE)、0x48098338b7951548405ae9595f9afca42cef81cb9e62ab7b9197062ac9589916 (LIQUIDATION_FEE_TYPE)、0xaa29290904ae6d2424f8b6d33af3b4e36cab293aae4ff5179e3b31f7b283c298 (FUNDING_FEE_TYPE)、0xa308101ac9839a32932eeff55c751a8c7c7456ddd11032ff2e7f59e511e03e38 (UI_DEPOSIT_FEE_TYPE)、0x60d9d0628f9ac11173c8fe92ef1b87cb309066b9469b11ea38865c18f9a15779 (UI_WITHDRAWAL_FEE_TYPE)、0xa0c3abc09ebd75f64c70f35ac10928fbf25d016b68aec9d0dcafa251f65e1e39 (UI_SWAP_FEE_TYPE)、0x21bbfc38c54ccf4ce9515f2040d66a101840804b22500ee8c0c1a4cf6777f206 (UI_POSITION_FEE_TYPE)
- **graceTier**（4）：0 (tier0)、1 (tier1)、2 (tier2)、3 (tier3)
- **proTier**（4）：0 (proTier0)、1 (proTier1)、2 (proTier2)、3 (proTier3)
- **referralTier**（4）：0 (referralTier0)、1 (referralTier1)、2 (referralTier2)、3 (referralTier3)
- **oracleProvider**（3）：0x037518F9bfaB37CB6Ed1270f8721067A224db870 (ChainlinkPriceFeedProvider)、0x179CcB793d7440a5F543Af901f9a9d7FAd10885c (PythPriceFeedProvider)、0x63Bb86f2EDF8Fa13A2DCbD0bB75F7919279C394d (ChainlinkDataStreamProvider)
- **oracleContract**（1）：0xe15A6130b6336f96B698d6fAd4732A7aCC0Cc110 (Oracle)

## ⚠ 探测法读数说明

标 `⚠探测` 的 key 没能从合约源码推断出取值类型（没有 `dataStore.getXxx(Keys.KEY)` 的直接引用），
工具对它按 uint/int/bool/address/bytes32 各读一遍全部列出。同一 key 会出现多行，
**只有其中一行是真的**——用例引用前必须回源码确认该 key 的写入类型。

