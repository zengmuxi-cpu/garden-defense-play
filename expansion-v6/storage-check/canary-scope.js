/* Diagnostic dependency injection only. No production source modifications. */
(function () {
  'use strict';
  const PRODUCTION = 'dewkeepers-expansion-progress-v1';
  const PREFIX = 'dewkeepers-v6-disposable-canary-';
  const state = { run: '', permit: null, log: [], transactions: new Map(), bufferedReplies: new Map(), firstReplies: new Map() };
  let bridgeTake;
  let nativeFactory, nativeError;
  try { nativeFactory = window.indexedDB; } catch (error) { nativeError = error; }
  const nativeOpen = nativeFactory && nativeFactory.open.bind(nativeFactory);
  const fail = message => { throw new DOMException(message, 'SecurityError'); };
  function note(kind, details) { state.log.push(Object.assign({ kind, time: new Date().toISOString() }, details || {})); }
  function captureReply(id) {
    if (!bridgeTake || state.bufferedReplies.has(id) || state.firstReplies.has(id)) return;
    const raw = bridgeTake(id);
    if (!raw) return;
    const record = state.transactions.get(id);
    const terminal = record ? record.terminal : null;
    state.bufferedReplies.set(id, raw);
    state.firstReplies.set(id, terminal);
    note('first-reply-observed', { id, terminal, reply: JSON.parse(raw) });
  }
  function afterCallback(handler, facade, event, permit) {
    try { if (handler) handler.call(facade, { type: event.type, target: facade, currentTarget: facade }); }
    finally { captureReply(permit.id); }
  }
  function wrapRequest(request, permit) {
    const facade = {};
    Object.defineProperties(facade, {
      result: { get: () => request.result }, error: { get: () => request.error },
      onsuccess: { set: handler => { request.onsuccess = event => afterCallback(handler, facade, event, permit); } },
      onerror: { set: handler => { request.onerror = event => afterCallback(handler, facade, event, permit); } }
    });
    return facade;
  }
  function wrapTransaction(tx, permit) {
    const record = { id: permit.id, mode: tx.mode, durability: tx.durability || 'not reported', terminal: null, puts: 0 };
    state.transactions.set(permit.id, record);
    note('transaction-start', record);
    tx.addEventListener('complete', () => { record.terminal = 'complete'; note('transaction-complete', { id: permit.id }); });
    tx.addEventListener('abort', () => { record.terminal = 'abort'; note('transaction-abort', { id: permit.id, error: tx.error ? tx.error.name : null }); });
    const facade = {
      abort: () => tx.abort(),
      objectStore(name) {
        if (name !== 'slots') fail('Only the synthetic slots store is permitted.');
        const store = tx.objectStore(name);
        return Object.freeze({
          get(key) {
            if (key !== 'current' && key !== 'backup') fail('Only known synthetic keys are permitted.');
            return wrapRequest(store.get(key), permit);
          },
          put(value, key) {
            if (permit.mode !== 'write' || (key !== 'current' && key !== 'backup')) fail('Write outside the explicit canary action.');
            if (typeof value !== 'string' || value.length > 4096 || !value.startsWith('{"probe":"dewkeepers-v6-canary"')) fail('Only bounded synthetic payloads are permitted.');
            const request = store.put(value, key);
            record.puts++;
            note('put-enqueued', { id: permit.id, key });
            if (permit.abortAfterFirstPut && record.puts === 1) {
              request.addEventListener('success', () => {
                note('first-put-success-then-injected-abort', { id: permit.id, key });
                tx.abort();
              });
            }
            return wrapRequest(request, permit);
          }
        });
      }
    };
    Object.defineProperty(facade, 'error', { get: () => tx.error });
    for (const key of ['onabort', 'onerror', 'oncomplete']) Object.defineProperty(facade, key, {
      set: handler => { tx[key] = event => afterCallback(handler, facade, event, permit); }
    });
    return facade;
  }
  function wrapDatabase(db, permit) {
    const facade = {
      close: () => db.close(),
      createObjectStore(name) {
        if (!permit.create || name !== 'slots') fail('Schema creation was not approved by Start.');
        note('create-synthetic-store', { id: permit.id, database: PREFIX + state.run, name });
        db.createObjectStore(name);
      },
      transaction(name, mode, options) {
        if (name !== 'slots' || !['readonly', 'readwrite'].includes(mode)) fail('Unexpected transaction scope.');
        if (mode === 'readwrite' && permit.mode !== 'write') fail('This action is read-only.');
        const tx = options === undefined ? db.transaction(name, mode) : db.transaction(name, mode, options);
        return wrapTransaction(tx, permit);
      }
    };
    Object.defineProperty(facade, 'onversionchange', { set: value => { db.onversionchange = value; } });
    return facade;
  }
  const guardedFactory = Object.freeze({
    open(requestedName, version) {
      const permit = state.permit;
      state.permit = null;
      if (!permit || !state.run) fail('Click a page action before opening storage.');
      if (requestedName !== PRODUCTION || version !== 1) fail('Unexpected database name/version; no native open performed.');
      if (nativeError) throw nativeError;
      if (!nativeOpen) throw new DOMException('IndexedDB is unavailable.', 'NotSupportedError');
      const actualName = PREFIX + state.run;
      note('mapped-open', { id: permit.id, requestedName, actualName, version, allowCreate: permit.create, mode: permit.mode });
      const native = nativeOpen(actualName, version);
      const handlers = {};
      let wrapped, sawUpgrade = false;
      const facade = {};
      Object.defineProperties(facade, {
        result: { get: () => wrapped || (wrapped = wrapDatabase(native.result, permit)) },
        error: { get: () => native.error }
      });
      for (const key of ['onupgradeneeded', 'onsuccess', 'onerror', 'onblocked']) {
        Object.defineProperty(facade, key, { set: handler => { handlers[key] = handler; } });
        native[key] = function (event) {
          if (key === 'onupgradeneeded') {
            sawUpgrade = true;
            if (!permit.create) {
              note('missing-canary-upgrade-aborted', { id: permit.id });
              native.transaction.abort();
              return;
            }
          }
          if (key === 'onsuccess' && permit.create && !sawUpgrade) {
            native.result.close();
            note('unexpected-existing-canary', { id: permit.id });
            // A random collision must never overwrite an existing database.
            afterCallback(handlers.onerror, facade, event, permit);
            return;
          }
          afterCallback(handlers[key], facade, event, permit);
        };
      }
      return facade;
    }
  });
  Object.defineProperty(window, 'indexedDB', { value: guardedFactory, writable: false, configurable: false });
  window.DewkeepersCanaryScope = Object.freeze({
    observeBridge(bridge) {
      if (bridgeTake) fail('Bridge observation is already installed.');
      bridgeTake = bridge.take.bind(bridge);
    },
    take(id) {
      captureReply(id);
      const value = state.bufferedReplies.get(id) || '';
      state.bufferedReplies.delete(id);
      return value;
    },
    setRun(run) {
      if (!/^[a-f0-9]{32}$/.test(run) || (state.run && state.run !== run)) fail('Invalid or changing canary run.');
      state.run = run;
    },
    permit(id, options) {
      if (state.permit) fail('A previous permit was not consumed.');
      if (!['read', 'write'].includes(options.mode) || (options.create && options.mode !== 'write')) fail('Invalid canary permit.');
      state.permit = Object.freeze({ id, mode: options.mode, create: options.create === true, abortAfterFirstPut: options.abortAfterFirstPut === true });
    },
    confirmReply(id, reply) {
      const record = state.transactions.get(id);
      if (!reply.error && (!record || record.terminal !== 'complete' || state.firstReplies.get(id) !== 'complete')) fail('Success arrived before transaction completion.');
      note('bridge-reply', { id, reply, terminal: record ? record.terminal : null });
    },
    report: () => JSON.parse(JSON.stringify({ database: state.run ? PREFIX + state.run : null, events: state.log })),
    transaction: id => JSON.parse(JSON.stringify(state.transactions.get(id) || null))
  });
})();
