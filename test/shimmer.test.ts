import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import claudeShimmer, {
  completionNotice,
  estimateOutputTokens,
  estimateTextTokens,
  finalTokenReading,
  formatTokenAmount,
  isInteractiveTui,
  liveTokenReading,
  outcomeFromStopReason,
  pickVerb,
  reportedOutputTokens,
  reportedPromptTokens,
  sweepPosition,
  TICK_MS,
  tokensPerSecond,
  tpsColor,
  tweenTokens,
  VERBS,
} from "../extensions/claude-shimmer/index";
import { setColorMode } from "../extensions/shared/color";

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

// ─── Pure helpers ─────────────────────────────────────────────────

test("token amounts are bare numbers; throughput bands and prompt totals are defined once", () => {
  assert.equal(formatTokenAmount(1), "1");
  assert.equal(formatTokenAmount(128), "128");
  assert.equal(formatTokenAmount(1234), "1.2k");
  assert.equal(formatTokenAmount(-3), "0");
  assert.deepEqual(tpsColor(120), [174, 229, 197], "fastest band");
  assert.deepEqual(tpsColor(60), [159, 211, 242]);
  assert.deepEqual(tpsColor(30), [243, 217, 139]);
  assert.deepEqual(tpsColor(29.9), [255, 143, 163], "slowest band");
  assert.equal(tokensPerSecond(1000, 10_000), 100);
  assert.equal(tokensPerSecond(0, 10_000), null);
  assert.equal(tokensPerSecond(100, 0), null);
  assert.equal(reportedPromptTokens({ usage: { input: 190, cacheWrite: 10, cacheRead: 14_000 } }), 14_200);
  assert.equal(reportedPromptTokens({ usage: { input: 5 } }), 5);
  assert.equal(reportedPromptTokens(undefined), 0);
});

test("estimates: © ® ™ count like normal chars, emoji count double", () => {
  assert.equal(estimateTextTokens("©®™"), estimateTextTokens("éüñ"));
  assert.ok(estimateTextTokens("😀😀") > estimateTextTokens("©®"));
  assert.equal(estimateTextTokens("abcd".repeat(100)), 100);
  assert.equal(estimateOutputTokens({ content: [{ type: "text", text: "x".repeat(40) }, { type: "thinking", thinking: "y".repeat(40) }] }), 20);
});

test("streaming stub usage (Anthropic output≈1) never hides the estimate", () => {
  assert.deepEqual(liveTokenReading(1, 500), { tokens: 500, estimated: true });
  assert.deepEqual(liveTokenReading(null, 20), { tokens: 20, estimated: true });
  assert.deepEqual(liveTokenReading(600, 500), { tokens: 600, estimated: false });
  assert.deepEqual(liveTokenReading(null, 0), { tokens: 0, estimated: false });
  // Zero-filled streaming usage is "not reported".
  assert.equal(reportedOutputTokens({ usage: { output: 0 } }), null);
});

test("final usage is authoritative only for normal stops", () => {
  const content = [{ type: "text", text: "x".repeat(4000) }]; // ≈1000 tokens
  assert.deepEqual(finalTokenReading({ content, usage: { output: 800, input: 10 }, stopReason: "stop" }), { tokens: 800, estimated: false });
  assert.deepEqual(finalTokenReading({ content, usage: { output: 1, input: 10 }, stopReason: "aborted" }), { tokens: 1000, estimated: true });
  assert.deepEqual(finalTokenReading({ content, usage: { output: 1, input: 10 }, stopReason: "error" }), { tokens: 1000, estimated: true });
  assert.deepEqual(finalTokenReading({ content, stopReason: "stop" }), { tokens: 1000, estimated: true });
  assert.deepEqual(finalTokenReading({ content: [], usage: { output: 0, input: 5 }, stopReason: "stop" }), { tokens: 0, estimated: false });
});

test("completion notice only on success", () => {
  assert.equal(completionNotice("completed", 12_400, () => 0), "✻ Baked for 12s");
  assert.equal(completionNotice("aborted", 12_400), undefined);
  assert.equal(completionNotice("error", 12_400), undefined);
  assert.equal(outcomeFromStopReason("aborted"), "aborted");
  assert.equal(outcomeFromStopReason("error"), "error");
  assert.equal(outcomeFromStopReason("toolUse"), "completed");
  assert.equal(outcomeFromStopReason(undefined), "completed");
});

