var Ar = Object.defineProperty;
var Rr = (e, t, r) => t in e ? Ar(e, t, { enumerable: !0, configurable: !0, writable: !0, value: r }) : e[t] = r;
var h = (e, t, r) => Rr(e, typeof t != "symbol" ? t + "" : t, r);
class dt extends Error {
  constructor(r, n, o) {
    super(n);
    h(this, "code");
    h(this, "details");
    this.name = "NetProofError", this.code = r, this.details = o;
  }
}
const Wt = BigInt(2 ** 32 - 1), ze = /* @__PURE__ */ BigInt(32);
function Ir(e, t = !1) {
  return t ? { h: Number(e & Wt), l: Number(e >> ze & Wt) } : { h: Number(e >> ze & Wt) | 0, l: Number(e & Wt) | 0 };
}
function Rn(e, t = !1) {
  const r = e.length;
  let n = new Uint32Array(r), o = new Uint32Array(r);
  for (let i = 0; i < r; i++) {
    const { h: s, l: c } = Ir(e[i], t);
    [n[i], o[i]] = [s, c];
  }
  return [n, o];
}
const Sr = (e) => e / 2 ** 32 | 0, Or = (e) => e >>> 0;
function Tr(e, t, r, n) {
  const o = Sr(r), i = Or(r);
  e.setUint32(t, n ? i : o, n), e.setUint32(t + 4, n ? o : i, n);
}
const Xe = (e, t, r) => e >>> r, Ge = (e, t, r) => e << 32 - r | t >>> r, Rt = (e, t, r) => e >>> r | t << 32 - r, It = (e, t, r) => e << 32 - r | t >>> r, Vt = (e, t, r) => e << 64 - r | t >>> r - 32, Jt = (e, t, r) => e >>> r - 32 | t << 64 - r;
function ct(e, t, r, n) {
  const o = (t >>> 0) + (n >>> 0);
  return { h: e + r + (o / 2 ** 32 | 0) | 0, l: o | 0 };
}
const Hr = (e, t, r) => (e >>> 0) + (t >>> 0) + (r >>> 0), Cr = (e, t, r, n) => t + r + n + (e / 2 ** 32 | 0) | 0, Ur = (e, t, r, n) => (e >>> 0) + (t >>> 0) + (r >>> 0) + (n >>> 0), Lr = (e, t, r, n, o) => t + r + n + o + (e / 2 ** 32 | 0) | 0, Nr = (e, t, r, n, o) => (e >>> 0) + (t >>> 0) + (r >>> 0) + (n >>> 0) + (o >>> 0), Fr = (e, t, r, n, o, i) => t + r + n + o + i + (e / 2 ** 32 | 0) | 0;
function ve(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
const oe = (e) => e ? `"${e}" ` : "";
function V(e, t = "") {
  if (typeof e != "number")
    throw new TypeError(oe(t) + "expected number, got " + typeof e);
  if (!Number.isSafeInteger(e) || e < 0)
    throw new RangeError(oe(t) + "expected integer >= 0, got " + e);
  return e;
}
function Dr(e, t = "") {
  if (typeof e != "boolean")
    throw new TypeError(oe(t) + "expected boolean, got type=" + typeof e);
  return e;
}
function Z(e, t, r = "") {
  if (ve(e) && (t === void 0 || e.length === t))
    return e;
  t !== void 0 && V(t, "length");
  const n = ve(e), o = t !== void 0 ? ` of length ${t}` : "", i = n ? `length=${e.length}` : `type=${typeof e}`, s = oe(r) + "expected Uint8Array" + o + ", got " + i;
  throw n ? new RangeError(s) : new TypeError(s);
}
function In(e) {
  if (typeof e != "function" || typeof e.create != "function")
    throw new TypeError("expected hash wrapped by utils.createHasher");
  if (V(e.outputLen), V(e.blockLen), e.outputLen < 1 || e.blockLen < 1)
    throw new Error("hash blockLen / outputLen must be >= 1");
}
const kr = (e, t) => {
  if (e === null || typeof e != "object" || Array.isArray(e))
    throw new TypeError((t === "object" ? "" : `"${t}" `) + "expected object, got type=" + typeof e);
}, We = (e, t) => {
  kr(e, t);
  const r = Object.getPrototypeOf(e);
  if (r !== Object.prototype && r !== null)
    throw new TypeError(`"${t}" expected plain object`);
  if (Object.hasOwn(e, "__proto__"))
    throw new TypeError(`"${t}.__proto__" is not allowed`);
};
function Ut(e, t = !0) {
  if (e.destroyed)
    throw new Error("hash was destroyed");
  if (t && e.finished)
    throw new Error("digest() was already called");
}
function Se(e, t) {
  Z(e, void 0, "output");
  const r = t.outputLen;
  if (!(e.length >= r))
    throw new RangeError('"output" expected length >= ' + r);
}
function Ve(e) {
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
function Qt(e, t) {
  return e << t | e >>> 32 - t >>> 0;
}
const $r = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
function Mr(e) {
  return e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255;
}
function Pr(e) {
  for (let t = 0; t < e.length; t++)
    e[t] = Mr(e[t]);
  return e;
}
const Je = $r ? (e) => e : Pr, Sn = /* @ts-ignore */ typeof Uint8Array.from([]).toHex == "function" && typeof Uint8Array.fromHex == "function", Kr = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0"));
function Oe(e) {
  if (Z(e), Sn)
    return e.toHex();
  let t = "";
  for (let r = 0; r < e.length; r++)
    t += Kr[e[r]];
  return t;
}
function Qe(e) {
  return e >= 48 && e <= 57 ? e - 48 : e >= 65 && e <= 70 ? e - 55 : e >= 97 && e <= 102 ? e - 87 : void 0;
}
function On(e) {
  if (typeof e != "string")
    throw new TypeError("hex string expected, got " + typeof e);
  if (Sn)
    try {
      return Uint8Array.fromHex(e);
    } catch (o) {
      throw o instanceof SyntaxError ? new RangeError(o.message) : o;
    }
  const t = e.length, r = t / 2;
  if (t % 2)
    throw new RangeError("hex string expected, got unpadded hex of length " + t);
  const n = new Uint8Array(r);
  for (let o = 0, i = 0; o < r; o++, i += 2) {
    const s = Qe(e.charCodeAt(i)), c = Qe(e.charCodeAt(i + 1));
    if (s === void 0 || c === void 0) {
      const a = e[i] + e[i + 1];
      throw new RangeError('hex string expected, got non-hex character "' + a + '" at index ' + i);
    }
    n[o] = s * 16 + c;
  }
  return n;
}
function $t(...e) {
  let t = 0;
  for (let n = 0; n < e.length; n++) {
    const o = e[n];
    Z(o), t += o.length;
  }
  const r = new Uint8Array(t);
  for (let n = 0, o = 0; n < e.length; n++) {
    const i = e[n];
    r.set(i, o), o += i.length;
  }
  return r;
}
function qr(e, t, r = "opts") {
  return We(e, "defaults"), t !== void 0 && We(t, r), Object.assign(/* @__PURE__ */ Object.create(null), e, t);
}
function se(e, t = {}) {
  if (typeof e != "function")
    throw new TypeError('"hashCons" expected function, got type=' + typeof e);
  t = qr({}, t, "info");
  const r = (o, i) => e(i).update(o).digest(), n = e(void 0);
  return r.outputLen = n.outputLen, r.blockLen = n.blockLen, r.canXOF = n.canXOF, r.create = (o) => e(o), Object.assign(r, t), Object.freeze(r);
}
function jr(e = 32) {
  V(e, "bytesLength");
  const t = typeof globalThis == "object" ? globalThis.crypto : null;
  if (typeof (t == null ? void 0 : t.getRandomValues) != "function")
    throw new Error("crypto.getRandomValues must be defined");
  if (e > 65536)
    throw new RangeError(`"bytesLength" expected <= 65536, got ${e}`);
  return t.getRandomValues(new Uint8Array(e));
}
const Tn = (e) => ({
  // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
  // Larger suffix values would need base-128 OID encoding and a different length byte.
  oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, e])
});
function Zr(e, t, r) {
  return e & t ^ ~e & r;
}
function Yr(e, t, r) {
  return e & t ^ e & r ^ t & r;
}
class Te {
  constructor(t, r, n, o) {
    h(this, "blockLen");
    h(this, "outputLen");
    h(this, "canXOF", !1);
    h(this, "padOffset");
    h(this, "isLE");
    // For partial updates less than block size
    h(this, "buffer");
    h(this, "view");
    h(this, "finished", !1);
    h(this, "length", 0);
    h(this, "pos", 0);
    h(this, "destroyed", !1);
    this.blockLen = t, this.outputLen = r, this.padOffset = n, this.isLE = o, this.buffer = new Uint8Array(t), this.view = Ht(this.buffer);
  }
  update(t) {
    Ut(this), Z(t);
    const { view: r, buffer: n, blockLen: o } = this, i = t.length;
    let s = !1;
    for (let c = 0; c < i; ) {
      const a = Math.min(o - this.pos, i - c);
      if (a === o) {
        const f = Ht(t);
        for (; o <= i - c; c += o)
          this.process(f, c);
        s = !0;
        continue;
      }
      n.set(c === 0 && a === i ? t : t.subarray(c, c + a), this.pos), this.pos += a, c += a, this.pos === o && (this.process(r, 0), this.pos = 0, s = !0);
    }
    return this.length += t.length, s && this.roundClean(), this;
  }
  digestInto(t) {
    Ut(this), Se(t, this), this.finished = !0;
    const { buffer: r, view: n, blockLen: o, isLE: i } = this;
    let { pos: s } = this;
    r[s++] = 128, r.fill(0, s), this.padOffset > o - s && (this.process(n, 0), r.fill(0)), Tr(n, o - 8, this.length * 8, i), this.process(n, 0), this.roundClean();
    const c = t === r ? n : Ht(t), a = this.outputLen, f = a / 4, d = this.get();
    if (a % 4 || f > d.length)
      throw new Error("invalid outputLen");
    for (let b = 0; b < f; b++)
      c.setUint32(4 * b, d[b], i);
  }
  digest() {
    const { buffer: t, outputLen: r } = this;
    this.digestInto(t);
    const n = t.slice(0, r);
    return this.destroy(), n;
  }
  _cloneIntoMeta(t) {
    const { buffer: r, length: n, finished: o, destroyed: i, pos: s } = this;
    return t.destroyed = i, t.finished = o, t.length = n, t.pos = s, s && t.buffer.set(r), t;
  }
  clone() {
    return this._cloneInto();
  }
}
const zr = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), Xr = /* @__PURE__ */ Uint32Array.from([
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
]), Gr = /* @__PURE__ */ Uint32Array.from([
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
class Wr extends Te {
  constructor(r, n) {
    super(64, r, 8, !1);
    // We cannot use array here since array allows indexing by variable
    // which means optimizer/compiler cannot use registers.
    // Numeric initializers matter: starting the fields as `undefined` changes
    // V8's field representation and makes sha256 3x slower (measured).
    h(this, "A", 0);
    h(this, "B", 0);
    h(this, "C", 0);
    h(this, "D", 0);
    h(this, "E", 0);
    h(this, "F", 0);
    h(this, "G", 0);
    h(this, "H", 0);
    this.A = n[0] | 0, this.B = n[1] | 0, this.C = n[2] | 0, this.D = n[3] | 0, this.E = n[4] | 0, this.F = n[5] | 0, this.G = n[6] | 0, this.H = n[7] | 0;
  }
  get() {
    const { A: r, B: n, C: o, D: i, E: s, F: c, G: a, H: f } = this;
    return [r, n, o, i, s, c, a, f];
  }
  // prettier-ignore
  set(r, n, o, i, s, c, a, f) {
    this.A = r | 0, this.B = n | 0, this.C = o | 0, this.D = i | 0, this.E = s | 0, this.F = c | 0, this.G = a | 0, this.H = f | 0;
  }
  _cloneInto(r) {
    return (r || (r = new this.constructor())).set(...this.get()), this._cloneIntoMeta(r);
  }
  process(r, n) {
    for (let p = 0; p < 16; p++, n += 4)
      pt[p] = r.getUint32(n, !1);
    for (let p = 16; p < 64; p++) {
      const w = pt[p - 15], l = pt[p - 2], E = rt(w, 7) ^ rt(w, 18) ^ w >>> 3, x = rt(l, 17) ^ rt(l, 19) ^ l >>> 10;
      pt[p] = x + pt[p - 7] + E + pt[p - 16] | 0;
    }
    let { A: o, B: i, C: s, D: c, E: a, F: f, G: d, H: b } = this;
    for (let p = 0; p < 64; p++) {
      const w = rt(a, 6) ^ rt(a, 11) ^ rt(a, 25), l = b + w + Zr(a, f, d) + Gr[p] + pt[p] | 0, x = (rt(o, 2) ^ rt(o, 13) ^ rt(o, 22)) + Yr(o, i, s) | 0;
      b = d, d = f, f = a, a = c + l | 0, c = s, s = i, i = o, o = l + x | 0;
    }
    o = o + this.A | 0, i = i + this.B | 0, s = s + this.C | 0, c = c + this.D | 0, a = a + this.E | 0, f = f + this.F | 0, d = d + this.G | 0, b = b + this.H | 0, this.set(o, i, s, c, a, f, d, b);
  }
  roundClean() {
    ut(pt);
  }
  destroy() {
    this.destroyed = !0, this.set(0, 0, 0, 0, 0, 0, 0, 0), ut(this.buffer);
  }
}
class Vr extends Wr {
  constructor() {
    super(32, zr);
  }
}
const Hn = Rn([
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
].map((e) => BigInt(e))), Jr = Hn[0], Qr = Hn[1], wt = /* @__PURE__ */ new Uint32Array(80), gt = /* @__PURE__ */ new Uint32Array(80);
class to extends Te {
  constructor(r, n) {
    super(128, r, 16, !1);
    // We cannot use array here since array allows indexing by variable
    // which means optimizer/compiler cannot use registers.
    // h -- high 32 bits, l -- low 32 bits
    // Numeric initializers matter: starting the fields as `undefined` changes
    // V8's field representation and slows hashing down (measured on sha256).
    h(this, "Ah", 0);
    h(this, "Al", 0);
    h(this, "Bh", 0);
    h(this, "Bl", 0);
    h(this, "Ch", 0);
    h(this, "Cl", 0);
    h(this, "Dh", 0);
    h(this, "Dl", 0);
    h(this, "Eh", 0);
    h(this, "El", 0);
    h(this, "Fh", 0);
    h(this, "Fl", 0);
    h(this, "Gh", 0);
    h(this, "Gl", 0);
    h(this, "Hh", 0);
    h(this, "Hl", 0);
    this.Ah = n[0] | 0, this.Al = n[1] | 0, this.Bh = n[2] | 0, this.Bl = n[3] | 0, this.Ch = n[4] | 0, this.Cl = n[5] | 0, this.Dh = n[6] | 0, this.Dl = n[7] | 0, this.Eh = n[8] | 0, this.El = n[9] | 0, this.Fh = n[10] | 0, this.Fl = n[11] | 0, this.Gh = n[12] | 0, this.Gl = n[13] | 0, this.Hh = n[14] | 0, this.Hl = n[15] | 0;
  }
  // prettier-ignore
  get() {
    const { Ah: r, Al: n, Bh: o, Bl: i, Ch: s, Cl: c, Dh: a, Dl: f, Eh: d, El: b, Fh: p, Fl: w, Gh: l, Gl: E, Hh: x, Hl: R } = this;
    return [r, n, o, i, s, c, a, f, d, b, p, w, l, E, x, R];
  }
  // prettier-ignore
  set(r, n, o, i, s, c, a, f, d, b, p, w, l, E, x, R) {
    this.Ah = r | 0, this.Al = n | 0, this.Bh = o | 0, this.Bl = i | 0, this.Ch = s | 0, this.Cl = c | 0, this.Dh = a | 0, this.Dl = f | 0, this.Eh = d | 0, this.El = b | 0, this.Fh = p | 0, this.Fl = w | 0, this.Gh = l | 0, this.Gl = E | 0, this.Hh = x | 0, this.Hl = R | 0;
  }
  _cloneInto(r) {
    return (r || (r = new this.constructor())).set(...this.get()), this._cloneIntoMeta(r);
  }
  process(r, n) {
    for (let O = 0; O < 16; O++, n += 4)
      wt[O] = r.getUint32(n), gt[O] = r.getUint32(n += 4);
    for (let O = 16; O < 80; O++) {
      const P = wt[O - 15] | 0, U = gt[O - 15] | 0, K = Rt(P, U, 1) ^ Rt(P, U, 8) ^ Xe(P, U, 7), ot = It(P, U, 1) ^ It(P, U, 8) ^ Ge(P, U, 7), j = wt[O - 2] | 0, D = gt[O - 2] | 0, it = Rt(j, D, 19) ^ Vt(j, D, 61) ^ Xe(j, D, 6), et = It(j, D, 19) ^ Jt(j, D, 61) ^ Ge(j, D, 6), nt = Ur(ot, et, gt[O - 7], gt[O - 16]), ht = Lr(nt, K, it, wt[O - 7], wt[O - 16]);
      wt[O] = ht | 0, gt[O] = nt | 0;
    }
    let { Ah: o, Al: i, Bh: s, Bl: c, Ch: a, Cl: f, Dh: d, Dl: b, Eh: p, El: w, Fh: l, Fl: E, Gh: x, Gl: R, Hh: H, Hl: M } = this;
    for (let O = 0; O < 80; O++) {
      const P = Rt(p, w, 14) ^ Rt(p, w, 18) ^ Vt(p, w, 41), U = It(p, w, 14) ^ It(p, w, 18) ^ Jt(p, w, 41), K = p & l ^ ~p & x, ot = w & E ^ ~w & R, j = Nr(M, U, ot, Qr[O], gt[O]), D = Fr(j, H, P, K, Jr[O], wt[O]), it = j | 0, et = Rt(o, i, 28) ^ Vt(o, i, 34) ^ Vt(o, i, 39), nt = It(o, i, 28) ^ Jt(o, i, 34) ^ Jt(o, i, 39), ht = o & s ^ o & a ^ s & a, st = i & c ^ i & f ^ c & f;
      H = x | 0, M = R | 0, x = l | 0, R = E | 0, l = p | 0, E = w | 0, { h: p, l: w } = ct(d | 0, b | 0, D | 0, it | 0), d = a | 0, b = f | 0, a = s | 0, f = c | 0, s = o | 0, c = i | 0;
      const xt = Hr(it, nt, st);
      o = Cr(xt, D, et, ht), i = xt | 0;
    }
    ({ h: o, l: i } = ct(this.Ah | 0, this.Al | 0, o | 0, i | 0)), { h: s, l: c } = ct(this.Bh | 0, this.Bl | 0, s | 0, c | 0), { h: a, l: f } = ct(this.Ch | 0, this.Cl | 0, a | 0, f | 0), { h: d, l: b } = ct(this.Dh | 0, this.Dl | 0, d | 0, b | 0), { h: p, l: w } = ct(this.Eh | 0, this.El | 0, p | 0, w | 0), { h: l, l: E } = ct(this.Fh | 0, this.Fl | 0, l | 0, E | 0), { h: x, l: R } = ct(this.Gh | 0, this.Gl | 0, x | 0, R | 0), { h: H, l: M } = ct(this.Hh | 0, this.Hl | 0, H | 0, M | 0), this.set(o, i, s, c, a, f, d, b, p, w, l, E, x, R, H, M);
  }
  roundClean() {
    ut(wt, gt);
  }
  destroy() {
    this.destroyed = !0, ut(this.buffer), this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
}
class eo extends to {
  constructor() {
    super(64, Xr);
  }
}
const He = /* @__PURE__ */ se(
  () => new Vr(),
  /* @__PURE__ */ Tn(1)
), tn = /* @__PURE__ */ se(
  () => new eo(),
  /* @__PURE__ */ Tn(3)
), no = new TextEncoder();
new TextDecoder();
function ro(e) {
  return no.encode(e);
}
const en = "0123456789abcdef";
function ce(e, t = !1) {
  let r = t ? "0x" : "";
  for (let n = 0; n < e.length; n++)
    r += en[e[n] >> 4] + en[e[n] & 15];
  return r;
}
(() => {
  const e = new Uint32Array(256);
  for (let t = 0; t < 256; t++) {
    let r = t;
    for (let n = 0; n < 8; n++) r = r & 1 ? 3988292384 ^ r >>> 1 : r >>> 1;
    e[t] = r >>> 0;
  }
  return e;
})();
ro("netproof-wallet/entropy/v1");
class nn {
  constructor(t, r) {
    h(this, "oHash");
    h(this, "iHash");
    h(this, "blockLen");
    h(this, "outputLen");
    h(this, "canXOF", !1);
    h(this, "finished", !1);
    h(this, "destroyed", !1);
    if (In(t), Z(r, void 0, "key"), this.iHash = t.create(), typeof this.iHash.update != "function")
      throw new Error("expected Hash instance");
    this.blockLen = this.iHash.blockLen, this.outputLen = this.iHash.outputLen;
    const n = this.blockLen, o = new Uint8Array(n);
    o.set(r.length > n ? t.create().update(r).digest() : r);
    for (let i = 0; i < o.length; i++)
      o[i] ^= 54;
    this.iHash.update(o), this.oHash = t.create();
    for (let i = 0; i < o.length; i++)
      o[i] ^= 106;
    this.oHash.update(o), ut(o);
  }
  update(t) {
    return Ut(this), this.iHash.update(t), this;
  }
  digestInto(t) {
    Ut(this), Se(t, this), this.finished = !0;
    const r = t.subarray(0, this.outputLen);
    this.iHash.digestInto(r), this.oHash.update(r), this.oHash.digestInto(r), this.destroy();
  }
  digest() {
    const t = new Uint8Array(this.oHash.outputLen);
    return this.digestInto(t), t;
  }
  _cloneInto(t) {
    t || (t = Object.create(Object.getPrototypeOf(this), {}));
    const { oHash: r, iHash: n, finished: o, destroyed: i, blockLen: s, outputLen: c, canXOF: a } = this;
    return t = t, t.finished = o, t.destroyed = i, t.blockLen = s, t.outputLen = c, t.canXOF = a, t.oHash = r._cloneInto(t.oHash), t.iHash = n._cloneInto(t.iHash), t;
  }
  clone() {
    return this._cloneInto();
  }
  destroy() {
    this.destroyed = !0, this.oHash.destroy(), this.iHash.destroy();
  }
}
const Be = /* @__PURE__ */ (() => {
  const e = ((t, r, n) => new nn(t, r).update(n).digest());
  return e.create = (t, r) => new nn(t, r), e;
})();
function Cn(e, t, r = () => {
}) {
  if (!Array.isArray(e))
    throw new TypeError(`"${t}" expected array, got type=${typeof e}`);
  for (let n = 0; n < e.length; n++)
    r(e[n], `${t}[${n}]`);
  return e;
}
const Y = (e, t, r) => Z(e, t, r), Un = V;
function oo(e, t = "") {
  if (typeof e != "string") {
    const r = t && `"${t}" `;
    throw new TypeError(r + "expected string, got type=" + typeof e);
  }
  return e;
}
function Ct(e, t = "object") {
  if (e === null || typeof e != "object" || Array.isArray(e))
    throw new TypeError(t === "object" ? "expected valid options object" : `"${t}" expected object, got type=${typeof e}`);
  return e;
}
function Pt(e, t) {
  if (typeof e != "function")
    throw new TypeError(`"${t}" is invalid: expected function, got ${typeof e}`);
  return e;
}
const Ln = Oe, yt = (...e) => $t(...e), _e = (e) => On(e), ae = ve, Ce = (e) => jr(e), ie = /* @__PURE__ */ BigInt(0), rn = /* @__PURE__ */ BigInt(1), io = (e) => e ? `"${e}" ` : "";
function At(e, t = "") {
  if (typeof e != "boolean")
    throw new TypeError(io(t) + "expected boolean, got type=" + typeof e);
  return e;
}
function Ue(e) {
  if (typeof e == "bigint") {
    if (!Bt(e))
      throw new RangeError("positive bigint expected, got " + e);
  } else
    Un(e);
  return e;
}
function Kt(e, t = "") {
  if (typeof e != "number") {
    const r = t && `"${t}" `;
    throw new TypeError(r + "expected number, got type=" + typeof e);
  }
  if (!Number.isSafeInteger(e)) {
    const r = t && `"${t}" `;
    throw new RangeError(r + "expected safe integer, got " + e);
  }
}
function te(e) {
  const t = Ue(e).toString(16);
  return t.length & 1 ? "0" + t : t;
}
function Nn(e) {
  if (typeof e != "string")
    throw new TypeError("hex string expected, got " + typeof e);
  return e === "" ? ie : BigInt("0x" + e);
}
function Lt(e) {
  return Nn(Oe(e));
}
function Fn(e) {
  return Nn(Oe(so(Z(e)).reverse()));
}
function Le(e, t) {
  if (V(t), t === 0)
    throw new Error("zero output length is invalid");
  e = Ue(e);
  const r = t * 2, n = e.toString(16);
  if (n.length > r)
    throw new RangeError("number is too large");
  return On(n.padStart(r, "0"));
}
function Dn(e, t) {
  return Le(e, t).reverse();
}
function so(e) {
  return Uint8Array.from(Y(e));
}
function Bt(e) {
  return typeof e == "bigint" && ie <= e;
}
function kn(e, t, r) {
  return Bt(e) && Bt(t) && Bt(r) && t <= e && e < r;
}
function $n(e, t, r, n) {
  if (!kn(t, r, n))
    throw new RangeError("expected valid " + e + ": " + r + " <= n < " + n + ", got " + t);
}
function Ne(e) {
  if (e < ie)
    throw new Error("expected non-negative bigint, got " + e);
  return e === ie ? 0 : e.toString(2).length;
}
const Fe = (e) => (Kt(e, "n"), (rn << BigInt(e)) - rn);
function co(e, t, r) {
  if (V(e, "hashLen"), V(t, "qByteLen"), typeof r != "function")
    throw new TypeError("hmacFn must be a function");
  const n = (x) => new Uint8Array(x), o = Uint8Array.of(), i = Uint8Array.of(0), s = Uint8Array.of(1), c = 1e3;
  let a = n(e), f = n(e), d = 0;
  const b = () => {
    a.fill(1), f.fill(0), d = 0;
  }, p = (...x) => r(f, yt(a, ...x)), w = (x = o) => {
    f = p(i, x), a = p(), x.length !== 0 && (f = p(s, x), a = p());
  }, l = () => {
    if (d++ >= c)
      throw new Error("drbg: tried max amount of iterations");
    let x = 0;
    const R = [];
    for (; x < t; ) {
      a = p();
      const H = a.slice();
      R.push(H), x += a.length;
    }
    return yt(...R);
  };
  return (x, R) => {
    b(), w(x);
    let H;
    for (; (H = R(l())) === void 0; )
      w();
    return b(), H;
  };
}
function zt(e, t = {}, r = {}, n = "object") {
  Ct(e, n), Ct(t, "fields"), Ct(r, "optFields");
  function o(s, c, a) {
    const f = n === "object" ? `param "${String(s)}"` : `"${n}.${String(s)}"`, d = e[s];
    if (!Object.hasOwn(e, s) && (a ? d !== void 0 : c !== "function"))
      throw new TypeError(`${f} is invalid: expected own property`);
    if (a && d === void 0)
      return;
    const b = typeof d;
    if (b !== c || d === null)
      throw new TypeError(`${f} is invalid: expected ${c}, got ${b}`);
  }
  const i = (s, c) => Object.entries(s).forEach(([a, f]) => o(a, f, c));
  i(t, !1), i(r, !0);
}
const $ = /* @__PURE__ */ BigInt(0), L = /* @__PURE__ */ BigInt(1), mt = /* @__PURE__ */ BigInt(2), Mn = /* @__PURE__ */ BigInt(3), De = /* @__PURE__ */ BigInt(4), Pn = /* @__PURE__ */ BigInt(5), ao = /* @__PURE__ */ BigInt(7), Kn = /* @__PURE__ */ BigInt(8), fo = /* @__PURE__ */ BigInt(9), uo = /* @__PURE__ */ BigInt(15), qn = /* @__PURE__ */ BigInt(16), ho = /* @__PURE__ */ BigInt("0x10000000000000000");
function J(e, t) {
  if (t <= $)
    throw new Error("mod: expected positive modulus, got " + t);
  const r = e % t;
  return r >= $ ? r : t + r;
}
function jn(e, t, r) {
  if (r <= L)
    throw new Error("pow: expected modulus > 1, got " + r);
  if (typeof t != "bigint")
    throw new TypeError("invalid exponent: expected bigint, got " + typeof t);
  if (t < $)
    throw new Error("invalid exponent, negatives unsupported");
  if (t === $)
    return L;
  if (t === L)
    return e;
  let n = e % r;
  if (n < $ && (n += r), t < ho) {
    let c = L;
    for (; t > $; )
      t & L && (c = c * n % r), n = n * n % r, t >>= L;
    return c;
  }
  const o = [];
  for (; t > $; )
    o.push(Number(t & uo)), t >>= De;
  const i = new Array(16);
  i[0] = L, i[1] = n;
  for (let c = 2; c < 16; c++)
    i[c] = i[c - 1] * n % r;
  let s = i[o[o.length - 1]];
  for (let c = o.length - 2; c >= 0; c--) {
    s = s * s % r, s = s * s % r, s = s * s % r, s = s * s % r;
    const a = o[c];
    a !== 0 && (s = s * i[a] % r);
  }
  return s;
}
function tt(e, t, r) {
  if (r <= L)
    throw new Error("pow2: expected modulus > 1, got " + r);
  if (t < $)
    throw new Error("pow2: expected non-negative exponent, got " + t);
  let n = e;
  for (; t-- > $; )
    n *= n, n %= r;
  return n;
}
function on(e, t) {
  if (e === $)
    throw new Error("invert: expected non-zero number");
  if (t <= L)
    throw new Error("invert: expected modulus > 1, got " + t);
  let r = J(e, t), n = t, o = $, i = L;
  for (; r !== $; ) {
    const c = n / r, a = n - r * c, f = o - i * c;
    n = r, r = a, o = i, i = f;
  }
  if (n !== L)
    throw new Error("invert: does not exist");
  return J(o, t);
}
function lo(e, t) {
  if (t <= L)
    throw new Error("invertCt: expected prime modulus > 1, got " + t);
  const r = J(e, t);
  if (r === $)
    throw new Error("invertCt: expected non-zero number");
  const n = jn(r, t - mt, t);
  if (J(r * n, t) !== L)
    throw new Error("invertCt: does not exist");
  return n;
}
function ke(e, t, r) {
  const n = e;
  if (!n.eql(n.sqr(t), r))
    throw new Error("Cannot find square root");
}
function $e(e, t) {
  if ((e & L) === $)
    throw new Error(t + ": expected odd modulus, got " + e);
}
function Zn(e, t) {
  const r = e, n = (r.ORDER + L) / De, o = r.pow(t, n);
  return ke(r, o, t), o;
}
function po(e, t) {
  const r = e, n = (r.ORDER - Pn) / Kn, o = r.mul(t, mt), i = r.pow(o, n), s = r.mul(t, i), c = r.mul(r.mul(s, mt), i), a = r.mul(s, r.sub(c, r.ONE));
  return ke(r, a, t), a;
}
function wo(e) {
  const t = fe(e), r = Yn(e), n = r(t, t.neg(t.ONE)), o = r(t, n), i = r(t, t.neg(n)), s = (e + ao) / qn;
  return ((c, a) => {
    const f = c;
    let d = f.pow(a, s), b = f.mul(d, n);
    const p = f.mul(d, o), w = f.mul(d, i), l = f.eql(f.sqr(b), a), E = f.eql(f.sqr(p), a);
    d = f.cmov(d, b, l), b = f.cmov(w, p, E);
    const x = f.eql(f.sqr(b), a), R = f.cmov(d, b, x);
    return ke(f, R, a), R;
  });
}
function Yn(e) {
  if (e < Mn)
    throw new Error("sqrt is not defined for small field");
  $e(e, "tonelliShanks");
  let t = e - L, r = 0;
  for (; t % mt === $; )
    t /= mt, r++;
  let n = mt;
  const o = fe(e);
  for (; sn(o, n) === 1; )
    if (n++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  if (r === 1)
    return Zn;
  let i = o.pow(n, t);
  const s = (t + L) / mt;
  return function(a, f) {
    const d = a;
    if (d.is0(f))
      return f;
    if (sn(d, f) !== 1)
      throw new Error("Cannot find square root");
    let b = r, p = d.mul(d.ONE, i), w = d.pow(f, t), l = d.pow(f, s);
    for (; !d.eql(w, d.ONE); ) {
      if (d.is0(w))
        throw new Error("Cannot find square root: probably non-prime P");
      let E = 1, x = d.sqr(w);
      for (; !d.eql(x, d.ONE); )
        if (E++, x = d.sqr(x), E === b)
          throw new Error("Cannot find square root");
      const R = L << BigInt(b - E - 1), H = d.pow(p, R);
      b = E, p = d.sqr(H), w = d.mul(w, p), l = d.mul(l, H);
    }
    return l;
  };
}
function go(e) {
  return $e(e, "Fp.sqrt"), e % De === Mn ? Zn : e % Kn === Pn ? po : e % qn === fo ? wo(e) : Yn(e);
}
const bo = [
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
function qt(e) {
  if (Ct(e, "field"), typeof e.ORDER != "bigint")
    throw new TypeError('param "ORDER" is invalid: expected bigint, got ' + typeof e.ORDER);
  Kt(e.BYTES, "BYTES"), Kt(e.BITS, "BITS");
  for (const t of bo)
    Pt(e[t], "field." + t);
  if (e.BYTES < 1 || e.BITS < 1)
    throw new Error("invalid field: expected BYTES/BITS > 0");
  if (e.ORDER <= L)
    throw new Error("invalid field: expected ORDER > 1, got " + e.ORDER);
  return e;
}
function zn(e, t, r = !1) {
  qt(e), Cn(t, "nums"), At(r, "passZero");
  const n = e, o = new Array(t.length).fill(r ? n.ZERO : void 0), i = t.reduce((c, a, f) => n.is0(a) ? c : (o[f] = c, n.mul(c, a)), n.ONE), s = n.inv(i);
  return t.reduceRight((c, a, f) => n.is0(a) ? c : (o[f] = n.mul(c, o[f]), n.mul(c, a)), s), o;
}
function sn(e, t) {
  qt(e);
  const r = e;
  $e(r.ORDER, "FpLegendre");
  const n = (r.ORDER - L) / mt, o = r.pow(t, n), i = r.eql(o, r.ONE), s = r.eql(o, r.ZERO), c = r.eql(o, r.neg(r.ONE));
  if (!i && !s && !c)
    throw new Error("invalid Legendre symbol result");
  return i ? 1 : s ? 0 : -1;
}
function yo(e, t) {
  if (t !== void 0 && Un(t), e <= $)
    throw new Error("invalid n length: expected positive n, got " + e);
  if (t !== void 0 && t < 1)
    throw new Error("invalid n length: expected positive bit length, got " + t);
  const r = Ne(e);
  if (t !== void 0 && t < r)
    throw new Error(`invalid n length: expected nBitLength (${t}) >= bitLen(n) (${r})`);
  const n = t !== void 0 ? t : r, o = Math.ceil(n / 8);
  return { nBitLength: n, nByteLength: o };
}
const cn = /* @__PURE__ */ new WeakMap();
class an {
  constructor(t, r = {}) {
    h(this, "ORDER");
    h(this, "BITS");
    h(this, "BYTES");
    h(this, "isLE");
    h(this, "ZERO", $);
    h(this, "ONE", L);
    h(this, "_lengths");
    h(this, "_mod");
    if (t <= L)
      throw new Error("invalid field: expected ORDER > 1, got " + t);
    let n;
    this.isLE = !1, r != null && typeof r == "object" && (typeof r.BITS == "number" && (n = r.BITS), typeof r.sqrt == "function" && Object.defineProperty(this, "sqrt", { value: r.sqrt, enumerable: !0 }), typeof r.isLE == "boolean" && (this.isLE = r.isLE), r.allowedLengths && (this._lengths = Object.freeze(r.allowedLengths.slice())), typeof r.modFromBytes == "boolean" && (this._mod = r.modFromBytes));
    const { nBitLength: o, nByteLength: i } = yo(t, n);
    if (i > 2048)
      throw new Error("invalid field: expected ORDER of <= 2048 bytes");
    this.ORDER = t, this.BITS = o, this.BYTES = i, Object.freeze(this);
  }
  create(t) {
    return J(t, this.ORDER);
  }
  isValid(t) {
    if (typeof t != "bigint")
      throw new TypeError("invalid field element: expected bigint, got " + typeof t);
    return $ <= t && t < this.ORDER;
  }
  is0(t) {
    return t === $;
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
  eql(t, r) {
    return t === r;
  }
  sqr(t) {
    return J(t * t, this.ORDER);
  }
  add(t, r) {
    return J(t + r, this.ORDER);
  }
  sub(t, r) {
    return J(t - r, this.ORDER);
  }
  mul(t, r) {
    return J(t * r, this.ORDER);
  }
  pow(t, r) {
    return jn(t, r, this.ORDER);
  }
  div(t, r) {
    return J(t * on(r, this.ORDER), this.ORDER);
  }
  // Same as above, but doesn't normalize
  sqrN(t) {
    return t * t;
  }
  addN(t, r) {
    return t + r;
  }
  subN(t, r) {
    return t - r;
  }
  mulN(t, r) {
    return t * r;
  }
  inv(t) {
    return on(t, this.ORDER);
  }
  sqrt(t) {
    let r = cn.get(this);
    return r || cn.set(this, r = go(this.ORDER)), r(this, t);
  }
  toBytes(t) {
    return this.isLE ? Dn(t, this.BYTES) : Le(t, this.BYTES);
  }
  fromBytes(t, r = !1) {
    Y(t);
    const { _lengths: n, BYTES: o, isLE: i, ORDER: s, _mod: c } = this;
    if (n) {
      if (t.length < 1 || !n.includes(t.length) || t.length > o)
        throw new Error("Field.fromBytes: expected " + n + " bytes, got " + t.length);
      const f = new Uint8Array(o);
      f.set(t, i ? 0 : f.length - t.length), t = f;
    }
    if (t.length !== o)
      throw new Error("Field.fromBytes: expected " + o + " bytes, got " + t.length);
    let a = i ? Fn(t) : Lt(t);
    if (c && (a = J(a, s)), !r && !this.isValid(a))
      throw new Error("invalid field element: outside of range 0..ORDER");
    return a;
  }
  // TODO: we don't need it here, move out to separate fn
  invertBatch(t) {
    return zn(this, t, !0);
  }
  // We can't move this out because Fp6, Fp12 implement it
  // and it's unclear what to return in there.
  cmov(t, r, n) {
    return At(n, "condition"), n ? r : t;
  }
}
function fe(e, t = {}) {
  return Object.freeze(an.prototype), new an(e, t);
}
function Xn(e) {
  if (typeof e != "bigint")
    throw new Error("field order must be bigint");
  if (e <= L)
    throw new Error("field order must be greater than 1");
  const t = Ne(e - L);
  return Math.ceil(t / 8);
}
function Me(e) {
  const t = Xn(e);
  return t + Math.ceil(t / 2);
}
function Gn(e, t, r = !1) {
  Y(e);
  const n = e.length, o = Xn(t), i = Math.max(Me(t), 16);
  if (n < i || n > 1024)
    throw new Error("expected " + i + "-1024 bytes of input, got " + n);
  const s = r ? Fn(e) : Lt(e), c = J(s, t - L) + L;
  return r ? Dn(c, o) : Le(c, o);
}
const Pe = /* @__PURE__ */ BigInt(0), jt = /* @__PURE__ */ BigInt(1), mo = /* @__PURE__ */ BigInt(4), he = 16, fn = 128, xo = 5, dn = 2 ** 31;
function Xt(e) {
  const t = e;
  if (typeof t != "function")
    throw new TypeError('"Point" expected constructor, got type=' + typeof e);
  Pt(t.fromAffine, "Point.fromAffine"), Pt(t.fromBytes, "Point.fromBytes"), Pt(t.fromHex, "Point.fromHex"), Ct(t.BASE, "Point.BASE"), Ct(t.ZERO, "Point.ZERO"), qt(t.Fp), qt(t.Fn);
}
function Eo(e, t) {
  Xt(e), Vn(t, e);
  const r = zn(e.Fp, t.map((n) => n.Z));
  return t.map((n, o) => e.fromAffine(n.toAffine(r[o])));
}
function vo(e, t, r = 1) {
  if (!Number.isSafeInteger(e) || e < r || e > t)
    throw new Error("invalid window size, expected [" + r + ".." + t + "], got W=" + e);
}
function Bo(e, t) {
  const r = e * (4 * t + 128);
  if (r > dn)
    throw new Error("invalid window size: table would need ~" + Math.ceil(r / 2 ** 20) + " MiB, max " + dn / 2 ** 20 + " MiB");
}
function Wn(e, t) {
  if (e !== void 0) {
    Pt(e, "randomBytes");
    try {
      const r = e(t);
      if (!ae(r) || r.length !== t)
        return;
    } catch {
      return;
    }
    return e;
  }
}
function Vn(e, t) {
  Cn(e, "points"), e.forEach((r, n) => {
    if (!(r instanceof t))
      throw new Error("invalid point at index " + n);
  });
}
function _o(e, t, r) {
  if (!Array.isArray(e))
    throw new Error("array of scalars expected");
  e.forEach((n, o) => {
    if (!(r === void 0 ? t.isValid(n) : Bt(n) && n < r))
      throw new Error("invalid scalar at index " + o);
  });
}
const Jn = /* @__PURE__ */ new WeakMap();
function le(e) {
  return Jn.get(e) || 1;
}
function Ao(e, t) {
  const r = e.double(), n = [e];
  for (let o = 1; o < t; o++)
    n.push(n[o - 1].add(r));
  return n;
}
function Ro(e, t) {
  const r = 2 ** t, n = r / 2, o = BigInt(r - 1), i = [];
  for (; e > Pe; ) {
    let s = 0;
    e & jt && (s = Number(e & o), s >= n && (s -= r), e -= BigInt(s)), i.push(s), e >>= jt;
  }
  return i;
}
function Io(e, t, r) {
  const n = 2 ** t, o = n / 2, i = BigInt(n - 1), s = BigInt(t), c = [];
  for (let a = 0; a < r; a++) {
    let f = Number(e & i);
    e >>= s, f > o && (f -= n, e += jt), c.push(f);
  }
  if (e !== Pe)
    throw new Error("invalid wnaf");
  return c;
}
function So(e, t, r) {
  let n = 0;
  for (const i of r)
    n = Math.max(n, i.length);
  let o = e;
  for (let i = n - 1; i >= 0; i--) {
    i !== n - 1 && (o = o.double());
    for (let s = 0; s < r.length; s++) {
      const c = r[s][i];
      if (c) {
        const a = t[s][Math.abs(c) - 1 >> 1];
        o = o.add(c < 0 ? a.negate() : a);
      }
    }
  }
  return o;
}
class Oo {
  // Parametrized with a given Point class (not individual point)
  constructor(t, r) {
    h(this, "Point");
    h(this, "BASE");
    h(this, "ZERO");
    h(this, "randomBytes");
    h(this, "wnafPrecomputes", /* @__PURE__ */ new WeakMap());
    h(this, "baseCanBeBlinded");
    h(this, "bits");
    Xt(t), this.randomBytes = Wn(r, he), this.Point = t, this.BASE = t.BASE, this.ZERO = t.ZERO, this.bits = t.Fn.BITS;
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
  buildWnafTable(t, r, n) {
    const o = Math.ceil(n / r) + 1, i = 2 ** (r - 1), s = [];
    let c = t;
    for (let a = 0; a < o; a++) {
      let f = c;
      for (let d = 0; d < i; d++)
        s.push(f), f = f.add(c);
      c = s[s.length - 1].double();
    }
    return { W: r, bits: n, windows: o, comp: s };
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
  wnafCachedCT(t, r) {
    const { W: n, windows: o, comp: i } = t, s = 2 ** (n - 1), c = Io(r, n, o);
    let a = this.ZERO, f = this.BASE;
    for (let d = 0; d < o; d++) {
      const b = c[d], p = d * s, w = Math.abs(b) - 1;
      let l = i[p];
      for (let x = 1; x < s; x++)
        l = x === w ? i[p + x] : l;
      const E = l.negate();
      b === 0 ? f = f.add(i[p]) : a = a.add(b < 0 ? E : l);
    }
    return { p: a, f };
  }
  // Cache key is point identity plus (W, bits); at most two entries exist per point (public-width
  // `Fn.BITS` and blinded `Fn.BITS + BLIND_BITS`). Callers must not reuse the same point with
  // incompatible `transform(...)` layouts and expect a separate cache entry.
  getWnafPrecomputes(t, r, n, o) {
    let i = this.wnafPrecomputes.get(r), s = i == null ? void 0 : i.find((c) => c.W === t && c.bits === n);
    return s || (s = this.buildWnafTable(r, t, n), typeof o == "function" && (s = { ...s, comp: o(s.comp) }), i || (i = [], this.wnafPrecomputes.set(r, i)), i.push(s)), s;
  }
  assertPoint(t) {
    if (!(t instanceof this.Point))
      throw new TypeError('"point" expected Point instance, got type=' + typeof t);
  }
  // Shared prologue of the constant-time entry points. Rejects scalar 0: in key/signature-style
  // callers a zero scalar means broken upstream plumbing, and concrete Points already reject it.
  // Uses inRange instead of Fn.isValidNot0: validateField() only certifies the arithmetic subset.
  validateMulInput(t, r) {
    if (this.assertPoint(t), !kn(r, jt, this.Point.Fn.ORDER))
      throw new Error("invalid scalar");
  }
  // Constant-time dispatch shared by mulCT / mulCTBlinded. Un-precomputed points (W===1, e.g.
  // ECDH peer keys) skip building a throwaway cached table in favor of a small fixed-window
  // multiply. `n` must be < 2^bits.
  runCT(t, r, n, o) {
    const i = le(t);
    return i === 1 ? this.fixedWindowCT(t, r, n) : this.wnafCachedCT(this.getWnafPrecomputes(i, t, n, o), r);
  }
  mulCT(t, r, n) {
    return this.validateMulInput(t, r), this.runCT(t, r, this.bits, n);
  }
  mulCTBlinded(t, r, n) {
    if (this.validateMulInput(t, r), this.randomBytes === void 0)
      throw new Error("randomBytes is required for scalar blinding");
    const o = this.Point.Fn.BITS + fn, i = this.randomBytes(he);
    if (!ae(i) || i.length !== he)
      throw new Error("randomBytes returned invalid byte array");
    i[0] = i[0] & 63 | 128;
    const s = r + Lt(i) * this.Point.Fn.ORDER;
    return this.runCT(t, s, o, n);
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
  fixedWindowCT(t, r, n) {
    const o = xo, i = 1 << o, s = Fe(o), c = new Array(i);
    c[0] = this.ZERO;
    for (let d = 1; d < i; d++)
      c[d] = c[d - 1].add(t);
    const a = Math.ceil(n / o);
    let f = this.ZERO;
    for (let d = a - 1; d >= 0; d--) {
      if (d !== a - 1)
        for (let w = 0; w < o; w++)
          f = f.double();
      const b = Number(r >> BigInt(d * o) & s);
      let p = c[0];
      for (let w = 1; w < i; w++)
        p = w === b ? c[w] : p;
      f = f.add(p);
    }
    return { p: f, f };
  }
  shouldBlind(t, r) {
    return this.randomBytes === void 0 ? !1 : r === jt ? !0 : t !== this.BASE ? !1 : (this.baseCanBeBlinded === void 0 && (this.baseCanBeBlinded = this.mulUnsafe(this.BASE, this.Point.Fn.ORDER).is0()), this.baseCanBeBlinded);
  }
  mulSecret(t, r, n, o) {
    return this.shouldBlind(t, n) ? this.mulCTBlinded(t, r, o) : this.mulCT(t, r, o);
  }
  mulUnsafe(t, r, n) {
    if (this.assertPoint(t), !Bt(r))
      throw new Error("invalid scalar");
    const o = le(t);
    if (o === 1 || r >= this.Point.Fn.ORDER)
      return Ae(this.Point, [t], [r], !0);
    const i = this.getWnafPrecomputes(o, t, this.bits, n);
    return this.wnafCachedCT(i, r).p;
  }
  // Remembers the window size used for precomputed wNAF multiplication of the given point
  // and drops any previously built tables. Usually only the base point is precomputed.
  // W=1 resets the point to the un-precomputed (table-less) paths.
  // W is additionally capped so tables stay under ~2 GiB ({@link TABLE_BYTES_MAX}).
  setWindowSize(t, r) {
    this.assertPoint(t), vo(r, this.bits);
    const n = Math.ceil((this.bits + fn) / r) + 1;
    Bo(n * 2 ** (r - 1), this.Point.Fp.BYTES), Jn.set(t, r), this.wnafPrecomputes.delete(t);
  }
  // True when a window size is set: tables themselves are built lazily on first multiply.
  hasWindowSize(t) {
    return le(t) !== 1;
  }
}
function Ae(e, t, r, n = !1) {
  if (Xt(e), Vn(t, e), At(n, "allowOversized"), _o(r, e.Fn, n ? e.Fn.ORDER ** mo : void 0), t.length !== r.length)
    throw new Error("arrays of points and scalars must have equal length");
  const o = t.map((s) => Ao(s, 4)), i = r.map((s) => Ro(s, 4));
  return So(e.ZERO, o, i);
}
function un(e, t, r) {
  if (t) {
    if (t.ORDER !== e)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    return qt(t), t;
  } else
    return fe(e, { isLE: r });
}
function To(e, t, r = {}, n) {
  if (n === void 0 && (n = e === "edwards"), !t || typeof t != "object")
    throw new Error(`expected valid ${e} CURVE object`);
  zt(r);
  for (const a of ["p", "n", "h"]) {
    const f = t[a];
    if (!(Bt(f) && f !== Pe))
      throw new Error(`CURVE.${a} must be positive bigint`);
  }
  const o = un(t.p, r.Fp, n), i = un(t.n, r.Fn, n), c = ["Gx", "Gy", "a", "b"];
  for (const a of c)
    if (!o.isValid(t[a]))
      throw new Error(`CURVE.${a} must be valid field element of CURVE.Fp`);
  return t = Object.freeze(Object.assign({}, t)), { CURVE: t, Fp: o, Fn: i };
}
function Ho(e, t) {
  return function(n) {
    const o = e(n);
    return { secretKey: o, publicKey: t(o) };
  };
}
const Co = /* @__PURE__ */ BigInt(0);
class Uo extends Error {
  constructor(t = "") {
    super(t);
  }
}
const at = {
  // asn.1 DER encoding utils
  Err: Uo,
  // Basic building block is TLV (Tag-Length-Value)
  _tlv: {
    encode: (e, t) => {
      const { Err: r } = at;
      if (Kt(e, "tag"), e < 0 || e > 255)
        throw new r("tlv.encode: wrong tag");
      if (oo(t, "data"), t.length & 1)
        throw new r("tlv.encode: unpadded data");
      const n = t.length / 2, o = te(n);
      if (o.length / 2 & 128)
        throw new r("tlv.encode: long form length too big");
      const i = n > 127 ? te(o.length / 2 | 128) : "";
      return te(e) + i + o + t;
    },
    // v - value, l - left bytes (unparsed)
    decode(e, t) {
      const { Err: r } = at;
      t = Y(t, void 0, "DER data");
      let n = 0;
      if (e < 0 || e > 255)
        throw new r("tlv.decode: wrong tag");
      if (t.length < 2 || t[n++] !== e)
        throw new r("tlv.decode: wrong tlv");
      const o = t[n++], i = !!(o & 128);
      let s = 0;
      if (!i)
        s = o;
      else {
        const a = o & 127;
        if (!a)
          throw new r("tlv.decode(long): indefinite length not supported");
        if (a > 4)
          throw new r("tlv.decode(long): byte length is too big");
        const f = t.subarray(n, n + a);
        if (f.length !== a)
          throw new r("tlv.decode: length bytes not complete");
        if (f[0] === 0)
          throw new r("tlv.decode(long): zero leftmost byte");
        for (const d of f)
          s = s << 8 | d;
        if (n += a, s < 128)
          throw new r("tlv.decode(long): not minimal encoding");
      }
      const c = t.subarray(n, n + s);
      if (c.length !== s)
        throw new r("tlv.decode: wrong value length");
      return { v: c, l: t.subarray(n + s) };
    }
  },
  // https://crypto.stackexchange.com/a/57734 Leftmost bit of first byte is 'negative' flag,
  // since we always use positive integers here. It must always be empty:
  // - add zero byte if exists
  // - if next byte doesn't have a flag, leading zero is not allowed (minimal encoding)
  _int: {
    encode(e) {
      const { Err: t } = at;
      if (Ue(e), e < Co)
        throw new t("integer: negative integers are not allowed");
      let r = te(e);
      if (Number.parseInt(r[0], 16) & 8 && (r = "00" + r), r.length & 1)
        throw new t("unexpected DER parsing assertion: unpadded hex");
      return r;
    },
    decode(e) {
      const { Err: t } = at;
      if (e.length < 1)
        throw new t("invalid signature integer: empty");
      if (e[0] & 128)
        throw new t("invalid signature integer: negative");
      if (e.length > 1 && e[0] === 0 && !(e[1] & 128))
        throw new t("invalid signature integer: unnecessary leading zero");
      return Lt(e);
    }
  },
  toSig(e, t) {
    const { Err: r, _int: n, _tlv: o } = at;
    if (t !== void 0 && (Kt(t, "maxScalarBytes"), t < 1))
      throw new r("invalid signature: maxScalarBytes must be positive");
    const i = Y(e, void 0, "signature"), { v: s, l: c } = o.decode(48, i);
    if (c.length)
      throw new r("invalid signature: left bytes after parsing");
    const { v: a, l: f } = o.decode(2, s), { v: d, l: b } = o.decode(2, f);
    if (b.length)
      throw new r("invalid signature: left bytes after parsing");
    if (t !== void 0 && (a.length > t || d.length > t))
      throw new r("invalid signature: integer too large");
    return { r: n.decode(a), s: n.decode(d) };
  },
  hexFromSig(e) {
    const { _tlv: t, _int: r } = at;
    zt(e, { r: "bigint", s: "bigint" }, {}, "sig");
    const n = t.encode(2, r.encode(e.r)), o = t.encode(2, r.encode(e.s)), i = n + o;
    return t.encode(48, i);
  }
}, pe = (Object.freeze(at._tlv), Object.freeze(at._int), Object.freeze(at));
const hn = (e, t) => (e + (e >= 0 ? t : -t) / Qn) / t;
function Lo(e, t, r) {
  $n("scalar", e, ft, r);
  const [[n, o], [i, s]] = t, c = hn(s * e, r), a = hn(-o * e, r);
  let f = e - c * n - a * i, d = -c * o - a * s;
  const b = f < ft, p = d < ft;
  b && (f = -f), p && (d = -d);
  const w = Fe(Math.ceil(Ne(r) / 2)) + vt;
  if (f < ft || f >= w || d < ft || d >= w)
    throw new Error("splitScalar (endomorphism): failed for k");
  return { k1neg: b, k1: f, k2neg: p, k2: d };
}
function Re(e) {
  if (!["compact", "recovered", "der"].includes(e))
    throw new Error('Signature format must be "compact", "recovered", or "der"');
  return e;
}
function we(e, t) {
  zt(e);
  const r = {};
  for (let n of Object.keys(t))
    r[n] = e[n] === void 0 ? t[n] : e[n];
  return At(r.lowS, "lowS"), At(r.prehash, "prehash"), r.format !== void 0 && Re(r.format), r;
}
const ft = /* @__PURE__ */ BigInt(0), vt = /* @__PURE__ */ BigInt(1), Qn = /* @__PURE__ */ BigInt(2), ge = /* @__PURE__ */ BigInt(3), No = /* @__PURE__ */ BigInt(4);
function Fo(e, t = {}) {
  const r = To("weierstrass", e, t), n = r.Fp, o = r.Fn;
  let i = r.CURVE;
  const { h: s, n: c } = i;
  zt(t, {}, {
    allowInfinityPoint: "boolean",
    clearCofactor: "function",
    isTorsionFree: "function",
    fromBytes: "function",
    toBytes: "function",
    endo: "object",
    randomBytes: "function"
  });
  const { endo: a, allowInfinityPoint: f, clearCofactor: d, isTorsionFree: b, fromBytes: p, toBytes: w } = t, l = t.randomBytes === void 0 ? Ce : t.randomBytes;
  if (a && (!n.is0(i.a) || typeof a.beta != "bigint" || !Array.isArray(a.basises)))
    throw new Error('invalid endo: expected "beta": bigint and "basises": array');
  const E = a ? {
    beta: a.beta,
    basises: a.basises.map((g) => [...g])
  } : void 0, x = er(n, o);
  function R() {
    if (!n.isOdd)
      throw new Error("compression is not supported: Field does not have .isOdd()");
  }
  function H(g, u, y) {
    if (u.is0()) {
      if (!f)
        throw new Error("bad point: ZERO");
      return Uint8Array.of(0);
    }
    const { x: m, y: _ } = u.toAffine(), A = n.toBytes(m);
    if (At(y, "isCompressed"), y) {
      R();
      const v = !n.isOdd(_);
      return yt(tr(v), A);
    } else
      return yt(Uint8Array.of(4), A, n.toBytes(_));
  }
  function M(g) {
    Y(g, void 0, "Point");
    const { publicKey: u, publicKeyUncompressed: y } = x, m = g.length, _ = g[0], A = g.subarray(1);
    if (f && m === 1 && _ === 0)
      return { x: n.ZERO, y: n.ZERO };
    if (m === u && (_ === 2 || _ === 3)) {
      const v = n.fromBytes(A);
      if (!n.isValid(v))
        throw new Error("bad point: is not on curve, wrong x");
      const S = ot(v);
      let I;
      try {
        I = n.sqrt(S);
      } catch (N) {
        const k = N instanceof Error ? ": " + N.message : "";
        throw new Error("bad point: is not on curve, sqrt error" + k);
      }
      R();
      const C = n.isOdd(I);
      return (_ & 1) === 1 !== C && (I = n.neg(I)), { x: v, y: I };
    } else if (m === y && _ === 4) {
      const v = n.BYTES, S = n.fromBytes(A.subarray(0, v)), I = n.fromBytes(A.subarray(v, v * 2));
      if (!j(S, I))
        throw new Error("bad point: is not on curve");
      return { x: S, y: I };
    } else
      throw new Error(`bad point: got length ${m}, expected compressed=${u} or uncompressed=${y}`);
  }
  const O = w === void 0 ? H : w, P = p === void 0 ? M : p, U = n.mul(i.b, ge), K = n.is0(i.a) ? (g) => n.ZERO : (g) => n.mul(i.a, g);
  function ot(g) {
    const u = n.sqr(g), y = n.mul(u, g);
    return n.add(n.add(y, n.mul(g, i.a)), i.b);
  }
  function j(g, u) {
    const y = n.sqr(u), m = ot(g);
    return n.eql(y, m);
  }
  if (!j(i.Gx, i.Gy))
    throw new Error("bad curve params: generator point");
  const D = n.mul(n.pow(i.a, ge), No), it = n.mul(n.sqr(i.b), BigInt(27));
  if (n.is0(n.add(D, it)))
    throw new Error("bad curve params: a or b");
  function et(g, u, y = !1) {
    if (!n.isValid(u) || y && n.is0(u))
      throw new Error(`bad point coordinate ${g}`);
    return typeof u == "object" && u !== null ? n.create(u) : u;
  }
  function nt(g) {
    if (!(g instanceof Q))
      throw new Error("Weierstrass Point expected");
  }
  function ht(g) {
    if (!E || !E.basises)
      throw new Error("no endo");
    return Lo(g, E.basises, o.ORDER);
  }
  function st(g, u, y, m) {
    if (!o.isValid(m))
      throw new RangeError("invalid scalar: out of range");
    if (E) {
      const { k1neg: _, k1: A, k2neg: v, k2: S } = ht(m), I = new Q(n.mul(y.X, E.beta), y.Y, y.Z);
      g.push(_ ? y.negate() : y, v ? I.negate() : I), u.push(A, S);
    } else
      g.push(y), u.push(m);
  }
  const xt = /* @__PURE__ */ new WeakSet(), B = class B {
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    constructor(u, y, m) {
      h(this, "X");
      h(this, "Y");
      h(this, "Z");
      this.X = et("x", u), this.Y = et("y", y, !0), this.Z = et("z", m), Object.freeze(this);
    }
    static CURVE() {
      return i;
    }
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    static fromAffine(u) {
      const { x: y, y: m } = u || {};
      if (!u || !n.isValid(y) || !n.isValid(m))
        throw new Error("invalid affine point");
      if (u instanceof B)
        throw new Error("projective point not allowed");
      return n.is0(y) && n.is0(m) ? B.ZERO : new B(y, m, n.ONE);
    }
    static fromBytes(u) {
      const y = B.fromAffine(P(Y(u, void 0, "point")));
      return y.assertValidity(), y;
    }
    static fromHex(u) {
      return B.fromBytes(_e(u));
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
      return lt.setWindowSize(this, u), y || this.multiply(ge), this;
    }
    // TODO: return `this`
    /** A point on curve is valid if it conforms to equation. */
    assertValidity() {
      const u = this;
      if (u.is0()) {
        if (f && n.is0(u.X) && n.eql(u.Y, n.ONE) && n.is0(u.Z))
          return;
        throw new Error("bad point: ZERO");
      }
      if (xt.has(u))
        return;
      const { x: y, y: m } = u.toAffine();
      if (!n.isValid(y) || !n.isValid(m))
        throw new Error("bad point: x or y not field elements");
      if (!j(y, m))
        throw new Error("bad point: equation left != right");
      if (!u.isTorsionFree())
        throw new Error("bad point: not in prime-order subgroup");
      xt.add(u);
    }
    hasEvenY() {
      const { y: u } = this.toAffine();
      if (!n.isOdd)
        throw new Error("Field doesn't support isOdd");
      return !n.isOdd(u);
    }
    /** Compare one point to another. */
    equals(u) {
      nt(u);
      const { X: y, Y: m, Z: _ } = this, { X: A, Y: v, Z: S } = u, I = n.eql(n.mul(y, S), n.mul(A, _)), C = n.eql(n.mul(m, S), n.mul(v, _));
      return I && C;
    }
    /** Flips point to one corresponding to (x, -y) in Affine coordinates. */
    negate() {
      return new B(this.X, n.neg(this.Y), this.Z);
    }
    // Renes-Costello-Batina exception-free doubling formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 3
    // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
    double() {
      const { X: u, Y: y, Z: m } = this;
      let _ = n.ZERO, A = n.ZERO, v = n.ZERO, S = n.mul(u, u), I = n.mul(y, y), C = n.mul(m, m), T = n.mul(u, y);
      return T = n.add(T, T), v = n.mul(u, m), v = n.add(v, v), _ = K(v), A = n.mul(U, C), A = n.add(_, A), _ = n.sub(I, A), A = n.add(I, A), A = n.mul(_, A), _ = n.mul(T, _), v = n.mul(U, v), C = K(C), T = n.sub(S, C), T = K(T), T = n.add(T, v), v = n.add(S, S), S = n.add(v, S), S = n.add(S, C), S = n.mul(S, T), A = n.add(A, S), C = n.mul(y, m), C = n.add(C, C), S = n.mul(C, T), _ = n.sub(_, S), v = n.mul(C, I), v = n.add(v, v), v = n.add(v, v), new B(_, A, v);
    }
    // Renes-Costello-Batina exception-free addition formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 1
    // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
    add(u) {
      nt(u);
      const { X: y, Y: m, Z: _ } = this, { X: A, Y: v, Z: S } = u;
      let I = n.ZERO, C = n.ZERO, T = n.ZERO, N = n.mul(y, A), k = n.mul(m, v), q = n.mul(_, S), G = n.add(y, m), F = n.add(A, v);
      G = n.mul(G, F), F = n.add(N, k), G = n.sub(G, F), F = n.add(y, _);
      let W = n.add(A, S);
      return F = n.mul(F, W), W = n.add(N, q), F = n.sub(F, W), W = n.add(m, _), I = n.add(v, S), W = n.mul(W, I), I = n.add(k, q), W = n.sub(W, I), T = K(F), I = n.mul(U, q), T = n.add(I, T), I = n.sub(k, T), T = n.add(k, T), C = n.mul(I, T), k = n.add(N, N), k = n.add(k, N), q = K(q), F = n.mul(U, F), k = n.add(k, q), q = n.sub(N, q), q = K(q), F = n.add(F, q), N = n.mul(k, F), C = n.add(C, N), N = n.mul(W, F), I = n.mul(G, I), I = n.sub(I, N), N = n.mul(G, k), T = n.mul(W, T), T = n.add(T, N), new B(I, C, T);
    }
    subtract(u) {
      return nt(u), this.add(u.negate());
    }
    is0() {
      return this.equals(B.ZERO);
    }
    /**
     * Constant time multiplication.
     * Uses precomputed tables (signed fixed-window wNAF) when available.
     * Uses scalar blinding and avoids endomorphism splitting in the secret-scalar path.
     * @param scalar - by which the point would be multiplied
     * @returns New point
     */
    multiply(u) {
      if (!o.isValidNot0(u))
        throw new RangeError("invalid scalar: out of range");
      const { p: y, f: m } = lt.mulSecret(this, u, s, Nt);
      return Nt([y, m])[0];
    }
    /**
     * Non-constant-time multiplication. Uses width-4 wNAF with GLV endomorphism splitting
     * when available (two half-width scalars sharing one halved doubling chain).
     * It's faster, but should only be used when you don't care about
     * an exposed secret key e.g. sig verification, which works over *public* keys.
     */
    multiplyUnsafe(u) {
      const y = this, m = u;
      if (!o.isValid(m))
        throw new RangeError("invalid scalar: out of range");
      if (m === ft || y.is0())
        return B.ZERO;
      if (m === vt)
        return y;
      if (lt.hasWindowSize(this))
        return lt.mulUnsafe(y, m, Nt);
      const _ = [], A = [];
      return st(_, A, y, m), Ae(B, _, A);
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
      const _ = [], A = [];
      return st(_, A, this, u), st(_, A, y, m), Ae(B, _, A);
    }
    /**
     * Converts Projective point to affine (x, y) coordinates.
     * (X, Y, Z) ∋ (x=X/Z, y=Y/Z).
     * @param invertedZ - Z^-1 (inverted zero) - optional, precomputation is useful for invertBatch
     */
    toAffine(u) {
      const y = this;
      let m = u;
      if (m != null && !n.isValid(m))
        throw new RangeError('"invertedZ" expected valid field element');
      const { X: _, Y: A, Z: v } = y;
      if (n.eql(v, n.ONE))
        return { x: _, y: A };
      const S = y.is0();
      m == null && (m = S ? n.ONE : n.inv(v));
      const I = n.mul(_, m), C = n.mul(A, m), T = n.mul(v, m);
      if (S)
        return { x: n.ZERO, y: n.ZERO };
      if (!n.eql(T, n.ONE))
        throw new Error("invZ was invalid");
      return { x: I, y: C };
    }
    /**
     * Checks whether Point is free of torsion elements (is in prime subgroup).
     * Always torsion-free for cofactor=1 curves.
     */
    isTorsionFree() {
      return s === vt ? !0 : b ? b(B, this) : lt.mulUnsafe(this, c).is0();
    }
    clearCofactor() {
      return s === vt ? this : d ? d(B, this) : this.multiplyUnsafe(s);
    }
    isSmallOrder() {
      return s === vt ? this.is0() : this.clearCofactor().is0();
    }
    toBytes(u = !0) {
      return At(u, "isCompressed"), this.assertValidity(), O(B, this, u);
    }
    toHex(u = !0) {
      return Ln(this.toBytes(u));
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
  };
  h(B, "BASE", new B(i.Gx, i.Gy, n.ONE)), h(B, "ZERO", new B(n.ZERO, n.ONE, n.ZERO)), h(B, "Fp", n), h(B, "Fn", o);
  let Q = B;
  const Nt = (g) => Eo(Q, g), lt = new Oo(Q, l);
  return lt.bits >= 6 && Q.BASE.precompute(6), Object.freeze(Q.prototype), Object.freeze(Q), Q;
}
function tr(e) {
  return Uint8Array.of(e ? 2 : 3);
}
function er(e, t) {
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
function Do(e, t = {}) {
  Xt(e);
  const { Fn: r } = e, n = t.randomBytes === void 0 ? Ce : t.randomBytes, o = Object.assign(er(e.Fp, r), {
    seed: Math.max(Me(r.ORDER), 16)
  });
  function i(w) {
    try {
      const l = r.fromBytes(w);
      return r.isValidNot0(l);
    } catch {
      return !1;
    }
  }
  function s(w, l) {
    const { publicKey: E, publicKeyUncompressed: x } = o;
    try {
      const R = w.length;
      return l === !0 && R !== E || l === !1 && R !== x ? !1 : !e.fromBytes(w).is0();
    } catch {
      return !1;
    }
  }
  function c(w) {
    return w = w === void 0 ? n(o.seed) : w, Gn(Y(w, o.seed, "seed"), r.ORDER);
  }
  function a(w, l = !0) {
    return e.BASE.multiply(r.fromBytes(w)).toBytes(l);
  }
  function f(w) {
    const { secretKey: l, publicKey: E, publicKeyUncompressed: x } = o, R = r._lengths;
    if (!ae(w))
      return;
    const H = Y(w, void 0, "key").length, M = H === E || H === x, O = H === l || !!(R != null && R.includes(H));
    if (!(M && O))
      return M;
  }
  function d(w, l, E = !0) {
    if (f(w) === !0)
      throw new Error("first arg must be private key");
    if (f(l) === !1)
      throw new Error("second arg must be public key");
    const x = r.fromBytes(w), R = e.fromBytes(l);
    if (R.is0())
      throw new Error("invalid public key: point at infinity");
    return R.multiply(x).toBytes(E);
  }
  const b = {
    isValidSecretKey: i,
    isValidPublicKey: s,
    randomSecretKey: c
  }, p = Ho(c, a);
  return Object.freeze(b), Object.freeze(o), Object.freeze({ getPublicKey: a, getSharedSecret: d, keygen: p, Point: e, utils: b, lengths: o });
}
function ko(e, t, r = {}) {
  Xt(e);
  const n = t;
  In(n), zt(r, {}, {
    hmac: "function",
    lowS: "boolean",
    randomBytes: "function",
    bits2int: "function",
    bits2int_modN: "function"
  });
  const o = Object.assign({}, r), i = o.randomBytes === void 0 ? Ce : o.randomBytes, s = o.hmac === void 0 ? (B, g) => Be(n, B, g) : o.hmac, { Fp: c, Fn: a } = e, { ORDER: f, BITS: d } = a, b = Me(f), p = Wn(i, b), { keygen: w, getPublicKey: l, getSharedSecret: E, utils: x, lengths: R } = Do(e, o), H = {
    prehash: !0,
    lowS: typeof o.lowS == "boolean" ? o.lowS : !0,
    format: "compact",
    extraEntropy: !1
  }, M = f * Qn + vt < c.ORDER;
  function O(B) {
    const g = f >> vt;
    return B > g;
  }
  function P(B, g) {
    if (!a.isValidNot0(g))
      throw new Error(`invalid signature ${B}: out of range 1..Point.Fn.ORDER`);
    return g;
  }
  function U() {
    if (!c.isOdd)
      throw new Error("Field doesn't support isOdd");
  }
  function K(B, g, u) {
    return U(), (B === u ? 0 : 2) | Number(c.isOdd(g));
  }
  function ot() {
    if (M)
      throw new Error('"recovered" sig type is not supported for cofactor >2 curves');
  }
  function j(B, g) {
    Re(g);
    const u = R.signature, y = g === "compact" ? u : g === "recovered" ? u + 1 : void 0;
    return Y(B, y);
  }
  class D {
    constructor(g, u, y) {
      h(this, "r");
      h(this, "s");
      h(this, "recovery");
      if (this.r = P("r", g), this.s = P("s", u), y != null) {
        if (ot(), ![0, 1, 2, 3].includes(y))
          throw new Error("invalid recovery id");
        this.recovery = y;
      }
      Object.freeze(this);
    }
    static fromBytes(g, u = H.format) {
      j(g, u);
      let y;
      if (u === "der") {
        if (g.length > 2 * a.BYTES + 16)
          throw new pe.Err("invalid signature: DER signature too long");
        const { r: v, s: S } = pe.toSig(Y(g), a.BYTES + 1);
        return new D(v, S);
      }
      u === "recovered" && (y = g[0], u = "compact", g = g.subarray(1));
      const m = R.signature / 2, _ = g.subarray(0, m), A = g.subarray(m, m * 2);
      return new D(a.fromBytes(_), a.fromBytes(A), y);
    }
    static fromHex(g, u) {
      return this.fromBytes(_e(g), u);
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
      const { r: u, s: y } = this, m = this.assertRecovery(), _ = m === 2 || m === 3 ? u + f : u;
      if (!c.isValid(_))
        throw new Error("invalid recovery id: sig.r+curve.n != R.x");
      const A = c.toBytes(_), v = e.fromBytes(yt(tr((m & 1) === 0), A)), S = a.inv(_), I = et(Y(g, void 0, "msgHash")), C = a.create(-I * S), T = a.create(y * S), N = e.BASE.mulAddUnsafe(C, v, T);
      if (N.is0())
        throw new Error("invalid recovery: point at infinify");
      return N.assertValidity(), N;
    }
    // Signatures should be low-s, to prevent malleability.
    hasHighS() {
      return O(this.s);
    }
    toBytes(g = H.format) {
      if (Re(g), g === "der")
        return _e(pe.hexFromSig(this));
      const { r: u, s: y } = this, m = a.toBytes(u), _ = a.toBytes(y);
      return g === "recovered" ? (ot(), yt(Uint8Array.of(this.assertRecovery()), m, _)) : yt(m, _);
    }
    toHex(g) {
      return Ln(this.toBytes(g));
    }
  }
  Object.freeze(D.prototype), Object.freeze(D);
  const it = o.bits2int === void 0 ? function(g) {
    if (g.length > 8192)
      throw new Error("input is too large");
    const u = Lt(g), y = g.length * 8 - d;
    return y > 0 ? u >> BigInt(y) : u;
  } : o.bits2int, et = o.bits2int_modN === void 0 ? function(g) {
    return a.create(it(g));
  } : o.bits2int_modN, nt = Fe(d);
  function ht(B) {
    return $n("num < 2^" + d, B, ft, nt), a.toBytes(B);
  }
  function st(B, g) {
    return Y(B, void 0, "message"), g ? Y(n(B), void 0, "prehashed message") : B;
  }
  function xt(B, g, u) {
    const { lowS: y, prehash: m, extraEntropy: _ } = we(u, H);
    B = st(B, m);
    const A = et(B), v = a.fromBytes(g);
    if (!a.isValidNot0(v))
      throw new Error("invalid private key");
    const S = [ht(v), ht(A)];
    if (_ != null && _ !== !1) {
      const N = _ === !0 ? i(R.secretKey) : _;
      S.push(Y(N, void 0, "extraEntropy"));
    }
    const I = yt(...S), C = A;
    function T(N) {
      const k = it(N);
      if (!a.isValidNot0(k))
        return;
      const q = e.BASE.multiply(k).toAffine(), G = a.create(q.x);
      if (G === ft)
        return;
      let F;
      if (p !== void 0) {
        const Ft = Lt(Gn(p(b), f)), vr = a.inv(a.mul(Ft, k)), Br = a.mul(Ft, C), _r = a.mul(Ft, v);
        F = a.create(vr * a.create(Br + _r * G));
      } else {
        const Ft = lo(k, f);
        F = a.create(Ft * a.create(C + G * v));
      }
      if (F === ft)
        return;
      let W = K(q.x, q.y, G), Ye = F;
      return y && O(F) && (Ye = a.neg(F), W ^= 1), new D(G, Ye, M ? void 0 : W);
    }
    return { seed: I, k2sig: T };
  }
  function Q(B, g, u = {}) {
    const { seed: y, k2sig: m } = xt(B, g, u);
    return co(n.outputLen, a.BYTES, s)(y, m).toBytes(u.format);
  }
  function Nt(B, g, u, y = {}) {
    const { lowS: m, prehash: _, format: A } = we(y, H);
    if (u = Y(u, void 0, "publicKey"), g = st(g, _), !ae(B)) {
      const v = B instanceof D ? ", use sig.toBytes()" : "";
      throw new Error("verify expects Uint8Array signature" + v);
    }
    j(B, A);
    try {
      const v = D.fromBytes(B, A), S = e.fromBytes(u);
      if (S.is0() || m && v.hasHighS())
        return !1;
      const { r: I, s: C } = v, T = et(g), N = a.inv(C), k = a.create(T * N), q = a.create(I * N), G = e.BASE.mulAddUnsafe(k, S, q);
      if (G.is0())
        return !1;
      const F = G.toAffine();
      return !(a.create(F.x) !== I || A === "recovered" && v.recovery !== K(F.x, F.y, I));
    } catch {
      return !1;
    }
  }
  function lt(B, g, u = {}) {
    const { prehash: y } = we(u, H);
    return g = st(g, y), D.fromBytes(B, "recovered").recoverPublicKey(g).toBytes();
  }
  return Object.freeze({
    keygen: w,
    getPublicKey: l,
    getSharedSecret: E,
    utils: x,
    lengths: R,
    Point: e,
    sign: Q,
    verify: Nt,
    recoverPublicKey: lt,
    Signature: D,
    hash: n
  });
}
const Ke = {
  p: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
  n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
  h: BigInt(1),
  a: BigInt(0),
  b: BigInt(7),
  Gx: BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
  Gy: BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
}, $o = {
  beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
  basises: [
    [BigInt("0x3086d221a7d46bcde86c90e49284eb15"), -BigInt("0xe4437ed6010e88286f547fa90abfe4c3")],
    [BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8"), BigInt("0x3086d221a7d46bcde86c90e49284eb15")]
  ]
}, ln = /* @__PURE__ */ BigInt(2);
function Mo(e) {
  const t = Ke.p, r = BigInt(3), n = BigInt(6), o = BigInt(11), i = BigInt(22), s = BigInt(23), c = BigInt(44), a = BigInt(88), f = e * e * e % t, d = f * f * e % t, b = tt(d, r, t) * d % t, p = tt(b, r, t) * d % t, w = tt(p, ln, t) * f % t, l = tt(w, o, t) * w % t, E = tt(l, i, t) * l % t, x = tt(E, c, t) * E % t, R = tt(x, a, t) * x % t, H = tt(R, c, t) * E % t, M = tt(H, r, t) * d % t, O = tt(M, s, t) * l % t, P = tt(O, n, t) * f % t, U = tt(P, ln, t);
  if (!Ie.eql(Ie.sqr(U), e))
    throw new Error("Cannot find square root");
  return U;
}
const Ie = /* @__PURE__ */ fe(Ke.p, { sqrt: Mo }), Po = /* @__PURE__ */ Fo(Ke, {
  Fp: Ie,
  endo: $o
}), Tt = /* @__PURE__ */ ko(Po, He), Ko = /* @__PURE__ */ Uint8Array.from([
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
]), nr = Uint8Array.from(new Array(16).fill(0).map((e, t) => t)), qo = nr.map((e) => (9 * e + 5) % 16), rr = /* @__PURE__ */ (() => {
  const r = [[nr], [qo]];
  for (let n = 0; n < 4; n++)
    for (let o of r)
      o.push(o[n].map((i) => Ko[i]));
  return r;
})(), or = rr[0], ir = rr[1], sr = /* @__PURE__ */ [
  [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8],
  [12, 13, 11, 15, 6, 9, 9, 7, 12, 15, 11, 13, 7, 8, 7, 7],
  [13, 15, 14, 11, 7, 7, 6, 8, 13, 14, 13, 12, 5, 5, 6, 9],
  [14, 11, 12, 14, 8, 6, 5, 5, 15, 12, 15, 14, 9, 9, 8, 6],
  [15, 12, 13, 13, 9, 5, 8, 6, 14, 11, 12, 11, 8, 6, 5, 5]
].map((e) => Uint8Array.from(e)), jo = /* @__PURE__ */ or.map((e, t) => e.map((r) => sr[t][r])), Zo = /* @__PURE__ */ ir.map((e, t) => e.map((r) => sr[t][r])), Yo = /* @__PURE__ */ Uint32Array.from([
  0,
  1518500249,
  1859775393,
  2400959708,
  2840853838
]), zo = /* @__PURE__ */ Uint32Array.from([
  1352829926,
  1548603684,
  1836072691,
  2053994217,
  0
]);
function pn(e, t, r, n) {
  return e === 0 ? t ^ r ^ n : e === 1 ? t & r | ~t & n : e === 2 ? (t | ~r) ^ n : e === 3 ? t & n | r & ~n : t ^ (r | ~n);
}
const ee = /* @__PURE__ */ new Uint32Array(16);
class Xo extends Te {
  constructor() {
    super(64, 20, 8, !0);
    h(this, "h0", 1732584193);
    h(this, "h1", -271733879);
    h(this, "h2", -1732584194);
    h(this, "h3", 271733878);
    h(this, "h4", -1009589776);
  }
  get() {
    const { h0: r, h1: n, h2: o, h3: i, h4: s } = this;
    return [r, n, o, i, s];
  }
  set(r, n, o, i, s) {
    this.h0 = r | 0, this.h1 = n | 0, this.h2 = o | 0, this.h3 = i | 0, this.h4 = s | 0;
  }
  _cloneInto(r) {
    return (r || (r = new this.constructor())).set(...this.get()), this._cloneIntoMeta(r);
  }
  process(r, n) {
    for (let l = 0; l < 16; l++, n += 4)
      ee[l] = r.getUint32(n, !0);
    let o = this.h0 | 0, i = o, s = this.h1 | 0, c = s, a = this.h2 | 0, f = a, d = this.h3 | 0, b = d, p = this.h4 | 0, w = p;
    for (let l = 0; l < 5; l++) {
      const E = 4 - l, x = Yo[l], R = zo[l], H = or[l], M = ir[l], O = jo[l], P = Zo[l];
      for (let U = 0; U < 16; U++) {
        const K = Qt(o + pn(l, s, a, d) + ee[H[U]] + x, O[U]) + p | 0;
        o = p, p = d, d = Qt(a, 10) | 0, a = s, s = K;
      }
      for (let U = 0; U < 16; U++) {
        const K = Qt(i + pn(E, c, f, b) + ee[M[U]] + R, P[U]) + w | 0;
        i = w, w = b, b = Qt(f, 10) | 0, f = c, c = K;
      }
    }
    this.set(this.h1 + a + b | 0, this.h2 + d + w | 0, this.h3 + p + i | 0, this.h4 + o + c | 0, this.h0 + s + f | 0);
  }
  roundClean() {
    ut(ee);
  }
  destroy() {
    this.destroyed = !0, ut(this.buffer), this.set(0, 0, 0, 0, 0);
  }
}
const Go = /* @__PURE__ */ se(() => new Xo());
const Wo = (e) => Object.freeze(e());
function Vo(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
function Zt(e) {
  if (!Vo(e))
    throw new TypeError("Uint8Array expected");
}
function cr(e) {
  if (typeof e != "function")
    throw new TypeError("function expected");
  return !0;
}
function ar(e, t) {
  if (typeof t != "string")
    throw new TypeError(`${e}: string expected`);
  return !0;
}
function Jo(e, t = "number") {
  if (typeof e != "number")
    throw new TypeError(`${t}: expected number, got ${typeof e}`);
  if (!Number.isSafeInteger(e))
    throw new RangeError(`${t}: expected safe integer, got ${e}`);
}
function Qo(...e) {
  const t = (i) => i, r = (i, s) => (c) => i(s(c)), n = e.map((i) => i.encode).reduceRight(r, t), o = e.map((i) => i.decode).reduce(r, t);
  return { encode: n, decode: o };
}
const wn = /* @__PURE__ */ (() => {
  try {
    const e = new TextDecoder();
    return e.decode(Uint8Array.of(65, 48, 43, 127)) === "A0+" ? e : void 0;
  } catch {
    return;
  }
})(), be = 8192;
function ti(e) {
  const t = e.length;
  if (wn !== void 0 && t >= 12)
    return wn.decode(e);
  if (t <= be)
    return String.fromCharCode.apply(null, e);
  let r = "";
  for (let n = 0; n < t; n += be)
    r += String.fromCharCode.apply(null, e.subarray(n, n + be));
  return r;
}
function ei(e, t) {
  const r = e.length;
  if (r > 128)
    throw new Error("alphabet: max 128 letters");
  const n = new Uint8Array(r), o = new Int8Array(128).fill(-1);
  for (let i = 0; i < r; i++) {
    const s = e.charCodeAt(i);
    if (e.codePointAt(i) !== s || s > 127)
      throw new Error("alphabet: single-char ASCII letters only");
    n[i] = s, o[s] = i;
  }
  if (t !== void 0)
    for (const i of Object.keys(t)) {
      const s = i.charCodeAt(0), c = o[t[i].charCodeAt(0)];
      if (i.length !== 1 || s > 127 || c === void 0 || c === -1)
        throw new Error(`alphabet: invalid alias ${i}`);
      o[s] = c;
    }
  return {
    encode: (i) => {
      const s = new Uint8Array(i.length);
      for (let c = 0; c < i.length; c++) {
        const a = i[c], f = n[a];
        if (f === void 0)
          throw new Error(`alphabet.encode: invalid digit ${a}`);
        s[c] = f;
      }
      return ti(s);
    },
    decode: (i) => {
      ar("decode", i);
      const s = i.length, c = new Uint8Array(s);
      for (let a = 0; a < s; a++) {
        const f = i.charCodeAt(a), d = f < 128 ? o[f] : -1;
        if (d === -1)
          throw new Error(`Unknown letter "${i[a]}". Allowed: ${e}`);
        c[a] = d;
      }
      return c;
    }
  };
}
function ni(e, t) {
  if (Jo(e), e <= 0)
    throw new RangeError(`checksum length must be positive: ${e}`);
  cr(t);
  const r = t;
  return {
    encode(n) {
      Zt(n);
      const o = r(n).slice(0, e), i = new Uint8Array(n.length + e);
      return i.set(n), i.set(o, n.length), i;
    },
    decode(n) {
      Zt(n);
      const o = n.slice(0, -e), i = n.slice(-e), s = r(o).slice(0, e);
      for (let c = 0; c < e; c++)
        if (s[c] !== i[c])
          throw new Error("Invalid checksum");
      return o;
    }
  };
}
const ri = 656356768, gn = 65536, oi = 2048, ii = 4096, si = (e, t) => ({
  encode: (r) => {
    Zt(r);
    const n = r.length;
    if (n === 0)
      return new Uint8Array(0);
    if (n >= gn)
      throw new Error("invalid length");
    let o = 0;
    for (; o < n - 1 && r[o] === 0; )
      o++;
    const i = Math.ceil(n / 2), s = new Uint16Array(i), c = n & 1;
    c && (s[0] = r[0]);
    for (let l = c, E = c; l < n; l += 2, E++)
      s[E] = r[l] << 8 | r[l + 1];
    const a = [];
    let f = 0;
    for (; f < i; ) {
      let l = 0;
      for (let E = f; E < i; E++) {
        const x = l * 65536 + s[E], R = Math.floor(x / t);
        l = x - R * t, s[E] = R, R === 0 && E === f && f++;
      }
      a.push(l);
    }
    const d = a.length - 1;
    let b = d * 5;
    for (let l = a[d]; b++, !(l < e); l = Math.floor(l / e))
      ;
    const p = new Uint8Array(o + b);
    let w = p.length - 1;
    for (let l = 0; l < d; l++) {
      let E = a[l];
      for (let x = 0; x < 5; x++)
        p[w--] = E % e, E = Math.floor(E / e);
    }
    for (let l = a[d]; w >= o; l = Math.floor(l / e))
      p[w--] = l % e;
    return p;
  },
  decode: (r) => {
    Zt(r);
    const n = r.length;
    if (n === 0)
      return new Uint8Array(0);
    if (n >= gn)
      throw new Error("invalid length");
    let o = 0;
    for (; o < n - 1 && r[o] === 0; )
      o++;
    const i = new Uint16Array(Math.ceil(n * 6 / 16) + 1);
    let s = 0, c = 0, a = n % 5 || 5;
    for (; c < n; ) {
      let p = 0, w = 1;
      for (const E = c + a; c < E; c++) {
        const x = r[c];
        if (x >= e)
          throw new Error(`invalid integer: ${x}`);
        p = p * e + x, w *= e;
      }
      a = 5;
      let l = p;
      for (let E = 0; E < s; E++) {
        const x = i[E] * w + l;
        l = Math.floor(x / 65536), i[E] = x - l * 65536;
      }
      for (; l > 0; l = Math.floor(l / 65536))
        i[s++] = l % 65536;
    }
    const f = s === 0 ? 1 : s * 2 - (i[s - 1] < 256 ? 1 : 0), d = new Uint8Array(o + f);
    let b = d.length - 1;
    for (let p = 0; p < s; p++) {
      const w = i[p];
      d[b--] = w & 255, b >= o && (d[b--] = w >> 8);
    }
    return d;
  }
}), ci = (e, t) => {
  const r = ei(t);
  return {
    encode(n) {
      if (Zt(n), n.length > oi)
        throw new Error("invalid length");
      return r.encode(e.encode(n));
    },
    decode(n) {
      if (ar("baseN.decode", n), n.length > ii)
        throw new Error("invalid length");
      return e.decode(r.decode(n));
    }
  };
}, ai = /* @__PURE__ */ si(58, ri), fi = (e) => ci(ai, e), di = /* @__PURE__ */ Wo(() => fi("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz")), ui = (e) => {
  cr(e);
  const t = e;
  return Qo(ni(4, (r) => t(t(r))), di);
};
const Mt = Tt.Point, St = Mt.Fn, ye = /* @__PURE__ */ ui(He), hi = Uint8Array.from("Bitcoin seed".split(""), (e) => e.charCodeAt(0)), me = { private: 76066276, public: 76067358 }, ne = 2147483648, xe = 255, li = (e) => Go(He(e)), pi = (e) => Ht(e).getUint32(0, !1), bt = (e, t = "number") => {
  if (typeof e != "number")
    throw new TypeError(`"${t}" expected number, got type=${typeof e}`);
  if (!Number.isSafeInteger(e) || e < 0 || e > 2 ** 32 - 1)
    throw new RangeError(`"${t}" expected integer in range 0..2**32-1, got ${e}`);
  const r = new Uint8Array(4);
  return Ht(r).setUint32(0, e, !1), r;
}, Ee = (e, t = "versions") => {
  if (!(typeof e == "object" && e !== null))
    throw new Error("versions must be an object");
  return bt(e.private, `${t}.private`), bt(e.public, `${t}.public`), e;
};
class Et {
  constructor(t) {
    h(this, "versions");
    h(this, "depth", 0);
    h(this, "index", 0);
    h(this, "parentFingerprint", 0);
    h(this, "_chainCode", null);
    h(this, "_privateKey");
    h(this, "_publicKey");
    h(this, "_pubHash");
    var i, s, c;
    if (!t || typeof t != "object")
      throw new Error("HDKey.constructor must not be called directly");
    const r = (i = t.depth) != null ? i : 0, n = (s = t.index) != null ? s : 0, o = (c = t.parentFingerprint) != null ? c : 0;
    if (!Number.isSafeInteger(r) || r < 0 || r > xe)
      throw new RangeError("HDKey: depth must be an integer in range 0..255");
    if (bt(n, "index"), bt(o, "parentFingerprint"), r === 0 && (n !== 0 || o !== 0))
      throw new Error("HDKey: zero depth with non-zero index/parent fingerprint");
    if (this.versions = t.versions ? Ee(t.versions) : me, this.depth = r, t.chainCode && Z(t.chainCode, 32), this._chainCode = t.chainCode ? Uint8Array.from(t.chainCode) : null, this.index = n, this.parentFingerprint = o, t.publicKey && t.privateKey)
      throw new Error("HDKey: publicKey and privateKey at same time.");
    if (t.privateKey) {
      if (!Tt.utils.isValidSecretKey(t.privateKey))
        throw new Error("Invalid private key");
      this._privateKey = Uint8Array.from(t.privateKey), this._publicKey = Tt.getPublicKey(this._privateKey, !0);
    } else if (t.publicKey)
      this._publicKey = Mt.fromBytes(t.publicKey).toBytes(!0);
    else
      throw new Error("HDKey: no public or private key provided");
    this._pubHash = li(this._publicKey);
  }
  get fingerprint() {
    if (!this._pubHash)
      throw new Error("No publicKey set!");
    return pi(this._pubHash);
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
    return ye.encode(this.serialize(this.versions.private, $t(Uint8Array.of(0), t)));
  }
  get publicExtendedKey() {
    if (!this._publicKey)
      throw new Error("No public key");
    return ye.encode(this.serialize(this.versions.public, this._publicKey));
  }
  static fromMasterSeed(t, r = me) {
    if (Z(t), r = Ee(r), 8 * t.length < 128 || 8 * t.length > 512)
      throw new RangeError("HDKey: seed length must be between 128 and 512 bits; 256 bits is advised, got " + t.length);
    const n = Be(tn, hi, t), o = n.slice(0, 32), i = n.slice(32);
    return new Et({ versions: r, chainCode: i, privateKey: o });
  }
  static fromExtendedKey(t, r = me) {
    r = Ee(r);
    const n = ye.decode(t);
    if (n.length !== 78)
      throw new Error(`HDKey: invalid extended key length: expected 78 bytes, got ${n.length}`);
    const o = Ht(n), i = o.getUint32(0, !1), s = {
      versions: r,
      depth: n[4],
      parentFingerprint: o.getUint32(5, !1),
      index: o.getUint32(9, !1),
      chainCode: n.slice(13, 45)
    }, c = n.slice(45), a = c[0] === 0;
    if (i !== r[a ? "private" : "public"])
      throw new Error("Version mismatch");
    return a ? new Et({ ...s, privateKey: c.slice(1) }) : new Et({ ...s, publicKey: c });
  }
  static fromJSON(t) {
    return Et.fromExtendedKey("xpriv" in t ? t.xpriv : t.xpub);
  }
  derive(t) {
    if (!/^[mM]'?/.test(t))
      throw new Error('Path must start with "m" or "M"');
    if (/^[mM]'?$/.test(t))
      return this;
    const r = t.replace(/^[mM]'?\//, "").split("/");
    if (r.length > xe - this.depth)
      throw new Error("HDKey: path exceeds the serializable depth 255");
    let n = this;
    for (const o of r) {
      const i = /^(\d+)('?)$/.exec(o), s = i && i[1];
      if (!i || i.length !== 3 || typeof s != "string")
        throw new Error("invalid child index: " + o);
      let c = +s;
      if (!Number.isSafeInteger(c) || c >= ne)
        throw new Error("Invalid index");
      i[2] === "'" && (c += ne), n = n.deriveChild(c);
    }
    return n;
  }
  deriveChild(t) {
    return this._deriveChild(t);
  }
  /** Test-only implementation seam. Production callers must use deriveChild(). */
  _deriveChild(t, r) {
    if (!this._publicKey || !this._chainCode)
      throw new Error("No publicKey or chainCode set");
    let n = bt(t, "index");
    if (t >= ne) {
      const d = this._privateKey;
      if (!d)
        throw new Error("Could not derive hardened child key");
      n = $t(Uint8Array.of(0), d, n);
    } else
      n = $t(this._publicKey, n);
    const o = r || Be(tn, this._chainCode, n);
    Z(o, 64);
    const i = o.slice(0, 32), s = o.slice(32), c = {
      versions: this.versions,
      chainCode: s,
      depth: this.depth + 1,
      parentFingerprint: this.fingerprint,
      index: t
    };
    if (c.depth > xe)
      throw new Error("HDKey: depth exceeds the serializable value 255");
    const a = () => {
      const d = this._privateKey ? 4294967295 : ne - 1;
      if (t >= d)
        throw new Error(`HDKey: cannot retry child derivation at index ${t}`);
      return this.deriveChild(t + 1);
    }, f = St.fromBytes(i, !0);
    if (!St.isValid(f))
      return a();
    if (this._privateKey) {
      const d = St.create(St.fromBytes(this._privateKey) + f);
      if (!St.isValidNot0(d))
        return a();
      c.privateKey = St.toBytes(d);
    } else {
      const d = Mt.fromBytes(this._publicKey), b = f === 0n ? d : d.add(Mt.BASE.multiply(f));
      if (b.equals(Mt.ZERO))
        return a();
      c.publicKey = b.toBytes(!0);
    }
    return new Et(c);
  }
  sign(t) {
    if (!this._privateKey)
      throw new Error("No privateKey set!");
    return Z(t, 32), Tt.sign(t, this._privateKey, { prehash: !1 });
  }
  verify(t, r) {
    if (Z(t, 32), Z(r, 64), !this._publicKey)
      throw new Error("No publicKey set!");
    return Tt.verify(r, t, this._publicKey, { prehash: !1 });
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
  serialize(t, r) {
    if (!this._chainCode)
      throw new Error("No chainCode set");
    return Z(r, 33), $t(bt(t, "version"), new Uint8Array([this.depth]), bt(this.parentFingerprint, "parentFingerprint"), bt(this.index, "index"), this._chainCode, r);
  }
}
const wi = BigInt(0), Dt = BigInt(1), gi = BigInt(2), bi = BigInt(7), yi = BigInt(256), mi = BigInt(113), fr = [], dr = [], ur = [];
for (let e = 0, t = Dt, r = 1, n = 0; e < 24; e++) {
  [r, n] = [n, (2 * r + 3 * n) % 5], fr.push(2 * (5 * n + r)), dr.push((e + 1) * (e + 2) / 2 % 64);
  let o = wi;
  for (let i = 0; i < 7; i++)
    t = (t << Dt ^ (t >> bi) * mi) % yi, t & gi && (o ^= Dt << (Dt << BigInt(i)) - Dt);
  ur.push(o);
}
const hr = Rn(ur, !0), xi = hr[0], Ei = hr[1], vi = (e, t, r) => e << r | t >>> 32 - r, Bi = (e, t, r) => t << r | e >>> 32 - r, _i = (e, t, r) => t << r - 32 | e >>> 64 - r, Ai = (e, t, r) => e << r - 32 | t >>> 64 - r, bn = (e, t, r) => r > 32 ? _i(e, t, r) : vi(e, t, r), yn = (e, t, r) => r > 32 ? Ai(e, t, r) : Bi(e, t, r), Ot = new Uint32Array(10);
function Ri(e, t = 24) {
  if (!(e instanceof Uint32Array))
    throw new TypeError('"s" expected Uint32Array(50), got type=' + typeof e);
  if (e.length !== 50)
    throw new RangeError('"s" expected Uint32Array(50), got length=' + e.length);
  if (V(t, "rounds"), t < 1 || t > 24)
    throw new Error('"rounds" expected integer 1..24');
  for (let r = 24 - t; r < 24; r++) {
    for (let i = 0; i < 10; i++)
      Ot[i] = e[i] ^ e[i + 10] ^ e[i + 20] ^ e[i + 30] ^ e[i + 40];
    for (let i = 0; i < 10; i += 2) {
      const s = (i + 8) % 10, c = (i + 2) % 10, a = Ot[c], f = Ot[c + 1], d = bn(a, f, 1) ^ Ot[s], b = yn(a, f, 1) ^ Ot[s + 1];
      for (let p = 0; p < 50; p += 10)
        e[i + p] ^= d, e[i + p + 1] ^= b;
    }
    let n = e[2], o = e[3];
    for (let i = 0; i < 24; i++) {
      const s = dr[i], c = bn(n, o, s), a = yn(n, o, s), f = fr[i];
      n = e[f], o = e[f + 1], e[f] = c, e[f + 1] = a;
    }
    for (let i = 0; i < 50; i += 10) {
      const s = e[i], c = e[i + 1], a = e[i + 2], f = e[i + 3];
      e[i] ^= ~e[i + 2] & e[i + 4], e[i + 1] ^= ~e[i + 3] & e[i + 5], e[i + 2] ^= ~e[i + 4] & e[i + 6], e[i + 3] ^= ~e[i + 5] & e[i + 7], e[i + 4] ^= ~e[i + 6] & e[i + 8], e[i + 5] ^= ~e[i + 7] & e[i + 9], e[i + 6] ^= ~e[i + 8] & s, e[i + 7] ^= ~e[i + 9] & c, e[i + 8] ^= ~s & a, e[i + 9] ^= ~c & f;
    }
    e[0] ^= xi[r], e[1] ^= Ei[r];
  }
  ut(Ot);
}
class qe {
  // NOTE: we accept arguments in bytes instead of bits here.
  constructor(t, r, n, o = !1, i = 24) {
    h(this, "state");
    h(this, "pos", 0);
    h(this, "posOut", 0);
    h(this, "finished", !1);
    h(this, "state32");
    h(this, "destroyed", !1);
    h(this, "blockLen");
    h(this, "suffix");
    h(this, "outputLen");
    h(this, "canXOF");
    h(this, "enableXOF", !1);
    h(this, "rounds");
    if (V(t, "blockLen"), V(r, "suffix"), V(i, "rounds"), Dr(o, "enableXOF"), this.blockLen = t, this.suffix = r, this.outputLen = n, this.enableXOF = o, this.canXOF = o, this.rounds = i, V(n, "outputLen"), !(0 < t && t < 200))
      throw new Error('"blockLen" must be 1..199');
    this.state = new Uint8Array(200), this.state32 = Ve(this.state);
  }
  clone() {
    return this._cloneInto();
  }
  keccak() {
    Je(this.state32), Ri(this.state32, this.rounds), Je(this.state32), this.posOut = 0, this.pos = 0;
  }
  update(t) {
    Ut(this), Z(t);
    const { blockLen: r, state: n, state32: o } = this, i = t.length, s = r % 4 === 0 && t.byteOffset % 4 === 0, c = r / 4, a = s && i >= r ? Ve(t) : void 0;
    for (let f = 0; f < i; ) {
      if (a !== void 0 && this.pos === 0 && f % 4 === 0 && i - f >= r) {
        for (let b = 0, p = f / 4; b < c; b++)
          o[b] ^= a[p + b];
        f += r, this.pos = r, this.keccak();
        continue;
      }
      const d = Math.min(r - this.pos, i - f);
      for (let b = 0; b < d; b++)
        n[this.pos++] ^= t[f++];
      this.pos === r && this.keccak();
    }
    return this;
  }
  finish() {
    if (this.finished)
      return;
    this.finished = !0;
    const { state: t, suffix: r, pos: n, blockLen: o } = this;
    t[n] ^= r, (r & 128) !== 0 && n === o - 1 && this.keccak(), t[o - 1] ^= 128, this.keccak();
  }
  writeInto(t) {
    Ut(this, !1), Z(t), this.finish();
    const r = this.state, { blockLen: n } = this;
    for (let o = 0, i = t.length; o < i; ) {
      this.posOut >= n && this.keccak();
      const s = Math.min(n - this.posOut, i - o);
      t.set(r.subarray(this.posOut, this.posOut + s), o), this.posOut += s, o += s;
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
    if (Se(t, this), this.finished)
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
    const { blockLen: r, suffix: n, outputLen: o, rounds: i, enableXOF: s } = this;
    return t || (t = new qe(r, n, o, s, i)), t.blockLen = r, t.state32.set(this.state32), t.pos = this.pos, t.posOut = this.posOut, t.finished = this.finished, t.rounds = i, t.suffix = n, t.outputLen = o, t.enableXOF = s, t.canXOF = this.canXOF, t.destroyed = this.destroyed, t;
  }
}
const Ii = (e, t, r, n = {}) => se(() => new qe(t, e, r), n), lr = /* @__PURE__ */ Ii(1, 136, 32), Yt = 2147483648, mn = [
  {
    id: "bip44",
    label: "BIP44",
    xpubPath: "m/44'/60'/{account}'",
    receiveTemplate: "m/44'/60'/{account}'/0/{index}",
    changeTemplate: "m/44'/60'/{account}'/1/{index}",
    note: "MetaMask、OKX Web3、Trust Wallet、imToken 默认路径"
  }
];
function Si(e) {
  const t = mn.find((r) => r.id === e);
  if (!t)
    throw new dt("PATH_INVALID", `unknown derivation scheme: ${e}`, {
      available: mn.map((r) => r.id)
    });
  return t;
}
function xn(e, t, r = 0) {
  return e.replace("{account}", String(t)).replace("{index}", String(r));
}
function Oi(e) {
  const t = e.trim();
  if (t === "m" || t === "M" || t === "") return [];
  if (!/^m(\/|$)/u.test(t))
    throw new dt("PATH_INVALID", `path must start with m/: ${e}`);
  const r = t.replace(/^m\/?/u, "");
  return r.length === 0 ? [] : r.split("/").map((n) => {
    const o = n.endsWith("'") || n.endsWith("h") || n.endsWith("H"), i = o ? n.slice(0, -1) : n;
    if (!/^\d+$/u.test(i))
      throw new dt("PATH_INVALID", `invalid path segment "${n}" in ${e}`);
    const s = Number.parseInt(i, 10);
    if (s >= Yt)
      throw new dt("PATH_INVALID", `path segment ${n} exceeds the hardened range`);
    return o ? s + Yt : s;
  });
}
function Ti(e) {
  return e.length === 0 ? "m" : "m/" + e.map((t) => t >= Yt ? `${t - Yt}'` : String(t)).join("/");
}
function Hi(e) {
  return e >= Yt;
}
function Ci(e, t) {
  const r = Oi(t);
  let n = e;
  for (const o of r) {
    if (Hi(o) && !n.privateKey)
      throw new dt(
        "DERIVATION_HARDENED_NEEDS_PRIVATE",
        `cannot derive hardened child ${Ti([o])} from a public-only key`
      );
    n = n.deriveChild(o);
  }
  return n;
}
function Ui(e) {
  if (e.length === 33) {
    const t = Tt.Point.fromBytes(e).toAffine();
    return Li(t.x, t.y);
  }
  if (e.length === 65) {
    if (e[0] !== 4)
      throw new dt("KEY_MISSING_PRIVATE", "uncompressed public key must start with 0x04");
    return pr(e.subarray(1));
  }
  throw new dt("KEY_MISSING_PRIVATE", `unsupported public key length ${e.length}`);
}
function pr(e) {
  const t = lr(e);
  return Ni(ce(t.subarray(12)));
}
function Li(e, t) {
  const r = new Uint8Array(64);
  return r.set(En(e), 0), r.set(En(t), 32), pr(r);
}
function En(e) {
  const t = new Uint8Array(32);
  let r = e;
  for (let n = 31; n >= 0; n--)
    t[n] = Number(r & 0xffn), r >>= 8n;
  if (r !== 0n) throw new dt("KEY_MISSING_PRIVATE", "coordinate does not fit in 32 bytes");
  return t;
}
function Ni(e) {
  const t = e.toLowerCase().replace(/^0x/u, "");
  if (!/^[0-9a-f]{40}$/u.test(t))
    throw new dt("TX_INVALID_FIELD", `not an EVM address: ${e}`);
  const r = ce(lr(new TextEncoder().encode(t)));
  let n = "0x";
  for (let o = 0; o < 40; o++)
    n += Number.parseInt(r[o], 16) >= 8 ? t[o].toUpperCase() : t[o];
  return n;
}
BigInt(Number.MAX_SAFE_INTEGER);
function Fi(e, t, r, n) {
  const o = Si(t), i = Et.fromExtendedKey(e), s = xn(o.receiveTemplate, r, n), c = xn(o.xpubPath, r), a = s.slice(c.length).replace(/^\//u, ""), f = a.length === 0 ? i : Ci(i, `m/${a}`);
  return {
    account: r,
    scheme: t,
    address: Ui(f.publicKey),
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
  constructor({ code: r, message: n, data: o }) {
    super(n);
    h(this, "code");
    h(this, "data");
    this.name = "RpcError", this.code = r, o !== void 0 && (this.data = o);
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
const vn = {
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
}, Di = 501;
function ki(e) {
  return e === Di;
}
const $i = 200;
function Mi(e) {
  var t;
  return ((t = e.addresses) != null ? t : []).map((r, n) => ({
    address: r.address,
    path: r.path,
    scheme: "solana",
    account: n,
    index: 0
  }));
}
function Pi(e, t, r, n) {
  const o = e.accounts.find(
    (c) => c.scheme === t && c.account === r
  );
  if (!o) return [];
  const i = Math.max(1, Math.min(n, $i)), s = [];
  for (let c = 0; c < i; c++)
    try {
      const a = Fi(o.xpub, o.scheme, o.account, c);
      s.push({
        address: a.address,
        path: a.path,
        scheme: o.scheme,
        account: o.account,
        index: c
      });
    } catch {
      break;
    }
  return s;
}
function wr(e, t) {
  return ki(t.chainId) ? Mi(e).slice(t.accountIndex, t.accountIndex + 1) : Pi(
    e,
    t.schemeId,
    t.accountIndex,
    t.addressCount
  );
}
function gr(e, t) {
  var n, o;
  const r = wr(e, t);
  return (o = (n = r[t.addressIndex]) != null ? n : r[0]) != null ? o : null;
}
class Ki {
  constructor(t) {
    h(this, "id", 0);
    h(this, "url");
    h(this, "timeoutMs");
    var r;
    this.url = t.url, this.timeoutMs = (r = t.timeoutMs) != null ? r : 2e4;
  }
  async call(t, r = []) {
    const n = new AbortController(), o = setTimeout(() => n.abort(), this.timeoutMs);
    try {
      const i = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method: t, params: r }),
        signal: n.signal
      });
      if (!i.ok)
        throw new z({
          code: X.internal.code,
          message: `RPC 节点返回 HTTP ${i.status}`
        });
      const s = await i.json();
      if (s.error)
        throw new z({
          code: s.error.code,
          message: s.error.message,
          ...s.error.data !== void 0 ? { data: s.error.data } : {}
        });
      return s.result;
    } catch (i) {
      throw i instanceof z ? i : i.name === "AbortError" ? new z({ code: X.internal.code, message: "RPC 请求超时" }) : new z({
        code: X.internal.code,
        message: `无法连接 RPC 节点：${i.message}`
      });
    } finally {
      clearTimeout(o);
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
async function qi(e, t, r) {
  const n = new Ki({ url: r.rpcUrl });
  switch (e) {
    case "eth_getTransactionCount":
      return kt(await n.call(e, t), "nonce");
    case "eth_gasPrice":
      return kt(await n.call(e, t), "gasPrice");
    case "eth_estimateGas":
      return kt(await n.call(e, t), "gas");
    case "eth_maxPriorityFeePerGas": {
      const o = await n.call(e, t);
      return typeof o == "string" ? kt(o, "maxPriorityFeePerGas") : kt(await n.call("eth_gasPrice", []), "gasPrice");
    }
    case "eth_chainId": {
      const o = await n.call(e, t);
      return typeof o == "string" ? o : `0x${r.chainId.toString(16)}`;
    }
    case "eth_sendRawTransaction":
      return ji(t[0]), n.call(e, t);
    default:
      return n.call(e, t);
  }
}
function ji(e) {
  if (typeof e != "string" || !/^0x02[0-9a-fA-F]+$|^0x[0-9a-fA-F]{100,}$/u.test(e))
    throw new z({
      code: X.invalidParams.code,
      message: "拒绝广播：不是合法的已签名交易载荷"
    });
}
const Zi = /* @__PURE__ */ new Set([
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
]), Yi = {
  eth_sendTransaction: "sendTransaction",
  eth_signTransaction: "signTransaction",
  personal_sign: "personal_sign",
  eth_signTypedData_v4: "signTypedData",
  eth_signTypedData: "signTypedData"
};
async function zi(e, t, r) {
  try {
    return { result: await Xi(e, t, r) };
  } catch (n) {
    return n instanceof z ? { error: n.toShape() } : { error: { code: X.internal.code, message: n.message } };
  }
}
async function Xi(e, t, r) {
  var a;
  const { wallet: n, settings: o, origin: i, approvedOrigins: s } = r;
  switch (e) {
    case "eth_chainId":
      return `0x${o.chainId.toString(16)}`;
    case "net_version":
      return String(o.chainId);
    case "wallet_getPermissions":
      return s.includes(i) ? [{ parentCapability: "eth_accounts", caveats: [] }] : [];
    case "wallet_requestPermissions":
      return _n(n), [
        {
          parentCapability: "eth_accounts",
          caveats: [{ type: "restrictReturnedAccounts", value: [(a = gr(n, o)) == null ? void 0 : a.address] }]
        }
      ];
    case "wallet_revokePermissions":
      return null;
    case "wallet_switchEthereumChain": {
      const f = Wi(t[0]);
      if (f === o.chainId) return null;
      if (!o.rpcUrls[f]) throw new z(X.unrecognizedChain);
      return await r.requestApproval({
        id: re(),
        kind: "connect",
        origin: i,
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
      return !n || !s.includes(i) ? [] : Bn(n, o);
    case "eth_requestAccounts": {
      if (!n)
        throw await r.requestApproval({
          id: re(),
          kind: "connect",
          origin: i,
          chainId: o.chainId,
          createdAt: Date.now(),
          method: e,
          params: []
        }), new z(X.disconnected);
      return s.includes(i) || await r.requestApproval({
        id: re(),
        kind: "connect",
        origin: i,
        chainId: o.chainId,
        createdAt: Date.now(),
        method: e,
        params: []
      }), Bn(n, o);
    }
  }
  if (Zi.has(e))
    return r.forward(e, t);
  const c = Yi[e];
  if (c) {
    _n(n), Gi(i, s);
    const f = {
      id: re(),
      kind: c,
      origin: i,
      chainId: o.chainId,
      createdAt: Date.now(),
      method: e,
      params: t
    };
    return r.requestApproval(f);
  }
  throw e.startsWith("wallet_") ? new z(X.unsupportedMethod) : new z({ code: -32601, message: `不支持的方法 ${e}` });
}
function Bn(e, t) {
  const r = new Set(t.hiddenAccounts.map((i) => i.toLowerCase())), n = wr(e, t).filter(
    (i) => !r.has(i.address.toLowerCase())
  ), o = gr(e, t);
  return o ? [o.address, ...n.map((i) => i.address).filter((i) => i !== o.address)] : [];
}
function _n(e) {
  if (!e)
    throw new z({
      code: X.disconnected.code,
      message: "尚未连接硬件钱包。请在插件中扫码导入 xpub。"
    });
}
function Gi(e, t) {
  if (!t.includes(e))
    throw new z({
      code: X.unauthorized.code,
      message: "该站点尚未获得账户授权。请先调用 eth_requestAccounts。"
    });
}
function Wi(e) {
  const t = e == null ? void 0 : e.chainId;
  if (typeof t == "string") return Number.parseInt(t.replace(/^0x/u, ""), 16);
  if (typeof t == "number") return t;
  throw new z(X.invalidParams);
}
function re() {
  const e = new Uint8Array(16);
  return crypto.getRandomValues(e), ce(e, !0);
}
const Vi = "netproof.wallet.v1", Ji = "netproof.settings.v1", br = "netproof.origins.v1", je = "netproof.pending.v1";
function yr() {
  return chrome.storage.local;
}
async function de(e) {
  var r;
  return (r = (await yr().get(e))[e]) != null ? r : null;
}
async function Ze(e, t) {
  await yr().set({ [e]: t });
}
async function Qi() {
  return de(Vi);
}
async function mr() {
  var t;
  const e = await de(Ji);
  return {
    ...vn,
    ...e != null ? e : {},
    rpcUrls: { ...vn.rpcUrls, ...(t = e == null ? void 0 : e.rpcUrls) != null ? t : {} }
  };
}
async function xr() {
  var e;
  return (e = await de(br)) != null ? e : [];
}
async function ts(e) {
  const t = await xr();
  t.includes(e) || await Ze(br, [...t, e]);
}
async function Gt() {
  var e;
  return (e = await de(je)) != null ? e : [];
}
async function es(e) {
  const t = await Gt();
  await Ze(
    je,
    [...t.filter((r) => r.id !== e.id), e]
  );
}
async function ns(e) {
  var r;
  return (r = (await Gt()).find((n) => n.id === e)) != null ? r : null;
}
async function ue(e) {
  const t = await Gt();
  await Ze(
    je,
    t.filter((r) => r.id !== e)
  );
}
const An = "tab.html", _t = /* @__PURE__ */ new Map();
chrome.runtime.onInstalled.addListener(() => {
  Gt().then(async (e) => {
    for (const t of e) await ue(t.id);
  });
});
chrome.runtime.onConnect.addListener((e) => {
  e.name === "netproof-provider" && e.onMessage.addListener((t) => {
    (async () => {
      var r;
      try {
        if (t.type === "approval-result") {
          Er(t);
          return;
        }
        if (t.type === "provider-poke") {
          e.postMessage({ type: "poked" });
          return;
        }
        if (t.type !== "rpc") return;
        const n = await rs(t.method, t.params, t.origin);
        e.postMessage({ type: "rpc-result", id: t.id, ...n });
      } catch (n) {
        e.postMessage({
          type: "rpc-result",
          id: (r = t.id) != null ? r : "unknown",
          error: { code: X.internal.code, message: n.message }
        });
      }
    })();
  });
});
chrome.runtime.onMessage.addListener((e, t, r) => {
  const n = e;
  return (n == null ? void 0 : n.type) === "approval-result" ? (Er(n), r({ ok: !0 }), !0) : (n == null ? void 0 : n.type) === "pending-list" ? (Gt().then((o) => r({ pending: o })), !0) : !1;
});
async function rs(e, t, r) {
  const n = await mr(), o = await Qi(), i = await xr(), s = n.rpcUrls[n.chainId];
  return s ? zi(e, t, {
    wallet: o,
    settings: n,
    origin: r,
    approvedOrigins: i,
    forward: (c, a) => qi(c, a, { rpcUrl: s, chainId: n.chainId }),
    requestApproval: (c) => os(c)
  }) : { error: { code: X.unrecognizedChain.code, message: `链 ${n.chainId} 没有配置 RPC` } };
}
function os(e, t) {
  return new Promise((r, n) => {
    (async () => (await es(e), _t.set(e.id, { resolve: r, reject: n }), await is(e.id), setTimeout(() => {
      _t.has(e.id) && (_t.delete(e.id), ue(e.id), n({ code: X.userRejected.code, message: "请求已超时，请重新发起" }));
    }, 600 * 1e3)))();
  });
}
async function is(e) {
  const t = chrome.runtime.getURL(`${An}#/approve/${e}`), n = (await chrome.tabs.query({ url: chrome.runtime.getURL(`${An}*`) }))[0];
  if ((n == null ? void 0 : n.id) !== void 0) {
    await chrome.tabs.update(n.id, { url: t, active: !0 }), n.windowId !== void 0 && await chrome.windows.update(n.windowId, { focused: !0 });
    return;
  }
  await chrome.tabs.create({ url: t });
}
function Er(e) {
  const t = _t.get(e.id);
  t && (_t.delete(e.id), ue(e.id), e.error ? t.reject(e.error) : t.resolve(e.result));
}
async function cs(e, t) {
  if (!await ns(e)) return;
  await ue(e);
  const n = _t.get(e);
  n && (_t.delete(e), t.error ? n.reject(t.error) : n.resolve(t.result));
}
async function as(e) {
  await ts(e);
}
async function fs() {
  return mr();
}
function ds() {
  const e = new Uint8Array(16);
  return crypto.getRandomValues(e), ce(e, !0);
}
export {
  z as RpcError,
  cs as __completeApproval,
  cs as completeApproval,
  ds as newRequestId,
  fs as readSettings,
  as as rememberOrigin
};
