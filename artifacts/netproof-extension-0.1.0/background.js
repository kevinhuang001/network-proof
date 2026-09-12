var Fr = Object.defineProperty;
var Dr = (e, t, n) => t in e ? Fr(e, t, { enumerable: !0, configurable: !0, writable: !0, value: n }) : e[t] = n;
var l = (e, t, n) => Dr(e, typeof t != "symbol" ? t + "" : t, n);
class dt extends Error {
  constructor(n, r, i) {
    super(r);
    l(this, "code");
    l(this, "details");
    this.name = "NetProofError", this.code = n, this.details = i;
  }
}
const Vt = BigInt(2 ** 32 - 1), nn = /* @__PURE__ */ BigInt(32);
function $r(e, t = !1) {
  return t ? { h: Number(e & Vt), l: Number(e >> nn & Vt) } : { h: Number(e >> nn & Vt) | 0, l: Number(e & Vt) | 0 };
}
function Nn(e, t = !1) {
  const n = e.length;
  let r = new Uint32Array(n), i = new Uint32Array(n);
  for (let o = 0; o < n; o++) {
    const { h: s, l: a } = $r(e[o], t);
    [r[o], i[o]] = [s, a];
  }
  return [r, i];
}
const kr = (e) => e / 2 ** 32 | 0, Mr = (e) => e >>> 0;
function Pr(e, t, n, r) {
  const i = kr(n), o = Mr(n);
  e.setUint32(t, r ? o : i, r), e.setUint32(t + 4, r ? i : o, r);
}
const rn = (e, t, n) => e >>> n, on = (e, t, n) => e << 32 - n | t >>> n, It = (e, t, n) => e >>> n | t << 32 - n, St = (e, t, n) => e << 32 - n | t >>> n, Jt = (e, t, n) => e << 64 - n | t >>> n - 32, Qt = (e, t, n) => e >>> n - 32 | t << 64 - n;
function ct(e, t, n, r) {
  const i = (t >>> 0) + (r >>> 0);
  return { h: e + n + (i / 2 ** 32 | 0) | 0, l: i | 0 };
}
const Kr = (e, t, n) => (e >>> 0) + (t >>> 0) + (n >>> 0), qr = (e, t, n, r) => t + n + r + (e / 2 ** 32 | 0) | 0, jr = (e, t, n, r) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0), Yr = (e, t, n, r, i) => t + n + r + i + (e / 2 ** 32 | 0) | 0, Zr = (e, t, n, r, i) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0) + (i >>> 0), zr = (e, t, n, r, i, o) => t + n + r + i + o + (e / 2 ** 32 | 0) | 0;
function Re(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
const ce = (e) => e ? `"${e}" ` : "";
function V(e, t = "") {
  if (typeof e != "number")
    throw new TypeError(ce(t) + "expected number, got " + typeof e);
  if (!Number.isSafeInteger(e) || e < 0)
    throw new RangeError(ce(t) + "expected integer >= 0, got " + e);
  return e;
}
function Xr(e, t = "") {
  if (typeof e != "boolean")
    throw new TypeError(ce(t) + "expected boolean, got type=" + typeof e);
  return e;
}
function Y(e, t, n = "") {
  if (Re(e) && (t === void 0 || e.length === t))
    return e;
  t !== void 0 && V(t, "length");
  const r = Re(e), i = t !== void 0 ? ` of length ${t}` : "", o = r ? `length=${e.length}` : `type=${typeof e}`, s = ce(n) + "expected Uint8Array" + i + ", got " + o;
  throw r ? new RangeError(s) : new TypeError(s);
}
function Fn(e) {
  if (typeof e != "function" || typeof e.create != "function")
    throw new TypeError("expected hash wrapped by utils.createHasher");
  if (V(e.outputLen), V(e.blockLen), e.outputLen < 1 || e.blockLen < 1)
    throw new Error("hash blockLen / outputLen must be >= 1");
}
const Gr = (e, t) => {
  if (e === null || typeof e != "object" || Array.isArray(e))
    throw new TypeError((t === "object" ? "" : `"${t}" `) + "expected object, got type=" + typeof e);
}, sn = (e, t) => {
  Gr(e, t);
  const n = Object.getPrototypeOf(e);
  if (n !== Object.prototype && n !== null)
    throw new TypeError(`"${t}" expected plain object`);
  if (Object.hasOwn(e, "__proto__"))
    throw new TypeError(`"${t}.__proto__" is not allowed`);
};
function Lt(e, t = !0) {
  if (e.destroyed)
    throw new Error("hash was destroyed");
  if (t && e.finished)
    throw new Error("digest() was already called");
}
function Ue(e, t) {
  Y(e, void 0, "output");
  const n = t.outputLen;
  if (!(e.length >= n))
    throw new RangeError('"output" expected length >= ' + n);
}
function cn(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function ut(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
function Ht(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function rt(e, t) {
  return e << 32 - t | e >>> t;
}
function te(e, t) {
  return e << t | e >>> 32 - t >>> 0;
}
const Wr = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
function Vr(e) {
  return e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255;
}
function Jr(e) {
  for (let t = 0; t < e.length; t++)
    e[t] = Vr(e[t]);
  return e;
}
const an = Wr ? (e) => e : Jr, Dn = /* @ts-ignore */ typeof Uint8Array.from([]).toHex == "function" && typeof Uint8Array.fromHex == "function", Qr = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0"));
function Le(e) {
  if (Y(e), Dn)
    return e.toHex();
  let t = "";
  for (let n = 0; n < e.length; n++)
    t += Qr[e[n]];
  return t;
}
function fn(e) {
  return e >= 48 && e <= 57 ? e - 48 : e >= 65 && e <= 70 ? e - 55 : e >= 97 && e <= 102 ? e - 87 : void 0;
}
function $n(e) {
  if (typeof e != "string")
    throw new TypeError("hex string expected, got " + typeof e);
  if (Dn)
    try {
      return Uint8Array.fromHex(e);
    } catch (i) {
      throw i instanceof SyntaxError ? new RangeError(i.message) : i;
    }
  const t = e.length, n = t / 2;
  if (t % 2)
    throw new RangeError("hex string expected, got unpadded hex of length " + t);
  const r = new Uint8Array(n);
  for (let i = 0, o = 0; i < n; i++, o += 2) {
    const s = fn(e.charCodeAt(o)), a = fn(e.charCodeAt(o + 1));
    if (s === void 0 || a === void 0) {
      const c = e[o] + e[o + 1];
      throw new RangeError('hex string expected, got non-hex character "' + c + '" at index ' + o);
    }
    r[i] = s * 16 + a;
  }
  return r;
}
function Mt(...e) {
  let t = 0;
  for (let r = 0; r < e.length; r++) {
    const i = e[r];
    Y(i), t += i.length;
  }
  const n = new Uint8Array(t);
  for (let r = 0, i = 0; r < e.length; r++) {
    const o = e[r];
    n.set(o, i), i += o.length;
  }
  return n;
}
function ti(e, t, n = "opts") {
  return sn(e, "defaults"), t !== void 0 && sn(t, n), Object.assign(/* @__PURE__ */ Object.create(null), e, t);
}
function de(e, t = {}) {
  if (typeof e != "function")
    throw new TypeError('"hashCons" expected function, got type=' + typeof e);
  t = ti({}, t, "info");
  const n = (i, o) => e(o).update(i).digest(), r = e(void 0);
  return n.outputLen = r.outputLen, n.blockLen = r.blockLen, n.canXOF = r.canXOF, n.create = (i) => e(i), Object.assign(n, t), Object.freeze(n);
}
function ei(e = 32) {
  V(e, "bytesLength");
  const t = typeof globalThis == "object" ? globalThis.crypto : null;
  if (typeof (t == null ? void 0 : t.getRandomValues) != "function")
    throw new Error("crypto.getRandomValues must be defined");
  if (e > 65536)
    throw new RangeError(`"bytesLength" expected <= 65536, got ${e}`);
  return t.getRandomValues(new Uint8Array(e));
}
const kn = (e) => ({
  // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
  // Larger suffix values would need base-128 OID encoding and a different length byte.
  oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, e])
});
function ni(e, t, n) {
  return e & t ^ ~e & n;
}
function ri(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
class Ne {
  constructor(t, n, r, i) {
    l(this, "blockLen");
    l(this, "outputLen");
    l(this, "canXOF", !1);
    l(this, "padOffset");
    l(this, "isLE");
    // For partial updates less than block size
    l(this, "buffer");
    l(this, "view");
    l(this, "finished", !1);
    l(this, "length", 0);
    l(this, "pos", 0);
    l(this, "destroyed", !1);
    this.blockLen = t, this.outputLen = n, this.padOffset = r, this.isLE = i, this.buffer = new Uint8Array(t), this.view = Ht(this.buffer);
  }
  update(t) {
    Lt(this), Y(t);
    const { view: n, buffer: r, blockLen: i } = this, o = t.length;
    let s = !1;
    for (let a = 0; a < o; ) {
      const c = Math.min(i - this.pos, o - a);
      if (c === i) {
        const f = Ht(t);
        for (; i <= o - a; a += i)
          this.process(f, a);
        s = !0;
        continue;
      }
      r.set(a === 0 && c === o ? t : t.subarray(a, a + c), this.pos), this.pos += c, a += c, this.pos === i && (this.process(n, 0), this.pos = 0, s = !0);
    }
    return this.length += t.length, s && this.roundClean(), this;
  }
  digestInto(t) {
    Lt(this), Ue(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, n.fill(0, s), this.padOffset > i - s && (this.process(r, 0), n.fill(0)), Pr(r, i - 8, this.length * 8, o), this.process(r, 0), this.roundClean();
    const a = t === n ? r : Ht(t), c = this.outputLen, f = c / 4, d = this.get();
    if (c % 4 || f > d.length)
      throw new Error("invalid outputLen");
    for (let b = 0; b < f; b++)
      a.setUint32(4 * b, d[b], o);
  }
  digest() {
    const { buffer: t, outputLen: n } = this;
    this.digestInto(t);
    const r = t.slice(0, n);
    return this.destroy(), r;
  }
  _cloneIntoMeta(t) {
    const { buffer: n, length: r, finished: i, destroyed: o, pos: s } = this;
    return t.destroyed = o, t.finished = i, t.length = r, t.pos = s, s && t.buffer.set(n), t;
  }
  clone() {
    return this._cloneInto();
  }
}
const ii = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), oi = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  4089235720,
  3144134277,
  2227873595,
  1013904242,
  4271175723,
  2773480762,
  1595750129,
  1359893119,
  2917565137,
  2600822924,
  725511199,
  528734635,
  4215389547,
  1541459225,
  327033209
]), si = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]), pt = /* @__PURE__ */ new Uint32Array(64);
class ci extends Ne {
  constructor(n, r) {
    super(64, n, 8, !1);
    // We cannot use array here since array allows indexing by variable
    // which means optimizer/compiler cannot use registers.
    // Numeric initializers matter: starting the fields as `undefined` changes
    // V8's field representation and makes sha256 3x slower (measured).
    l(this, "A", 0);
    l(this, "B", 0);
    l(this, "C", 0);
    l(this, "D", 0);
    l(this, "E", 0);
    l(this, "F", 0);
    l(this, "G", 0);
    l(this, "H", 0);
    this.A = r[0] | 0, this.B = r[1] | 0, this.C = r[2] | 0, this.D = r[3] | 0, this.E = r[4] | 0, this.F = r[5] | 0, this.G = r[6] | 0, this.H = r[7] | 0;
  }
  get() {
    const { A: n, B: r, C: i, D: o, E: s, F: a, G: c, H: f } = this;
    return [n, r, i, o, s, a, c, f];
  }
  // prettier-ignore
  set(n, r, i, o, s, a, c, f) {
    this.A = n | 0, this.B = r | 0, this.C = i | 0, this.D = o | 0, this.E = s | 0, this.F = a | 0, this.G = c | 0, this.H = f | 0;
  }
  _cloneInto(n) {
    return (n || (n = new this.constructor())).set(...this.get()), this._cloneIntoMeta(n);
  }
  process(n, r) {
    for (let p = 0; p < 16; p++, r += 4)
      pt[p] = n.getUint32(r, !1);
    for (let p = 16; p < 64; p++) {
      const w = pt[p - 15], h = pt[p - 2], E = rt(w, 7) ^ rt(w, 18) ^ w >>> 3, x = rt(h, 17) ^ rt(h, 19) ^ h >>> 10;
      pt[p] = x + pt[p - 7] + E + pt[p - 16] | 0;
    }
    let { A: i, B: o, C: s, D: a, E: c, F: f, G: d, H: b } = this;
    for (let p = 0; p < 64; p++) {
      const w = rt(c, 6) ^ rt(c, 11) ^ rt(c, 25), h = b + w + ni(c, f, d) + si[p] + pt[p] | 0, x = (rt(i, 2) ^ rt(i, 13) ^ rt(i, 22)) + ri(i, o, s) | 0;
      b = d, d = f, f = c, c = a + h | 0, a = s, s = o, o = i, i = h + x | 0;
    }
    i = i + this.A | 0, o = o + this.B | 0, s = s + this.C | 0, a = a + this.D | 0, c = c + this.E | 0, f = f + this.F | 0, d = d + this.G | 0, b = b + this.H | 0, this.set(i, o, s, a, c, f, d, b);
  }
  roundClean() {
    ut(pt);
  }
  destroy() {
    this.destroyed = !0, this.set(0, 0, 0, 0, 0, 0, 0, 0), ut(this.buffer);
  }
}
class ai extends ci {
  constructor() {
    super(32, ii);
  }
}
const Mn = Nn([
  "0x428a2f98d728ae22",
  "0x7137449123ef65cd",
  "0xb5c0fbcfec4d3b2f",
  "0xe9b5dba58189dbbc",
  "0x3956c25bf348b538",
  "0x59f111f1b605d019",
  "0x923f82a4af194f9b",
  "0xab1c5ed5da6d8118",
  "0xd807aa98a3030242",
  "0x12835b0145706fbe",
  "0x243185be4ee4b28c",
  "0x550c7dc3d5ffb4e2",
  "0x72be5d74f27b896f",
  "0x80deb1fe3b1696b1",
  "0x9bdc06a725c71235",
  "0xc19bf174cf692694",
  "0xe49b69c19ef14ad2",
  "0xefbe4786384f25e3",
  "0x0fc19dc68b8cd5b5",
  "0x240ca1cc77ac9c65",
  "0x2de92c6f592b0275",
  "0x4a7484aa6ea6e483",
  "0x5cb0a9dcbd41fbd4",
  "0x76f988da831153b5",
  "0x983e5152ee66dfab",
  "0xa831c66d2db43210",
  "0xb00327c898fb213f",
  "0xbf597fc7beef0ee4",
  "0xc6e00bf33da88fc2",
  "0xd5a79147930aa725",
  "0x06ca6351e003826f",
  "0x142929670a0e6e70",
  "0x27b70a8546d22ffc",
  "0x2e1b21385c26c926",
  "0x4d2c6dfc5ac42aed",
  "0x53380d139d95b3df",
  "0x650a73548baf63de",
  "0x766a0abb3c77b2a8",
  "0x81c2c92e47edaee6",
  "0x92722c851482353b",
  "0xa2bfe8a14cf10364",
  "0xa81a664bbc423001",
  "0xc24b8b70d0f89791",
  "0xc76c51a30654be30",
  "0xd192e819d6ef5218",
  "0xd69906245565a910",
  "0xf40e35855771202a",
  "0x106aa07032bbd1b8",
  "0x19a4c116b8d2d0c8",
  "0x1e376c085141ab53",
  "0x2748774cdf8eeb99",
  "0x34b0bcb5e19b48a8",
  "0x391c0cb3c5c95a63",
  "0x4ed8aa4ae3418acb",
  "0x5b9cca4f7763e373",
  "0x682e6ff3d6b2b8a3",
  "0x748f82ee5defb2fc",
  "0x78a5636f43172f60",
  "0x84c87814a1f0ab72",
  "0x8cc702081a6439ec",
  "0x90befffa23631e28",
  "0xa4506cebde82bde9",
  "0xbef9a3f7b2c67915",
  "0xc67178f2e372532b",
  "0xca273eceea26619c",
  "0xd186b8c721c0c207",
  "0xeada7dd6cde0eb1e",
  "0xf57d4f7fee6ed178",
  "0x06f067aa72176fba",
  "0x0a637dc5a2c898a6",
  "0x113f9804bef90dae",
  "0x1b710b35131c471b",
  "0x28db77f523047d84",
  "0x32caab7b40c72493",
  "0x3c9ebe0a15c9bebc",
  "0x431d67c49c100d4c",
  "0x4cc5d4becb3e42b6",
  "0x597f299cfc657e2a",
  "0x5fcb6fab3ad6faec",
  "0x6c44198c4a475817"
].map((e) => BigInt(e))), fi = Mn[0], di = Mn[1], wt = /* @__PURE__ */ new Uint32Array(80), gt = /* @__PURE__ */ new Uint32Array(80);
class ui extends Ne {
  constructor(n, r) {
    super(128, n, 16, !1);
    // We cannot use array here since array allows indexing by variable
    // which means optimizer/compiler cannot use registers.
    // h -- high 32 bits, l -- low 32 bits
    // Numeric initializers matter: starting the fields as `undefined` changes
    // V8's field representation and slows hashing down (measured on sha256).
    l(this, "Ah", 0);
    l(this, "Al", 0);
    l(this, "Bh", 0);
    l(this, "Bl", 0);
    l(this, "Ch", 0);
    l(this, "Cl", 0);
    l(this, "Dh", 0);
    l(this, "Dl", 0);
    l(this, "Eh", 0);
    l(this, "El", 0);
    l(this, "Fh", 0);
    l(this, "Fl", 0);
    l(this, "Gh", 0);
    l(this, "Gl", 0);
    l(this, "Hh", 0);
    l(this, "Hl", 0);
    this.Ah = r[0] | 0, this.Al = r[1] | 0, this.Bh = r[2] | 0, this.Bl = r[3] | 0, this.Ch = r[4] | 0, this.Cl = r[5] | 0, this.Dh = r[6] | 0, this.Dl = r[7] | 0, this.Eh = r[8] | 0, this.El = r[9] | 0, this.Fh = r[10] | 0, this.Fl = r[11] | 0, this.Gh = r[12] | 0, this.Gl = r[13] | 0, this.Hh = r[14] | 0, this.Hl = r[15] | 0;
  }
  // prettier-ignore
  get() {
    const { Ah: n, Al: r, Bh: i, Bl: o, Ch: s, Cl: a, Dh: c, Dl: f, Eh: d, El: b, Fh: p, Fl: w, Gh: h, Gl: E, Hh: x, Hl: R } = this;
    return [n, r, i, o, s, a, c, f, d, b, p, w, h, E, x, R];
  }
  // prettier-ignore
  set(n, r, i, o, s, a, c, f, d, b, p, w, h, E, x, R) {
    this.Ah = n | 0, this.Al = r | 0, this.Bh = i | 0, this.Bl = o | 0, this.Ch = s | 0, this.Cl = a | 0, this.Dh = c | 0, this.Dl = f | 0, this.Eh = d | 0, this.El = b | 0, this.Fh = p | 0, this.Fl = w | 0, this.Gh = h | 0, this.Gl = E | 0, this.Hh = x | 0, this.Hl = R | 0;
  }
  _cloneInto(n) {
    return (n || (n = new this.constructor())).set(...this.get()), this._cloneIntoMeta(n);
  }
  process(n, r) {
    for (let O = 0; O < 16; O++, r += 4)
      wt[O] = n.getUint32(r), gt[O] = n.getUint32(r += 4);
    for (let O = 16; O < 80; O++) {
      const P = wt[O - 15] | 0, U = gt[O - 15] | 0, K = It(P, U, 1) ^ It(P, U, 8) ^ rn(P, U, 7), it = St(P, U, 1) ^ St(P, U, 8) ^ on(P, U, 7), j = wt[O - 2] | 0, D = gt[O - 2] | 0, ot = It(j, D, 19) ^ Jt(j, D, 61) ^ rn(j, D, 6), et = St(j, D, 19) ^ Qt(j, D, 61) ^ on(j, D, 6), nt = jr(it, et, gt[O - 7], gt[O - 16]), lt = Yr(nt, K, ot, wt[O - 7], wt[O - 16]);
      wt[O] = lt | 0, gt[O] = nt | 0;
    }
    let { Ah: i, Al: o, Bh: s, Bl: a, Ch: c, Cl: f, Dh: d, Dl: b, Eh: p, El: w, Fh: h, Fl: E, Gh: x, Gl: R, Hh: C, Hl: M } = this;
    for (let O = 0; O < 80; O++) {
      const P = It(p, w, 14) ^ It(p, w, 18) ^ Jt(p, w, 41), U = St(p, w, 14) ^ St(p, w, 18) ^ Qt(p, w, 41), K = p & h ^ ~p & x, it = w & E ^ ~w & R, j = Zr(M, U, it, di[O], gt[O]), D = zr(j, C, P, K, fi[O], wt[O]), ot = j | 0, et = It(i, o, 28) ^ Jt(i, o, 34) ^ Jt(i, o, 39), nt = St(i, o, 28) ^ Qt(i, o, 34) ^ Qt(i, o, 39), lt = i & s ^ i & c ^ s & c, st = o & a ^ o & f ^ a & f;
      C = x | 0, M = R | 0, x = h | 0, R = E | 0, h = p | 0, E = w | 0, { h: p, l: w } = ct(d | 0, b | 0, D | 0, ot | 0), d = c | 0, b = f | 0, c = s | 0, f = a | 0, s = i | 0, a = o | 0;
      const xt = Kr(ot, nt, st);
      i = qr(xt, D, et, lt), o = xt | 0;
    }
    ({ h: i, l: o } = ct(this.Ah | 0, this.Al | 0, i | 0, o | 0)), { h: s, l: a } = ct(this.Bh | 0, this.Bl | 0, s | 0, a | 0), { h: c, l: f } = ct(this.Ch | 0, this.Cl | 0, c | 0, f | 0), { h: d, l: b } = ct(this.Dh | 0, this.Dl | 0, d | 0, b | 0), { h: p, l: w } = ct(this.Eh | 0, this.El | 0, p | 0, w | 0), { h, l: E } = ct(this.Fh | 0, this.Fl | 0, h | 0, E | 0), { h: x, l: R } = ct(this.Gh | 0, this.Gl | 0, x | 0, R | 0), { h: C, l: M } = ct(this.Hh | 0, this.Hl | 0, C | 0, M | 0), this.set(i, o, s, a, c, f, d, b, p, w, h, E, x, R, C, M);
  }
  roundClean() {
    ut(wt, gt);
  }
  destroy() {
    this.destroyed = !0, ut(this.buffer), this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
}
class li extends ui {
  constructor() {
    super(64, oi);
  }
}
const Fe = /* @__PURE__ */ de(
  () => new ai(),
  /* @__PURE__ */ kn(1)
), dn = /* @__PURE__ */ de(
  () => new li(),
  /* @__PURE__ */ kn(3)
), hi = new TextEncoder();
new TextDecoder();
function pi(e) {
  return hi.encode(e);
}
const un = "0123456789abcdef";
function ue(e, t = !1) {
  let n = t ? "0x" : "";
  for (let r = 0; r < e.length; r++)
    n += un[e[r] >> 4] + un[e[r] & 15];
  return n;
}
(() => {
  const e = new Uint32Array(256);
  for (let t = 0; t < 256; t++) {
    let n = t;
    for (let r = 0; r < 8; r++) n = n & 1 ? 3988292384 ^ n >>> 1 : n >>> 1;
    e[t] = n >>> 0;
  }
  return e;
})();
pi("netproof-wallet/entropy/v1");
class ln {
  constructor(t, n) {
    l(this, "oHash");
    l(this, "iHash");
    l(this, "blockLen");
    l(this, "outputLen");
    l(this, "canXOF", !1);
    l(this, "finished", !1);
    l(this, "destroyed", !1);
    if (Fn(t), Y(n, void 0, "key"), this.iHash = t.create(), typeof this.iHash.update != "function")
      throw new Error("expected Hash instance");
    this.blockLen = this.iHash.blockLen, this.outputLen = this.iHash.outputLen;
    const r = this.blockLen, i = new Uint8Array(r);
    i.set(n.length > r ? t.create().update(n).digest() : n);
    for (let o = 0; o < i.length; o++)
      i[o] ^= 54;
    this.iHash.update(i), this.oHash = t.create();
    for (let o = 0; o < i.length; o++)
      i[o] ^= 106;
    this.oHash.update(i), ut(i);
  }
  update(t) {
    return Lt(this), this.iHash.update(t), this;
  }
  digestInto(t) {
    Lt(this), Ue(t, this), this.finished = !0;
    const n = t.subarray(0, this.outputLen);
    this.iHash.digestInto(n), this.oHash.update(n), this.oHash.digestInto(n), this.destroy();
  }
  digest() {
    const t = new Uint8Array(this.oHash.outputLen);
    return this.digestInto(t), t;
  }
  _cloneInto(t) {
    t || (t = Object.create(Object.getPrototypeOf(this), {}));
    const { oHash: n, iHash: r, finished: i, destroyed: o, blockLen: s, outputLen: a, canXOF: c } = this;
    return t = t, t.finished = i, t.destroyed = o, t.blockLen = s, t.outputLen = a, t.canXOF = c, t.oHash = n._cloneInto(t.oHash), t.iHash = r._cloneInto(t.iHash), t;
  }
  clone() {
    return this._cloneInto();
  }
  destroy() {
    this.destroyed = !0, this.oHash.destroy(), this.iHash.destroy();
  }
}
const Ie = /* @__PURE__ */ (() => {
  const e = ((t, n, r) => new ln(t, n).update(r).digest());
  return e.create = (t, n) => new ln(t, n), e;
})();
function Pn(e, t, n = () => {
}) {
  if (!Array.isArray(e))
    throw new TypeError(`"${t}" expected array, got type=${typeof e}`);
  for (let r = 0; r < e.length; r++)
    n(e[r], `${t}[${r}]`);
  return e;
}
const Z = (e, t, n) => Y(e, t, n), Kn = V;
function wi(e, t = "") {
  if (typeof e != "string") {
    const n = t && `"${t}" `;
    throw new TypeError(n + "expected string, got type=" + typeof e);
  }
  return e;
}
function Ut(e, t = "object") {
  if (e === null || typeof e != "object" || Array.isArray(e))
    throw new TypeError(t === "object" ? "expected valid options object" : `"${t}" expected object, got type=${typeof e}`);
  return e;
}
function Kt(e, t) {
  if (typeof e != "function")
    throw new TypeError(`"${t}" is invalid: expected function, got ${typeof e}`);
  return e;
}
const qn = Le, yt = (...e) => Mt(...e), Se = (e) => $n(e), le = Re, De = (e) => ei(e), ae = /* @__PURE__ */ BigInt(0), hn = /* @__PURE__ */ BigInt(1), gi = (e) => e ? `"${e}" ` : "";
function At(e, t = "") {
  if (typeof e != "boolean")
    throw new TypeError(gi(t) + "expected boolean, got type=" + typeof e);
  return e;
}
function $e(e) {
  if (typeof e == "bigint") {
    if (!_t(e))
      throw new RangeError("positive bigint expected, got " + e);
  } else
    Kn(e);
  return e;
}
function qt(e, t = "") {
  if (typeof e != "number") {
    const n = t && `"${t}" `;
    throw new TypeError(n + "expected number, got type=" + typeof e);
  }
  if (!Number.isSafeInteger(e)) {
    const n = t && `"${t}" `;
    throw new RangeError(n + "expected safe integer, got " + e);
  }
}
function ee(e) {
  const t = $e(e).toString(16);
  return t.length & 1 ? "0" + t : t;
}
function jn(e) {
  if (typeof e != "string")
    throw new TypeError("hex string expected, got " + typeof e);
  return e === "" ? ae : BigInt("0x" + e);
}
function Nt(e) {
  return jn(Le(e));
}
function Yn(e) {
  return jn(Le(bi(Y(e)).reverse()));
}
function ke(e, t) {
  if (V(t), t === 0)
    throw new Error("zero output length is invalid");
  e = $e(e);
  const n = t * 2, r = e.toString(16);
  if (r.length > n)
    throw new RangeError("number is too large");
  return $n(r.padStart(n, "0"));
}
function Zn(e, t) {
  return ke(e, t).reverse();
}
function bi(e) {
  return Uint8Array.from(Z(e));
}
function _t(e) {
  return typeof e == "bigint" && ae <= e;
}
function zn(e, t, n) {
  return _t(e) && _t(t) && _t(n) && t <= e && e < n;
}
function Xn(e, t, n, r) {
  if (!zn(t, n, r))
    throw new RangeError("expected valid " + e + ": " + n + " <= n < " + r + ", got " + t);
}
function Me(e) {
  if (e < ae)
    throw new Error("expected non-negative bigint, got " + e);
  return e === ae ? 0 : e.toString(2).length;
}
const Pe = (e) => (qt(e, "n"), (hn << BigInt(e)) - hn);
function yi(e, t, n) {
  if (V(e, "hashLen"), V(t, "qByteLen"), typeof n != "function")
    throw new TypeError("hmacFn must be a function");
  const r = (x) => new Uint8Array(x), i = Uint8Array.of(), o = Uint8Array.of(0), s = Uint8Array.of(1), a = 1e3;
  let c = r(e), f = r(e), d = 0;
  const b = () => {
    c.fill(1), f.fill(0), d = 0;
  }, p = (...x) => n(f, yt(c, ...x)), w = (x = i) => {
    f = p(o, x), c = p(), x.length !== 0 && (f = p(s, x), c = p());
  }, h = () => {
    if (d++ >= a)
      throw new Error("drbg: tried max amount of iterations");
    let x = 0;
    const R = [];
    for (; x < t; ) {
      c = p();
      const C = c.slice();
      R.push(C), x += c.length;
    }
    return yt(...R);
  };
  return (x, R) => {
    b(), w(x);
    let C;
    for (; (C = R(h())) === void 0; )
      w();
    return b(), C;
  };
}
function Gt(e, t = {}, n = {}, r = "object") {
  Ut(e, r), Ut(t, "fields"), Ut(n, "optFields");
  function i(s, a, c) {
    const f = r === "object" ? `param "${String(s)}"` : `"${r}.${String(s)}"`, d = e[s];
    if (!Object.hasOwn(e, s) && (c ? d !== void 0 : a !== "function"))
      throw new TypeError(`${f} is invalid: expected own property`);
    if (c && d === void 0)
      return;
    const b = typeof d;
    if (b !== a || d === null)
      throw new TypeError(`${f} is invalid: expected ${a}, got ${b}`);
  }
  const o = (s, a) => Object.entries(s).forEach(([c, f]) => i(c, f, a));
  o(t, !1), o(n, !0);
}
const k = /* @__PURE__ */ BigInt(0), L = /* @__PURE__ */ BigInt(1), mt = /* @__PURE__ */ BigInt(2), Gn = /* @__PURE__ */ BigInt(3), Ke = /* @__PURE__ */ BigInt(4), Wn = /* @__PURE__ */ BigInt(5), mi = /* @__PURE__ */ BigInt(7), Vn = /* @__PURE__ */ BigInt(8), xi = /* @__PURE__ */ BigInt(9), Ei = /* @__PURE__ */ BigInt(15), Jn = /* @__PURE__ */ BigInt(16), vi = /* @__PURE__ */ BigInt("0x10000000000000000");
function J(e, t) {
  if (t <= k)
    throw new Error("mod: expected positive modulus, got " + t);
  const n = e % t;
  return n >= k ? n : t + n;
}
function Qn(e, t, n) {
  if (n <= L)
    throw new Error("pow: expected modulus > 1, got " + n);
  if (typeof t != "bigint")
    throw new TypeError("invalid exponent: expected bigint, got " + typeof t);
  if (t < k)
    throw new Error("invalid exponent, negatives unsupported");
  if (t === k)
    return L;
  if (t === L)
    return e;
  let r = e % n;
  if (r < k && (r += n), t < vi) {
    let a = L;
    for (; t > k; )
      t & L && (a = a * r % n), r = r * r % n, t >>= L;
    return a;
  }
  const i = [];
  for (; t > k; )
    i.push(Number(t & Ei)), t >>= Ke;
  const o = new Array(16);
  o[0] = L, o[1] = r;
  for (let a = 2; a < 16; a++)
    o[a] = o[a - 1] * r % n;
  let s = o[i[i.length - 1]];
  for (let a = i.length - 2; a >= 0; a--) {
    s = s * s % n, s = s * s % n, s = s * s % n, s = s * s % n;
    const c = i[a];
    c !== 0 && (s = s * o[c] % n);
  }
  return s;
}
function tt(e, t, n) {
  if (n <= L)
    throw new Error("pow2: expected modulus > 1, got " + n);
  if (t < k)
    throw new Error("pow2: expected non-negative exponent, got " + t);
  let r = e;
  for (; t-- > k; )
    r *= r, r %= n;
  return r;
}
function pn(e, t) {
  if (e === k)
    throw new Error("invert: expected non-zero number");
  if (t <= L)
    throw new Error("invert: expected modulus > 1, got " + t);
  let n = J(e, t), r = t, i = k, o = L;
  for (; n !== k; ) {
    const a = r / n, c = r - n * a, f = i - o * a;
    r = n, n = c, i = o, o = f;
  }
  if (r !== L)
    throw new Error("invert: does not exist");
  return J(i, t);
}
function _i(e, t) {
  if (t <= L)
    throw new Error("invertCt: expected prime modulus > 1, got " + t);
  const n = J(e, t);
  if (n === k)
    throw new Error("invertCt: expected non-zero number");
  const r = Qn(n, t - mt, t);
  if (J(n * r, t) !== L)
    throw new Error("invertCt: does not exist");
  return r;
}
function qe(e, t, n) {
  const r = e;
  if (!r.eql(r.sqr(t), n))
    throw new Error("Cannot find square root");
}
function je(e, t) {
  if ((e & L) === k)
    throw new Error(t + ": expected odd modulus, got " + e);
}
function tr(e, t) {
  const n = e, r = (n.ORDER + L) / Ke, i = n.pow(t, r);
  return qe(n, i, t), i;
}
function Bi(e, t) {
  const n = e, r = (n.ORDER - Wn) / Vn, i = n.mul(t, mt), o = n.pow(i, r), s = n.mul(t, o), a = n.mul(n.mul(s, mt), o), c = n.mul(s, n.sub(a, n.ONE));
  return qe(n, c, t), c;
}
function Ai(e) {
  const t = he(e), n = er(e), r = n(t, t.neg(t.ONE)), i = n(t, r), o = n(t, t.neg(r)), s = (e + mi) / Jn;
  return ((a, c) => {
    const f = a;
    let d = f.pow(c, s), b = f.mul(d, r);
    const p = f.mul(d, i), w = f.mul(d, o), h = f.eql(f.sqr(b), c), E = f.eql(f.sqr(p), c);
    d = f.cmov(d, b, h), b = f.cmov(w, p, E);
    const x = f.eql(f.sqr(b), c), R = f.cmov(d, b, x);
    return qe(f, R, c), R;
  });
}
function er(e) {
  if (e < Gn)
    throw new Error("sqrt is not defined for small field");
  je(e, "tonelliShanks");
  let t = e - L, n = 0;
  for (; t % mt === k; )
    t /= mt, n++;
  let r = mt;
  const i = he(e);
  for (; wn(i, r) === 1; )
    if (r++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  if (n === 1)
    return tr;
  let o = i.pow(r, t);
  const s = (t + L) / mt;
  return function(c, f) {
    const d = c;
    if (d.is0(f))
      return f;
    if (wn(d, f) !== 1)
      throw new Error("Cannot find square root");
    let b = n, p = d.mul(d.ONE, o), w = d.pow(f, t), h = d.pow(f, s);
    for (; !d.eql(w, d.ONE); ) {
      if (d.is0(w))
        throw new Error("Cannot find square root: probably non-prime P");
      let E = 1, x = d.sqr(w);
      for (; !d.eql(x, d.ONE); )
        if (E++, x = d.sqr(x), E === b)
          throw new Error("Cannot find square root");
      const R = L << BigInt(b - E - 1), C = d.pow(p, R);
      b = E, p = d.sqr(C), w = d.mul(w, p), h = d.mul(h, C);
    }
    return h;
  };
}
function Ri(e) {
  return je(e, "Fp.sqrt"), e % Ke === Gn ? tr : e % Vn === Wn ? Bi : e % Jn === xi ? Ai(e) : er(e);
}
const Ii = [
  "create",
  "isValid",
  "is0",
  "neg",
  "inv",
  "sqrt",
  "sqr",
  "eql",
  "add",
  "sub",
  "mul",
  "pow",
  "div",
  "addN",
  "subN",
  "mulN",
  "sqrN"
];
function jt(e) {
  if (Ut(e, "field"), typeof e.ORDER != "bigint")
    throw new TypeError('param "ORDER" is invalid: expected bigint, got ' + typeof e.ORDER);
  qt(e.BYTES, "BYTES"), qt(e.BITS, "BITS");
  for (const t of Ii)
    Kt(e[t], "field." + t);
  if (e.BYTES < 1 || e.BITS < 1)
    throw new Error("invalid field: expected BYTES/BITS > 0");
  if (e.ORDER <= L)
    throw new Error("invalid field: expected ORDER > 1, got " + e.ORDER);
  return e;
}
function nr(e, t, n = !1) {
  jt(e), Pn(t, "nums"), At(n, "passZero");
  const r = e, i = new Array(t.length).fill(n ? r.ZERO : void 0), o = t.reduce((a, c, f) => r.is0(c) ? a : (i[f] = a, r.mul(a, c)), r.ONE), s = r.inv(o);
  return t.reduceRight((a, c, f) => r.is0(c) ? a : (i[f] = r.mul(a, i[f]), r.mul(a, c)), s), i;
}
function wn(e, t) {
  jt(e);
  const n = e;
  je(n.ORDER, "FpLegendre");
  const r = (n.ORDER - L) / mt, i = n.pow(t, r), o = n.eql(i, n.ONE), s = n.eql(i, n.ZERO), a = n.eql(i, n.neg(n.ONE));
  if (!o && !s && !a)
    throw new Error("invalid Legendre symbol result");
  return o ? 1 : s ? 0 : -1;
}
function Si(e, t) {
  if (t !== void 0 && Kn(t), e <= k)
    throw new Error("invalid n length: expected positive n, got " + e);
  if (t !== void 0 && t < 1)
    throw new Error("invalid n length: expected positive bit length, got " + t);
  const n = Me(e);
  if (t !== void 0 && t < n)
    throw new Error(`invalid n length: expected nBitLength (${t}) >= bitLen(n) (${n})`);
  const r = t !== void 0 ? t : n, i = Math.ceil(r / 8);
  return { nBitLength: r, nByteLength: i };
}
const gn = /* @__PURE__ */ new WeakMap();
class bn {
  constructor(t, n = {}) {
    l(this, "ORDER");
    l(this, "BITS");
    l(this, "BYTES");
    l(this, "isLE");
    l(this, "ZERO", k);
    l(this, "ONE", L);
    l(this, "_lengths");
    l(this, "_mod");
    if (t <= L)
      throw new Error("invalid field: expected ORDER > 1, got " + t);
    let r;
    this.isLE = !1, n != null && typeof n == "object" && (typeof n.BITS == "number" && (r = n.BITS), typeof n.sqrt == "function" && Object.defineProperty(this, "sqrt", { value: n.sqrt, enumerable: !0 }), typeof n.isLE == "boolean" && (this.isLE = n.isLE), n.allowedLengths && (this._lengths = Object.freeze(n.allowedLengths.slice())), typeof n.modFromBytes == "boolean" && (this._mod = n.modFromBytes));
    const { nBitLength: i, nByteLength: o } = Si(t, r);
    if (o > 2048)
      throw new Error("invalid field: expected ORDER of <= 2048 bytes");
    this.ORDER = t, this.BITS = i, this.BYTES = o, Object.freeze(this);
  }
  create(t) {
    return J(t, this.ORDER);
  }
  isValid(t) {
    if (typeof t != "bigint")
      throw new TypeError("invalid field element: expected bigint, got " + typeof t);
    return k <= t && t < this.ORDER;
  }
  is0(t) {
    return t === k;
  }
  // is valid and invertible
  isValidNot0(t) {
    return !this.is0(t) && this.isValid(t);
  }
  isOdd(t) {
    return (t & L) === L;
  }
  neg(t) {
    return J(-t, this.ORDER);
  }
  eql(t, n) {
    return t === n;
  }
  sqr(t) {
    return J(t * t, this.ORDER);
  }
  add(t, n) {
    return J(t + n, this.ORDER);
  }
  sub(t, n) {
    return J(t - n, this.ORDER);
  }
  mul(t, n) {
    return J(t * n, this.ORDER);
  }
  pow(t, n) {
    return Qn(t, n, this.ORDER);
  }
  div(t, n) {
    return J(t * pn(n, this.ORDER), this.ORDER);
  }
  // Same as above, but doesn't normalize
  sqrN(t) {
    return t * t;
  }
  addN(t, n) {
    return t + n;
  }
  subN(t, n) {
    return t - n;
  }
  mulN(t, n) {
    return t * n;
  }
  inv(t) {
    return pn(t, this.ORDER);
  }
  sqrt(t) {
    let n = gn.get(this);
    return n || gn.set(this, n = Ri(this.ORDER)), n(this, t);
  }
  toBytes(t) {
    return this.isLE ? Zn(t, this.BYTES) : ke(t, this.BYTES);
  }
  fromBytes(t, n = !1) {
    Z(t);
    const { _lengths: r, BYTES: i, isLE: o, ORDER: s, _mod: a } = this;
    if (r) {
      if (t.length < 1 || !r.includes(t.length) || t.length > i)
        throw new Error("Field.fromBytes: expected " + r + " bytes, got " + t.length);
      const f = new Uint8Array(i);
      f.set(t, o ? 0 : f.length - t.length), t = f;
    }
    if (t.length !== i)
      throw new Error("Field.fromBytes: expected " + i + " bytes, got " + t.length);
    let c = o ? Yn(t) : Nt(t);
    if (a && (c = J(c, s)), !n && !this.isValid(c))
      throw new Error("invalid field element: outside of range 0..ORDER");
    return c;
  }
  // TODO: we don't need it here, move out to separate fn
  invertBatch(t) {
    return nr(this, t, !0);
  }
  // We can't move this out because Fp6, Fp12 implement it
  // and it's unclear what to return in there.
  cmov(t, n, r) {
    return At(r, "condition"), r ? n : t;
  }
}
function he(e, t = {}) {
  return Object.freeze(bn.prototype), new bn(e, t);
}
function rr(e) {
  if (typeof e != "bigint")
    throw new Error("field order must be bigint");
  if (e <= L)
    throw new Error("field order must be greater than 1");
  const t = Me(e - L);
  return Math.ceil(t / 8);
}
function Ye(e) {
  const t = rr(e);
  return t + Math.ceil(t / 2);
}
function ir(e, t, n = !1) {
  Z(e);
  const r = e.length, i = rr(t), o = Math.max(Ye(t), 16);
  if (r < o || r > 1024)
    throw new Error("expected " + o + "-1024 bytes of input, got " + r);
  const s = n ? Yn(e) : Nt(e), a = J(s, t - L) + L;
  return n ? Zn(a, i) : ke(a, i);
}
const Ze = /* @__PURE__ */ BigInt(0), Yt = /* @__PURE__ */ BigInt(1), Oi = /* @__PURE__ */ BigInt(4), ge = 16, yn = 128, Ti = 5, mn = 2 ** 31;
function Wt(e) {
  const t = e;
  if (typeof t != "function")
    throw new TypeError('"Point" expected constructor, got type=' + typeof e);
  Kt(t.fromAffine, "Point.fromAffine"), Kt(t.fromBytes, "Point.fromBytes"), Kt(t.fromHex, "Point.fromHex"), Ut(t.BASE, "Point.BASE"), Ut(t.ZERO, "Point.ZERO"), jt(t.Fp), jt(t.Fn);
}
function Ci(e, t) {
  Wt(e), sr(t, e);
  const n = nr(e.Fp, t.map((r) => r.Z));
  return t.map((r, i) => e.fromAffine(r.toAffine(n[i])));
}
function Hi(e, t, n = 1) {
  if (!Number.isSafeInteger(e) || e < n || e > t)
    throw new Error("invalid window size, expected [" + n + ".." + t + "], got W=" + e);
}
function Ui(e, t) {
  const n = e * (4 * t + 128);
  if (n > mn)
    throw new Error("invalid window size: table would need ~" + Math.ceil(n / 2 ** 20) + " MiB, max " + mn / 2 ** 20 + " MiB");
}
function or(e, t) {
  if (e !== void 0) {
    Kt(e, "randomBytes");
    try {
      const n = e(t);
      if (!le(n) || n.length !== t)
        return;
    } catch {
      return;
    }
    return e;
  }
}
function sr(e, t) {
  Pn(e, "points"), e.forEach((n, r) => {
    if (!(n instanceof t))
      throw new Error("invalid point at index " + r);
  });
}
function Li(e, t, n) {
  if (!Array.isArray(e))
    throw new Error("array of scalars expected");
  e.forEach((r, i) => {
    if (!(n === void 0 ? t.isValid(r) : _t(r) && r < n))
      throw new Error("invalid scalar at index " + i);
  });
}
const cr = /* @__PURE__ */ new WeakMap();
function be(e) {
  return cr.get(e) || 1;
}
function Ni(e, t) {
  const n = e.double(), r = [e];
  for (let i = 1; i < t; i++)
    r.push(r[i - 1].add(n));
  return r;
}
function Fi(e, t) {
  const n = 2 ** t, r = n / 2, i = BigInt(n - 1), o = [];
  for (; e > Ze; ) {
    let s = 0;
    e & Yt && (s = Number(e & i), s >= r && (s -= n), e -= BigInt(s)), o.push(s), e >>= Yt;
  }
  return o;
}
function Di(e, t, n) {
  const r = 2 ** t, i = r / 2, o = BigInt(r - 1), s = BigInt(t), a = [];
  for (let c = 0; c < n; c++) {
    let f = Number(e & o);
    e >>= s, f > i && (f -= r, e += Yt), a.push(f);
  }
  if (e !== Ze)
    throw new Error("invalid wnaf");
  return a;
}
function $i(e, t, n) {
  let r = 0;
  for (const o of n)
    r = Math.max(r, o.length);
  let i = e;
  for (let o = r - 1; o >= 0; o--) {
    o !== r - 1 && (i = i.double());
    for (let s = 0; s < n.length; s++) {
      const a = n[s][o];
      if (a) {
        const c = t[s][Math.abs(a) - 1 >> 1];
        i = i.add(a < 0 ? c.negate() : c);
      }
    }
  }
  return i;
}
class ki {
  // Parametrized with a given Point class (not individual point)
  constructor(t, n) {
    l(this, "Point");
    l(this, "BASE");
    l(this, "ZERO");
    l(this, "randomBytes");
    l(this, "wnafPrecomputes", /* @__PURE__ */ new WeakMap());
    l(this, "baseCanBeBlinded");
    l(this, "bits");
    Wt(t), this.randomBytes = or(n, ge), this.Point = t, this.BASE = t.BASE, this.ZERO = t.ZERO, this.bits = t.Fn.BITS;
  }
  /**
   * Creates a signed fixed-window wNAF precomputation table: for every window w, the
   * multiples `[1..2^(W−1)]⋅2^(w⋅W)⋅P`, flattened. All doublings are baked into the table,
   * so cached multiplication is additions-only. `windows = ceil(bits/W) + 1`: the extra
   * window absorbs the final carry of signed-digit recoding.
   * For a 256-bit curve and W=6, the table is 44⋅32 = 1408 points.
   * @param point - Point instance
   * @param W - window size
   * @param bits - scalar bitlength the table must cover
   */
  buildWnafTable(t, n, r) {
    const i = Math.ceil(r / n) + 1, o = 2 ** (n - 1), s = [];
    let a = t;
    for (let c = 0; c < i; c++) {
      let f = a;
      for (let d = 0; d < o; d++)
        s.push(f), f = f.add(a);
      a = s[s.length - 1].double();
    }
    return { W: n, bits: r, windows: i, comp: s };
  }
  /**
   * Implements ec multiplication using precomputed signed fixed-window wNAF tables.
   * Constant-time: fixed window count with one table addition per window — zero digits feed
   * the fake accumulator — and no doublings; the lookup scans the whole window slice.
   * Scalar bounds are validated by the public entry points ({@link ScalarMultiplier.mulCT},
   * {@link ScalarMultiplier.mulCTBlinded}, {@link ScalarMultiplier.mulUnsafe});
   * signedWindowDigits throws if `n` exceeds the table.
   * @returns real and fake (for const-time) points
   */
  wnafCachedCT(t, n) {
    const { W: r, windows: i, comp: o } = t, s = 2 ** (r - 1), a = Di(n, r, i);
    let c = this.ZERO, f = this.BASE;
    for (let d = 0; d < i; d++) {
      const b = a[d], p = d * s, w = Math.abs(b) - 1;
      let h = o[p];
      for (let x = 1; x < s; x++)
        h = x === w ? o[p + x] : h;
      const E = h.negate();
      b === 0 ? f = f.add(o[p]) : c = c.add(b < 0 ? E : h);
    }
    return { p: c, f };
  }
  // Cache key is point identity plus (W, bits); at most two entries exist per point (public-width
  // `Fn.BITS` and blinded `Fn.BITS + BLIND_BITS`). Callers must not reuse the same point with
  // incompatible `transform(...)` layouts and expect a separate cache entry.
  getWnafPrecomputes(t, n, r, i) {
    let o = this.wnafPrecomputes.get(n), s = o == null ? void 0 : o.find((a) => a.W === t && a.bits === r);
    return s || (s = this.buildWnafTable(n, t, r), typeof i == "function" && (s = { ...s, comp: i(s.comp) }), o || (o = [], this.wnafPrecomputes.set(n, o)), o.push(s)), s;
  }
  assertPoint(t) {
    if (!(t instanceof this.Point))
      throw new TypeError('"point" expected Point instance, got type=' + typeof t);
  }
  // Shared prologue of the constant-time entry points. Rejects scalar 0: in key/signature-style
  // callers a zero scalar means broken upstream plumbing, and concrete Points already reject it.
  // Uses inRange instead of Fn.isValidNot0: validateField() only certifies the arithmetic subset.
  validateMulInput(t, n) {
    if (this.assertPoint(t), !zn(n, Yt, this.Point.Fn.ORDER))
      throw new Error("invalid scalar");
  }
  // Constant-time dispatch shared by mulCT / mulCTBlinded. Un-precomputed points (W===1, e.g.
  // ECDH peer keys) skip building a throwaway cached table in favor of a small fixed-window
  // multiply. `n` must be < 2^bits.
  runCT(t, n, r, i) {
    const o = be(t);
    return o === 1 ? this.fixedWindowCT(t, n, r) : this.wnafCachedCT(this.getWnafPrecomputes(o, t, r, i), n);
  }
  mulCT(t, n, r) {
    return this.validateMulInput(t, n), this.runCT(t, n, this.bits, r);
  }
  mulCTBlinded(t, n, r) {
    if (this.validateMulInput(t, n), this.randomBytes === void 0)
      throw new Error("randomBytes is required for scalar blinding");
    const i = this.Point.Fn.BITS + yn, o = this.randomBytes(ge);
    if (!le(o) || o.length !== ge)
      throw new Error("randomBytes returned invalid byte array");
    o[0] = o[0] & 63 | 128;
    const s = n + Nt(o) * this.Point.Fn.ORDER;
    return this.runCT(t, s, i, r);
  }
  /**
   * Constant-time multiplication `n*point` for an un-precomputed point, via a small fixed window.
   * A cached wNAF table only pays off when reused; a flat 2^FW_WINDOW table (`size-1` adds) is
   * far cheaper to build for a single use. The point-operation sequence is independent of `n`:
   * build the table, then per window exactly FW_WINDOW doublings, a data-oblivious scan over
   * every table entry, and one addition (adds the identity when the window digit is 0 — never
   * skipped).
   *
   * `n` must be `< 2^bits`. Assumes complete addition (adding the identity costs the same as any
   * add), which holds for the Weierstrass/Edwards point types used here. The table is left in
   * projective form (no normalizeZ): normalizing this small a table costs more than the
   * mixed-add savings it would buy for a single multiply.
   * @returns real point `p`; `f` duplicates it only to match {@link wnafCachedCT}'s return shape
   * (this path needs no fake accumulator — its op-count is already scalar-independent).
   */
  fixedWindowCT(t, n, r) {
    const i = Ti, o = 1 << i, s = Pe(i), a = new Array(o);
    a[0] = this.ZERO;
    for (let d = 1; d < o; d++)
      a[d] = a[d - 1].add(t);
    const c = Math.ceil(r / i);
    let f = this.ZERO;
    for (let d = c - 1; d >= 0; d--) {
      if (d !== c - 1)
        for (let w = 0; w < i; w++)
          f = f.double();
      const b = Number(n >> BigInt(d * i) & s);
      let p = a[0];
      for (let w = 1; w < o; w++)
        p = w === b ? a[w] : p;
      f = f.add(p);
    }
    return { p: f, f };
  }
  shouldBlind(t, n) {
    return this.randomBytes === void 0 ? !1 : n === Yt ? !0 : t !== this.BASE ? !1 : (this.baseCanBeBlinded === void 0 && (this.baseCanBeBlinded = this.mulUnsafe(this.BASE, this.Point.Fn.ORDER).is0()), this.baseCanBeBlinded);
  }
  mulSecret(t, n, r, i) {
    return this.shouldBlind(t, r) ? this.mulCTBlinded(t, n, i) : this.mulCT(t, n, i);
  }
  mulUnsafe(t, n, r) {
    if (this.assertPoint(t), !_t(n))
      throw new Error("invalid scalar");
    const i = be(t);
    if (i === 1 || n >= this.Point.Fn.ORDER)
      return Oe(this.Point, [t], [n], !0);
    const o = this.getWnafPrecomputes(i, t, this.bits, r);
    return this.wnafCachedCT(o, n).p;
  }
  // Remembers the window size used for precomputed wNAF multiplication of the given point
  // and drops any previously built tables. Usually only the base point is precomputed.
  // W=1 resets the point to the un-precomputed (table-less) paths.
  // W is additionally capped so tables stay under ~2 GiB ({@link TABLE_BYTES_MAX}).
  setWindowSize(t, n) {
    this.assertPoint(t), Hi(n, this.bits);
    const r = Math.ceil((this.bits + yn) / n) + 1;
    Ui(r * 2 ** (n - 1), this.Point.Fp.BYTES), cr.set(t, n), this.wnafPrecomputes.delete(t);
  }
  // True when a window size is set: tables themselves are built lazily on first multiply.
  hasWindowSize(t) {
    return be(t) !== 1;
  }
}
function Oe(e, t, n, r = !1) {
  if (Wt(e), sr(t, e), At(r, "allowOversized"), Li(n, e.Fn, r ? e.Fn.ORDER ** Oi : void 0), t.length !== n.length)
    throw new Error("arrays of points and scalars must have equal length");
  const i = t.map((s) => Ni(s, 4)), o = n.map((s) => Fi(s, 4));
  return $i(e.ZERO, i, o);
}
function xn(e, t, n) {
  if (t) {
    if (t.ORDER !== e)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    return jt(t), t;
  } else
    return he(e, { isLE: n });
}
function Mi(e, t, n = {}, r) {
  if (r === void 0 && (r = e === "edwards"), !t || typeof t != "object")
    throw new Error(`expected valid ${e} CURVE object`);
  Gt(n);
  for (const c of ["p", "n", "h"]) {
    const f = t[c];
    if (!(_t(f) && f !== Ze))
      throw new Error(`CURVE.${c} must be positive bigint`);
  }
  const i = xn(t.p, n.Fp, r), o = xn(t.n, n.Fn, r), a = ["Gx", "Gy", "a", "b"];
  for (const c of a)
    if (!i.isValid(t[c]))
      throw new Error(`CURVE.${c} must be valid field element of CURVE.Fp`);
  return t = Object.freeze(Object.assign({}, t)), { CURVE: t, Fp: i, Fn: o };
}
function Pi(e, t) {
  return function(r) {
    const i = e(r);
    return { secretKey: i, publicKey: t(i) };
  };
}
const Ki = /* @__PURE__ */ BigInt(0);
class qi extends Error {
  constructor(t = "") {
    super(t);
  }
}
const at = {
  // asn.1 DER encoding utils
  Err: qi,
  // Basic building block is TLV (Tag-Length-Value)
  _tlv: {
    encode: (e, t) => {
      const { Err: n } = at;
      if (qt(e, "tag"), e < 0 || e > 255)
        throw new n("tlv.encode: wrong tag");
      if (wi(t, "data"), t.length & 1)
        throw new n("tlv.encode: unpadded data");
      const r = t.length / 2, i = ee(r);
      if (i.length / 2 & 128)
        throw new n("tlv.encode: long form length too big");
      const o = r > 127 ? ee(i.length / 2 | 128) : "";
      return ee(e) + o + i + t;
    },
    // v - value, l - left bytes (unparsed)
    decode(e, t) {
      const { Err: n } = at;
      t = Z(t, void 0, "DER data");
      let r = 0;
      if (e < 0 || e > 255)
        throw new n("tlv.decode: wrong tag");
      if (t.length < 2 || t[r++] !== e)
        throw new n("tlv.decode: wrong tlv");
      const i = t[r++], o = !!(i & 128);
      let s = 0;
      if (!o)
        s = i;
      else {
        const c = i & 127;
        if (!c)
          throw new n("tlv.decode(long): indefinite length not supported");
        if (c > 4)
          throw new n("tlv.decode(long): byte length is too big");
        const f = t.subarray(r, r + c);
        if (f.length !== c)
          throw new n("tlv.decode: length bytes not complete");
        if (f[0] === 0)
          throw new n("tlv.decode(long): zero leftmost byte");
        for (const d of f)
          s = s << 8 | d;
        if (r += c, s < 128)
          throw new n("tlv.decode(long): not minimal encoding");
      }
      const a = t.subarray(r, r + s);
      if (a.length !== s)
        throw new n("tlv.decode: wrong value length");
      return { v: a, l: t.subarray(r + s) };
    }
  },
  // https://crypto.stackexchange.com/a/57734 Leftmost bit of first byte is 'negative' flag,
  // since we always use positive integers here. It must always be empty:
  // - add zero byte if exists
  // - if next byte doesn't have a flag, leading zero is not allowed (minimal encoding)
  _int: {
    encode(e) {
      const { Err: t } = at;
      if ($e(e), e < Ki)
        throw new t("integer: negative integers are not allowed");
      let n = ee(e);
      if (Number.parseInt(n[0], 16) & 8 && (n = "00" + n), n.length & 1)
        throw new t("unexpected DER parsing assertion: unpadded hex");
      return n;
    },
    decode(e) {
      const { Err: t } = at;
      if (e.length < 1)
        throw new t("invalid signature integer: empty");
      if (e[0] & 128)
        throw new t("invalid signature integer: negative");
      if (e.length > 1 && e[0] === 0 && !(e[1] & 128))
        throw new t("invalid signature integer: unnecessary leading zero");
      return Nt(e);
    }
  },
  toSig(e, t) {
    const { Err: n, _int: r, _tlv: i } = at;
    if (t !== void 0 && (qt(t, "maxScalarBytes"), t < 1))
      throw new n("invalid signature: maxScalarBytes must be positive");
    const o = Z(e, void 0, "signature"), { v: s, l: a } = i.decode(48, o);
    if (a.length)
      throw new n("invalid signature: left bytes after parsing");
    const { v: c, l: f } = i.decode(2, s), { v: d, l: b } = i.decode(2, f);
    if (b.length)
      throw new n("invalid signature: left bytes after parsing");
    if (t !== void 0 && (c.length > t || d.length > t))
      throw new n("invalid signature: integer too large");
    return { r: r.decode(c), s: r.decode(d) };
  },
  hexFromSig(e) {
    const { _tlv: t, _int: n } = at;
    Gt(e, { r: "bigint", s: "bigint" }, {}, "sig");
    const r = t.encode(2, n.encode(e.r)), i = t.encode(2, n.encode(e.s)), o = r + i;
    return t.encode(48, o);
  }
}, ye = (Object.freeze(at._tlv), Object.freeze(at._int), Object.freeze(at));
const En = (e, t) => (e + (e >= 0 ? t : -t) / ar) / t;
function ji(e, t, n) {
  Xn("scalar", e, ft, n);
  const [[r, i], [o, s]] = t, a = En(s * e, n), c = En(-i * e, n);
  let f = e - a * r - c * o, d = -a * i - c * s;
  const b = f < ft, p = d < ft;
  b && (f = -f), p && (d = -d);
  const w = Pe(Math.ceil(Me(n) / 2)) + vt;
  if (f < ft || f >= w || d < ft || d >= w)
    throw new Error("splitScalar (endomorphism): failed for k");
  return { k1neg: b, k1: f, k2neg: p, k2: d };
}
function Te(e) {
  if (!["compact", "recovered", "der"].includes(e))
    throw new Error('Signature format must be "compact", "recovered", or "der"');
  return e;
}
function me(e, t) {
  Gt(e);
  const n = {};
  for (let r of Object.keys(t))
    n[r] = e[r] === void 0 ? t[r] : e[r];
  return At(n.lowS, "lowS"), At(n.prehash, "prehash"), n.format !== void 0 && Te(n.format), n;
}
const ft = /* @__PURE__ */ BigInt(0), vt = /* @__PURE__ */ BigInt(1), ar = /* @__PURE__ */ BigInt(2), xe = /* @__PURE__ */ BigInt(3), Yi = /* @__PURE__ */ BigInt(4);
function Zi(e, t = {}) {
  const n = Mi("weierstrass", e, t), r = n.Fp, i = n.Fn;
  let o = n.CURVE;
  const { h: s, n: a } = o;
  Gt(t, {}, {
    allowInfinityPoint: "boolean",
    clearCofactor: "function",
    isTorsionFree: "function",
    fromBytes: "function",
    toBytes: "function",
    endo: "object",
    randomBytes: "function"
  });
  const { endo: c, allowInfinityPoint: f, clearCofactor: d, isTorsionFree: b, fromBytes: p, toBytes: w } = t, h = t.randomBytes === void 0 ? De : t.randomBytes;
  if (c && (!r.is0(o.a) || typeof c.beta != "bigint" || !Array.isArray(c.basises)))
    throw new Error('invalid endo: expected "beta": bigint and "basises": array');
  const E = c ? {
    beta: c.beta,
    basises: c.basises.map((g) => [...g])
  } : void 0, x = dr(r, i);
  function R() {
    if (!r.isOdd)
      throw new Error("compression is not supported: Field does not have .isOdd()");
  }
  function C(g, u, y) {
    if (u.is0()) {
      if (!f)
        throw new Error("bad point: ZERO");
      return Uint8Array.of(0);
    }
    const { x: m, y: B } = u.toAffine(), A = r.toBytes(m);
    if (At(y, "isCompressed"), y) {
      R();
      const v = !r.isOdd(B);
      return yt(fr(v), A);
    } else
      return yt(Uint8Array.of(4), A, r.toBytes(B));
  }
  function M(g) {
    Z(g, void 0, "Point");
    const { publicKey: u, publicKeyUncompressed: y } = x, m = g.length, B = g[0], A = g.subarray(1);
    if (f && m === 1 && B === 0)
      return { x: r.ZERO, y: r.ZERO };
    if (m === u && (B === 2 || B === 3)) {
      const v = r.fromBytes(A);
      if (!r.isValid(v))
        throw new Error("bad point: is not on curve, wrong x");
      const S = it(v);
      let I;
      try {
        I = r.sqrt(S);
      } catch (N) {
        const $ = N instanceof Error ? ": " + N.message : "";
        throw new Error("bad point: is not on curve, sqrt error" + $);
      }
      R();
      const H = r.isOdd(I);
      return (B & 1) === 1 !== H && (I = r.neg(I)), { x: v, y: I };
    } else if (m === y && B === 4) {
      const v = r.BYTES, S = r.fromBytes(A.subarray(0, v)), I = r.fromBytes(A.subarray(v, v * 2));
      if (!j(S, I))
        throw new Error("bad point: is not on curve");
      return { x: S, y: I };
    } else
      throw new Error(`bad point: got length ${m}, expected compressed=${u} or uncompressed=${y}`);
  }
  const O = w === void 0 ? C : w, P = p === void 0 ? M : p, U = r.mul(o.b, xe), K = r.is0(o.a) ? (g) => r.ZERO : (g) => r.mul(o.a, g);
  function it(g) {
    const u = r.sqr(g), y = r.mul(u, g);
    return r.add(r.add(y, r.mul(g, o.a)), o.b);
  }
  function j(g, u) {
    const y = r.sqr(u), m = it(g);
    return r.eql(y, m);
  }
  if (!j(o.Gx, o.Gy))
    throw new Error("bad curve params: generator point");
  const D = r.mul(r.pow(o.a, xe), Yi), ot = r.mul(r.sqr(o.b), BigInt(27));
  if (r.is0(r.add(D, ot)))
    throw new Error("bad curve params: a or b");
  function et(g, u, y = !1) {
    if (!r.isValid(u) || y && r.is0(u))
      throw new Error(`bad point coordinate ${g}`);
    return typeof u == "object" && u !== null ? r.create(u) : u;
  }
  function nt(g) {
    if (!(g instanceof Q))
      throw new Error("Weierstrass Point expected");
  }
  function lt(g) {
    if (!E || !E.basises)
      throw new Error("no endo");
    return ji(g, E.basises, i.ORDER);
  }
  function st(g, u, y, m) {
    if (!i.isValid(m))
      throw new RangeError("invalid scalar: out of range");
    if (E) {
      const { k1neg: B, k1: A, k2neg: v, k2: S } = lt(m), I = new Q(r.mul(y.X, E.beta), y.Y, y.Z);
      g.push(B ? y.negate() : y, v ? I.negate() : I), u.push(A, S);
    } else
      g.push(y), u.push(m);
  }
  const xt = /* @__PURE__ */ new WeakSet(), _ = class _ {
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    constructor(u, y, m) {
      l(this, "X");
      l(this, "Y");
      l(this, "Z");
      this.X = et("x", u), this.Y = et("y", y, !0), this.Z = et("z", m), Object.freeze(this);
    }
    static CURVE() {
      return o;
    }
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    static fromAffine(u) {
      const { x: y, y: m } = u || {};
      if (!u || !r.isValid(y) || !r.isValid(m))
        throw new Error("invalid affine point");
      if (u instanceof _)
        throw new Error("projective point not allowed");
      return r.is0(y) && r.is0(m) ? _.ZERO : new _(y, m, r.ONE);
    }
    static fromBytes(u) {
      const y = _.fromAffine(P(Z(u, void 0, "point")));
      return y.assertValidity(), y;
    }
    static fromHex(u) {
      return _.fromBytes(Se(u));
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    /**
     * @param isLazy - true will defer table computation until the first multiplication
     */
    precompute(u = 6, y = !0) {
      return ht.setWindowSize(this, u), y || this.multiply(xe), this;
    }
    // TODO: return `this`
    /** A point on curve is valid if it conforms to equation. */
    assertValidity() {
      const u = this;
      if (u.is0()) {
        if (f && r.is0(u.X) && r.eql(u.Y, r.ONE) && r.is0(u.Z))
          return;
        throw new Error("bad point: ZERO");
      }
      if (xt.has(u))
        return;
      const { x: y, y: m } = u.toAffine();
      if (!r.isValid(y) || !r.isValid(m))
        throw new Error("bad point: x or y not field elements");
      if (!j(y, m))
        throw new Error("bad point: equation left != right");
      if (!u.isTorsionFree())
        throw new Error("bad point: not in prime-order subgroup");
      xt.add(u);
    }
    hasEvenY() {
      const { y: u } = this.toAffine();
      if (!r.isOdd)
        throw new Error("Field doesn't support isOdd");
      return !r.isOdd(u);
    }
    /** Compare one point to another. */
    equals(u) {
      nt(u);
      const { X: y, Y: m, Z: B } = this, { X: A, Y: v, Z: S } = u, I = r.eql(r.mul(y, S), r.mul(A, B)), H = r.eql(r.mul(m, S), r.mul(v, B));
      return I && H;
    }
    /** Flips point to one corresponding to (x, -y) in Affine coordinates. */
    negate() {
      return new _(this.X, r.neg(this.Y), this.Z);
    }
    // Renes-Costello-Batina exception-free doubling formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 3
    // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
    double() {
      const { X: u, Y: y, Z: m } = this;
      let B = r.ZERO, A = r.ZERO, v = r.ZERO, S = r.mul(u, u), I = r.mul(y, y), H = r.mul(m, m), T = r.mul(u, y);
      return T = r.add(T, T), v = r.mul(u, m), v = r.add(v, v), B = K(v), A = r.mul(U, H), A = r.add(B, A), B = r.sub(I, A), A = r.add(I, A), A = r.mul(B, A), B = r.mul(T, B), v = r.mul(U, v), H = K(H), T = r.sub(S, H), T = K(T), T = r.add(T, v), v = r.add(S, S), S = r.add(v, S), S = r.add(S, H), S = r.mul(S, T), A = r.add(A, S), H = r.mul(y, m), H = r.add(H, H), S = r.mul(H, T), B = r.sub(B, S), v = r.mul(H, I), v = r.add(v, v), v = r.add(v, v), new _(B, A, v);
    }
    // Renes-Costello-Batina exception-free addition formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 1
    // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
    add(u) {
      nt(u);
      const { X: y, Y: m, Z: B } = this, { X: A, Y: v, Z: S } = u;
      let I = r.ZERO, H = r.ZERO, T = r.ZERO, N = r.mul(y, A), $ = r.mul(m, v), q = r.mul(B, S), G = r.add(y, m), F = r.add(A, v);
      G = r.mul(G, F), F = r.add(N, $), G = r.sub(G, F), F = r.add(y, B);
      let W = r.add(A, S);
      return F = r.mul(F, W), W = r.add(N, q), F = r.sub(F, W), W = r.add(m, B), I = r.add(v, S), W = r.mul(W, I), I = r.add($, q), W = r.sub(W, I), T = K(F), I = r.mul(U, q), T = r.add(I, T), I = r.sub($, T), T = r.add($, T), H = r.mul(I, T), $ = r.add(N, N), $ = r.add($, N), q = K(q), F = r.mul(U, F), $ = r.add($, q), q = r.sub(N, q), q = K(q), F = r.add(F, q), N = r.mul($, F), H = r.add(H, N), N = r.mul(W, F), I = r.mul(G, I), I = r.sub(I, N), N = r.mul(G, $), T = r.mul(W, T), T = r.add(T, N), new _(I, H, T);
    }
    subtract(u) {
      return nt(u), this.add(u.negate());
    }
    is0() {
      return this.equals(_.ZERO);
    }
    /**
     * Constant time multiplication.
     * Uses precomputed tables (signed fixed-window wNAF) when available.
     * Uses scalar blinding and avoids endomorphism splitting in the secret-scalar path.
     * @param scalar - by which the point would be multiplied
     * @returns New point
     */
    multiply(u) {
      if (!i.isValidNot0(u))
        throw new RangeError("invalid scalar: out of range");
      const { p: y, f: m } = ht.mulSecret(this, u, s, Ft);
      return Ft([y, m])[0];
    }
    /**
     * Non-constant-time multiplication. Uses width-4 wNAF with GLV endomorphism splitting
     * when available (two half-width scalars sharing one halved doubling chain).
     * It's faster, but should only be used when you don't care about
     * an exposed secret key e.g. sig verification, which works over *public* keys.
     */
    multiplyUnsafe(u) {
      const y = this, m = u;
      if (!i.isValid(m))
        throw new RangeError("invalid scalar: out of range");
      if (m === ft || y.is0())
        return _.ZERO;
      if (m === vt)
        return y;
      if (ht.hasWindowSize(this))
        return ht.mulUnsafe(y, m, Ft);
      const B = [], A = [];
      return st(B, A, y, m), Oe(_, B, A);
    }
    /**
     * Non-constant-time double-scalar multiplication `a⋅this + b⋅other` (Strauss–Shamir).
     * Both walks share one doubling chain via {@link mulAddUnsafe}, and GLV endomorphism
     * (when available) halves the chain again by splitting each scalar into two half-width
     * parts. Used by ECDSA verification and public-key recovery for `R = u1⋅G + u2⋅P`.
     * Only for public scalars.
     */
    mulAddUnsafe(u, y, m) {
      nt(y);
      const B = [], A = [];
      return st(B, A, this, u), st(B, A, y, m), Oe(_, B, A);
    }
    /**
     * Converts Projective point to affine (x, y) coordinates.
     * (X, Y, Z) ∋ (x=X/Z, y=Y/Z).
     * @param invertedZ - Z^-1 (inverted zero) - optional, precomputation is useful for invertBatch
     */
    toAffine(u) {
      const y = this;
      let m = u;
      if (m != null && !r.isValid(m))
        throw new RangeError('"invertedZ" expected valid field element');
      const { X: B, Y: A, Z: v } = y;
      if (r.eql(v, r.ONE))
        return { x: B, y: A };
      const S = y.is0();
      m == null && (m = S ? r.ONE : r.inv(v));
      const I = r.mul(B, m), H = r.mul(A, m), T = r.mul(v, m);
      if (S)
        return { x: r.ZERO, y: r.ZERO };
      if (!r.eql(T, r.ONE))
        throw new Error("invZ was invalid");
      return { x: I, y: H };
    }
    /**
     * Checks whether Point is free of torsion elements (is in prime subgroup).
     * Always torsion-free for cofactor=1 curves.
     */
    isTorsionFree() {
      return s === vt ? !0 : b ? b(_, this) : ht.mulUnsafe(this, a).is0();
    }
    clearCofactor() {
      return s === vt ? this : d ? d(_, this) : this.multiplyUnsafe(s);
    }
    isSmallOrder() {
      return s === vt ? this.is0() : this.clearCofactor().is0();
    }
    toBytes(u = !0) {
      return At(u, "isCompressed"), this.assertValidity(), O(_, this, u);
    }
    toHex(u = !0) {
      return qn(this.toBytes(u));
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
  };
  l(_, "BASE", new _(o.Gx, o.Gy, r.ONE)), l(_, "ZERO", new _(r.ZERO, r.ONE, r.ZERO)), l(_, "Fp", r), l(_, "Fn", i);
  let Q = _;
  const Ft = (g) => Ci(Q, g), ht = new ki(Q, h);
  return ht.bits >= 6 && Q.BASE.precompute(6), Object.freeze(Q.prototype), Object.freeze(Q), Q;
}
function fr(e) {
  return Uint8Array.of(e ? 2 : 3);
}
function dr(e, t) {
  return {
    secretKey: t.BYTES,
    publicKey: 1 + e.BYTES,
    publicKeyUncompressed: 1 + 2 * e.BYTES,
    publicKeyHasPrefix: !0,
    // Raw compact `(r || s)` signature width; DER and recovered signatures use
    // different lengths outside this helper.
    signature: 2 * t.BYTES
  };
}
function zi(e, t = {}) {
  Wt(e);
  const { Fn: n } = e, r = t.randomBytes === void 0 ? De : t.randomBytes, i = Object.assign(dr(e.Fp, n), {
    seed: Math.max(Ye(n.ORDER), 16)
  });
  function o(w) {
    try {
      const h = n.fromBytes(w);
      return n.isValidNot0(h);
    } catch {
      return !1;
    }
  }
  function s(w, h) {
    const { publicKey: E, publicKeyUncompressed: x } = i;
    try {
      const R = w.length;
      return h === !0 && R !== E || h === !1 && R !== x ? !1 : !e.fromBytes(w).is0();
    } catch {
      return !1;
    }
  }
  function a(w) {
    return w = w === void 0 ? r(i.seed) : w, ir(Z(w, i.seed, "seed"), n.ORDER);
  }
  function c(w, h = !0) {
    return e.BASE.multiply(n.fromBytes(w)).toBytes(h);
  }
  function f(w) {
    const { secretKey: h, publicKey: E, publicKeyUncompressed: x } = i, R = n._lengths;
    if (!le(w))
      return;
    const C = Z(w, void 0, "key").length, M = C === E || C === x, O = C === h || !!(R != null && R.includes(C));
    if (!(M && O))
      return M;
  }
  function d(w, h, E = !0) {
    if (f(w) === !0)
      throw new Error("first arg must be private key");
    if (f(h) === !1)
      throw new Error("second arg must be public key");
    const x = n.fromBytes(w), R = e.fromBytes(h);
    if (R.is0())
      throw new Error("invalid public key: point at infinity");
    return R.multiply(x).toBytes(E);
  }
  const b = {
    isValidSecretKey: o,
    isValidPublicKey: s,
    randomSecretKey: a
  }, p = Pi(a, c);
  return Object.freeze(b), Object.freeze(i), Object.freeze({ getPublicKey: c, getSharedSecret: d, keygen: p, Point: e, utils: b, lengths: i });
}
function Xi(e, t, n = {}) {
  Wt(e);
  const r = t;
  Fn(r), Gt(n, {}, {
    hmac: "function",
    lowS: "boolean",
    randomBytes: "function",
    bits2int: "function",
    bits2int_modN: "function"
  });
  const i = Object.assign({}, n), o = i.randomBytes === void 0 ? De : i.randomBytes, s = i.hmac === void 0 ? (_, g) => Ie(r, _, g) : i.hmac, { Fp: a, Fn: c } = e, { ORDER: f, BITS: d } = c, b = Ye(f), p = or(o, b), { keygen: w, getPublicKey: h, getSharedSecret: E, utils: x, lengths: R } = zi(e, i), C = {
    prehash: !0,
    lowS: typeof i.lowS == "boolean" ? i.lowS : !0,
    format: "compact",
    extraEntropy: !1
  }, M = f * ar + vt < a.ORDER;
  function O(_) {
    const g = f >> vt;
    return _ > g;
  }
  function P(_, g) {
    if (!c.isValidNot0(g))
      throw new Error(`invalid signature ${_}: out of range 1..Point.Fn.ORDER`);
    return g;
  }
  function U() {
    if (!a.isOdd)
      throw new Error("Field doesn't support isOdd");
  }
  function K(_, g, u) {
    return U(), (_ === u ? 0 : 2) | Number(a.isOdd(g));
  }
  function it() {
    if (M)
      throw new Error('"recovered" sig type is not supported for cofactor >2 curves');
  }
  function j(_, g) {
    Te(g);
    const u = R.signature, y = g === "compact" ? u : g === "recovered" ? u + 1 : void 0;
    return Z(_, y);
  }
  class D {
    constructor(g, u, y) {
      l(this, "r");
      l(this, "s");
      l(this, "recovery");
      if (this.r = P("r", g), this.s = P("s", u), y != null) {
        if (it(), ![0, 1, 2, 3].includes(y))
          throw new Error("invalid recovery id");
        this.recovery = y;
      }
      Object.freeze(this);
    }
    static fromBytes(g, u = C.format) {
      j(g, u);
      let y;
      if (u === "der") {
        if (g.length > 2 * c.BYTES + 16)
          throw new ye.Err("invalid signature: DER signature too long");
        const { r: v, s: S } = ye.toSig(Z(g), c.BYTES + 1);
        return new D(v, S);
      }
      u === "recovered" && (y = g[0], u = "compact", g = g.subarray(1));
      const m = R.signature / 2, B = g.subarray(0, m), A = g.subarray(m, m * 2);
      return new D(c.fromBytes(B), c.fromBytes(A), y);
    }
    static fromHex(g, u) {
      return this.fromBytes(Se(g), u);
    }
    assertRecovery() {
      const { recovery: g } = this;
      if (g == null)
        throw new Error("invalid recovery id: must be present");
      return g;
    }
    addRecoveryBit(g) {
      return new D(this.r, this.s, g);
    }
    // Unlike the top-level helper below, this method expects a digest that has
    // already been hashed to the curve's message representative.
    recoverPublicKey(g) {
      const { r: u, s: y } = this, m = this.assertRecovery(), B = m === 2 || m === 3 ? u + f : u;
      if (!a.isValid(B))
        throw new Error("invalid recovery id: sig.r+curve.n != R.x");
      const A = a.toBytes(B), v = e.fromBytes(yt(fr((m & 1) === 0), A)), S = c.inv(B), I = et(Z(g, void 0, "msgHash")), H = c.create(-I * S), T = c.create(y * S), N = e.BASE.mulAddUnsafe(H, v, T);
      if (N.is0())
        throw new Error("invalid recovery: point at infinify");
      return N.assertValidity(), N;
    }
    // Signatures should be low-s, to prevent malleability.
    hasHighS() {
      return O(this.s);
    }
    toBytes(g = C.format) {
      if (Te(g), g === "der")
        return Se(ye.hexFromSig(this));
      const { r: u, s: y } = this, m = c.toBytes(u), B = c.toBytes(y);
      return g === "recovered" ? (it(), yt(Uint8Array.of(this.assertRecovery()), m, B)) : yt(m, B);
    }
    toHex(g) {
      return qn(this.toBytes(g));
    }
  }
  Object.freeze(D.prototype), Object.freeze(D);
  const ot = i.bits2int === void 0 ? function(g) {
    if (g.length > 8192)
      throw new Error("input is too large");
    const u = Nt(g), y = g.length * 8 - d;
    return y > 0 ? u >> BigInt(y) : u;
  } : i.bits2int, et = i.bits2int_modN === void 0 ? function(g) {
    return c.create(ot(g));
  } : i.bits2int_modN, nt = Pe(d);
  function lt(_) {
    return Xn("num < 2^" + d, _, ft, nt), c.toBytes(_);
  }
  function st(_, g) {
    return Z(_, void 0, "message"), g ? Z(r(_), void 0, "prehashed message") : _;
  }
  function xt(_, g, u) {
    const { lowS: y, prehash: m, extraEntropy: B } = me(u, C);
    _ = st(_, m);
    const A = et(_), v = c.fromBytes(g);
    if (!c.isValidNot0(v))
      throw new Error("invalid private key");
    const S = [lt(v), lt(A)];
    if (B != null && B !== !1) {
      const N = B === !0 ? o(R.secretKey) : B;
      S.push(Z(N, void 0, "extraEntropy"));
    }
    const I = yt(...S), H = A;
    function T(N) {
      const $ = ot(N);
      if (!c.isValidNot0($))
        return;
      const q = e.BASE.multiply($).toAffine(), G = c.create(q.x);
      if (G === ft)
        return;
      let F;
      if (p !== void 0) {
        const Dt = Nt(ir(p(b), f)), Ur = c.inv(c.mul(Dt, $)), Lr = c.mul(Dt, H), Nr = c.mul(Dt, v);
        F = c.create(Ur * c.create(Lr + Nr * G));
      } else {
        const Dt = _i($, f);
        F = c.create(Dt * c.create(H + G * v));
      }
      if (F === ft)
        return;
      let W = K(q.x, q.y, G), en = F;
      return y && O(F) && (en = c.neg(F), W ^= 1), new D(G, en, M ? void 0 : W);
    }
    return { seed: I, k2sig: T };
  }
  function Q(_, g, u = {}) {
    const { seed: y, k2sig: m } = xt(_, g, u);
    return yi(r.outputLen, c.BYTES, s)(y, m).toBytes(u.format);
  }
  function Ft(_, g, u, y = {}) {
    const { lowS: m, prehash: B, format: A } = me(y, C);
    if (u = Z(u, void 0, "publicKey"), g = st(g, B), !le(_)) {
      const v = _ instanceof D ? ", use sig.toBytes()" : "";
      throw new Error("verify expects Uint8Array signature" + v);
    }
    j(_, A);
    try {
      const v = D.fromBytes(_, A), S = e.fromBytes(u);
      if (S.is0() || m && v.hasHighS())
        return !1;
      const { r: I, s: H } = v, T = et(g), N = c.inv(H), $ = c.create(T * N), q = c.create(I * N), G = e.BASE.mulAddUnsafe($, S, q);
      if (G.is0())
        return !1;
      const F = G.toAffine();
      return !(c.create(F.x) !== I || A === "recovered" && v.recovery !== K(F.x, F.y, I));
    } catch {
      return !1;
    }
  }
  function ht(_, g, u = {}) {
    const { prehash: y } = me(u, C);
    return g = st(g, y), D.fromBytes(_, "recovered").recoverPublicKey(g).toBytes();
  }
  return Object.freeze({
    keygen: w,
    getPublicKey: h,
    getSharedSecret: E,
    utils: x,
    lengths: R,
    Point: e,
    sign: Q,
    verify: Ft,
    recoverPublicKey: ht,
    Signature: D,
    hash: r
  });
}
const ze = {
  p: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
  n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
  h: BigInt(1),
  a: BigInt(0),
  b: BigInt(7),
  Gx: BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
  Gy: BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
}, Gi = {
  beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
  basises: [
    [BigInt("0x3086d221a7d46bcde86c90e49284eb15"), -BigInt("0xe4437ed6010e88286f547fa90abfe4c3")],
    [BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8"), BigInt("0x3086d221a7d46bcde86c90e49284eb15")]
  ]
}, vn = /* @__PURE__ */ BigInt(2);
function Wi(e) {
  const t = ze.p, n = BigInt(3), r = BigInt(6), i = BigInt(11), o = BigInt(22), s = BigInt(23), a = BigInt(44), c = BigInt(88), f = e * e * e % t, d = f * f * e % t, b = tt(d, n, t) * d % t, p = tt(b, n, t) * d % t, w = tt(p, vn, t) * f % t, h = tt(w, i, t) * w % t, E = tt(h, o, t) * h % t, x = tt(E, a, t) * E % t, R = tt(x, c, t) * x % t, C = tt(R, a, t) * E % t, M = tt(C, n, t) * d % t, O = tt(M, s, t) * h % t, P = tt(O, r, t) * f % t, U = tt(P, vn, t);
  if (!Ce.eql(Ce.sqr(U), e))
    throw new Error("Cannot find square root");
  return U;
}
const Ce = /* @__PURE__ */ he(ze.p, { sqrt: Wi }), Vi = /* @__PURE__ */ Zi(ze, {
  Fp: Ce,
  endo: Gi
}), Ct = /* @__PURE__ */ Xi(Vi, Fe), Ji = /* @__PURE__ */ Uint8Array.from([
  7,
  4,
  13,
  1,
  10,
  6,
  15,
  3,
  12,
  0,
  9,
  5,
  2,
  14,
  11,
  8
]), ur = Uint8Array.from(new Array(16).fill(0).map((e, t) => t)), Qi = ur.map((e) => (9 * e + 5) % 16), lr = /* @__PURE__ */ (() => {
  const n = [[ur], [Qi]];
  for (let r = 0; r < 4; r++)
    for (let i of n)
      i.push(i[r].map((o) => Ji[o]));
  return n;
})(), hr = lr[0], pr = lr[1], wr = /* @__PURE__ */ [
  [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8],
  [12, 13, 11, 15, 6, 9, 9, 7, 12, 15, 11, 13, 7, 8, 7, 7],
  [13, 15, 14, 11, 7, 7, 6, 8, 13, 14, 13, 12, 5, 5, 6, 9],
  [14, 11, 12, 14, 8, 6, 5, 5, 15, 12, 15, 14, 9, 9, 8, 6],
  [15, 12, 13, 13, 9, 5, 8, 6, 14, 11, 12, 11, 8, 6, 5, 5]
].map((e) => Uint8Array.from(e)), to = /* @__PURE__ */ hr.map((e, t) => e.map((n) => wr[t][n])), eo = /* @__PURE__ */ pr.map((e, t) => e.map((n) => wr[t][n])), no = /* @__PURE__ */ Uint32Array.from([
  0,
  1518500249,
  1859775393,
  2400959708,
  2840853838
]), ro = /* @__PURE__ */ Uint32Array.from([
  1352829926,
  1548603684,
  1836072691,
  2053994217,
  0
]);
function _n(e, t, n, r) {
  return e === 0 ? t ^ n ^ r : e === 1 ? t & n | ~t & r : e === 2 ? (t | ~n) ^ r : e === 3 ? t & r | n & ~r : t ^ (n | ~r);
}
const ne = /* @__PURE__ */ new Uint32Array(16);
class io extends Ne {
  constructor() {
    super(64, 20, 8, !0);
    l(this, "h0", 1732584193);
    l(this, "h1", -271733879);
    l(this, "h2", -1732584194);
    l(this, "h3", 271733878);
    l(this, "h4", -1009589776);
  }
  get() {
    const { h0: n, h1: r, h2: i, h3: o, h4: s } = this;
    return [n, r, i, o, s];
  }
  set(n, r, i, o, s) {
    this.h0 = n | 0, this.h1 = r | 0, this.h2 = i | 0, this.h3 = o | 0, this.h4 = s | 0;
  }
  _cloneInto(n) {
    return (n || (n = new this.constructor())).set(...this.get()), this._cloneIntoMeta(n);
  }
  process(n, r) {
    for (let h = 0; h < 16; h++, r += 4)
      ne[h] = n.getUint32(r, !0);
    let i = this.h0 | 0, o = i, s = this.h1 | 0, a = s, c = this.h2 | 0, f = c, d = this.h3 | 0, b = d, p = this.h4 | 0, w = p;
    for (let h = 0; h < 5; h++) {
      const E = 4 - h, x = no[h], R = ro[h], C = hr[h], M = pr[h], O = to[h], P = eo[h];
      for (let U = 0; U < 16; U++) {
        const K = te(i + _n(h, s, c, d) + ne[C[U]] + x, O[U]) + p | 0;
        i = p, p = d, d = te(c, 10) | 0, c = s, s = K;
      }
      for (let U = 0; U < 16; U++) {
        const K = te(o + _n(E, a, f, b) + ne[M[U]] + R, P[U]) + w | 0;
        o = w, w = b, b = te(f, 10) | 0, f = a, a = K;
      }
    }
    this.set(this.h1 + c + b | 0, this.h2 + d + w | 0, this.h3 + p + o | 0, this.h4 + i + a | 0, this.h0 + s + f | 0);
  }
  roundClean() {
    ut(ne);
  }
  destroy() {
    this.destroyed = !0, ut(this.buffer), this.set(0, 0, 0, 0, 0);
  }
}
const oo = /* @__PURE__ */ de(() => new io());
const so = (e) => Object.freeze(e());
function co(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
function Zt(e) {
  if (!co(e))
    throw new TypeError("Uint8Array expected");
}
function gr(e) {
  if (typeof e != "function")
    throw new TypeError("function expected");
  return !0;
}
function br(e, t) {
  if (typeof t != "string")
    throw new TypeError(`${e}: string expected`);
  return !0;
}
function ao(e, t = "number") {
  if (typeof e != "number")
    throw new TypeError(`${t}: expected number, got ${typeof e}`);
  if (!Number.isSafeInteger(e))
    throw new RangeError(`${t}: expected safe integer, got ${e}`);
}
function fo(...e) {
  const t = (o) => o, n = (o, s) => (a) => o(s(a)), r = e.map((o) => o.encode).reduceRight(n, t), i = e.map((o) => o.decode).reduce(n, t);
  return { encode: r, decode: i };
}
const Bn = /* @__PURE__ */ (() => {
  try {
    const e = new TextDecoder();
    return e.decode(Uint8Array.of(65, 48, 43, 127)) === "A0+" ? e : void 0;
  } catch {
    return;
  }
})(), Ee = 8192;
function uo(e) {
  const t = e.length;
  if (Bn !== void 0 && t >= 12)
    return Bn.decode(e);
  if (t <= Ee)
    return String.fromCharCode.apply(null, e);
  let n = "";
  for (let r = 0; r < t; r += Ee)
    n += String.fromCharCode.apply(null, e.subarray(r, r + Ee));
  return n;
}
function lo(e, t) {
  const n = e.length;
  if (n > 128)
    throw new Error("alphabet: max 128 letters");
  const r = new Uint8Array(n), i = new Int8Array(128).fill(-1);
  for (let o = 0; o < n; o++) {
    const s = e.charCodeAt(o);
    if (e.codePointAt(o) !== s || s > 127)
      throw new Error("alphabet: single-char ASCII letters only");
    r[o] = s, i[s] = o;
  }
  if (t !== void 0)
    for (const o of Object.keys(t)) {
      const s = o.charCodeAt(0), a = i[t[o].charCodeAt(0)];
      if (o.length !== 1 || s > 127 || a === void 0 || a === -1)
        throw new Error(`alphabet: invalid alias ${o}`);
      i[s] = a;
    }
  return {
    encode: (o) => {
      const s = new Uint8Array(o.length);
      for (let a = 0; a < o.length; a++) {
        const c = o[a], f = r[c];
        if (f === void 0)
          throw new Error(`alphabet.encode: invalid digit ${c}`);
        s[a] = f;
      }
      return uo(s);
    },
    decode: (o) => {
      br("decode", o);
      const s = o.length, a = new Uint8Array(s);
      for (let c = 0; c < s; c++) {
        const f = o.charCodeAt(c), d = f < 128 ? i[f] : -1;
        if (d === -1)
          throw new Error(`Unknown letter "${o[c]}". Allowed: ${e}`);
        a[c] = d;
      }
      return a;
    }
  };
}
function ho(e, t) {
  if (ao(e), e <= 0)
    throw new RangeError(`checksum length must be positive: ${e}`);
  gr(t);
  const n = t;
  return {
    encode(r) {
      Zt(r);
      const i = n(r).slice(0, e), o = new Uint8Array(r.length + e);
      return o.set(r), o.set(i, r.length), o;
    },
    decode(r) {
      Zt(r);
      const i = r.slice(0, -e), o = r.slice(-e), s = n(i).slice(0, e);
      for (let a = 0; a < e; a++)
        if (s[a] !== o[a])
          throw new Error("Invalid checksum");
      return i;
    }
  };
}
const po = 656356768, An = 65536, wo = 2048, go = 4096, bo = (e, t) => ({
  encode: (n) => {
    Zt(n);
    const r = n.length;
    if (r === 0)
      return new Uint8Array(0);
    if (r >= An)
      throw new Error("invalid length");
    let i = 0;
    for (; i < r - 1 && n[i] === 0; )
      i++;
    const o = Math.ceil(r / 2), s = new Uint16Array(o), a = r & 1;
    a && (s[0] = n[0]);
    for (let h = a, E = a; h < r; h += 2, E++)
      s[E] = n[h] << 8 | n[h + 1];
    const c = [];
    let f = 0;
    for (; f < o; ) {
      let h = 0;
      for (let E = f; E < o; E++) {
        const x = h * 65536 + s[E], R = Math.floor(x / t);
        h = x - R * t, s[E] = R, R === 0 && E === f && f++;
      }
      c.push(h);
    }
    const d = c.length - 1;
    let b = d * 5;
    for (let h = c[d]; b++, !(h < e); h = Math.floor(h / e))
      ;
    const p = new Uint8Array(i + b);
    let w = p.length - 1;
    for (let h = 0; h < d; h++) {
      let E = c[h];
      for (let x = 0; x < 5; x++)
        p[w--] = E % e, E = Math.floor(E / e);
    }
    for (let h = c[d]; w >= i; h = Math.floor(h / e))
      p[w--] = h % e;
    return p;
  },
  decode: (n) => {
    Zt(n);
    const r = n.length;
    if (r === 0)
      return new Uint8Array(0);
    if (r >= An)
      throw new Error("invalid length");
    let i = 0;
    for (; i < r - 1 && n[i] === 0; )
      i++;
    const o = new Uint16Array(Math.ceil(r * 6 / 16) + 1);
    let s = 0, a = 0, c = r % 5 || 5;
    for (; a < r; ) {
      let p = 0, w = 1;
      for (const E = a + c; a < E; a++) {
        const x = n[a];
        if (x >= e)
          throw new Error(`invalid integer: ${x}`);
        p = p * e + x, w *= e;
      }
      c = 5;
      let h = p;
      for (let E = 0; E < s; E++) {
        const x = o[E] * w + h;
        h = Math.floor(x / 65536), o[E] = x - h * 65536;
      }
      for (; h > 0; h = Math.floor(h / 65536))
        o[s++] = h % 65536;
    }
    const f = s === 0 ? 1 : s * 2 - (o[s - 1] < 256 ? 1 : 0), d = new Uint8Array(i + f);
    let b = d.length - 1;
    for (let p = 0; p < s; p++) {
      const w = o[p];
      d[b--] = w & 255, b >= i && (d[b--] = w >> 8);
    }
    return d;
  }
}), yo = (e, t) => {
  const n = lo(t);
  return {
    encode(r) {
      if (Zt(r), r.length > wo)
        throw new Error("invalid length");
      return n.encode(e.encode(r));
    },
    decode(r) {
      if (br("baseN.decode", r), r.length > go)
        throw new Error("invalid length");
      return e.decode(n.decode(r));
    }
  };
}, mo = /* @__PURE__ */ bo(58, po), xo = (e) => yo(mo, e), Eo = /* @__PURE__ */ so(() => xo("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz")), vo = (e) => {
  gr(e);
  const t = e;
  return fo(ho(4, (n) => t(t(n))), Eo);
};
const Pt = Ct.Point, Ot = Pt.Fn, ve = /* @__PURE__ */ vo(Fe), _o = Uint8Array.from("Bitcoin seed".split(""), (e) => e.charCodeAt(0)), _e = { private: 76066276, public: 76067358 }, re = 2147483648, Be = 255, Bo = (e) => oo(Fe(e)), Ao = (e) => Ht(e).getUint32(0, !1), bt = (e, t = "number") => {
  if (typeof e != "number")
    throw new TypeError(`"${t}" expected number, got type=${typeof e}`);
  if (!Number.isSafeInteger(e) || e < 0 || e > 2 ** 32 - 1)
    throw new RangeError(`"${t}" expected integer in range 0..2**32-1, got ${e}`);
  const n = new Uint8Array(4);
  return Ht(n).setUint32(0, e, !1), n;
}, Ae = (e, t = "versions") => {
  if (!(typeof e == "object" && e !== null))
    throw new Error("versions must be an object");
  return bt(e.private, `${t}.private`), bt(e.public, `${t}.public`), e;
};
class Et {
  constructor(t) {
    l(this, "versions");
    l(this, "depth", 0);
    l(this, "index", 0);
    l(this, "parentFingerprint", 0);
    l(this, "_chainCode", null);
    l(this, "_privateKey");
    l(this, "_publicKey");
    l(this, "_pubHash");
    var o, s, a;
    if (!t || typeof t != "object")
      throw new Error("HDKey.constructor must not be called directly");
    const n = (o = t.depth) != null ? o : 0, r = (s = t.index) != null ? s : 0, i = (a = t.parentFingerprint) != null ? a : 0;
    if (!Number.isSafeInteger(n) || n < 0 || n > Be)
      throw new RangeError("HDKey: depth must be an integer in range 0..255");
    if (bt(r, "index"), bt(i, "parentFingerprint"), n === 0 && (r !== 0 || i !== 0))
      throw new Error("HDKey: zero depth with non-zero index/parent fingerprint");
    if (this.versions = t.versions ? Ae(t.versions) : _e, this.depth = n, t.chainCode && Y(t.chainCode, 32), this._chainCode = t.chainCode ? Uint8Array.from(t.chainCode) : null, this.index = r, this.parentFingerprint = i, t.publicKey && t.privateKey)
      throw new Error("HDKey: publicKey and privateKey at same time.");
    if (t.privateKey) {
      if (!Ct.utils.isValidSecretKey(t.privateKey))
        throw new Error("Invalid private key");
      this._privateKey = Uint8Array.from(t.privateKey), this._publicKey = Ct.getPublicKey(this._privateKey, !0);
    } else if (t.publicKey)
      this._publicKey = Pt.fromBytes(t.publicKey).toBytes(!0);
    else
      throw new Error("HDKey: no public or private key provided");
    this._pubHash = Bo(this._publicKey);
  }
  get fingerprint() {
    if (!this._pubHash)
      throw new Error("No publicKey set!");
    return Ao(this._pubHash);
  }
  get identifier() {
    return this._pubHash ? Uint8Array.from(this._pubHash) : void 0;
  }
  get pubKeyHash() {
    return this._pubHash ? Uint8Array.from(this._pubHash) : void 0;
  }
  get privateKey() {
    return this._privateKey ? Uint8Array.from(this._privateKey) : null;
  }
  get publicKey() {
    return this._publicKey ? Uint8Array.from(this._publicKey) : null;
  }
  get chainCode() {
    return this._chainCode ? Uint8Array.from(this._chainCode) : null;
  }
  get privateExtendedKey() {
    const t = this._privateKey;
    if (!t)
      throw new Error("No private key");
    return ve.encode(this.serialize(this.versions.private, Mt(Uint8Array.of(0), t)));
  }
  get publicExtendedKey() {
    if (!this._publicKey)
      throw new Error("No public key");
    return ve.encode(this.serialize(this.versions.public, this._publicKey));
  }
  static fromMasterSeed(t, n = _e) {
    if (Y(t), n = Ae(n), 8 * t.length < 128 || 8 * t.length > 512)
      throw new RangeError("HDKey: seed length must be between 128 and 512 bits; 256 bits is advised, got " + t.length);
    const r = Ie(dn, _o, t), i = r.slice(0, 32), o = r.slice(32);
    return new Et({ versions: n, chainCode: o, privateKey: i });
  }
  static fromExtendedKey(t, n = _e) {
    n = Ae(n);
    const r = ve.decode(t);
    if (r.length !== 78)
      throw new Error(`HDKey: invalid extended key length: expected 78 bytes, got ${r.length}`);
    const i = Ht(r), o = i.getUint32(0, !1), s = {
      versions: n,
      depth: r[4],
      parentFingerprint: i.getUint32(5, !1),
      index: i.getUint32(9, !1),
      chainCode: r.slice(13, 45)
    }, a = r.slice(45), c = a[0] === 0;
    if (o !== n[c ? "private" : "public"])
      throw new Error("Version mismatch");
    return c ? new Et({ ...s, privateKey: a.slice(1) }) : new Et({ ...s, publicKey: a });
  }
  static fromJSON(t) {
    return Et.fromExtendedKey("xpriv" in t ? t.xpriv : t.xpub);
  }
  derive(t) {
    if (!/^[mM]'?/.test(t))
      throw new Error('Path must start with "m" or "M"');
    if (/^[mM]'?$/.test(t))
      return this;
    const n = t.replace(/^[mM]'?\//, "").split("/");
    if (n.length > Be - this.depth)
      throw new Error("HDKey: path exceeds the serializable depth 255");
    let r = this;
    for (const i of n) {
      const o = /^(\d+)('?)$/.exec(i), s = o && o[1];
      if (!o || o.length !== 3 || typeof s != "string")
        throw new Error("invalid child index: " + i);
      let a = +s;
      if (!Number.isSafeInteger(a) || a >= re)
        throw new Error("Invalid index");
      o[2] === "'" && (a += re), r = r.deriveChild(a);
    }
    return r;
  }
  deriveChild(t) {
    return this._deriveChild(t);
  }
  /** Test-only implementation seam. Production callers must use deriveChild(). */
  _deriveChild(t, n) {
    if (!this._publicKey || !this._chainCode)
      throw new Error("No publicKey or chainCode set");
    let r = bt(t, "index");
    if (t >= re) {
      const d = this._privateKey;
      if (!d)
        throw new Error("Could not derive hardened child key");
      r = Mt(Uint8Array.of(0), d, r);
    } else
      r = Mt(this._publicKey, r);
    const i = n || Ie(dn, this._chainCode, r);
    Y(i, 64);
    const o = i.slice(0, 32), s = i.slice(32), a = {
      versions: this.versions,
      chainCode: s,
      depth: this.depth + 1,
      parentFingerprint: this.fingerprint,
      index: t
    };
    if (a.depth > Be)
      throw new Error("HDKey: depth exceeds the serializable value 255");
    const c = () => {
      const d = this._privateKey ? 4294967295 : re - 1;
      if (t >= d)
        throw new Error(`HDKey: cannot retry child derivation at index ${t}`);
      return this.deriveChild(t + 1);
    }, f = Ot.fromBytes(o, !0);
    if (!Ot.isValid(f))
      return c();
    if (this._privateKey) {
      const d = Ot.create(Ot.fromBytes(this._privateKey) + f);
      if (!Ot.isValidNot0(d))
        return c();
      a.privateKey = Ot.toBytes(d);
    } else {
      const d = Pt.fromBytes(this._publicKey), b = f === 0n ? d : d.add(Pt.BASE.multiply(f));
      if (b.equals(Pt.ZERO))
        return c();
      a.publicKey = b.toBytes(!0);
    }
    return new Et(a);
  }
  sign(t) {
    if (!this._privateKey)
      throw new Error("No privateKey set!");
    return Y(t, 32), Ct.sign(t, this._privateKey, { prehash: !1 });
  }
  verify(t, n) {
    if (Y(t, 32), Y(n, 64), !this._publicKey)
      throw new Error("No publicKey set!");
    return Ct.verify(n, t, this._publicKey, { prehash: !1 });
  }
  wipePrivateData() {
    return this._privateKey && (this._privateKey.fill(0), this._privateKey = void 0), this;
  }
  // TODO(v3): Make automatic JSON serialization public-only so JSON.stringify cannot expose xpriv.
  toJSON() {
    return this.toPrivateJSON();
  }
  /**
   * Explicitly exports private key material. Treat the returned value as a secret.
   */
  toPrivateJSON() {
    return {
      xpriv: this.privateExtendedKey,
      xpub: this.publicExtendedKey
    };
  }
  serialize(t, n) {
    if (!this._chainCode)
      throw new Error("No chainCode set");
    return Y(n, 33), Mt(bt(t, "version"), new Uint8Array([this.depth]), bt(this.parentFingerprint, "parentFingerprint"), bt(this.index, "index"), this._chainCode, n);
  }
}
const Ro = BigInt(0), $t = BigInt(1), Io = BigInt(2), So = BigInt(7), Oo = BigInt(256), To = BigInt(113), yr = [], mr = [], xr = [];
for (let e = 0, t = $t, n = 1, r = 0; e < 24; e++) {
  [n, r] = [r, (2 * n + 3 * r) % 5], yr.push(2 * (5 * r + n)), mr.push((e + 1) * (e + 2) / 2 % 64);
  let i = Ro;
  for (let o = 0; o < 7; o++)
    t = (t << $t ^ (t >> So) * To) % Oo, t & Io && (i ^= $t << ($t << BigInt(o)) - $t);
  xr.push(i);
}
const Er = Nn(xr, !0), Co = Er[0], Ho = Er[1], Uo = (e, t, n) => e << n | t >>> 32 - n, Lo = (e, t, n) => t << n | e >>> 32 - n, No = (e, t, n) => t << n - 32 | e >>> 64 - n, Fo = (e, t, n) => e << n - 32 | t >>> 64 - n, Rn = (e, t, n) => n > 32 ? No(e, t, n) : Uo(e, t, n), In = (e, t, n) => n > 32 ? Fo(e, t, n) : Lo(e, t, n), Tt = new Uint32Array(10);
function Do(e, t = 24) {
  if (!(e instanceof Uint32Array))
    throw new TypeError('"s" expected Uint32Array(50), got type=' + typeof e);
  if (e.length !== 50)
    throw new RangeError('"s" expected Uint32Array(50), got length=' + e.length);
  if (V(t, "rounds"), t < 1 || t > 24)
    throw new Error('"rounds" expected integer 1..24');
  for (let n = 24 - t; n < 24; n++) {
    for (let o = 0; o < 10; o++)
      Tt[o] = e[o] ^ e[o + 10] ^ e[o + 20] ^ e[o + 30] ^ e[o + 40];
    for (let o = 0; o < 10; o += 2) {
      const s = (o + 8) % 10, a = (o + 2) % 10, c = Tt[a], f = Tt[a + 1], d = Rn(c, f, 1) ^ Tt[s], b = In(c, f, 1) ^ Tt[s + 1];
      for (let p = 0; p < 50; p += 10)
        e[o + p] ^= d, e[o + p + 1] ^= b;
    }
    let r = e[2], i = e[3];
    for (let o = 0; o < 24; o++) {
      const s = mr[o], a = Rn(r, i, s), c = In(r, i, s), f = yr[o];
      r = e[f], i = e[f + 1], e[f] = a, e[f + 1] = c;
    }
    for (let o = 0; o < 50; o += 10) {
      const s = e[o], a = e[o + 1], c = e[o + 2], f = e[o + 3];
      e[o] ^= ~e[o + 2] & e[o + 4], e[o + 1] ^= ~e[o + 3] & e[o + 5], e[o + 2] ^= ~e[o + 4] & e[o + 6], e[o + 3] ^= ~e[o + 5] & e[o + 7], e[o + 4] ^= ~e[o + 6] & e[o + 8], e[o + 5] ^= ~e[o + 7] & e[o + 9], e[o + 6] ^= ~e[o + 8] & s, e[o + 7] ^= ~e[o + 9] & a, e[o + 8] ^= ~s & c, e[o + 9] ^= ~a & f;
    }
    e[0] ^= Co[n], e[1] ^= Ho[n];
  }
  ut(Tt);
}
class Xe {
  // NOTE: we accept arguments in bytes instead of bits here.
  constructor(t, n, r, i = !1, o = 24) {
    l(this, "state");
    l(this, "pos", 0);
    l(this, "posOut", 0);
    l(this, "finished", !1);
    l(this, "state32");
    l(this, "destroyed", !1);
    l(this, "blockLen");
    l(this, "suffix");
    l(this, "outputLen");
    l(this, "canXOF");
    l(this, "enableXOF", !1);
    l(this, "rounds");
    if (V(t, "blockLen"), V(n, "suffix"), V(o, "rounds"), Xr(i, "enableXOF"), this.blockLen = t, this.suffix = n, this.outputLen = r, this.enableXOF = i, this.canXOF = i, this.rounds = o, V(r, "outputLen"), !(0 < t && t < 200))
      throw new Error('"blockLen" must be 1..199');
    this.state = new Uint8Array(200), this.state32 = cn(this.state);
  }
  clone() {
    return this._cloneInto();
  }
  keccak() {
    an(this.state32), Do(this.state32, this.rounds), an(this.state32), this.posOut = 0, this.pos = 0;
  }
  update(t) {
    Lt(this), Y(t);
    const { blockLen: n, state: r, state32: i } = this, o = t.length, s = n % 4 === 0 && t.byteOffset % 4 === 0, a = n / 4, c = s && o >= n ? cn(t) : void 0;
    for (let f = 0; f < o; ) {
      if (c !== void 0 && this.pos === 0 && f % 4 === 0 && o - f >= n) {
        for (let b = 0, p = f / 4; b < a; b++)
          i[b] ^= c[p + b];
        f += n, this.pos = n, this.keccak();
        continue;
      }
      const d = Math.min(n - this.pos, o - f);
      for (let b = 0; b < d; b++)
        r[this.pos++] ^= t[f++];
      this.pos === n && this.keccak();
    }
    return this;
  }
  finish() {
    if (this.finished)
      return;
    this.finished = !0;
    const { state: t, suffix: n, pos: r, blockLen: i } = this;
    t[r] ^= n, (n & 128) !== 0 && r === i - 1 && this.keccak(), t[i - 1] ^= 128, this.keccak();
  }
  writeInto(t) {
    Lt(this, !1), Y(t), this.finish();
    const n = this.state, { blockLen: r } = this;
    for (let i = 0, o = t.length; i < o; ) {
      this.posOut >= r && this.keccak();
      const s = Math.min(r - this.posOut, o - i);
      t.set(n.subarray(this.posOut, this.posOut + s), i), this.posOut += s, i += s;
    }
    return t;
  }
  xofInto(t) {
    if (!this.enableXOF)
      throw new Error("XOF is not enabled");
    return this.writeInto(t);
  }
  xof(t) {
    return V(t), this.xofInto(new Uint8Array(t));
  }
  digestInto(t) {
    if (Ue(t, this), this.finished)
      throw new Error("digest() was already called");
    this.writeInto(t.length === this.outputLen ? t : t.subarray(0, this.outputLen)), this.destroy();
  }
  digest() {
    const t = new Uint8Array(this.outputLen);
    return this.digestInto(t), t;
  }
  destroy() {
    this.destroyed = !0, ut(this.state);
  }
  _cloneInto(t) {
    const { blockLen: n, suffix: r, outputLen: i, rounds: o, enableXOF: s } = this;
    return t || (t = new Xe(n, r, i, s, o)), t.blockLen = n, t.state32.set(this.state32), t.pos = this.pos, t.posOut = this.posOut, t.finished = this.finished, t.rounds = o, t.suffix = r, t.outputLen = i, t.enableXOF = s, t.canXOF = this.canXOF, t.destroyed = this.destroyed, t;
  }
}
const $o = (e, t, n, r = {}) => de(() => new Xe(t, e, n), r), vr = /* @__PURE__ */ $o(1, 136, 32), zt = 2147483648, Sn = [
  {
    id: "bip44",
    label: "BIP44",
    xpubPath: "m/44'/60'/{account}'",
    receiveTemplate: "m/44'/60'/{account}'/0/{index}",
    changeTemplate: "m/44'/60'/{account}'/1/{index}",
    note: "MetaMask、OKX Web3、Trust Wallet、imToken 默认路径"
  }
];
function ko(e) {
  const t = Sn.find((n) => n.id === e);
  if (!t)
    throw new dt("PATH_INVALID", `unknown derivation scheme: ${e}`, {
      available: Sn.map((n) => n.id)
    });
  return t;
}
function On(e, t, n = 0) {
  return e.replace("{account}", String(t)).replace("{index}", String(n));
}
function Mo(e) {
  const t = e.trim();
  if (t === "m" || t === "M" || t === "") return [];
  if (!/^m(\/|$)/u.test(t))
    throw new dt("PATH_INVALID", `path must start with m/: ${e}`);
  const n = t.replace(/^m\/?/u, "");
  return n.length === 0 ? [] : n.split("/").map((r) => {
    const i = r.endsWith("'") || r.endsWith("h") || r.endsWith("H"), o = i ? r.slice(0, -1) : r;
    if (!/^\d+$/u.test(o))
      throw new dt("PATH_INVALID", `invalid path segment "${r}" in ${e}`);
    const s = Number.parseInt(o, 10);
    if (s >= zt)
      throw new dt("PATH_INVALID", `path segment ${r} exceeds the hardened range`);
    return i ? s + zt : s;
  });
}
function Po(e) {
  return e.length === 0 ? "m" : "m/" + e.map((t) => t >= zt ? `${t - zt}'` : String(t)).join("/");
}
function Ko(e) {
  return e >= zt;
}
function qo(e, t) {
  const n = Mo(t);
  let r = e;
  for (const i of n) {
    if (Ko(i) && !r.privateKey)
      throw new dt(
        "DERIVATION_HARDENED_NEEDS_PRIVATE",
        `cannot derive hardened child ${Po([i])} from a public-only key`
      );
    r = r.deriveChild(i);
  }
  return r;
}
function jo(e) {
  if (e.length === 33) {
    const t = Ct.Point.fromBytes(e).toAffine();
    return Yo(t.x, t.y);
  }
  if (e.length === 65) {
    if (e[0] !== 4)
      throw new dt("KEY_MISSING_PRIVATE", "uncompressed public key must start with 0x04");
    return _r(e.subarray(1));
  }
  throw new dt("KEY_MISSING_PRIVATE", `unsupported public key length ${e.length}`);
}
function _r(e) {
  const t = vr(e);
  return Zo(ue(t.subarray(12)));
}
function Yo(e, t) {
  const n = new Uint8Array(64);
  return n.set(Tn(e), 0), n.set(Tn(t), 32), _r(n);
}
function Tn(e) {
  const t = new Uint8Array(32);
  let n = e;
  for (let r = 31; r >= 0; r--)
    t[r] = Number(n & 0xffn), n >>= 8n;
  if (n !== 0n) throw new dt("KEY_MISSING_PRIVATE", "coordinate does not fit in 32 bytes");
  return t;
}
function Zo(e) {
  const t = e.toLowerCase().replace(/^0x/u, "");
  if (!/^[0-9a-f]{40}$/u.test(t))
    throw new dt("TX_INVALID_FIELD", `not an EVM address: ${e}`);
  const n = ue(vr(new TextEncoder().encode(t)));
  let r = "0x";
  for (let i = 0; i < 40; i++)
    r += Number.parseInt(n[i], 16) >= 8 ? t[i].toUpperCase() : t[i];
  return r;
}
BigInt(Number.MAX_SAFE_INTEGER);
function zo(e, t, n, r) {
  const i = ko(t), o = Et.fromExtendedKey(e), s = On(i.receiveTemplate, n, r), a = On(i.xpubPath, n), c = s.slice(a.length).replace(/^\//u, ""), f = c.length === 0 ? o : qo(o, `m/${c}`);
  return {
    account: n,
    scheme: t,
    address: jo(f.publicKey),
    path: s,
    xpub: e
  };
}
const X = {
  userRejected: { code: 4001, message: "用户拒绝了请求" },
  unauthorized: { code: 4100, message: "该账户未被授权给此站点" },
  unsupportedMethod: { code: 4200, message: "NetProof Companion 不支持该方法" },
  disconnected: { code: 4900, message: "未连接硬件钱包" },
  chainDisconnected: { code: 4901, message: "当前链未连接" },
  unrecognizedChain: { code: 4902, message: "未知的链 ID" },
  internal: { code: -32603, message: "内部错误" },
  invalidParams: { code: -32602, message: "参数无效" },
  deviceRejected: { code: 4001, message: "硬件钱包拒绝了签名" }
};
class z extends Error {
  constructor({ code: n, message: r, data: i }) {
    super(r);
    l(this, "code");
    l(this, "data");
    this.name = "RpcError", this.code = n, i !== void 0 && (this.data = i);
  }
  /** The structured-clone-safe representation. */
  toShape() {
    return {
      code: this.code,
      message: this.message,
      ...this.data !== void 0 ? { data: this.data } : {}
    };
  }
}
const Cn = {
  chainId: 1,
  rpcUrls: {
    1: "https://ethereum-rpc.publicnode.com",
    10: "https://mainnet.optimism.io",
    56: "https://bsc-dataseed.binance.org",
    137: "https://polygon-bor-rpc.publicnode.com",
    8453: "https://mainnet.base.org",
    42161: "https://arb1.arbitrum.io/rpc",
    43114: "https://api.avax.network/ext/bc/C/rpc",
    11155111: "https://ethereum-sepolia-rpc.publicnode.com",
    // Solana is not an EVM chain: different JSON-RPC methods (getBalance returns
    // lamports), different address format, 9 decimals. It lives here because the user
    // experiences it as "another network in the picker".
    // NOT `api.mainnet-beta.solana.com`: that endpoint answers HTTP 403 to any request
    // carrying an `Origin` header, which is every request a browser makes. Verified by
    // sending the same JSON-RPC call with and without `Origin` — 200 without, 403 with.
    // PublicNode answers both and sends `access-control-allow-origin: *`.
    501: "https://solana-rpc.publicnode.com"
  },
  accountIndex: 0,
  schemeId: "bip44",
  addressIndex: 0,
  addressCount: 20,
  visibleAccounts: 1,
  accountNames: {},
  hiddenAccounts: [],
  qrFragmentLength: 300,
  qrFrameDurationMs: 420,
  autoBroadcast: !0
}, Xo = 501;
function Go(e) {
  return e === Xo;
}
const ie = "netproof.companion.", pe = {
  wallets: `${ie}wallets.v1`,
  settings: `${ie}settings.v1`,
  origins: `${ie}origins.v1`,
  pending: `${ie}pending.v1`
}, Wo = 200;
function Vo(e) {
  var t;
  return ((t = e.addresses) != null ? t : []).map((n, r) => ({
    address: n.address,
    path: n.path,
    scheme: "solana",
    account: r,
    index: 0
  }));
}
function Jo(e, t, n, r) {
  const i = e.accounts.find(
    (a) => a.scheme === t && a.account === n
  );
  if (!i) return [];
  const o = Math.max(1, Math.min(r, Wo)), s = [];
  for (let a = 0; a < o; a++)
    try {
      const c = zo(i.xpub, i.scheme, i.account, a);
      s.push({
        address: c.address,
        path: c.path,
        scheme: i.scheme,
        account: i.account,
        index: a
      });
    } catch {
      break;
    }
  return s;
}
function Br(e, t) {
  return Go(t.chainId) ? Vo(e).slice(t.accountIndex, t.accountIndex + 1) : Jo(
    e,
    t.schemeId,
    t.accountIndex,
    t.addressCount
  );
}
function Ar(e, t) {
  var r, i;
  const n = Br(e, t);
  return (i = (r = n[t.addressIndex]) != null ? r : n[0]) != null ? i : null;
}
class Qo {
  constructor(t) {
    l(this, "id", 0);
    l(this, "url");
    l(this, "timeoutMs");
    var n;
    this.url = t.url, this.timeoutMs = (n = t.timeoutMs) != null ? n : 2e4;
  }
  async call(t, n = []) {
    const r = new AbortController(), i = setTimeout(() => r.abort(), this.timeoutMs);
    try {
      const o = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method: t, params: n }),
        signal: r.signal
      });
      if (!o.ok)
        throw new z({
          code: X.internal.code,
          message: `RPC 节点返回 HTTP ${o.status}`
        });
      const s = await o.json();
      if (s.error)
        throw new z({
          code: s.error.code,
          message: s.error.message,
          ...s.error.data !== void 0 ? { data: s.error.data } : {}
        });
      return s.result;
    } catch (o) {
      throw o instanceof z ? o : o.name === "AbortError" ? new z({ code: X.internal.code, message: "RPC 请求超时" }) : new z({
        code: X.internal.code,
        message: `无法连接 RPC 节点：${o.message}`
      });
    } finally {
      clearTimeout(i);
    }
  }
}
function kt(e, t) {
  if (typeof e != "string" || !/^0x[0-9a-fA-F]+$/u.test(e))
    throw new z({
      code: X.internal.code,
      message: `RPC 节点返回的 ${t} 不是合法的十六进制数量：${String(e)}`
    });
  return e;
}
async function ts(e, t, n) {
  const r = new Qo({ url: n.rpcUrl });
  switch (e) {
    case "eth_getTransactionCount":
      return kt(await r.call(e, t), "nonce");
    case "eth_gasPrice":
      return kt(await r.call(e, t), "gasPrice");
    case "eth_estimateGas":
      return kt(await r.call(e, t), "gas");
    case "eth_maxPriorityFeePerGas": {
      const i = await r.call(e, t);
      return typeof i == "string" ? kt(i, "maxPriorityFeePerGas") : kt(await r.call("eth_gasPrice", []), "gasPrice");
    }
    case "eth_chainId": {
      const i = await r.call(e, t);
      return typeof i == "string" ? i : `0x${n.chainId.toString(16)}`;
    }
    case "eth_sendRawTransaction":
      return es(t[0]), r.call(e, t);
    default:
      return r.call(e, t);
  }
}
function es(e) {
  if (typeof e != "string" || !/^0x02[0-9a-fA-F]+$|^0x[0-9a-fA-F]{100,}$/u.test(e))
    throw new z({
      code: X.invalidParams.code,
      message: "拒绝广播：不是合法的已签名交易载荷"
    });
}
const ns = /* @__PURE__ */ new Set([
  "eth_blockNumber",
  "eth_call",
  "eth_chainId",
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_getBalance",
  "eth_getBlockByNumber",
  "eth_getCode",
  "eth_getLogs",
  "eth_getStorageAt",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_maxPriorityFeePerGas",
  "eth_sendRawTransaction",
  "net_version",
  "web3_clientVersion"
]), rs = {
  eth_sendTransaction: "sendTransaction",
  eth_signTransaction: "signTransaction",
  personal_sign: "personal_sign",
  eth_signTypedData_v4: "signTypedData",
  eth_signTypedData: "signTypedData"
};
async function is(e, t, n) {
  try {
    return { result: await os(e, t, n) };
  } catch (r) {
    return r instanceof z ? { error: r.toShape() } : { error: { code: X.internal.code, message: r.message } };
  }
}
async function os(e, t, n) {
  var c;
  const { wallet: r, settings: i, origin: o, approvedOrigins: s } = n;
  switch (e) {
    case "eth_chainId":
      return `0x${i.chainId.toString(16)}`;
    case "net_version":
      return String(i.chainId);
    case "wallet_getPermissions":
      return s.includes(o) ? [{ parentCapability: "eth_accounts", caveats: [] }] : [];
    /*
     * EIP-2255: a wallet that answers `wallet_requestPermissions` is expected to answer
     * `wallet_getPermissions` too, and connectors do check it after connecting. Answering
     * with an unsupported-method error where a permission list is expected is the difference
     * between "connected" and "nothing happened".
     */
    case "wallet_getPermissions":
      return s.includes(o) ? [{ parentCapability: "eth_accounts", caveats: [] }] : [];
    /*
     * EIP-5792: `{}` means "no optional capabilities". Saying so explicitly is better than an
     * unsupported-method error, because a connector that asks is deciding whether to use
     * batched calls, and "no" is a legitimate answer it can fall back from.
     */
    case "wallet_getCapabilities":
      return {};
    case "wallet_requestPermissions":
      return Hn(r), [
        {
          parentCapability: "eth_accounts",
          caveats: [{ type: "restrictReturnedAccounts", value: [(c = Ar(r, i)) == null ? void 0 : c.address] }]
        }
      ];
    case "wallet_revokePermissions":
      return null;
    case "wallet_switchEthereumChain": {
      const f = cs(t[0]);
      if (f === i.chainId) return null;
      if (!i.rpcUrls[f]) throw new z(X.unrecognizedChain);
      return await n.requestApproval({
        id: oe(),
        kind: "connect",
        origin: o,
        chainId: f,
        createdAt: Date.now(),
        method: "wallet_switchEthereumChain",
        params: t
      }), null;
    }
    case "wallet_addEthereumChain":
      throw new z({
        code: X.unsupportedMethod.code,
        message: "出于安全考虑，NetProof Companion 不接受 dApp 添加网络，请在插件设置中添加 RPC。"
      });
    case "eth_accounts":
      return !r || !s.includes(o) ? [] : He(r, i);
    case "eth_requestAccounts": {
      if (!r)
        throw await n.requestApproval({
          id: oe(),
          kind: "connect",
          origin: o,
          chainId: i.chainId,
          createdAt: Date.now(),
          method: e,
          params: []
        }), new z(X.disconnected);
      return s.includes(o) || await n.requestApproval({
        id: oe(),
        kind: "connect",
        origin: o,
        chainId: i.chainId,
        createdAt: Date.now(),
        method: e,
        params: []
      }), He(r, i);
    }
  }
  if (ns.has(e))
    return n.forward(e, t);
  const a = rs[e];
  if (a) {
    Hn(r), ss(o, s);
    const f = {
      id: oe(),
      kind: a,
      origin: o,
      chainId: i.chainId,
      createdAt: Date.now(),
      method: e,
      params: t
    };
    return n.requestApproval(f);
  }
  throw e.startsWith("wallet_") ? new z(X.unsupportedMethod) : new z({ code: -32601, message: `不支持的方法 ${e}` });
}
function He(e, t) {
  const n = new Set(t.hiddenAccounts.map((o) => o.toLowerCase())), r = Br(e, t).filter(
    (o) => !n.has(o.address.toLowerCase())
  ), i = Ar(e, t);
  return i ? [i.address, ...r.map((o) => o.address).filter((o) => o !== i.address)] : [];
}
function Hn(e) {
  if (!e)
    throw new z({
      code: X.disconnected.code,
      message: "尚未连接硬件钱包。请在插件中扫码导入 xpub。"
    });
}
function ss(e, t) {
  if (!t.includes(e))
    throw new z({
      code: X.unauthorized.code,
      message: "该站点尚未获得账户授权。请先调用 eth_requestAccounts。"
    });
}
function cs(e) {
  const t = e == null ? void 0 : e.chainId;
  if (typeof t == "string") return Number.parseInt(t.replace(/^0x/u, ""), 16);
  if (typeof t == "number") return t;
  throw new z(X.invalidParams);
}
function oe() {
  const e = new Uint8Array(16);
  return crypto.getRandomValues(e), ue(e, !0);
}
const Rr = pe.wallets, as = pe.settings, Ir = pe.origins, Ge = pe.pending;
function Sr() {
  return chrome.storage.local;
}
async function Xt(e) {
  const n = (await Sr().get(e))[e];
  if (n == null) return null;
  if (typeof n == "string")
    try {
      return JSON.parse(n);
    } catch {
      return null;
    }
  return n;
}
async function We(e, t) {
  await Sr().set({ [e]: JSON.stringify(t) });
}
async function Ve() {
  var t, n;
  const e = await Xt(Rr);
  return !e || !Array.isArray(e.wallets) ? null : (n = (t = e.wallets.find((r) => r.masterFingerprint === e.activeId)) != null ? t : e.wallets[0]) != null ? n : null;
}
async function we() {
  var r, i, o, s, a, c, f, d;
  const e = await Xt(as), t = await Xt(
    Rr
  ), n = (o = (r = t == null ? void 0 : t.wallets) == null ? void 0 : r.find((b) => b.masterFingerprint === t.activeId)) != null ? o : (i = t == null ? void 0 : t.wallets) == null ? void 0 : i[0];
  return {
    ...Cn,
    ...e != null ? e : {},
    rpcUrls: { ...Cn.rpcUrls, ...(s = e == null ? void 0 : e.rpcUrls) != null ? s : {} },
    ...n ? {
      accountIndex: (a = n.accountIndex) != null ? a : 0,
      addressIndex: (c = n.addressIndex) != null ? c : 0,
      visibleAccounts: (f = n.visibleAccounts) != null ? f : 1,
      hiddenAccounts: (d = n.hiddenAccounts) != null ? d : []
    } : {}
  };
}
async function Je() {
  var e;
  return (e = await Xt(Ir)) != null ? e : [];
}
async function Or(e) {
  const t = await Je();
  t.includes(e) || await We(Ir, [...t, e]);
}
async function Rt() {
  var e;
  return (e = await Xt(Ge)) != null ? e : [];
}
async function fs(e) {
  const t = await Rt();
  await We(
    Ge,
    [...t.filter((n) => n.id !== e.id), e]
  );
}
async function Tr(e) {
  var n;
  return (n = (await Rt()).find((r) => r.id === e)) != null ? n : null;
}
async function Qe(e) {
  const t = await Rt();
  await We(
    Ge,
    t.filter((n) => n.id !== e)
  );
}
const Un = "tab.html", Bt = /* @__PURE__ */ new Map(), Cr = /* @__PURE__ */ new Map(), ds = /* @__PURE__ */ new WeakMap(), se = [], us = 40;
function Ln(e, t, n) {
  se.unshift({ at: Date.now(), method: e, origin: t, outcome: n }), se.length = Math.min(se.length, us);
}
chrome.runtime.onInstalled.addListener(() => {
  Rt().then(async (e) => {
    for (const t of e) await Qe(t.id);
  });
});
chrome.runtime.onConnect.addListener((e) => {
  e.name === "netproof-provider" && e.onMessage.addListener((t) => {
    (async () => {
      var n;
      try {
        if (t.type === "approval-result") {
          Hr(t);
          return;
        }
        if (t.type === "provider-poke") {
          e.postMessage({ type: "poked" });
          return;
        }
        if (t.type !== "rpc") return;
        Cr.set(t.origin, e), ds.set(e, t.origin);
        const r = await ls(t.method, t.params, t.origin);
        e.postMessage({ type: "rpc-result", id: t.id, ...r });
      } catch (r) {
        e.postMessage({
          type: "rpc-result",
          id: (n = t.id) != null ? n : "unknown",
          error: { code: X.internal.code, message: r.message }
        });
      }
    })();
  });
});
chrome.runtime.onMessage.addListener((e, t, n) => {
  const r = e;
  return (r == null ? void 0 : r.type) === "approval-result" ? (Hr(r), n({ ok: !0 }), !0) : (r == null ? void 0 : r.type) === "pending-list" ? (Rt().then((i) => n({ pending: i })), !0) : (r == null ? void 0 : r.type) === "diagnostics" ? ((async () => {
    var c, f;
    const [i, o, s, a] = await Promise.all([
      Rt(),
      Ve(),
      we(),
      Je()
    ]);
    n({
      wallet: (c = o == null ? void 0 : o.masterFingerprint) != null ? c : null,
      chainId: s.chainId,
      rpcUrl: (f = s.rpcUrls[s.chainId]) != null ? f : null,
      approvedOrigins: a,
      pending: i.map((d) => ({ id: d.id, method: d.method, origin: d.origin })),
      decisions: se
    });
  })(), !0) : !1;
});
async function ls(e, t, n) {
  const r = await we(), i = await Ve(), o = await Je(), s = r.rpcUrls[r.chainId];
  return s ? (i ? o.includes(n) || Ln(e, n, "未授权来源") : Ln(e, n, "还没有配对的钱包"), is(e, t, {
    wallet: i,
    settings: r,
    origin: n,
    approvedOrigins: o,
    forward: (a, c) => ts(a, c, { rpcUrl: s, chainId: r.chainId }),
    requestApproval: (a) => hs(a)
  })) : { error: { code: X.unrecognizedChain.code, message: `链 ${r.chainId} 没有配置 RPC` } };
}
function hs(e, t) {
  return new Promise((n, r) => {
    (async () => (await fs(e), Bt.set(e.id, { resolve: n, reject: r }), await fe(1), await ws(e), setTimeout(() => {
      Bt.has(e.id) && (Bt.delete(e.id), Qe(e.id), fe(0), r({ code: X.userRejected.code, message: "请求已超时，请重新发起" }));
    }, 600 * 1e3)))();
  });
}
function ps() {
  Rt().then((e) => fe(e.length));
}
async function fe(e) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color: "#2b6bff" }), await chrome.action.setBadgeText({ text: e > 0 ? String(e) : "" });
  } catch {
  }
}
async function ws(e) {
  if (e.kind === "connect")
    try {
      const t = chrome.action;
      if (typeof t.openPopup == "function") {
        await t.openPopup();
        return;
      }
    } catch {
    }
  await gs(e.id);
}
async function gs(e) {
  const t = chrome.runtime.getURL(`${Un}#/sign/${e}`), r = (await chrome.tabs.query({ url: chrome.runtime.getURL(`${Un}*`) }))[0];
  if ((r == null ? void 0 : r.id) !== void 0) {
    await chrome.tabs.update(r.id, { url: t, active: !0 }), r.windowId !== void 0 && await chrome.windows.update(r.windowId, { focused: !0 });
    return;
  }
  await chrome.tabs.create({ url: t });
}
async function Hr(e) {
  var r;
  const t = Bt.get(e.id);
  if (!t) return;
  const n = await Tr(e.id);
  Bt.delete(e.id), fe(0), n && (tn = n.origin), n && !e.error && await Or(n.origin), e.error ? t.reject(e.error) : t.resolve(e.result), bs(e, (r = n == null ? void 0 : n.origin) != null ? r : null);
}
async function bs(e, t) {
  if (e.error) return;
  const n = t != null ? t : tn, r = n ? Cr.get(n) : void 0;
  if (!n || !r) return;
  const i = await Ve();
  if (!i) return;
  const o = await we();
  try {
    r.postMessage({
      type: "event",
      event: "accountsChanged",
      data: He(i, o)
    });
  } catch {
  }
}
let tn = null;
async function ms(e, t) {
  const n = await Tr(e);
  if (!n) return;
  tn = n.origin, await Qe(e), ps();
  const r = Bt.get(e);
  r && (Bt.delete(e), t.error ? r.reject(t.error) : r.resolve(t.result));
}
async function xs(e) {
  await Or(e);
}
async function Es() {
  return we();
}
function vs() {
  const e = new Uint8Array(16);
  return crypto.getRandomValues(e), ue(e, !0);
}
export {
  z as RpcError,
  ms as __completeApproval,
  ms as completeApproval,
  vs as newRequestId,
  Es as readSettings,
  xs as rememberOrigin
};
