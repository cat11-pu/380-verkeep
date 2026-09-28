// headrun.js：按共用处理预算解析报文头，用尽预算的事件连着载压账，收尾补齐
import { versionOf, reservedOf, isFrame } from "./head.js";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function cloneState(state) {
  const src = state || {};
  return {
    records: (src.records || []).map(function (row) { return [row[0], row[1]]; }),
    counts: (src.counts || []).map(function (row) { return [row[0], row[1]]; }),
    ledger: (src.ledger || []).map(function (row) { return [row[0], row[1]]; }),
    applied: (src.applied || []).slice()
  };
}

function bumpCount(counts, version) {
  for (let i = 0; i < counts.length; i += 1) {
    if (counts[i][0] === version) {
      counts[i][1] += 1;
      return;
    }
  }
  counts.push([version, 1]);
  counts.sort(function (a, b) { return a[0] - b[0]; });
}

function eventKey(event, index) {
  return event && event.id !== undefined && event.id !== null ? event.id : "evt:" + index;
}

export function step(spec) {
  const state = cloneState(spec.state);
  const events = Array.isArray(spec.events) ? spec.events : [];
  const budget = Number.isFinite(spec.budget) ? Math.max(0, Math.trunc(spec.budget)) : 0;
  const top = Number.isFinite(spec.top) ? spec.top : Infinity;
  const codes = spec || {};
  const badFrame = codes.bad_frame_code || "E_BAD_FRAME";
  const badVersion = codes.bad_version_code || "E_BAD_VERSION";
  const badReserved = codes.bad_reserved_code || "E_BAD_RESERVED";
  const badEvent = codes.event_error_code || "E_BAD_EVENT";

  let served = 0;

  events.forEach(function (event, index) {
    if (!event || typeof event !== "object" || Array.isArray(event) || event.kind !== "frame") {
      fail(badEvent, "事件结构不合法");
    }
    if (!isFrame(event.hex)) {
      fail(badFrame, "报文头必须正好是两位十六进制字符");
    }
    const key = eventKey(event, index);
    if (state.applied.indexOf(key) !== -1) return;
    state.applied.push(key);

    const version = versionOf(event.hex);
    const reserved = reservedOf(event.hex);
    if (version > top) {
      fail(badVersion, "版本号超过版本上限");
    }
    if (reserved !== 0) {
      fail(badReserved, "保留位必须为零");
    }
    if (served < budget) {
      state.records.push([event.hex, version]);
      bumpCount(state.counts, version);
      served += 1;
    } else {
      state.ledger.push([event.kind, event.hex]);
    }
  });

  const judged = state.applied.length;
  return {
    state: state,
    served: served,
    ledger_before: state.ledger.length,
    ledger: state.ledger.map(function (row) { return [row[0], row[1]]; }),
    judged: judged,
    judged_bound: state.applied.length + state.ledger.length
  };
}

export function close(spec) {
  const state = cloneState(spec.state);
  const top = Number.isFinite(spec.top) ? spec.top : Infinity;
  const codes = spec || {};
  const badVersion = codes.bad_version_code || "E_BAD_VERSION";
  const badReserved = codes.bad_reserved_code || "E_BAD_RESERVED";

  let catchup = 0;
  while (state.ledger.length > 0) {
    const row = state.ledger.shift();
    const hex = row[1];
    const version = versionOf(hex);
    const reserved = reservedOf(hex);
    if (version > top) {
      const error = new Error("版本号超过版本上限");
      error.code = badVersion;
      throw error;
    }
    if (reserved !== 0) {
      const error = new Error("保留位必须为零");
      error.code = badReserved;
      throw error;
    }
    state.records.push([hex, version]);
    bumpCount(state.counts, version);
    catchup += 1;
  }

  return { state: state, catchup: catchup };
}
