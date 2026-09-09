#!/usr/bin/env bash
# 本地起 keeper，配置从本目录的 .env 读，不污染被测仓库。
#
#   KEEPER_RUN_RPC_URL=<本次Fork RPC> KEEPER_EXPECTED_CHAIN_ID=<chainId> ./run.sh check
#                           前置体检：配置齐不齐、RPC/Chain ID/角色对不对、Redis 通不通
#   ./run.sh producer       起 producer（只读，不签名，填队列）
#   ./run.sh worker         起 ord-worker（签名广播 executeOrder）
#   ./run.sh adl-worker     起 adl-worker（executeAdl，需 ADL_KEEPER）
#   ./run.sh liq-worker     起 liq-worker（executeLiquidation，需 LIQUIDATION_KEEPER）
#   ./run.sh rel-worker     起 rel-worker（Express/Flash 代发，队列由前端 /api/relay/* 填）
#   ./run.sh both           producer + ord-worker
#   ./run.sh all            producer + 全部四个 worker
#   ./run.sh inspect [...]  只读查 Redis 队列状态（一次性命令，不是常驻进程）
#   ./run.sh status         看哪些在跑
#   ./run.sh stop           全停
#
# 可选参数放在子命令**之前**；一个都不给时，行为（日志路径、pid 文件名、输出）与分层改造前一致。
#
#   --chain-id <id>       并行车道开关：一次绑定三件事——体检期望链、keeper 进程实际用的
#                         KEEPER_CHAIN_ID（Redis keyspace 前缀按它拼）、日志与 pid 目录
#                         （logs/<id>/）。两条会话各跑一套 keeper 时互不干扰：
#                         stop/status 只碰本车道，Redis 队列也分在不同前缀下。
#                         等价环境变量 KEEPER_RUNNER_CHAIN_ID
#   --log-dir <dir>       直接指定日志/pid 目录（相对路径按本目录解析）。同一条链要开两条
#                         车道时用它。等价环境变量 KEEPER_LOG_DIR
#   --align-chain-id      只把"体检期望链"和"进程实际链"对齐（消假绿灯），日志仍在默认 logs/。
#                         等价环境变量 KEEPER_ALIGN_CHAIN_ID=true
#   --help                打印用法
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { echo "❌ $*" >&2; exit 1; }
ok()  { echo "✅ $*"; }

