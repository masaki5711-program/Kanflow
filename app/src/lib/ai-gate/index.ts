import { gate } from "@/lib/translation/priority-gate"
import { loadAiGateConfig } from "./config"
import { probePeer } from "./peer-client"
import { RemoteGate, type GateLog } from "./remote-gate"

export { RemoteGate, aggregatePeers, backoffMs, type Admission, type RemoteGateState } from "./remote-gate"
export { loadAiGateConfig, parsePeers, type AiGateConfig } from "./config"

/** RemoteGate wired to this process's PriorityGate and the real HTTP probe. */
export function createRemoteGate(env: NodeJS.ProcessEnv, log?: GateLog): RemoteGate {
  const config = loadAiGateConfig(env)
  if (config.peers.length > 0 && !config.token) {
    log?.warn("INTERNAL_API_TOKEN is not set: peers will answer 503 and the worker runs throttled", { peers: config.peers })
  }
  return new RemoteGate({
    config,
    target: gate,
    probe: (url) => probePeer(url, config.token, { timeoutMs: config.timeoutMs }),
    log,
  })
}