test("sweep highlight enters and leaves from outside the text", () => {
  assert.equal(sweepPosition(10, 0, false), -5);
  assert.equal(sweepPosition(10, 19, false), 14);
  assert.equal(sweepPosition(10, 20, false), -5);
  assert.equal(sweepPosition(10, 0, true), 14);
  assert.equal(sweepPosition(10, 19, true), -5);
});

test("token tween converges in both directions", () => {
  let v = 0;
  for (let i = 0; i < 40 && v !== 2000; i++) v = tweenTokens(v, 2000);
  assert.equal(v, 2000);
  for (let i = 0; i < 40 && v !== 10; i++) v = tweenTokens(v, 10);
  assert.equal(v, 10);
});

test("verbs: trimmed list, deterministic pick", () => {
  assert.ok(VERBS.length >= 40 && VERBS.length <= 60);
  assert.equal(pickVerb(() => 0), VERBS[0]);
  assert.equal(pickVerb(() => 0.999999), VERBS[VERBS.length - 1]);
});

test("isInteractiveTui prefers ctx.mode and falls back to hasUI", () => {
  assert.equal(isInteractiveTui({ mode: "tui", hasUI: true }), true);
  assert.equal(isInteractiveTui({ mode: "rpc", hasUI: true }), false);
  assert.equal(isInteractiveTui({ mode: undefined as never, hasUI: true }), true);
  assert.equal(isInteractiveTui(undefined), false);
});

// ─── Handler-driven tests ─────────────────────────────────────────

type Handler = (event: any, ctx: any) => unknown;

function harness(mode: "tui" | "rpc" = "tui") {
  const handlers = new Map<string, Handler>();
  const messages: string[] = [];
  const notices: Array<[string, string | undefined]> = [];
  const indicators: unknown[] = [];
  const events: Array<[string, unknown]> = [];
  const pi = {
    on: (name: string, fn: Handler) => void handlers.set(name, fn),
    getThinkingLevel: () => "high",
    registerCommand: () => {},
    events: { emit: (name: string, payload: unknown) => void events.push([name, payload]) },
  };
  const ctx = {
    mode,
    hasUI: true,
    signal: undefined as { aborted: boolean } | undefined,
    getContextUsage: () => ({ tokens: 9_000, contextWindow: 128_000, percent: 7 }),
    ui: {
      theme: { getColorMode: () => "truecolor" },
      setWorkingMessage: (m?: string) => void (m !== undefined && messages.push(m)),
      setWorkingIndicator: (o?: unknown) => void indicators.push(o),
      notify: (m: string, t?: string) => void notices.push([m, t]),
    },
  };
  claudeShimmer(pi as never);
  const emit = async (name: string, event: Record<string, unknown> = {}) => {
    await handlers.get(name)?.({ type: name, ...event }, ctx);
  };
  const last = () => strip(messages.at(-1) ?? "");
  return { emit, messages, notices, indicators, events, ctx, last };
}

const assistant = (text: string, extra: Record<string, unknown> = {}) => ({
  role: "assistant",
  content: [{ type: "text", text }],
  ...extra,
});

async function streamText(h: ReturnType<typeof harness>, text: string, usageOutput = 1) {
  const message = assistant("", { usage: { output: usageOutput, input: 100 } });
  await h.emit("message_start", { message });
  await h.emit("message_update", { message, assistantMessageEvent: { type: "start" } });
  await h.emit("message_update", { message, assistantMessageEvent: { type: "text_start", contentIndex: 0 } });
  await h.emit("message_update", { message, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: text } });
}

beforeEach(() => {
  mock.timers.enable({ apis: ["setInterval", "Date"], now: 1_000_000 });
});

afterEach(async () => {
  mock.timers.reset();
  setColorMode("truecolor");
});

test("live counter is not stuck at 1 token on Anthropic-style stub usage", async () => {
  const h = harness();
  await h.emit("session_start");
  await h.emit("agent_start");
  await h.emit("turn_start");
  await streamText(h, "abcd".repeat(500), 1); // ≈500 tokens, provider says 1
  mock.timers.tick(TICK_MS * 30);
  assert.match(h.last(), /↓ ~500/);
  assert.match(h.last(), /↑ 100/, "the reported prompt is shown upstream");

  // Tool round: final usage is authoritative and accumulates.
  await h.emit("message_end", { message: assistant("abcd".repeat(500), { usage: { output: 480, input: 100 }, stopReason: "toolUse" }) });
  assert.match(h.last(), /↓ 480/);
  assert.doesNotMatch(h.last(), /~480/);
  await h.emit("turn_end");
  await h.emit("turn_start");
  await streamText(h, "abcd".repeat(100), 1);
  await h.emit("message_end", { message: assistant("abcd".repeat(100), { usage: { output: 90, input: 100 }, stopReason: "stop" }) });
  assert.match(h.last(), /↓ 570/);
  assert.match(h.last(), /↻ 2/, "both model rounds are counted");
  await h.emit("session_shutdown");
});