usage() {
  cat <<'EOF'
用法: run.sh [可选参数] {check|producer|worker|adl-worker|liq-worker|rel-worker|both|all|inspect|status|stop}

子命令
  check                 前置体检（默认）：配置、RPC/Chain ID、签名钱包角色、Redis
  producer              起 producer（只读，不签名，填队列）
  worker                起 ord-worker（签名广播 executeOrder）
  adl-worker            起 adl-worker（需 ADL_KEEPER 角色）
  liq-worker            起 liq-worker（需 LIQUIDATION_KEEPER 角色）
  rel-worker            起 rel-worker（代发，队列由前端 /api/relay/* 填）
  both                  producer + ord-worker
  all                   producer + 全部四个 worker
  inspect [...]         只读查 Redis 队列（一次性命令，参数透传给 keeper:inspect）
  status                看本车道哪些在跑（顺带清理陈旧 pid）
  stop                  停本车道登记的进程

可选参数（放在子命令之前；都不给 = 与分层改造前完全一致：日志/pid 在 logs/）
  --chain-id <id>       并行车道开关，一次绑定三件事：
                          · 体检期望的 Chain ID
                          · keeper 进程实际使用的 KEEPER_CHAIN_ID（决定 Redis keyspace 前缀）
                          · 日志与 pid 目录 → logs/<id>/
                        等价环境变量 KEEPER_RUNNER_CHAIN_ID
  --log-dir <dir>       日志/pid 目录（相对路径按 run.sh 所在目录解析）
                        等价环境变量 KEEPER_LOG_DIR
  --align-chain-id      只对齐链 ID（消除"体检全绿、Redis 前缀写错链"的假绿灯），
                        日志目录保持默认 logs/。等价环境变量 KEEPER_ALIGN_CHAIN_ID=true
  --help, -h            本帮助

环境变量
  KEEPER_DIR                keeper 应用目录（默认按已知布局自动探测）
  KEEPER_ENV_FILE           keeper 的 .env（默认本目录 .env；含私钥，脚本只 source 不打印）
  KEEPER_RUN_RPC_URL        本次运行绑定的 RPC，优先于 .env
  KEEPER_EXPECTED_CHAIN_ID  体检期望的 Chain ID（看板注入）
  KEEPER_DATA_STORE         DataStore 地址（查角色用）

  下列变量由调用方在命令行前缀传入时（如 KEEPER_CHAIN_ID=99912 ./run.sh check）优先于
  .env 里的同名值：KEEPER_CHAIN_ID / KEEPER_EXPECTED_CHAIN_ID / KEEPER_RUNNER_CHAIN_ID /
  KEEPER_RUN_RPC_URL / KEEPER_LOG_DIR / KEEPER_ALIGN_CHAIN_ID。
  **白名单之外**的同名变量一律以 .env 为准（与改造前一致）——尤其 KEEPER_DRY_RUN 这类
  安全阀不会被调用方 shell 里的残留值翻转。

目录解析规则（日志与 pid）
  1) --log-dir / KEEPER_LOG_DIR           → 指定目录
  2) --chain-id / KEEPER_RUNNER_CHAIN_ID  → logs/<chainId>/
  3) 都不给                                → logs/（默认，与改造前同一路径）
  status / stop 只作用于上面解析出的那一个目录，不再无差别扫全部 pid。

并行示例（两条会话各一套 keeper，互不干扰）
  会话 A（沿用默认车道，无需改动）:  ./run.sh both
  会话 B（另一条链自成一档）:        ./run.sh --chain-id 99912 both
                                     ./run.sh --chain-id 99912 status
                                     ./run.sh --chain-id 99912 stop
EOF
}

# ── 可选参数预解析（放在 .env 校验之前，好让 --help 在没有 .env 时也能用）──
CLI_CHAIN_ID=""
CLI_LOG_DIR=""
CLI_ALIGN=""
# 「flag 是否真的出现在命令行」——与上面的初始空串区分开，用于空值 fail-fast 判据
CLI_CHAIN_ID_GIVEN=false
CLI_LOG_DIR_GIVEN=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --chain-id)       [[ $# -ge 2 ]] || die "--chain-id 需要一个链 ID"; CLI_CHAIN_ID="$2"; CLI_CHAIN_ID_GIVEN=true; shift 2 ;;
    --chain-id=*)     CLI_CHAIN_ID="${1#*=}"; CLI_CHAIN_ID_GIVEN=true; shift ;;
    --log-dir)        [[ $# -ge 2 ]] || die "--log-dir 需要一个目录"; CLI_LOG_DIR="$2"; CLI_LOG_DIR_GIVEN=true; shift 2 ;;
    --log-dir=*)      CLI_LOG_DIR="${1#*=}"; CLI_LOG_DIR_GIVEN=true; shift ;;
    --align-chain-id) CLI_ALIGN=true; shift ;;
    -h|--help)        usage; exit 0 ;;
    --)               shift; break ;;
    -*)               die "未知参数: $1（./run.sh --help 看用法）" ;;
    *)                break ;;
  esac
done

# keeper 应用目录。优先取环境变量 KEEPER_DIR（调用方显式传入，例如测试看板），
# 否则按已知布局逐个探测；探测不到不再直接 cd 报错退出，由下面的校验给出可读提示。
#   候选 1：本目录在 TestCode/tools/keeper-runner（当前收编位置）
#   候选 2：本目录在旧的 Test/project/fx100/tool/keeper-runner
if [[ -z "${KEEPER_DIR:-}" ]]; then
  for _candidate in \
    "$HERE/../../../Github/fx100-apps@develop/apps/keeper" \
    "$HERE/../../../../../Github/fx100-apps@develop/apps/keeper"
  do
    KEEPER_DIR="$(cd "$_candidate" 2>/dev/null && pwd || true)"
    [[ -n "$KEEPER_DIR" ]] && break
  done
fi

# keeper 的 .env 带私钥，不随本目录进仓。默认读同级 .env，可用 KEEPER_ENV_FILE 指到仓外任意位置。
ENV_FILE="${KEEPER_ENV_FILE:-$HERE/.env}"
# 必须由 Keeper 配置或运行方指定；不把某一版部署地址硬编码为所有 Fork 的默认值。
DATA_STORE="${KEEPER_DATA_STORE:-0x606D72Ab0C0fDcce607d04B1645CE2D528B88014}"

[[ -n "${KEEPER_DIR:-}" && -d "$KEEPER_DIR" ]] \
  || die "找不到 keeper 应用目录（KEEPER_DIR=${KEEPER_DIR:-未设置}）—— 用 KEEPER_DIR=/path/to/fx100-apps/apps/keeper ./run.sh … 指定"
[[ -f "$ENV_FILE" ]] || die "缺 $ENV_FILE —— 先 cp .env.example .env 并填写，或用 KEEPER_ENV_FILE=/path/to/.env 指定"

# 调用方（命令行前缀变量 / 看板注入）给的值必须压过 .env 里的同名值。
# 但**只对下面这张白名单生效**：早期实现用 `export -p` 全量快照 + source 后 eval 恢复，
# 会让调用方 shell 里任何与 .env 同名的变量都无条件胜出——包括 KEEPER_DRY_RUN 这类安全阀
# （实测 `KEEPER_DRY_RUN=false ./run.sh check` 会把 .env 里的 true 翻成 false，
# 提示从「只验证不广播」变成「会真的广播交易」）。默认路径不该有这种行为变化，故收窄为白名单。
# 白名单 = 本脚本文档里承诺可以被调用方覆盖的那几个；其余一律以 .env 为准（与改造前一致）。
# 这里只处理**变量优先级**，不读取、不打印 .env 的任何内容。
_OVERRIDABLE_VARS=(
  KEEPER_CHAIN_ID
  KEEPER_EXPECTED_CHAIN_ID
  KEEPER_RUNNER_CHAIN_ID
  KEEPER_RUN_RPC_URL
  KEEPER_LOG_DIR
  KEEPER_ALIGN_CHAIN_ID
)
_CALLER_OVERRIDES=""
for _v in "${_OVERRIDABLE_VARS[@]}"; do
  if [[ -n "${!_v+set}" ]]; then
    _CALLER_OVERRIDES+="$(printf 'export %s=%q\n' "$_v" "${!_v}")"$'\n'
  fi
done
set -a; source "$ENV_FILE"; set +a
# 只恢复白名单里调用方确实给过的项。
if [[ -n "$_CALLER_OVERRIDES" ]]; then
  set +e
  eval "$_CALLER_OVERRIDES" >/dev/null 2>&1
  set -e
fi
unset _CALLER_OVERRIDES _OVERRIDABLE_VARS _v

# 看板/测试批次可显式注入所选环境 RPC。它优先于 .env，避免 Keeper 静默连到旧 Fork。
if [[ -n "${KEEPER_RUN_RPC_URL:-}" ]]; then
  KEEPER_HTTP_RPC_URL="$KEEPER_RUN_RPC_URL"
fi

# ── 链 ID 解析：体检期望的链和进程实际用的链必须是同一个值 ──
# SLOT_CHAIN_ID：本次新增的**显式**链入口（--chain-id / KEEPER_RUNNER_CHAIN_ID），可空。
#   注意看板一直在传 KEEPER_EXPECTED_CHAIN_ID，所以它不算"显式指定 chainId"——
#   把它当显式会让正在跑的 keeper 的 pid/日志换目录，stop 找不到旧进程。
# 给了入口就必须给有效值——**空值不能静默落回默认车道**：默认车道往往是别人正在跑的
# keeper，包装脚本写成 `./run.sh --chain-id "$CHAIN" stop` 而 $CHAIN 取空时，
# 静默回落等于去停别条会话的进程（2026-09-05 并行会话审计的 HIGH 风险项）。
if [[ "$CLI_CHAIN_ID_GIVEN" == "true" && -z "$CLI_CHAIN_ID" ]]; then
  die "--chain-id 需要一个链 ID（收到空值）。不指定 --chain-id 才使用默认车道 logs/。"
fi
if [[ -n "${KEEPER_RUNNER_CHAIN_ID+set}" && -z "${KEEPER_RUNNER_CHAIN_ID}" ]]; then
  die "KEEPER_RUNNER_CHAIN_ID 被设为空值。要用默认车道请不要设置它（unset），而不是设成空串。"
fi
SLOT_CHAIN_ID="${CLI_CHAIN_ID:-${KEEPER_RUNNER_CHAIN_ID:-}}"
if [[ -n "$SLOT_CHAIN_ID" ]]; then
  [[ "$SLOT_CHAIN_ID" =~ ^[0-9]+$ ]] || die "链 ID 必须是纯数字：$SLOT_CHAIN_ID"
  # 两个都是显式给的、又互相打架，不猜，直接停
  if [[ -n "${KEEPER_EXPECTED_CHAIN_ID:-}" && "$SLOT_CHAIN_ID" != "${KEEPER_EXPECTED_CHAIN_ID}" ]]; then
    die "链 ID 冲突：--chain-id/KEEPER_RUNNER_CHAIN_ID=$SLOT_CHAIN_ID 与 KEEPER_EXPECTED_CHAIN_ID=${KEEPER_EXPECTED_CHAIN_ID} 不一致"
  fi
fi
EXPECTED_CHAIN_ID="${SLOT_CHAIN_ID:-${KEEPER_EXPECTED_CHAIN_ID:-${KEEPER_CHAIN_ID:-}}}"

# 显式给了链（--chain-id）或显式要求对齐（--align-chain-id）时，把 KEEPER_CHAIN_ID 对齐后
# 导给子进程——keeper 的 Redis keyspace 前缀就是按它拼的（apps/keeper/src/infra/keyspace.ts），
# 不对齐就会出现"体检期望 99911、队列却写进 84532 前缀"的假绿灯。
# 默认（两个都不给）不动 KEEPER_CHAIN_ID，保持与改造前一致。
ALIGN_CHAIN_ID="${CLI_ALIGN:-${KEEPER_ALIGN_CHAIN_ID:-false}}"
if [[ -n "$SLOT_CHAIN_ID" || "$ALIGN_CHAIN_ID" == "true" ]]; then
  [[ -n "$EXPECTED_CHAIN_ID" ]] || die "要求对齐链 ID，但没解析出链 ID —— 用 --chain-id <id> 指定"
  export KEEPER_CHAIN_ID="$EXPECTED_CHAIN_ID"
fi
# keeper 子进程真正会用的链（getKeeperChainId 读的就是 KEEPER_CHAIN_ID）
RUNTIME_CHAIN_ID="${KEEPER_CHAIN_ID:-}"

# ── 日志 / pid 目录解析 ──
#   1) --log-dir / KEEPER_LOG_DIR           → 该目录（相对路径按本目录解析）
#   2) --chain-id / KEEPER_RUNNER_CHAIN_ID  → logs/<chainId>/
#   3) 都不给                                → logs/（默认，与改造前同一路径，
#                                              不打断别人已经跑在 logs/ 里的 keeper）
# status / stop 只作用于这里解析出的目录。
# 同上：给了 --log-dir / KEEPER_LOG_DIR 就必须给有效值，空值不静默回落默认车道。
if [[ "$CLI_LOG_DIR_GIVEN" == "true" && -z "$CLI_LOG_DIR" ]]; then
  die "--log-dir 需要一个目录（收到空值）。不指定 --log-dir 才使用默认车道 logs/。"
fi
if [[ -n "${KEEPER_LOG_DIR+set}" && -z "${KEEPER_LOG_DIR}" ]]; then
  die "KEEPER_LOG_DIR 被设为空值。要用默认车道请不要设置它（unset），而不是设成空串。"
fi
_LOG_DIR_RAW="${CLI_LOG_DIR:-${KEEPER_LOG_DIR:-}}"
if [[ -n "$_LOG_DIR_RAW" ]]; then
  case "$_LOG_DIR_RAW" in
    /*) LOG_DIR="$_LOG_DIR_RAW" ;;
    *)  LOG_DIR="$HERE/$_LOG_DIR_RAW" ;;
  esac
elif [[ -n "$SLOT_CHAIN_ID" ]]; then
  LOG_DIR="$HERE/logs/$SLOT_CHAIN_ID"
else
  LOG_DIR="$HERE/logs"
fi
# 展示用短名：默认车道仍显示成 logs/…，与改造前的提示文案一字不差
LOG_DIR_LABEL="logs"
[[ "$LOG_DIR" == "$HERE/logs" ]] || LOG_DIR_LABEL="$LOG_DIR"

# worker 表：名字 | yarn 脚本 | 私钥变量 | 需要的链上角色（空=不需要）
# 角色为空不等于不用签名——rel-worker 是代发者（用户签名、keeper 付 gas），
# 合约里根本没有 RELAY_KEEPER 这个角色，它只需要一个有 ETH 的钱包。
WORKERS=(
  "ord-worker|keeper:ord-worker|ORDER_KEEPER_PRIVATE_KEY|ORDER_KEEPER"
  "adl-worker|keeper:adl-worker|ADL_KEEPER_PRIVATE_KEY|ADL_KEEPER"
  "liq-worker|keeper:liq-worker|LIQUIDATION_KEEPER_PRIVATE_KEY|LIQUIDATION_KEEPER"
  "rel-worker|keeper:rel-worker|RELAY_KEEPER_PRIVATE_KEY|"
)

field() { echo "$1" | cut -d'|' -f"$2"; }

# 查某个私钥变量对应的地址在链上有没有某角色。回显判定，返回是否失败。
check_signer() {
  local label="$1" var="$2" role="$3" required="$4"
  local key="${!var:-}"

  if [[ -z "$key" ]]; then
    if [[ "$required" == "required" ]]; then
      echo "❌ $label: $var 为空"; return 1
    fi
    echo "   $label: $var 未配（该 worker 不可用，其余不受影响）"; return 0
  fi

  local addr; addr="$(cast wallet address --private-key "$key" 2>/dev/null || true)"
  [[ -n "$addr" ]] || { echo "❌ $label: $var 解不出地址"; return 1; }

  local bal eth
  bal="$(cast balance "$addr" --rpc-url "$KEEPER_HTTP_RPC_URL" 2>/dev/null || echo 0)"
  eth="$(cast from-wei "$bal" 2>/dev/null || echo '?')"

  if [[ -z "$role" ]]; then
    ok "$label: $addr  ETH $eth  （代发者，无需链上角色）"
    return 0
  fi

  local h has
  h="$(cast keccak "$(cast abi-encode 'f(string)' "$role")")"
  has="$(cast call "$DATA_STORE" 'hasRole(bytes32,address)(bool)' "$h" "$addr" --rpc-url "$KEEPER_HTTP_RPC_URL" 2>/dev/null || echo error)"
  if [[ "$has" == "true" ]]; then
    ok "$label: $addr  ETH $eth  持有 $role"
    return 0
  fi
  echo "❌ $label: $addr 没有 $role 角色（hasRole=${has}）"
  echo "   授权：cd ../role-grant && node plan-grant.mjs --grant DataStore/$role=$addr \\"
  echo "           --from <admin地址> --account <keystore名> --execute --yes"
  return 1
}

check() {
  local fail=0
  echo "keeper 前置体检"
  echo "  keeper 源码: $KEEPER_DIR"
  [[ -d "$KEEPER_DIR" ]] || die "找不到 keeper 源码目录"

  [[ -n "$EXPECTED_CHAIN_ID" ]] \
    && ok "配置 Chain ID $EXPECTED_CHAIN_ID" \
    || { echo "❌ KEEPER_CHAIN_ID / KEEPER_EXPECTED_CHAIN_ID 未设"; fail=1; }

  # 假绿灯闸门：体检拿 EXPECTED 去比 RPC，进程却按 KEEPER_CHAIN_ID 拼 Redis keyspace。
  # 两者不一致 = 体检全绿但队列写在另一条链的前缀下，这里必须说出来。
  if [[ -n "$EXPECTED_CHAIN_ID" && "$RUNTIME_CHAIN_ID" != "$EXPECTED_CHAIN_ID" ]]; then
    echo "⚠️  体检期望 Chain ID $EXPECTED_CHAIN_ID，但 keeper 进程实际会用 KEEPER_CHAIN_ID=${RUNTIME_CHAIN_ID:-未设}"
    echo "   Redis keyspace 前缀按后者拼（apps/keeper/src/infra/keyspace.ts）——不一致就是假绿灯"
    echo "   修：加 --chain-id $EXPECTED_CHAIN_ID（连日志/pid 一并分到 logs/$EXPECTED_CHAIN_ID/），"
    echo "       或加 --align-chain-id（只对齐链，日志仍在 logs/）"
  elif [[ -n "$SLOT_CHAIN_ID" || "$ALIGN_CHAIN_ID" == "true" ]]; then
    ok "keeper 进程实际使用 KEEPER_CHAIN_ID=$RUNTIME_CHAIN_ID（与体检期望同值）"
  fi
  if [[ "$LOG_DIR" != "$HERE/logs" ]]; then
    ok "日志/pid 目录 $LOG_DIR（status/stop 只作用于本目录）"
  fi

  [[ "${CHAINLINK_NETWORK:-}" == "testnet" ]] \
    && ok "CHAINLINK_NETWORK=testnet" \
    || { echo "❌ CHAINLINK_NETWORK=${CHAINLINK_NETWORK:-未设}，84532 必须是 testnet"; fail=1; }

  [[ -n "${KEEPER_HTTP_RPC_URL:-}" ]] && ok "RPC 已配" || { echo "❌ KEEPER_HTTP_RPC_URL 为空"; fail=1; }
  [[ -n "${CHAINLINK_API_KEY:-}" && -n "${CHAINLINK_API_SECRET:-}" ]] \
    && ok "Chainlink 凭证已配" \
    || { echo "❌ CHAINLINK_API_KEY / SECRET 为空——没有它拿不到签名报价，订单执行不了"; fail=1; }

  if [[ -n "${KEEPER_HTTP_RPC_URL:-}" ]]; then
    local actual_chain_id
    actual_chain_id="$(cast chain-id --rpc-url "$KEEPER_HTTP_RPC_URL" 2>/dev/null || true)"
    [[ -n "$actual_chain_id" && "$actual_chain_id" == "$EXPECTED_CHAIN_ID" ]] \
      && ok "RPC Chain ID $actual_chain_id 与本 Fork 固定配置一致" \
      || { echo "❌ RPC Chain ID=${actual_chain_id:-不可读}，期望 $EXPECTED_CHAIN_ID；拒绝启动到错误 Fork"; fail=1; }
    echo
    echo "  签名钱包与角色："
    # ord-worker 是基本盘，缺它整条链路不通 → required；其余缺了只影响自己 → optional
    check_signer "ord-worker" ORDER_KEEPER_PRIVATE_KEY ORDER_KEEPER required || fail=1
    for w in "${WORKERS[@]:1}"; do
      check_signer "$(field "$w" 1)" "$(field "$w" 3)" "$(field "$w" 4)" optional || true
    done
    echo
  fi

  if redis-cli -h "${REDIS_HOST:-127.0.0.1}" -p "${REDIS_PORT:-6379}" ping >/dev/null 2>&1; then
    ok "Redis 可达"
  else
    echo "❌ Redis 不通（${REDIS_HOST:-127.0.0.1}:${REDIS_PORT:-6379}）——brew services start redis"; fail=1
  fi

  [[ "${KEEPER_DRY_RUN:-true}" == "true" ]] \
    && echo "ℹ️  KEEPER_DRY_RUN=true：只验证不广播。角色确认无误后改成 false 才会真发交易" \
    || echo "⚠️  KEEPER_DRY_RUN=false：会真的广播交易"

  [[ $fail -eq 0 ]] && { echo; ok "体检通过"; } || { echo; die "有未通过项，先补齐再启动"; }
}

run_one() {
  local script="$1" name="$2"
  mkdir -p "$LOG_DIR"
  echo "起 ${name}（日志 $LOG_DIR/$name.log；RPC 已绑定至本次运行）"
  ( cd "$KEEPER_DIR" && yarn "$script" >> "$LOG_DIR/$name.log" 2>&1 & echo $! > "$LOG_DIR/$name.pid" )
  sleep 1
  echo "  pid $(cat "$LOG_DIR/$name.pid")"
}

# 按 worker 名起：私钥没配就跳过并说明，不让整条命令失败
run_worker() {
  local want="$1"
  for w in "${WORKERS[@]}"; do
    [[ "$(field "$w" 1)" == "$want" ]] || continue
    local var; var="$(field "$w" 3)"
    if [[ -z "${!var:-}" ]]; then
      echo "跳过 ${want}：$var 未配"
      return 0
    fi
    run_one "$(field "$w" 2)" "$want"
    return 0
  done
  die "未知 worker: $want"
}

# 提示同级的其它 chainId 槽位（本次不管理它们）。默认布局下 logs/ 没有子目录，
# 这段不会打印任何东西，输出与改造前一致。
hint_other_slots() {
  local other="" d
  for d in "$HERE"/logs/*/; do
    [[ -d "$d" ]] || continue
    [[ "${d%/}" != "$LOG_DIR" ]] || continue
    ls "$d"*.pid >/dev/null 2>&1 || continue
    if [[ -z "$other" ]]; then other="${d%/}"; else other="$other  ${d%/}"; fi
  done
  if [[ -n "$other" ]]; then
    echo
    echo "其它 chainId 槽位（本次未管理，用 --chain-id <id> 或 --log-dir 切过去）：$other"
  fi
}

