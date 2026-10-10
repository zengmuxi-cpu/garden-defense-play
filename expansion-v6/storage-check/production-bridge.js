
(function () {
  if (window.__dewkeepersProgressV6) return;
  const DB = 'dewkeepers-expansion-progress-v1';
  const replies = new Map(), active = new Map();
  function done(id, result) { if (!replies.has(id)) replies.set(id, JSON.stringify(result)); active.delete(id); }
  function request(id, operation, expected, candidate, previous) {
    let idb;
    try { idb = window.indexedDB; } catch (error) { done(id, {error:error.name || 'unavailable'}); return; }
    if (!idb) { done(id, {error:'unavailable'}); return; }
    let db, tx, finished = false, timedOut = false;
    const timer = setTimeout(function () {
      timedOut = true;
      if (tx) { try { tx.abort(); } catch (_) { /* Wait for its authoritative terminal event. */ } }
      else finish({error:'timeout'});
    }, 15000);
    function finish(value) { if (finished) return; finished = true; clearTimeout(timer); if (db) db.close(); done(id, value); }
    let open;
    try { open = idb.open(DB, 1); } catch (error) { finish({error:error.name || 'open'}); return; }
    open.onupgradeneeded = function () { open.result.createObjectStore('slots'); };
    open.onerror = function () { finish({error:open.error ? open.error.name : 'open'}); };
    open.onblocked = function () { finish({error:'blocked'}); };
    open.onsuccess = function () {
      db = open.result;
      if (finished) { db.close(); return; }
      db.onversionchange = function () { db.close(); };
      try {
        try { tx = db.transaction('slots', operation === 'load' ? 'readonly' : 'readwrite', {durability:'strict'}); }
        catch (error) { if (!(error instanceof TypeError)) throw error; tx = db.transaction('slots', operation === 'load' ? 'readonly' : 'readwrite'); }
        active.set(id, tx);
        const slots = tx.objectStore('slots');
        let result = {}, current = '', backup = '', conflict = false;
        tx.onabort = function () { finish({error: conflict ? 'conflict' : (timedOut ? 'timeout' : (tx.error ? tx.error.name : 'io'))}); };
        tx.onerror = function () {}; // onabort is the authoritative failure.
        tx.oncomplete = function () { finish(result); };
        const read = slots.get('current');
        read.onsuccess = function () {
          current = read.result === undefined ? '' : read.result;
          if (operation === 'load') {
            const old = slots.get('backup');
            old.onsuccess = function () { backup = old.result === undefined ? '' : old.result; result = {current, backup}; };
          } else {
            // Retrying the exact already committed bytes is safe after a lost acknowledgement.
            if (current === candidate) { result = {current, duplicate:true}; return; }
            if (current !== expected) { conflict = true; tx.abort(); return; }
            if (previous) slots.put(previous, 'backup');
            slots.put(candidate, 'current');
            result = {current:candidate};
          }
        };
      } catch (error) { if (tx) { try { tx.abort(); } catch (_) {} } finish({error:error.name || 'io'}); }
    };
  }
  window.addEventListener('beforeunload', function (event) {
    if (active.size) { event.preventDefault(); event.returnValue = ''; }
  });
  window.__dewkeepersProgressV6 = {database:DB, request,
    take: function (id) { const reply = replies.get(id); if (reply === undefined) return ''; replies.delete(id); return reply; }};
})();
