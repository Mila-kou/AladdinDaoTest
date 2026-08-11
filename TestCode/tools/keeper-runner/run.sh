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
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

die() { echo "❌ $*" >&2; exit 1; }
ok()  { echo "✅ $*"; }

[[ -n "${KEEPER_DIR:-}" && -d "$KEEPER_DIR" ]] \
  || die "找不到 keeper 应用目录（KEEPER_DIR=${KEEPER_DIR:-未设置}）—— 用 KEEPER_DIR=/path/to/fx100-apps/apps/keeper ./run.sh … 指定"
[[ -f "$ENV_FILE" ]] || die "缺 $ENV_FILE —— 先 cp .env.example .env 并填写，或用 KEEPER_ENV_FILE=/path/to/.env 指定"
set -a; source "$ENV_FILE"; set +a

# 看板/测试批次可显式注入所选环境 RPC。它优先于 .env，避免 Keeper 静默连到旧 Fork。
if [[ -n "${KEEPER_RUN_RPC_URL:-}" ]]; then
  KEEPER_HTTP_RPC_URL="$KEEPER_RUN_RPC_URL"
fi
EXPECTED_CHAIN_ID="${KEEPER_EXPECTED_CHAIN_ID:-${KEEPER_CHAIN_ID:-}}"

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
  mkdir -p "$HERE/logs"
  echo "起 ${name}（日志 $HERE/logs/$name.log；RPC 已绑定至本次运行）"
  ( cd "$KEEPER_DIR" && yarn "$script" >> "$HERE/logs/$name.log" 2>&1 & echo $! > "$HERE/logs/$name.pid" )
  sleep 1
  echo "  pid $(cat "$HERE/logs/$name.pid")"
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

status() {
  echo "运行中的 keeper 进程："
  local found=0
  for f in "$HERE"/logs/*.pid; do
    [[ -f "$f" ]] || continue
    local name pid; name="$(basename "$f" .pid)"; pid="$(cat "$f")"
    if kill -0 "$pid" 2>/dev/null; then
      echo "  ✅ $name  pid $pid"; found=1
    else
      # 进程没了 pid 文件还在：直接清掉，留着会让下次 status/stop 误判
      rm -f "$f"
      echo "  ○ $name  已退出（清理陈旧 pid；日志见 logs/$name.log）"
    fi
  done
  [[ $found -eq 1 ]] || echo "  （无）"
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
    for f in "$HERE"/logs/*.pid; do
      [[ -f "$f" ]] || continue
      pid="$(cat "$f")"
      pkill -TERM -P "$pid" 2>/dev/null
      kill -TERM "$pid" 2>/dev/null && echo "停 $(basename "$f" .pid)"
      rm -f "$f"
    done
    sleep 2
    echo "✅ 已请求停止本 keeper-runner 管理的进程；其他 runner 的进程不会被触碰。"
    ;;
  *) die "用法: $0 {check|producer|worker|adl-worker|liq-worker|rel-worker|both|all|inspect|status|stop}" ;;
esac