test("HUD shows upstream tokens, live throughput and the run's turn count", async () => {
  const h = harness();
  await h.emit("session_start");
  await h.emit("agent_start");
  await h.emit("turn_start");
  mock.timers.tick(TICK_MS);
  assert.match(h.last(), /↑ ~9k/, "before the provider reports, the context estimate stands in");
  const message = assistant("", { usage: { input: 1_000, cacheRead: 11_000, output: 1 } });
  await h.emit("message_start", { message });
  await h.emit("message_update", { message, assistantMessageEvent: { type: "text_start", contentIndex: 0 } });
  await h.emit("message_update", { message, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "abcd".repeat(500) } });
  mock.timers.tick(2_000); // 2s of generation on top of the pending-context tick
  const line = h.last();
  assert.match(line, /↑ 12k/, "input + both cache buckets are the upstream count");
  assert.match(line, /↓ ~500/);
  // Throughput spans turn_start → now, exactly like the footer's generation time.
  const expectedTps = (500 / ((TICK_MS + 2_000) / 1000)).toFixed(1);
  assert.match(line, new RegExp(`${expectedTps.replace(".", "\\.")} tok/s`), "throughput uses generation time only");
  assert.match(line, /↻ 1/);
  assert.match(line, /00:02/, "elapsed wall clock stays");

  // A later run starts from zero: the counters belong to the run, not the session.
  await h.emit("agent_end", { messages: [assistant("ok", { usage: { output: 5, input: 100 }, stopReason: "stop" })] });
  await h.emit("agent_settled");
  await h.emit("agent_start");
  mock.timers.tick(TICK_MS);
  assert.doesNotMatch(h.last(), /↑ 12k/, "upstream resets per run");
  assert.doesNotMatch(h.last(), /↻ 2/);
  await h.emit("turn_start");
  mock.timers.tick(TICK_MS);
  assert.match(h.last(), /↻ 1/, "turn counting restarts");
  await h.emit("session_shutdown");
});

test("aborted message keeps the larger estimate instead of dropping to 1", async () => {
  const h = harness();
  await h.emit("agent_start");
  await streamText(h, "abcd".repeat(2000), 1);
  await h.emit("message_end", { message: assistant("abcd".repeat(2000), { usage: { output: 1, input: 100 }, stopReason: "aborted" }) });
  assert.match(h.last(), /↓ ~2k/);
  await h.emit("session_shutdown");
});

