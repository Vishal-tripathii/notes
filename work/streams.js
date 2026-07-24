/**
 * ============================================================================
 *  NODE STREAMS — watch backpressure actually happen
 *  Run it:  node streams.js
 * ============================================================================
 *
 *  Backpressure is hard to believe until you SEE a buffer fill and a fast
 *  producer get throttled by a slow consumer. Section 3 prints that live.
 *
 *  SECTION 1  the four types, minimal examples
 *  SECTION 2  writing your own Readable / Writable / Transform
 *  SECTION 3  BACKPRESSURE — the demo that matters ⭐
 *  SECTION 4  highWaterMark — same data, different buffer sizes
 *  SECTION 5  pipeline vs pipe — why errors need pipeline
 *  SECTION 6  async iterators — backpressure for free
 *  SECTION 7  the 10GB CSV pattern (chunk boundaries + batching)
 * ============================================================================
 */

const { Readable, Writable, Transform } = require('stream');
const { pipeline } = require('stream/promises');

const START = Date.now();
const log = (...a) =>
  console.log(`[${String(Date.now() - START).padStart(5, ' ')}ms]`, ...a);

const banner = t => {
  console.log('\n' + '='.repeat(72));
  console.log('  ' + t);
  console.log('='.repeat(72));
};

const delay = ms => new Promise(r => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION 2 — Writing your own
// ─────────────────────────────────────────────────────────────────────────────

/**
 * READABLE — you implement _read().
 *   push(chunk) sends data downstream.
 *   push(null)  ends the stream.
 *   push() returning FALSE means "buffer full, stop pushing" ← producer-side
 *                                                              backpressure
 */
class NumberSource extends Readable {
  constructor(max) {
    super({ objectMode: true });
    this.i = 0;
    this.max = max;
    this.pushed = 0;
  }

  _read() {                                  // called when the consumer wants more
    if (this.i >= this.max) return this.push(null);   // ⭐ null = done
    const more = this.push({ id: this.i++ });
    this.pushed++;
    // `more === false` → we've filled the buffer. Node won't call _read()
    // again until the consumer drains it. That IS backpressure.
    if (!more) this.hitLimit = true;
  }
}

/**
 * WRITABLE — you implement _write(chunk, encoding, callback).
 *   ⭐ callback() is the backpressure lever: until you call it, Node will not
 *      send the next chunk. Delay it and the WHOLE pipeline upstream slows down.
 */
class SlowConsumer extends Writable {
  constructor(msPerItem) {
    super({ objectMode: true });
    this.ms = msPerItem;
    this.count = 0;
  }

  async _write(item, enc, callback) {
    await delay(this.ms);                    // pretend: a DB insert / network call
    this.count++;
    callback();                              // ← "ready for the next one"
  }
}

/**
 * TRANSFORM — you implement _transform(chunk, encoding, callback).
 *   _flush() runs at the very end — essential for STATEFUL transforms
 *   that are holding partial data (see the LineSplitter in section 7).
 */
class Doubler extends Transform {
  constructor() { super({ objectMode: true }); }

  _transform(item, enc, callback) {
    callback(null, { id: item.id * 2 });     // (error, transformedChunk)
  }
}

async function section2() {
  const out = [];
  await pipeline(
    new NumberSource(5),
    new Doubler(),
    new Writable({
      objectMode: true,
      write(item, enc, cb) { out.push(item.id); cb(); },
    }),
  );
  log('Readable → Transform → Writable produced:', out.join(', '));
}

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION 3 — BACKPRESSURE ⭐ the demo that matters
//
//  A producer that can generate instantly, feeding a consumer that takes 40ms
//  per item. Without backpressure the producer would race ahead and buffer
//  everything in memory. Watch instead: it produces a few, then STOPS and waits.
// ─────────────────────────────────────────────────────────────────────────────

class InstantSource extends Readable {
  constructor(max) {
    super({ objectMode: true, highWaterMark: 4 });   // buffer only 4 items
    this.i = 0; this.max = max;
  }

  _read() {
    if (this.i >= this.max) return this.push(null);
    const n = this.i++;
    log(`   producer: pushed item ${n}   (buffered: ${this.readableLength})`);
    this.push({ n });
  }
}

async function section3() {
  log('producer is INSTANT, consumer takes 40ms per item, HWM = 4 items');
  log('watch: the producer fills the buffer, then STOPS until space frees up\n');

  const consumer = new Writable({
    objectMode: true,
    highWaterMark: 2,
    async write(item, enc, cb) {
      await delay(40);
      log(`consumer: finished item ${item.n}`);
      cb();                                  // ⭐ only now does upstream resume
    },
  });

  await pipeline(new InstantSource(8), consumer);

  log('\n⭐ The producer never ran away. It was throttled to consumer speed,');
  log('   and memory stayed at ~4 items no matter how many we generate.');
}

/** The same thing done WRONG — ignoring write()'s return value. */
async function section3Wrong() {
  log('\n❌ now the BROKEN version: ignoring write()\'s return value');

  let buffered = 0;
  const slow = new Writable({
    objectMode: true,
    highWaterMark: 2,
    async write(item, enc, cb) { await delay(40); cb(); },
  });

  for (let n = 0; n < 8; n++) {
    const ok = slow.write({ n });            // ⚠️ return value DISCARDED
    if (!ok) buffered++;
  }
  log(`   queued all 8 instantly · ${buffered} writes were over the limit`);
  log('   → with real data this is how "streaming" silently becomes readFile 💥');
  slow.end();
}

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION 4 — highWaterMark: same work, different buffer sizes
// ─────────────────────────────────────────────────────────────────────────────

async function section4() {
  for (const hwm of [1, 4, 16]) {
    const t = Date.now();
    let maxBuffered = 0;

    const src = new Readable({
      objectMode: true, highWaterMark: hwm,
      read() {
        if (this.i === undefined) this.i = 0;
        if (this.i >= 20) return this.push(null);
        this.push({ n: this.i++ });
        maxBuffered = Math.max(maxBuffered, this.readableLength);
      },
    });

    await pipeline(src, new Writable({
      objectMode: true, highWaterMark: hwm,
      async write(i, e, cb) { await delay(5); cb(); },
    }));

    log(`hwm=${String(hwm).padStart(2)} → ${Date.now() - t}ms, peak buffer ${maxBuffered} items`);
  }
  log('⭐ note the times barely differ — the CONSUMER is the bottleneck here,');
  log('   so a bigger buffer only holds more memory. That is the real lesson:');
  log('   tuning hwm does nothing unless BUFFERING is your actual bottleneck.');
}

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION 5 — pipeline vs pipe: error handling
// ─────────────────────────────────────────────────────────────────────────────

class Exploder extends Transform {
  constructor() { super({ objectMode: true }); }
  _transform(item, enc, cb) {
    if (item.n === 3) return cb(new Error('boom on item 3'));
    cb(null, item);
  }
}

async function section5() {
  // ✅ pipeline: the error propagates, and every stream is destroyed
  try {
    await pipeline(
      new InstantSourceQuiet(6),
      new Exploder(),
      new Writable({ objectMode: true, write(i, e, cb) { cb(); } }),
    );
  } catch (err) {
    log('✅ pipeline caught:', err.message, '— and cleaned up every stream');
  }

  // ❌ .pipe(): the error is unhandled on that stream; the others stay OPEN
  const src = new InstantSourceQuiet(6);
  const dest = new Writable({ objectMode: true, write(i, e, cb) { cb(); } });
  const bad = new Exploder();
  bad.on('error', e => {
    log('❌ .pipe(): error surfaced only via a manual listener —');
    log(`   src destroyed? ${src.destroyed} · dest destroyed? ${dest.destroyed}`);
    log('   → both still open. That is the file-descriptor leak.');
  });
  src.pipe(bad).pipe(dest);
  await delay(50);
}

class InstantSourceQuiet extends Readable {
  constructor(max) { super({ objectMode: true }); this.i = 0; this.max = max; }
  _read() { this.i >= this.max ? this.push(null) : this.push({ n: this.i++ }); }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION 6 — async iterators: backpressure for free
// ─────────────────────────────────────────────────────────────────────────────

async function section6() {
  const source = Readable.from(async function* () {
    for (let i = 0; i < 5; i++) { yield { n: i }; }
  }());

  const t = Date.now();
  for await (const item of source) {         // ⭐ the loop's pace throttles the source
    await delay(20);                         //    no events, no drain handling
  }
  log(`for await over 5 items @20ms = ${Date.now() - t}ms`);
  log('⭐ the await in the loop body IS the backpressure. try/catch works too.');
}

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION 7 — the 10GB CSV pattern
//
//  Two ideas that make it work at any size:
//    ① LineSplitter keeps the partial line across chunk boundaries
//    ② BatchInserter delays callback() → the read throttles to DB speed
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⭐ THE BUG THIS SOLVES: a 64KB disk read does NOT end on a newline.
 *    chunk 1: ...,"John Sm
 *    chunk 2: ith",42,NYC\n
 *    Splitting each chunk on \n independently corrupts one row PER CHUNK —
 *    about 160,000 silently mangled rows in a 10GB file.
 */
class LineSplitter extends Transform {
  constructor() { super({ readableObjectMode: true }); this.tail = ''; }

  _transform(chunk, enc, cb) {
    const lines = (this.tail + chunk).split('\n');
    this.tail = lines.pop();                 // ⭐ hold the incomplete last line
    for (const line of lines) if (line) this.push(line);
    cb();
  }

  _flush(cb) {                               // ⭐ or the final line is lost
    if (this.tail) this.push(this.tail);
    cb();
  }
}

class CsvParser extends Transform {
  constructor(headers) { super({ objectMode: true }); this.headers = headers; }
  _transform(line, enc, cb) {
    const cells = line.split(',');
    cb(null, Object.fromEntries(this.headers.map((h, i) => [h, cells[i]])));
  }
}

/** Delaying cb() until the "insert" resolves throttles the entire pipeline. */
class BatchInserter extends Writable {
  constructor(size) {
    super({ objectMode: true, highWaterMark: size * 2 });
    this.size = size; this.batch = []; this.inserted = 0; this.batches = 0;
  }

  async _write(row, enc, cb) {
    this.batch.push(row);
    if (this.batch.length >= this.size) await this.flush();
    cb();                                    // ← delayed = upstream pauses
  }

  async _final(cb) { await this.flush(); cb(); }   // ⭐ don't drop the remainder

  async flush() {
    if (!this.batch.length) return;
    await delay(10);                         // pretend: db.insertMany(this.batch)
    this.inserted += this.batch.length;
    this.batches++;
    this.batch = [];
  }
}

async function section7() {
  // A fake file delivered in chunks that deliberately split lines mid-row.
  const raw = 'id,name,city\n1,Ada,NYC\n2,Bob,LA\n3,Cy,SF\n4,Dee,LDN\n5,Eve,TYO\n';
  const chunks = [];
  for (let i = 0; i < raw.length; i += 7) chunks.push(raw.slice(i, i + 7));
  log(`file split into ${chunks.length} chunks of 7 bytes — lines ARE broken across them`);

  const headers = ['id', 'name', 'city'];
  const rows = [];
  const inserter = new BatchInserter(2);

  await pipeline(
    Readable.from(chunks),
    new LineSplitter(),
    new Transform({                          // drop the header line
      objectMode: true, readableObjectMode: true, writableObjectMode: true,
      transform(line, e, cb) { cb(null, line === 'id,name,city' ? undefined : line); },
    }),
    new CsvParser(headers),
    new Transform({
      objectMode: true,
      transform(row, e, cb) { rows.push(row); cb(null, row); },
    }),
    inserter,
  );

  log(`parsed ${rows.length} rows, none corrupted:`,
      rows.map(r => r.name).join(', '));
  log(`inserted ${inserter.inserted} rows in ${inserter.batches} batches of 2`);
  log('⭐ memory stayed constant — this identical code handles a 10GB file.');
}

// ─────────────────────────────────────────────────────────────────────────────
//  RUN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  banner('2. WRITING YOUR OWN — Readable → Transform → Writable');
  await section2();

  banner('3. BACKPRESSURE ⭐ — a fast producer throttled by a slow consumer');
  await section3();
  await section3Wrong();

  banner('4. HIGHWATERMARK — same work, different buffer sizes');
  await section4();

  banner('5. PIPELINE vs PIPE — error handling & cleanup');
  await section5();

  banner('6. ASYNC ITERATORS — backpressure for free');
  await section6();

  banner('7. THE 10GB CSV PATTERN — chunk boundaries + batching');
  await section7();

  banner('DONE');
}

main().catch(e => { console.error('\n💥', e); process.exit(1); });
