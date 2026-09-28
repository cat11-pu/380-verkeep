// headrun.js：按整批共用的处理预算处理帧事件，用尽后连着载压账，收尾把账做完
import { versionOf, reservedOf } from "./head.js";

const TOKEN = Symbol("eventToken");

function code(spec, key, fallback) {
  const value = spec && spec[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function fail(spec, key, fallback, message) {
  const error = new Error(message);
  error.code = code(spec, key, fallback);
  throw error;
}

function cloneState(state) {
  const source = state || {};
  const clone = {
    records: Array.isArray(source.records)
      ? source.records.map(function (row) { return [row[0], row[1]]; })
      : [],
    counts: Array.isArray(source.counts)
      ? source.counts.map(function (row) { return [row[0], row[1]]; })
      : [],
    ledger: Array.isArray(source.ledger)
      ? source.ledger.map(function (row) {
          const copy = [row[0], row[1]];
          if (row[TOKEN] !== undefined) copy[TOKEN] = row[TOKEN];
          return copy;
        })
      : [],
    applied: Array.isArray(source.applied) ? source.applied.slice() : []
  };
  return clone;
}

function eventToken(event) {
  if (event && event.id !== undefined && event.id !== null) return "id:" + String(event.id);
  return "ev:" + JSON.stringify(event);
}

function bumpCount(counts, version) {
  for (let i = 0; i < counts.length; i += 1) {
    if (counts[i][0] === version) {
      counts[i][1] += 1;
      return;
    }
  }
  let at = 0;
  while (at < counts.length && counts[at][0] < version) at += 1;
  counts.splice(at, 0, [version, 1]);
}

function recordFrame(state, entry) {
  const version = versionOf(entry[1]);
  state.records.push([entry[1], version]);
  bumpCount(state.counts, version);
  if (entry[TOKEN] !== undefined) state.applied.push(entry[TOKEN]);
}

export function step(spec) {
  const events = Array.isArray(spec && spec.events) ? spec.events : [];
  const budget = Number.isFinite(spec && spec.budget) ? Math.max(0, Math.trunc(spec.budget)) : 0;
  const top = Number.isFinite(spec && spec.top) ? spec.top : Infinity;
  const state = cloneState(spec && spec.state);
  const seen = new Set();
  let served = 0;

  for (const event of events) {
    if (!event || typeof event !== "object" || Array.isArray(event)
        || event.kind !== "frame") {
      fail(spec, "event_error_code", "E_BAD_EVENT", "事件结构不合法");
    }
    const hex = event.hex;
    const version = versionOf(hex);
    const reserved = reservedOf(hex);
    if (version < 0 || reserved < 0) {
      fail(spec, "bad_frame_code", "E_BAD_FRAME", "帧头不是两位十六进制");
    }
    if (version > top) {
      fail(spec, "bad_version_code", "E_BAD_VERSION", "版本号超过上限");
    }
    if (reserved !== 0) {
      fail(spec, "bad_reserved_code", "E_BAD_RESERVED", "保留位必须为零");
    }

    const token = eventToken(event);
    if (state.applied.indexOf(token) !== -1 || seen.has(token)) {
      seen.add(token);
      continue;
    }

    if (served >= budget) {
      const entry = [event.kind, hex];
      entry[TOKEN] = token;
      state.ledger.push(entry);
      continue;
    }

    recordFrame(state, entryOf(event, hex, token));
    seen.add(token);
    served += 1;
  }

  return {
    state: state,
    served: served,
    ledger_before: state.ledger.length,
    ledger: state.ledger.map(function (row) { return [row[0], row[1]]; }),
    judged: served,
    judged_bound: events.length
  };
}

function entryOf(event, hex, token) {
  const entry = [event.kind, hex];
  entry[TOKEN] = token;
  return entry;
}

export function close(spec) {
  const state = cloneState(spec && spec.state);
  let catchup = 0;
  while (state.ledger.length > 0) {
    recordFrame(state, state.ledger.shift());
    catchup += 1;
  }
  return { state: state, catchup: catchup };
}