test("verb is picked once per run and stays across tool rounds", async () => {
  const h = harness();
  await h.emit("agent_start");
  const verbOf = () => /^\S+ (\p{L}[\p{L}'-]*)/u.exec(h.last())?.[1];
  const first = verbOf();
  assert.ok(first && (VERBS as readonly string[]).includes(first));
  for (let round = 0; round < 8; round++) {
    await h.emit("tool_execution_start");
    await h.emit("tool_execution_end");
    await h.emit("turn_end");
    await h.emit("turn_start");
    mock.timers.tick(TICK_MS);
    assert.equal(verbOf(), first);
  }
  await h.emit("session_shutdown");
});

test("completion notice uses whole-run time, fires once, only on success, at agent_settled", async () => {
  const h = harness();
  await h.emit("agent_start");
  await h.emit("turn_start");
  mock.timers.tick(4_000);
  await h.emit("message_end", { message: assistant("hi", { usage: { output: 5, input: 1 }, stopReason: "toolUse" }) });
  await h.emit("turn_end");
  await h.emit("turn_start");
  mock.timers.tick(3_000);
  await h.emit("message_end", { message: assistant("done", { usage: { output: 5, input: 1 }, stopReason: "stop" }) });
  await h.emit("agent_end", { messages: [assistant("done", { stopReason: "stop" })] });
  assert.equal(h.notices.length, 0, "agent_end must not announce (retries/compaction may follow)");
  await h.emit("agent_settled");
  await h.emit("agent_settled");
  assert.equal(h.notices.length, 1);
  const [text, type] = h.notices[0]!;
  assert.equal(type, "info");
  assert.match(strip(text), /^✻ \w+ for 7s$/);
  // Zentui renders the footer notice from this event, so it must carry the same text.
  assert.deepEqual(h.events, [["muelsyse:completion-notice", text]]);
});

test("no completion notice after Esc or error", async () => {
  for (const stopReason of ["aborted", "error"]) {
    const h = harness();
    await h.emit("agent_start");
    await h.emit("message_end", { message: assistant("partial", { stopReason }) });
    await h.emit("agent_end", { messages: [assistant("partial", { stopReason })] });
    await h.emit("agent_settled");
    assert.equal(h.notices.length, 0, stopReason);
  }
  // Abort during tool execution: last assistant message was a toolUse, but the signal is aborted.
  const h = harness();
  await h.emit("agent_start");
  await h.emit("message_end", { message: assistant("call", { stopReason: "toolUse" }) });
  h.ctx.signal = { aborted: true };
  await h.emit("agent_end", { messages: [] });
  await h.emit("agent_settled");
  assert.equal(h.notices.length, 0);
});

test("retry after error keeps the run and announces success once", async () => {
  const h = harness();
  await h.emit("agent_start");
  await h.emit("message_end", { message: assistant("", { stopReason: "error" }) });
  await h.emit("agent_end", { messages: [assistant("", { stopReason: "error" })] });
  await h.emit("agent_start");
  await h.emit("message_end", { message: assistant("ok", { usage: { output: 2, input: 1 }, stopReason: "stop" }) });
  await h.emit("agent_end", { messages: [assistant("ok", { stopReason: "stop" })] });
  await h.emit("agent_settled");
  assert.equal(h.notices.length, 1);
});

test("non-TUI modes: no animation, no ANSI notify", async () => {
  const h = harness("rpc");
  await h.emit("session_start");
  await h.emit("agent_start");
  await streamText(h, "hello");
  mock.timers.tick(TICK_MS * 5);
  await h.emit("message_end", { message: assistant("hello", { stopReason: "stop" }) });
  await h.emit("agent_end", { messages: [] });
  await h.emit("agent_settled");
  assert.equal(h.messages.length, 0);
  assert.equal(h.indicators.length, 0);
  assert.equal(h.notices.length, 0);
});

test("single clock: indicator hidden, message updates once per tick", async () => {
  const h = harness();
  await h.emit("agent_start");
  assert.deepEqual(h.indicators[0], { frames: [], intervalMs: TICK_MS });
  const before = h.messages.length;
  mock.timers.tick(TICK_MS * 10);
  assert.equal(h.messages.length - before, 10);
  await h.emit("agent_end", { messages: [] });
  const stopped = h.messages.length;
  mock.timers.tick(TICK_MS * 10);
  assert.equal(h.messages.length, stopped, "no ticks after agent_end");
  await h.emit("agent_settled");
  assert.equal(h.indicators.at(-1), undefined, "indicator restored to Pi default");
});

test("working line is ours while the clock runs: a foreign ambient write cannot flash over the HUD", async () => {
  const h = harness();
  const original = h.ctx.ui.setWorkingMessage;
  await h.emit("session_start");
  await h.emit("agent_start");
  const own = h.messages.length;
  h.ctx.ui.setWorkingMessage("工作中 · 0:12"); // Cockpit's ambient message
  assert.equal(h.messages.length, own, "foreign string dropped while the run owns the line");
  mock.timers.tick(TICK_MS);
  assert.equal(h.messages.length, own + 1, "our tick still lands");

  await h.emit("agent_end", { messages: [] });
  h.ctx.ui.setWorkingMessage("工作中 · 0:13");
  assert.equal(h.messages.at(-1), "工作中 · 0:13", "handed back once the run ends");

  await h.emit("agent_start");
  const second = h.messages.length;
  h.ctx.ui.setWorkingMessage("工作中 · 0:14");
  assert.equal(h.messages.length, second, "a later run holds the line again");

  await h.emit("session_shutdown");
  assert.equal(h.ctx.ui.setWorkingMessage, original, "host setter restored on shutdown");
});

test("a rebound UI context is held; the discarded one is restored", async () => {
  const h = harness();
  const firstUi = h.ctx.ui;
  const firstOriginal = firstUi.setWorkingMessage;
  await h.emit("session_start");
  await h.emit("agent_start");
  await h.emit("session_shutdown");
  assert.equal(firstUi.setWorkingMessage, firstOriginal);

  const rebound = { ...firstUi, setWorkingMessage: (m?: string) => void (m !== undefined && h.messages.push(m)) };
  const reboundOriginal = rebound.setWorkingMessage;
  h.ctx.ui = rebound;
  await h.emit("agent_start");
  const own = h.messages.length;
  rebound.setWorkingMessage("工作中 · 0:12");
  assert.equal(h.messages.length, own, "the rebound context is held too");
  await h.emit("session_shutdown");
  assert.equal(rebound.setWorkingMessage, reboundOriginal, "rebound setter restored on shutdown");
});

test("non-TUI modes never take the working slot", async () => {
  const h = harness("rpc");
  const original = h.ctx.ui.setWorkingMessage;
  await h.emit("session_start");
  await h.emit("agent_start");
  assert.equal(h.ctx.ui.setWorkingMessage, original);
  h.ctx.ui.setWorkingMessage("工作中 · 0:12");
  assert.equal(h.messages.at(-1), "工作中 · 0:12");
  await h.emit("session_shutdown");
  assert.equal(h.ctx.ui.setWorkingMessage, original);
});

test("the working slot is held from session start, before any run", async () => {
  const h = harness();
  const original = h.ctx.ui.setWorkingMessage;
  await h.emit("session_start");
  assert.notEqual(h.ctx.ui.setWorkingMessage, original, "held before the first run");
  h.ctx.ui.setWorkingMessage("工作中 · 0:12");
  assert.equal(h.messages.at(-1), "工作中 · 0:12", "an idle session keeps passing foreign writes through");
  await h.emit("agent_start");
  mock.timers.tick(TICK_MS);
  assert.match(h.last(), /[↓↑]/, "the HUD renders with the hold already in place");
  await h.emit("session_shutdown");
  assert.equal(h.ctx.ui.setWorkingMessage, original);
});

test("a setter replaced after us is re-wrapped on the next run", async () => {
  const h = harness();
  await h.emit("session_start");
  await h.emit("agent_start");
  const foreign: string[] = [];
  const replacement = (m?: string) => void (m !== undefined && foreign.push(m));
  h.ctx.ui.setWorkingMessage = replacement; // a third party replaces the setter mid-session
  await h.emit("agent_end", { messages: [] });
  await h.emit("agent_start");
  const own = foreign.length;
  assert.equal(own, 1, "our HUD still reaches the setter that replaced ours");
  mock.timers.tick(TICK_MS);
  assert.equal(foreign.length, own + 1, "the clock keeps painting through the replacement");
  h.ctx.ui.setWorkingMessage("工作中 · 0:12");
  assert.equal(foreign.length, own + 1, "arbitration returns: foreign writes stay dropped");
  await h.emit("session_shutdown");
  assert.equal(h.ctx.ui.setWorkingMessage, replacement, "release hands the setter back to the replacement");
});

test("release leaves a setter stacked on top of ours in place", async () => {
  const h = harness();
  await h.emit("session_start");
  await h.emit("agent_start");
  const stacked = (m?: string) => void m;
  h.ctx.ui.setWorkingMessage = stacked;
  await h.emit("session_shutdown");
  assert.equal(h.ctx.ui.setWorkingMessage, stacked, "a foreign layer keeps its own chain");
});

test("disposed UI mid-tick stops the clock instead of throwing", async () => {
  const h = harness();
  await h.emit("agent_start");
  let calls = 0;
  h.ctx.ui.setWorkingMessage = () => {
    calls++;
    throw new Error("disposed");
  };
  mock.timers.tick(TICK_MS * 5);
  assert.equal(calls, 1);
});

test("stall fades the verb toward coral after ~3s without stream updates", async () => {
  const h = harness();
  await h.emit("agent_start");
  await streamText(h, "hello");
  mock.timers.tick(TICK_MS);
  const fresh = h.messages.at(-1)!;
  mock.timers.tick(6_000);
  const stalled = h.messages.at(-1)!;
  // Fully stalled: every verb char is pulled to coral (255;143;163) or its bloom.
  const reds = (s: string) => [...s.matchAll(/38;2;(\d+);/g)].filter((m) => Number(m[1]) === 255).length;
  assert.ok(reds(stalled) > reds(fresh));
  await h.emit("session_shutdown");
});