status() {
  echo "运行中的 keeper 进程："
  if [[ "$LOG_DIR" != "$HERE/logs" ]]; then
    echo "  （目录 $LOG_DIR）"
  fi
  local found=0
  for f in "$LOG_DIR"/*.pid; do
    [[ -f "$f" ]] || continue
    local name pid; name="$(basename "$f" .pid)"; pid="$(cat "$f")"
    if kill -0 "$pid" 2>/dev/null; then
      echo "  ✅ $name  pid $pid"; found=1
    else
      # 进程没了 pid 文件还在：直接清掉，留着会让下次 status/stop 误判
      rm -f "$f"
      echo "  ○ $name  已退出（清理陈旧 pid；日志见 $LOG_DIR_LABEL/$name.log）"
    fi
  done
  [[ $found -eq 1 ]] || echo "  （无）"
  hint_other_slots
  echo
  echo "实际 entrypoint 进程："
  pgrep -fl "src/entrypoints/" 2>/dev/null | sed 's/^/  /' || echo "  （无）"
}

case "${1:-check}" in
  check)      check ;;
  producer)   check; run_one keeper:producer producer ;;
  worker)     check; run_worker ord-worker ;;
  adl-worker) check; run_worker adl-worker ;;
  liq-worker) check; run_worker liq-worker ;;
  rel-worker) check; run_worker rel-worker ;;
  both)       check; run_one keeper:producer producer; run_worker ord-worker ;;
  all)
    check
    run_one keeper:producer producer
    for w in "${WORKERS[@]}"; do run_worker "$(field "$w" 1)"; done
    ;;
  inspect)
    # 只读调试，不需要角色也不需要 Redis 以外的东西；参数透传给 keeper:inspect
    shift || true
    ( cd "$KEEPER_DIR" && yarn keeper:inspect "$@" )
    ;;
  status)     status ;;
  stop)
    # 仅停止本 runner 自己记录的进程树；绝不全局 pkill，避免影响其他 Fork / 同事。
    # 只扫本车道的 pid 目录（默认仍是 logs/），别的 chainId 槽位一律不碰。
    if [[ "$LOG_DIR" != "$HERE/logs" ]]; then
      echo "（只处理 $LOG_DIR 下登记的进程）"
    fi
    for f in "$LOG_DIR"/*.pid; do
      [[ -f "$f" ]] || continue
      pid="$(cat "$f")"
      pkill -TERM -P "$pid" 2>/dev/null
      kill -TERM "$pid" 2>/dev/null && echo "停 $(basename "$f" .pid)"
      rm -f "$f"
    done
    sleep 2
    echo "✅ 已请求停止本 keeper-runner 管理的进程；其他 runner 的进程不会被触碰。"
    ;;
  *) die "用法: $0 [--chain-id <id>] [--log-dir <dir>] [--align-chain-id] {check|producer|worker|adl-worker|liq-worker|rel-worker|both|all|inspect|status|stop}（详见 --help）" ;;
esac
