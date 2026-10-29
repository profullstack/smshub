#!/usr/bin/env bash
# Hand smshub's in-memory vault unlocks from the old container to the new one on
# a deploy, so a redeploy does not lock every vault (src/lib/vault/handoff.ts).
#
#   vault-handoff.sh export <container>   prints the handoff JSON on stdout (keep it in a variable, never a file)
#   vault-handoff.sh import <container>   reads that JSON on stdin, prints {"ok":..,"imported":..}
#
# Keys only ever cross stdin/stdout pipes (never argv, so not in ps).
set -euo pipefail
op=${1:?usage: vault-handoff.sh export|import <container>}
cid=${2:?container id or name}
sock=${VAULT_HANDOFF_SOCKET:-/home/bun/.smshub-vault/handoff.sock}

# Runs inside the container (node or bun): send stdin as one line, print the reply.
client='const net=require("net");let i="";process.stdin.setEncoding("utf8");
process.stdin.on("data",d=>i+=d).on("end",()=>{const c=net.connect(process.env.HANDOFF_SOCK,()=>c.write(i.trim()+"\n"));
let o="";c.setEncoding("utf8");c.on("data",d=>o+=d);c.on("end",()=>process.stdout.write(o));
c.on("error",e=>{process.stderr.write("handoff socket: "+e.message+"\n");process.exit(1)})});'
run() { docker exec -i -e HANDOFF_SOCK="$sock" "$cid" node -e "$client"; }

case "$op" in
  export)
    out=$(printf '{"op":"export"}' | run)
    case "$out" in *'"ok":true'*) printf '%s' "$out" ;; *) echo "${out:-no reply}" >&2; exit 1 ;; esac
    ;;
  import)
    in=$(cat)
    [ -n "$in" ] || { echo "nothing to import" >&2; exit 1; }
    req=$(printf '%s' "$in" | sed 's/^{"ok":true,/{"op":"import",/')
    # The new process may still be starting its socket: retry for ~30s.
    for _ in $(seq 1 15); do
      if out=$(printf '%s' "$req" | run 2>/dev/null) && [ -n "$out" ]; then
        printf '%s\n' "$out"
        case "$out" in *'"ok":true'*) exit 0 ;; *) exit 1 ;; esac
      fi
      sleep 2
    done
    echo "handoff socket never answered in $cid" >&2; exit 1
    ;;
  *) echo "unknown op: $op" >&2; exit 2 ;;
esac
