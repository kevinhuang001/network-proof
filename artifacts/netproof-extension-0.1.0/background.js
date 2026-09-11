var Sr = Object.defineProperty;
var Or = (e, t, n) => t in e ? Sr(e, t, { enumerable: !0, configurable: !0, writable: !0, value: n }) : e[t] = n;
var l = (e, t, n) => Or(e, typeof t != "symbol" ? t + "" : t, n);
class dt extends Error {
  constructor(n, r, i) {
    super(r);
    l(this, "code");
    l(this, "details");
    this.name = "NetProofError", this.code = n, this.details = i;
  }
}
const Vt = BigInt(2 ** 32 - 1), Ge = /* @__PURE__ */ BigInt(32);
function Tr(e, t = !1) {
  return t ? { h: Number(e & Vt), l: Number(e >> Ge & Vt) } : { h: Number(e >> Ge & Vt) | 0, l: Number(e & Vt) | 0 };
}
function Sn(e, t = !1) {
  const n = e.length;
  let r = new Uint32Array(n), i = new Uint32Array(n);
  for (let o = 0; o < n; o++) {
    const { h: s, l: c } = Tr(e[o], t);
    [r[o], i[o]] = [s, c];
  }
  return [r, i];
}
const Hr = (e) => e / 2 ** 32 | 0, Cr = (e) => e >>> 0;
function Ur(e, t, n, r) {
  const i = Hr(n), o = Cr(n);
  e.setUint32(t, r ? o : i, r), e.setUint32(t + 4, r ? i : o, r);
}
const We = (e, t, n) => e >>> n, Ve = (e, t, n) => e << 32 - n | t >>> n, Rt = (e, t, n) => e >>> n | t << 32 - n, It = (e, t, n) => e << 32 - n | t >>> n, Jt = (e, t, n) => e << 64 - n | t >>> n - 32, Qt = (e, t, n) => e >>> n - 32 | t << 64 - n;
function ct(e, t, n, r) {
  const i = (t >>> 0) + (r >>> 0);
  return { h: e + n + (i / 2 ** 32 | 0) | 0, l: i | 0 };
}
const Lr = (e, t, n) => (e >>> 0) + (t >>> 0) + (n >>> 0), Nr = (e, t, n, r) => t + n + r + (e / 2 ** 32 | 0) | 0, Fr = (e, t, n, r) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0), Dr = (e, t, n, r, i) => t + n + r + i + (e / 2 ** 32 | 0) | 0, $r = (e, t, n, r, i) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0) + (i >>> 0), kr = (e, t, n, r, i, o) => t + n + r + i + o + (e / 2 ** 32 | 0) | 0;
function _e(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
const se = (e) => e ? `"${e}" ` : "";
function V(e, t = "") {
  if (typeof e != "number")
    throw new TypeError(se(t) + "expected number, got " + typeof e);
  if (!Number.isSafeInteger(e) || e < 0)
    throw new RangeError(se(t) + "expected integer >= 0, got " + e);
  return e;
}
function Mr(e, t = "") {
  if (typeof e != "boolean")
    throw new TypeError(se(t) + "expected boolean, got type=" + typeof e);
  return e;
}
function Y(e, t, n = "") {
  if (_e(e) && (t === void 0 || e.length === t))
    return e;
  t !== void 0 && V(t, "length");
  const r = _e(e), i = t !== void 0 ? ` of length ${t}` : "", o = r ? `length=${e.length}` : `type=${typeof e}`, s = se(n) + "expected Uint8Array" + i + ", got " + o;
  throw r ? new RangeError(s) : new TypeError(s);
}
function On(e) {
  if (typeof e != "function" || typeof e.create != "function")
    throw new TypeError("expected hash wrapped by utils.createHasher");
  if (V(e.outputLen), V(e.blockLen), e.outputLen < 1 || e.blockLen < 1)
    throw new Error("hash blockLen / outputLen must be >= 1");
}
const Pr = (e, t) => {
  if (e === null || typeof e != "object" || Array.isArray(e))
    throw new TypeError((t === "object" ? "" : `"${t}" `) + "expected object, got type=" + typeof e);
}, Je = (e, t) => {
  Pr(e, t);
  const n = Object.getPrototypeOf(e);
  if (n !== Object.prototype && n !== null)
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
function Te(e, t) {
  Y(e, void 0, "output");
  const n = t.outputLen;
  if (!(e.length >= n))
    throw new RangeError('"output" expected length >= ' + n);
}
function Qe(e) {
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
const Kr = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
function qr(e) {
  return e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255;
}
function jr(e) {
  for (let t = 0; t < e.length; t++)
    e[t] = qr(e[t]);
  return e;
}
const tn = Kr ? (e) => e : jr, Tn = /* @ts-ignore */ typeof Uint8Array.from([]).toHex == "function" && typeof Uint8Array.fromHex == "function", Yr = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0"));
function He(e) {
  if (Y(e), Tn)
    return e.toHex();
  let t = "";
  for (let n = 0; n < e.length; n++)
    t += Yr[e[n]];
  return t;
}
function en(e) {
  return e >= 48 && e <= 57 ? e - 48 : e >= 65 && e <= 70 ? e - 55 : e >= 97 && e <= 102 ? e - 87 : void 0;
}
function Hn(e) {
  if (typeof e != "string")
    throw new TypeError("hex string expected, got " + typeof e);
  if (Tn)
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
    const s = en(e.charCodeAt(o)), c = en(e.charCodeAt(o + 1));
    if (s === void 0 || c === void 0) {
      const a = e[o] + e[o + 1];
      throw new RangeError('hex string expected, got non-hex character "' + a + '" at index ' + o);
    }
    r[i] = s * 16 + c;
  }
  return r;
}
function kt(...e) {
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
function Zr(e, t, n = "opts") {
  return Je(e, "defaults"), t !== void 0 && Je(t, n), Object.assign(/* @__PURE__ */ Object.create(null), e, t);
}
function ae(e, t = {}) {
  if (typeof e != "function")
    throw new TypeError('"hashCons" expected function, got type=' + typeof e);
  t = Zr({}, t, "info");
  const n = (i, o) => e(o).update(i).digest(), r = e(void 0);
  return n.outputLen = r.outputLen, n.blockLen = r.blockLen, n.canXOF = r.canXOF, n.create = (i) => e(i), Object.assign(n, t), Object.freeze(n);
}
function zr(e = 32) {
  V(e, "bytesLength");
  const t = typeof globalThis == "object" ? globalThis.crypto : null;
  if (typeof (t == null ? void 0 : t.getRandomValues) != "function")
    throw new Error("crypto.getRandomValues must be defined");
  if (e > 65536)
    throw new RangeError(`"bytesLength" expected <= 65536, got ${e}`);
  return t.getRandomValues(new Uint8Array(e));
}
const Cn = (e) => ({
  // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
  // Larger suffix values would need base-128 OID encoding and a different length byte.
  oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, e])
});
function Xr(e, t, n) {
  return e & t ^ ~e & n;
}
function Gr(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
class Ce {
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
    Ut(this), Y(t);
    const { view: n, buffer: r, blockLen: i } = this, o = t.length;
    let s = !1;
    for (let c = 0; c < o; ) {
      const a = Math.min(i - this.pos, o - c);
      if (a === i) {
        const f = Ht(t);
        for (; i <= o - c; c += i)
          this.process(f, c);
        s = !0;
        continue;
      }
      r.set(c === 0 && a === o ? t : t.subarray(c, c + a), this.pos), this.pos += a, c += a, this.pos === i && (this.process(n, 0), this.pos = 0, s = !0);
    }
    return this.length += t.length, s && this.roundClean(), this;
  }
  digestInto(t) {
    Ut(this), Te(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, n.fill(0, s), this.padOffset > i - s && (this.process(r, 0), n.fill(0)), Ur(r, i - 8, this.length * 8, o), this.process(r, 0), this.roundClean();
    const c = t === n ? r : Ht(t), a = this.outputLen, f = a / 4, d = this.get();
    if (a % 4 || f > d.length)
      throw new Error("invalid outputLen");
    for (let b = 0; b < f; b++)
      c.setUint32(4 * b, d[b], o);
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
const Wr = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), Vr = /* @__PURE__ */ Uint32Array.from([
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
]), Jr = /* @__PURE__ */ Uint32Array.from([
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
class Qr extends Ce {
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
    const { A: n, B: r, C: i, D: o, E: s, F: c, G: a, H: f } = this;
    return [n, r, i, o, s, c, a, f];
  }
  // prettier-ignore
  set(n, r, i, o, s, c, a, f) {
    this.A = n | 0, this.B = r | 0, this.C = i | 0, this.D = o | 0, this.E = s | 0, this.F = c | 0, this.G = a | 0, this.H = f | 0;
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
    let { A: i, B: o, C: s, D: c, E: a, F: f, G: d, H: b } = this;
    for (let p = 0; p < 64; p++) {
      const w = rt(a, 6) ^ rt(a, 11) ^ rt(a, 25), h = b + w + Xr(a, f, d) + Jr[p] + pt[p] | 0, x = (rt(i, 2) ^ rt(i, 13) ^ rt(i, 22)) + Gr(i, o, s) | 0;
      b = d, d = f, f = a, a = c + h | 0, c = s, s = o, o = i, i = h + x | 0;
    }
    i = i + this.A | 0, o = o + this.B | 0, s = s + this.C | 0, c = c + this.D | 0, a = a + this.E | 0, f = f + this.F | 0, d = d + this.G | 0, b = b + this.H | 0, this.set(i, o, s, c, a, f, d, b);
  }
  roundClean() {
    ut(pt);
  }
  destroy() {
    this.destroyed = !0, this.set(0, 0, 0, 0, 0, 0, 0, 0), ut(this.buffer);
  }
}
class ti extends Qr {
  constructor() {
    super(32, Wr);
  }
}
const Un = Sn([
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
].map((e) => BigInt(e))), ei = Un[0], ni = Un[1], wt = /* @__PURE__ */ new Uint32Array(80), gt = /* @__PURE__ */ new Uint32Array(80);
class ri extends Ce {
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
    const { Ah: n, Al: r, Bh: i, Bl: o, Ch: s, Cl: c, Dh: a, Dl: f, Eh: d, El: b, Fh: p, Fl: w, Gh: h, Gl: E, Hh: x, Hl: R } = this;
    return [n, r, i, o, s, c, a, f, d, b, p, w, h, E, x, R];
  }
  // prettier-ignore
  set(n, r, i, o, s, c, a, f, d, b, p, w, h, E, x, R) {
    this.Ah = n | 0, this.Al = r | 0, this.Bh = i | 0, this.Bl = o | 0, this.Ch = s | 0, this.Cl = c | 0, this.Dh = a | 0, this.Dl = f | 0, this.Eh = d | 0, this.El = b | 0, this.Fh = p | 0, this.Fl = w | 0, this.Gh = h | 0, this.Gl = E | 0, this.Hh = x | 0, this.Hl = R | 0;
  }
  _cloneInto(n) {
    return (n || (n = new this.constructor())).set(...this.get()), this._cloneIntoMeta(n);
  }
  process(n, r) {
    for (let O = 0; O < 16; O++, r += 4)
      wt[O] = n.getUint32(r), gt[O] = n.getUint32(r += 4);
    for (let O = 16; O < 80; O++) {
      const P = wt[O - 15] | 0, U = gt[O - 15] | 0, K = Rt(P, U, 1) ^ Rt(P, U, 8) ^ We(P, U, 7), it = It(P, U, 1) ^ It(P, U, 8) ^ Ve(P, U, 7), j = wt[O - 2] | 0, D = gt[O - 2] | 0, ot = Rt(j, D, 19) ^ Jt(j, D, 61) ^ We(j, D, 6), et = It(j, D, 19) ^ Qt(j, D, 61) ^ Ve(j, D, 6), nt = Fr(it, et, gt[O - 7], gt[O - 16]), lt = Dr(nt, K, ot, wt[O - 7], wt[O - 16]);
      wt[O] = lt | 0, gt[O] = nt | 0;
    }
    let { Ah: i, Al: o, Bh: s, Bl: c, Ch: a, Cl: f, Dh: d, Dl: b, Eh: p, El: w, Fh: h, Fl: E, Gh: x, Gl: R, Hh: H, Hl: M } = this;
    for (let O = 0; O < 80; O++) {
      const P = Rt(p, w, 14) ^ Rt(p, w, 18) ^ Jt(p, w, 41), U = It(p, w, 14) ^ It(p, w, 18) ^ Qt(p, w, 41), K = p & h ^ ~p & x, it = w & E ^ ~w & R, j = $r(M, U, it, ni[O], gt[O]), D = kr(j, H, P, K, ei[O], wt[O]), ot = j | 0, et = Rt(i, o, 28) ^ Jt(i, o, 34) ^ Jt(i, o, 39), nt = It(i, o, 28) ^ Qt(i, o, 34) ^ Qt(i, o, 39), lt = i & s ^ i & a ^ s & a, st = o & c ^ o & f ^ c & f;
      H = x | 0, M = R | 0, x = h | 0, R = E | 0, h = p | 0, E = w | 0, { h: p, l: w } = ct(d | 0, b | 0, D | 0, ot | 0), d = a | 0, b = f | 0, a = s | 0, f = c | 0, s = i | 0, c = o | 0;
      const xt = Lr(ot, nt, st);
      i = Nr(xt, D, et, lt), o = xt | 0;
    }
    ({ h: i, l: o } = ct(this.Ah | 0, this.Al | 0, i | 0, o | 0)), { h: s, l: c } = ct(this.Bh | 0, this.Bl | 0, s | 0, c | 0), { h: a, l: f } = ct(this.Ch | 0, this.Cl | 0, a | 0, f | 0), { h: d, l: b } = ct(this.Dh | 0, this.Dl | 0, d | 0, b | 0), { h: p, l: w } = ct(this.Eh | 0, this.El | 0, p | 0, w | 0), { h, l: E } = ct(this.Fh | 0, this.Fl | 0, h | 0, E | 0), { h: x, l: R } = ct(this.Gh | 0, this.Gl | 0, x | 0, R | 0), { h: H, l: M } = ct(this.Hh | 0, this.Hl | 0, H | 0, M | 0), this.set(i, o, s, c, a, f, d, b, p, w, h, E, x, R, H, M);
  }
  roundClean() {
    ut(wt, gt);
  }
  destroy() {
    this.destroyed = !0, ut(this.buffer), this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
}
class ii extends ri {
  constructor() {
    super(64, Vr);
  }
}
const Ue = /* @__PURE__ */ ae(
  () => new ti(),
  /* @__PURE__ */ Cn(1)
), nn = /* @__PURE__ */ ae(
  () => new ii(),
  /* @__PURE__ */ Cn(3)
), oi = new TextEncoder();
new TextDecoder();
function si(e) {
  return oi.encode(e);
}
const rn = "0123456789abcdef";
function fe(e, t = !1) {
  let n = t ? "0x" : "";
  for (let r = 0; r < e.length; r++)
    n += rn[e[r] >> 4] + rn[e[r] & 15];
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
si("netproof-wallet/entropy/v1");
class on {
  constructor(t, n) {
    l(this, "oHash");
    l(this, "iHash");
    l(this, "blockLen");
    l(this, "outputLen");
    l(this, "canXOF", !1);
    l(this, "finished", !1);
    l(this, "destroyed", !1);
    if (On(t), Y(n, void 0, "key"), this.iHash = t.create(), typeof this.iHash.update != "function")
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
    return Ut(this), this.iHash.update(t), this;
  }
  digestInto(t) {
    Ut(this), Te(t, this), this.finished = !0;
    const n = t.subarray(0, this.outputLen);
    this.iHash.digestInto(n), this.oHash.update(n), this.oHash.digestInto(n), this.destroy();
  }
  digest() {
    const t = new Uint8Array(this.oHash.outputLen);
    return this.digestInto(t), t;
  }
  _cloneInto(t) {
    t || (t = Object.create(Object.getPrototypeOf(this), {}));
    const { oHash: n, iHash: r, finished: i, destroyed: o, blockLen: s, outputLen: c, canXOF: a } = this;
    return t = t, t.finished = i, t.destroyed = o, t.blockLen = s, t.outputLen = c, t.canXOF = a, t.oHash = n._cloneInto(t.oHash), t.iHash = r._cloneInto(t.iHash), t;
  }
  clone() {
    return this._cloneInto();
  }
  destroy() {
    this.destroyed = !0, this.oHash.destroy(), this.iHash.destroy();
  }
}
const Ae = /* @__PURE__ */ (() => {
  const e = ((t, n, r) => new on(t, n).update(r).digest());
  return e.create = (t, n) => new on(t, n), e;
})();
function Ln(e, t, n = () => {
}) {
  if (!Array.isArray(e))
    throw new TypeError(`"${t}" expected array, got type=${typeof e}`);
  for (let r = 0; r < e.length; r++)
    n(e[r], `${t}[${r}]`);
  return e;
}
const Z = (e, t, n) => Y(e, t, n), Nn = V;
function ci(e, t = "") {
  if (typeof e != "string") {
    const n = t && `"${t}" `;
    throw new TypeError(n + "expected string, got type=" + typeof e);
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
const Fn = He, yt = (...e) => kt(...e), Re = (e) => Hn(e), de = _e, Le = (e) => zr(e), ce = /* @__PURE__ */ BigInt(0), sn = /* @__PURE__ */ BigInt(1), ai = (e) => e ? `"${e}" ` : "";
function At(e, t = "") {
  if (typeof e != "boolean")
    throw new TypeError(ai(t) + "expected boolean, got type=" + typeof e);
  return e;
}
function Ne(e) {
  if (typeof e == "bigint") {
    if (!Bt(e))
      throw new RangeError("positive bigint expected, got " + e);
  } else
    Nn(e);
  return e;
}
function Kt(e, t = "") {
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
  const t = Ne(e).toString(16);
  return t.length & 1 ? "0" + t : t;
}
function Dn(e) {
  if (typeof e != "string")
    throw new TypeError("hex string expected, got " + typeof e);
  return e === "" ? ce : BigInt("0x" + e);
}
function Lt(e) {
  return Dn(He(e));
}
function $n(e) {
  return Dn(He(fi(Y(e)).reverse()));
}
function Fe(e, t) {
  if (V(t), t === 0)
    throw new Error("zero output length is invalid");
  e = Ne(e);
  const n = t * 2, r = e.toString(16);
  if (r.length > n)
    throw new RangeError("number is too large");
  return Hn(r.padStart(n, "0"));
}
function kn(e, t) {
  return Fe(e, t).reverse();
}
function fi(e) {
  return Uint8Array.from(Z(e));
}
function Bt(e) {
  return typeof e == "bigint" && ce <= e;
}
function Mn(e, t, n) {
  return Bt(e) && Bt(t) && Bt(n) && t <= e && e < n;
}
function Pn(e, t, n, r) {
  if (!Mn(t, n, r))
    throw new RangeError("expected valid " + e + ": " + n + " <= n < " + r + ", got " + t);
}
function De(e) {
  if (e < ce)
    throw new Error("expected non-negative bigint, got " + e);
  return e === ce ? 0 : e.toString(2).length;
}
const $e = (e) => (Kt(e, "n"), (sn << BigInt(e)) - sn);
function di(e, t, n) {
  if (V(e, "hashLen"), V(t, "qByteLen"), typeof n != "function")
    throw new TypeError("hmacFn must be a function");
  const r = (x) => new Uint8Array(x), i = Uint8Array.of(), o = Uint8Array.of(0), s = Uint8Array.of(1), c = 1e3;
  let a = r(e), f = r(e), d = 0;
  const b = () => {
    a.fill(1), f.fill(0), d = 0;
  }, p = (...x) => n(f, yt(a, ...x)), w = (x = i) => {
    f = p(o, x), a = p(), x.length !== 0 && (f = p(s, x), a = p());
  }, h = () => {
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
    for (; (H = R(h())) === void 0; )
      w();
    return b(), H;
  };
}
function Xt(e, t = {}, n = {}, r = "object") {
  Ct(e, r), Ct(t, "fields"), Ct(n, "optFields");
  function i(s, c, a) {
    const f = r === "object" ? `param "${String(s)}"` : `"${r}.${String(s)}"`, d = e[s];
    if (!Object.hasOwn(e, s) && (a ? d !== void 0 : c !== "function"))
      throw new TypeError(`${f} is invalid: expected own property`);
    if (a && d === void 0)
      return;
    const b = typeof d;
    if (b !== c || d === null)
      throw new TypeError(`${f} is invalid: expected ${c}, got ${b}`);
  }
  const o = (s, c) => Object.entries(s).forEach(([a, f]) => i(a, f, c));
  o(t, !1), o(n, !0);
}
const k = /* @__PURE__ */ BigInt(0), L = /* @__PURE__ */ BigInt(1), mt = /* @__PURE__ */ BigInt(2), Kn = /* @__PURE__ */ BigInt(3), ke = /* @__PURE__ */ BigInt(4), qn = /* @__PURE__ */ BigInt(5), ui = /* @__PURE__ */ BigInt(7), jn = /* @__PURE__ */ BigInt(8), li = /* @__PURE__ */ BigInt(9), hi = /* @__PURE__ */ BigInt(15), Yn = /* @__PURE__ */ BigInt(16), pi = /* @__PURE__ */ BigInt("0x10000000000000000");
function J(e, t) {
  if (t <= k)
    throw new Error("mod: expected positive modulus, got " + t);
  const n = e % t;
  return n >= k ? n : t + n;
}
function Zn(e, t, n) {
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
  if (r < k && (r += n), t < pi) {
    let c = L;
    for (; t > k; )
      t & L && (c = c * r % n), r = r * r % n, t >>= L;
    return c;
  }
  const i = [];
  for (; t > k; )
    i.push(Number(t & hi)), t >>= ke;
  const o = new Array(16);
  o[0] = L, o[1] = r;
  for (let c = 2; c < 16; c++)
    o[c] = o[c - 1] * r % n;
  let s = o[i[i.length - 1]];
  for (let c = i.length - 2; c >= 0; c--) {
    s = s * s % n, s = s * s % n, s = s * s % n, s = s * s % n;
    const a = i[c];
    a !== 0 && (s = s * o[a] % n);
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
function cn(e, t) {
  if (e === k)
    throw new Error("invert: expected non-zero number");
  if (t <= L)
    throw new Error("invert: expected modulus > 1, got " + t);
  let n = J(e, t), r = t, i = k, o = L;
  for (; n !== k; ) {
    const c = r / n, a = r - n * c, f = i - o * c;
    r = n, n = a, i = o, o = f;
  }
  if (r !== L)
    throw new Error("invert: does not exist");
  return J(i, t);
}
function wi(e, t) {
  if (t <= L)
    throw new Error("invertCt: expected prime modulus > 1, got " + t);
  const n = J(e, t);
  if (n === k)
    throw new Error("invertCt: expected non-zero number");
  const r = Zn(n, t - mt, t);
  if (J(n * r, t) !== L)
    throw new Error("invertCt: does not exist");
  return r;
}
function Me(e, t, n) {
  const r = e;
  if (!r.eql(r.sqr(t), n))
    throw new Error("Cannot find square root");
}
function Pe(e, t) {
  if ((e & L) === k)
    throw new Error(t + ": expected odd modulus, got " + e);
}
function zn(e, t) {
  const n = e, r = (n.ORDER + L) / ke, i = n.pow(t, r);
  return Me(n, i, t), i;
}
function gi(e, t) {
  const n = e, r = (n.ORDER - qn) / jn, i = n.mul(t, mt), o = n.pow(i, r), s = n.mul(t, o), c = n.mul(n.mul(s, mt), o), a = n.mul(s, n.sub(c, n.ONE));
  return Me(n, a, t), a;
}
function bi(e) {
  const t = ue(e), n = Xn(e), r = n(t, t.neg(t.ONE)), i = n(t, r), o = n(t, t.neg(r)), s = (e + ui) / Yn;
  return ((c, a) => {
    const f = c;
    let d = f.pow(a, s), b = f.mul(d, r);
    const p = f.mul(d, i), w = f.mul(d, o), h = f.eql(f.sqr(b), a), E = f.eql(f.sqr(p), a);
    d = f.cmov(d, b, h), b = f.cmov(w, p, E);
    const x = f.eql(f.sqr(b), a), R = f.cmov(d, b, x);
    return Me(f, R, a), R;
  });
}
function Xn(e) {
  if (e < Kn)
    throw new Error("sqrt is not defined for small field");
  Pe(e, "tonelliShanks");
  let t = e - L, n = 0;
  for (; t % mt === k; )
    t /= mt, n++;
  let r = mt;
  const i = ue(e);
  for (; an(i, r) === 1; )
    if (r++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  if (n === 1)
    return zn;
  let o = i.pow(r, t);
  const s = (t + L) / mt;
  return function(a, f) {
    const d = a;
    if (d.is0(f))
      return f;
    if (an(d, f) !== 1)
      throw new Error("Cannot find square root");
    let b = n, p = d.mul(d.ONE, o), w = d.pow(f, t), h = d.pow(f, s);
    for (; !d.eql(w, d.ONE); ) {
      if (d.is0(w))
        throw new Error("Cannot find square root: probably non-prime P");
      let E = 1, x = d.sqr(w);
      for (; !d.eql(x, d.ONE); )
        if (E++, x = d.sqr(x), E === b)
          throw new Error("Cannot find square root");
      const R = L << BigInt(b - E - 1), H = d.pow(p, R);
      b = E, p = d.sqr(H), w = d.mul(w, p), h = d.mul(h, H);
    }
    return h;
  };
}
function yi(e) {
  return Pe(e, "Fp.sqrt"), e % ke === Kn ? zn : e % jn === qn ? gi : e % Yn === li ? bi(e) : Xn(e);
}
const mi = [
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
  for (const t of mi)
    Pt(e[t], "field." + t);
  if (e.BYTES < 1 || e.BITS < 1)
    throw new Error("invalid field: expected BYTES/BITS > 0");
  if (e.ORDER <= L)
    throw new Error("invalid field: expected ORDER > 1, got " + e.ORDER);
  return e;
}
function Gn(e, t, n = !1) {
  qt(e), Ln(t, "nums"), At(n, "passZero");
  const r = e, i = new Array(t.length).fill(n ? r.ZERO : void 0), o = t.reduce((c, a, f) => r.is0(a) ? c : (i[f] = c, r.mul(c, a)), r.ONE), s = r.inv(o);
  return t.reduceRight((c, a, f) => r.is0(a) ? c : (i[f] = r.mul(c, i[f]), r.mul(c, a)), s), i;
}
function an(e, t) {
  qt(e);
  const n = e;
  Pe(n.ORDER, "FpLegendre");
  const r = (n.ORDER - L) / mt, i = n.pow(t, r), o = n.eql(i, n.ONE), s = n.eql(i, n.ZERO), c = n.eql(i, n.neg(n.ONE));
  if (!o && !s && !c)
    throw new Error("invalid Legendre symbol result");
  return o ? 1 : s ? 0 : -1;
}
function xi(e, t) {
  if (t !== void 0 && Nn(t), e <= k)
    throw new Error("invalid n length: expected positive n, got " + e);
  if (t !== void 0 && t < 1)
    throw new Error("invalid n length: expected positive bit length, got " + t);
  const n = De(e);
  if (t !== void 0 && t < n)
    throw new Error(`invalid n length: expected nBitLength (${t}) >= bitLen(n) (${n})`);
  const r = t !== void 0 ? t : n, i = Math.ceil(r / 8);
  return { nBitLength: r, nByteLength: i };
}
const fn = /* @__PURE__ */ new WeakMap();
class dn {
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
    const { nBitLength: i, nByteLength: o } = xi(t, r);
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
    return Zn(t, n, this.ORDER);
  }
  div(t, n) {
    return J(t * cn(n, this.ORDER), this.ORDER);
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
    return cn(t, this.ORDER);
  }
  sqrt(t) {
    let n = fn.get(this);
    return n || fn.set(this, n = yi(this.ORDER)), n(this, t);
  }
  toBytes(t) {
    return this.isLE ? kn(t, this.BYTES) : Fe(t, this.BYTES);
  }
  fromBytes(t, n = !1) {
    Z(t);
    const { _lengths: r, BYTES: i, isLE: o, ORDER: s, _mod: c } = this;
    if (r) {
      if (t.length < 1 || !r.includes(t.length) || t.length > i)
        throw new Error("Field.fromBytes: expected " + r + " bytes, got " + t.length);
      const f = new Uint8Array(i);
      f.set(t, o ? 0 : f.length - t.length), t = f;
    }
    if (t.length !== i)
      throw new Error("Field.fromBytes: expected " + i + " bytes, got " + t.length);
    let a = o ? $n(t) : Lt(t);
    if (c && (a = J(a, s)), !n && !this.isValid(a))
      throw new Error("invalid field element: outside of range 0..ORDER");
    return a;
  }
  // TODO: we don't need it here, move out to separate fn
  invertBatch(t) {
    return Gn(this, t, !0);
  }
  // We can't move this out because Fp6, Fp12 implement it
  // and it's unclear what to return in there.
  cmov(t, n, r) {
    return At(r, "condition"), r ? n : t;
  }
}
function ue(e, t = {}) {
  return Object.freeze(dn.prototype), new dn(e, t);
}
function Wn(e) {
  if (typeof e != "bigint")
    throw new Error("field order must be bigint");
  if (e <= L)
    throw new Error("field order must be greater than 1");
  const t = De(e - L);
  return Math.ceil(t / 8);
}
function Ke(e) {
  const t = Wn(e);
  return t + Math.ceil(t / 2);
}
function Vn(e, t, n = !1) {
  Z(e);
  const r = e.length, i = Wn(t), o = Math.max(Ke(t), 16);
  if (r < o || r > 1024)
    throw new Error("expected " + o + "-1024 bytes of input, got " + r);
  const s = n ? $n(e) : Lt(e), c = J(s, t - L) + L;
  return n ? kn(c, i) : Fe(c, i);
}
const qe = /* @__PURE__ */ BigInt(0), jt = /* @__PURE__ */ BigInt(1), Ei = /* @__PURE__ */ BigInt(4), pe = 16, un = 128, vi = 5, ln = 2 ** 31;
function Gt(e) {
  const t = e;
  if (typeof t != "function")
    throw new TypeError('"Point" expected constructor, got type=' + typeof e);
  Pt(t.fromAffine, "Point.fromAffine"), Pt(t.fromBytes, "Point.fromBytes"), Pt(t.fromHex, "Point.fromHex"), Ct(t.BASE, "Point.BASE"), Ct(t.ZERO, "Point.ZERO"), qt(t.Fp), qt(t.Fn);
}
function Bi(e, t) {
  Gt(e), Qn(t, e);
  const n = Gn(e.Fp, t.map((r) => r.Z));
  return t.map((r, i) => e.fromAffine(r.toAffine(n[i])));
}
function _i(e, t, n = 1) {
  if (!Number.isSafeInteger(e) || e < n || e > t)
    throw new Error("invalid window size, expected [" + n + ".." + t + "], got W=" + e);
}
function Ai(e, t) {
  const n = e * (4 * t + 128);
  if (n > ln)
    throw new Error("invalid window size: table would need ~" + Math.ceil(n / 2 ** 20) + " MiB, max " + ln / 2 ** 20 + " MiB");
}
function Jn(e, t) {
  if (e !== void 0) {
    Pt(e, "randomBytes");
    try {
      const n = e(t);
      if (!de(n) || n.length !== t)
        return;
    } catch {
      return;
    }
    return e;
  }
}
function Qn(e, t) {
  Ln(e, "points"), e.forEach((n, r) => {
    if (!(n instanceof t))
      throw new Error("invalid point at index " + r);
  });
}
function Ri(e, t, n) {
  if (!Array.isArray(e))
    throw new Error("array of scalars expected");
  e.forEach((r, i) => {
    if (!(n === void 0 ? t.isValid(r) : Bt(r) && r < n))
      throw new Error("invalid scalar at index " + i);
  });
}
const tr = /* @__PURE__ */ new WeakMap();
function we(e) {
  return tr.get(e) || 1;
}
function Ii(e, t) {
  const n = e.double(), r = [e];
  for (let i = 1; i < t; i++)
    r.push(r[i - 1].add(n));
  return r;
}
function Si(e, t) {
  const n = 2 ** t, r = n / 2, i = BigInt(n - 1), o = [];
  for (; e > qe; ) {
    let s = 0;
    e & jt && (s = Number(e & i), s >= r && (s -= n), e -= BigInt(s)), o.push(s), e >>= jt;
  }
  return o;
}
function Oi(e, t, n) {
  const r = 2 ** t, i = r / 2, o = BigInt(r - 1), s = BigInt(t), c = [];
  for (let a = 0; a < n; a++) {
    let f = Number(e & o);
    e >>= s, f > i && (f -= r, e += jt), c.push(f);
  }
  if (e !== qe)
    throw new Error("invalid wnaf");
  return c;
}
function Ti(e, t, n) {
  let r = 0;
  for (const o of n)
    r = Math.max(r, o.length);
  let i = e;
  for (let o = r - 1; o >= 0; o--) {
    o !== r - 1 && (i = i.double());
    for (let s = 0; s < n.length; s++) {
      const c = n[s][o];
      if (c) {
        const a = t[s][Math.abs(c) - 1 >> 1];
        i = i.add(c < 0 ? a.negate() : a);
      }
    }
  }
  return i;
}
class Hi {
  // Parametrized with a given Point class (not individual point)
  constructor(t, n) {
    l(this, "Point");
    l(this, "BASE");
    l(this, "ZERO");
    l(this, "randomBytes");
    l(this, "wnafPrecomputes", /* @__PURE__ */ new WeakMap());
    l(this, "baseCanBeBlinded");
    l(this, "bits");
    Gt(t), this.randomBytes = Jn(n, pe), this.Point = t, this.BASE = t.BASE, this.ZERO = t.ZERO, this.bits = t.Fn.BITS;
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
    let c = t;
    for (let a = 0; a < i; a++) {
      let f = c;
      for (let d = 0; d < o; d++)
        s.push(f), f = f.add(c);
      c = s[s.length - 1].double();
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
    const { W: r, windows: i, comp: o } = t, s = 2 ** (r - 1), c = Oi(n, r, i);
    let a = this.ZERO, f = this.BASE;
    for (let d = 0; d < i; d++) {
      const b = c[d], p = d * s, w = Math.abs(b) - 1;
      let h = o[p];
      for (let x = 1; x < s; x++)
        h = x === w ? o[p + x] : h;
      const E = h.negate();
      b === 0 ? f = f.add(o[p]) : a = a.add(b < 0 ? E : h);
    }
    return { p: a, f };
  }
  // Cache key is point identity plus (W, bits); at most two entries exist per point (public-width
  // `Fn.BITS` and blinded `Fn.BITS + BLIND_BITS`). Callers must not reuse the same point with
  // incompatible `transform(...)` layouts and expect a separate cache entry.
  getWnafPrecomputes(t, n, r, i) {
    let o = this.wnafPrecomputes.get(n), s = o == null ? void 0 : o.find((c) => c.W === t && c.bits === r);
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
    if (this.assertPoint(t), !Mn(n, jt, this.Point.Fn.ORDER))
      throw new Error("invalid scalar");
  }
  // Constant-time dispatch shared by mulCT / mulCTBlinded. Un-precomputed points (W===1, e.g.
  // ECDH peer keys) skip building a throwaway cached table in favor of a small fixed-window
  // multiply. `n` must be < 2^bits.
  runCT(t, n, r, i) {
    const o = we(t);
    return o === 1 ? this.fixedWindowCT(t, n, r) : this.wnafCachedCT(this.getWnafPrecomputes(o, t, r, i), n);
  }
  mulCT(t, n, r) {
    return this.validateMulInput(t, n), this.runCT(t, n, this.bits, r);
  }
  mulCTBlinded(t, n, r) {
    if (this.validateMulInput(t, n), this.randomBytes === void 0)
      throw new Error("randomBytes is required for scalar blinding");
    const i = this.Point.Fn.BITS + un, o = this.randomBytes(pe);
    if (!de(o) || o.length !== pe)
      throw new Error("randomBytes returned invalid byte array");
    o[0] = o[0] & 63 | 128;
    const s = n + Lt(o) * this.Point.Fn.ORDER;
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
    const i = vi, o = 1 << i, s = $e(i), c = new Array(o);
    c[0] = this.ZERO;
    for (let d = 1; d < o; d++)
      c[d] = c[d - 1].add(t);
    const a = Math.ceil(r / i);
    let f = this.ZERO;
    for (let d = a - 1; d >= 0; d--) {
      if (d !== a - 1)
        for (let w = 0; w < i; w++)
          f = f.double();
      const b = Number(n >> BigInt(d * i) & s);
      let p = c[0];
      for (let w = 1; w < o; w++)
        p = w === b ? c[w] : p;
      f = f.add(p);
    }
    return { p: f, f };
  }
  shouldBlind(t, n) {
    return this.randomBytes === void 0 ? !1 : n === jt ? !0 : t !== this.BASE ? !1 : (this.baseCanBeBlinded === void 0 && (this.baseCanBeBlinded = this.mulUnsafe(this.BASE, this.Point.Fn.ORDER).is0()), this.baseCanBeBlinded);
  }
  mulSecret(t, n, r, i) {
    return this.shouldBlind(t, r) ? this.mulCTBlinded(t, n, i) : this.mulCT(t, n, i);
  }
  mulUnsafe(t, n, r) {
    if (this.assertPoint(t), !Bt(n))
      throw new Error("invalid scalar");
    const i = we(t);
    if (i === 1 || n >= this.Point.Fn.ORDER)
      return Ie(this.Point, [t], [n], !0);
    const o = this.getWnafPrecomputes(i, t, this.bits, r);
    return this.wnafCachedCT(o, n).p;
  }
  // Remembers the window size used for precomputed wNAF multiplication of the given point
  // and drops any previously built tables. Usually only the base point is precomputed.
  // W=1 resets the point to the un-precomputed (table-less) paths.
  // W is additionally capped so tables stay under ~2 GiB ({@link TABLE_BYTES_MAX}).
  setWindowSize(t, n) {
    this.assertPoint(t), _i(n, this.bits);
    const r = Math.ceil((this.bits + un) / n) + 1;
    Ai(r * 2 ** (n - 1), this.Point.Fp.BYTES), tr.set(t, n), this.wnafPrecomputes.delete(t);
  }
  // True when a window size is set: tables themselves are built lazily on first multiply.
  hasWindowSize(t) {
    return we(t) !== 1;
  }
}
function Ie(e, t, n, r = !1) {
  if (Gt(e), Qn(t, e), At(r, "allowOversized"), Ri(n, e.Fn, r ? e.Fn.ORDER ** Ei : void 0), t.length !== n.length)
    throw new Error("arrays of points and scalars must have equal length");
  const i = t.map((s) => Ii(s, 4)), o = n.map((s) => Si(s, 4));
  return Ti(e.ZERO, i, o);
}
function hn(e, t, n) {
  if (t) {
    if (t.ORDER !== e)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    return qt(t), t;
  } else
    return ue(e, { isLE: n });
}
function Ci(e, t, n = {}, r) {
  if (r === void 0 && (r = e === "edwards"), !t || typeof t != "object")
    throw new Error(`expected valid ${e} CURVE object`);
  Xt(n);
  for (const a of ["p", "n", "h"]) {
    const f = t[a];
    if (!(Bt(f) && f !== qe))
      throw new Error(`CURVE.${a} must be positive bigint`);
  }
  const i = hn(t.p, n.Fp, r), o = hn(t.n, n.Fn, r), c = ["Gx", "Gy", "a", "b"];
  for (const a of c)
    if (!i.isValid(t[a]))
      throw new Error(`CURVE.${a} must be valid field element of CURVE.Fp`);
  return t = Object.freeze(Object.assign({}, t)), { CURVE: t, Fp: i, Fn: o };
}
function Ui(e, t) {
  return function(r) {
    const i = e(r);
    return { secretKey: i, publicKey: t(i) };
  };
}
const Li = /* @__PURE__ */ BigInt(0);
class Ni extends Error {
  constructor(t = "") {
    super(t);
  }
}
const at = {
  // asn.1 DER encoding utils
  Err: Ni,
  // Basic building block is TLV (Tag-Length-Value)
  _tlv: {
    encode: (e, t) => {
      const { Err: n } = at;
      if (Kt(e, "tag"), e < 0 || e > 255)
        throw new n("tlv.encode: wrong tag");
      if (ci(t, "data"), t.length & 1)
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
        const a = i & 127;
        if (!a)
          throw new n("tlv.decode(long): indefinite length not supported");
        if (a > 4)
          throw new n("tlv.decode(long): byte length is too big");
        const f = t.subarray(r, r + a);
        if (f.length !== a)
          throw new n("tlv.decode: length bytes not complete");
        if (f[0] === 0)
          throw new n("tlv.decode(long): zero leftmost byte");
        for (const d of f)
          s = s << 8 | d;
        if (r += a, s < 128)
          throw new n("tlv.decode(long): not minimal encoding");
      }
      const c = t.subarray(r, r + s);
      if (c.length !== s)
        throw new n("tlv.decode: wrong value length");
      return { v: c, l: t.subarray(r + s) };
    }
  },
  // https://crypto.stackexchange.com/a/57734 Leftmost bit of first byte is 'negative' flag,
  // since we always use positive integers here. It must always be empty:
  // - add zero byte if exists
  // - if next byte doesn't have a flag, leading zero is not allowed (minimal encoding)
  _int: {
    encode(e) {
      const { Err: t } = at;
      if (Ne(e), e < Li)
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
      return Lt(e);
    }
  },
  toSig(e, t) {
    const { Err: n, _int: r, _tlv: i } = at;
    if (t !== void 0 && (Kt(t, "maxScalarBytes"), t < 1))
      throw new n("invalid signature: maxScalarBytes must be positive");
    const o = Z(e, void 0, "signature"), { v: s, l: c } = i.decode(48, o);
    if (c.length)
      throw new n("invalid signature: left bytes after parsing");
    const { v: a, l: f } = i.decode(2, s), { v: d, l: b } = i.decode(2, f);
    if (b.length)
      throw new n("invalid signature: left bytes after parsing");
    if (t !== void 0 && (a.length > t || d.length > t))
      throw new n("invalid signature: integer too large");
    return { r: r.decode(a), s: r.decode(d) };
  },
  hexFromSig(e) {
    const { _tlv: t, _int: n } = at;
    Xt(e, { r: "bigint", s: "bigint" }, {}, "sig");
    const r = t.encode(2, n.encode(e.r)), i = t.encode(2, n.encode(e.s)), o = r + i;
    return t.encode(48, o);
  }
}, ge = (Object.freeze(at._tlv), Object.freeze(at._int), Object.freeze(at));
const pn = (e, t) => (e + (e >= 0 ? t : -t) / er) / t;
function Fi(e, t, n) {
  Pn("scalar", e, ft, n);
  const [[r, i], [o, s]] = t, c = pn(s * e, n), a = pn(-i * e, n);
  let f = e - c * r - a * o, d = -c * i - a * s;
  const b = f < ft, p = d < ft;
  b && (f = -f), p && (d = -d);
  const w = $e(Math.ceil(De(n) / 2)) + vt;
  if (f < ft || f >= w || d < ft || d >= w)
    throw new Error("splitScalar (endomorphism): failed for k");
  return { k1neg: b, k1: f, k2neg: p, k2: d };
}
function Se(e) {
  if (!["compact", "recovered", "der"].includes(e))
    throw new Error('Signature format must be "compact", "recovered", or "der"');
  return e;
}
function be(e, t) {
  Xt(e);
  const n = {};
  for (let r of Object.keys(t))
    n[r] = e[r] === void 0 ? t[r] : e[r];
  return At(n.lowS, "lowS"), At(n.prehash, "prehash"), n.format !== void 0 && Se(n.format), n;
}
const ft = /* @__PURE__ */ BigInt(0), vt = /* @__PURE__ */ BigInt(1), er = /* @__PURE__ */ BigInt(2), ye = /* @__PURE__ */ BigInt(3), Di = /* @__PURE__ */ BigInt(4);
function $i(e, t = {}) {
  const n = Ci("weierstrass", e, t), r = n.Fp, i = n.Fn;
  let o = n.CURVE;
  const { h: s, n: c } = o;
  Xt(t, {}, {
    allowInfinityPoint: "boolean",
    clearCofactor: "function",
    isTorsionFree: "function",
    fromBytes: "function",
    toBytes: "function",
    endo: "object",
    randomBytes: "function"
  });
  const { endo: a, allowInfinityPoint: f, clearCofactor: d, isTorsionFree: b, fromBytes: p, toBytes: w } = t, h = t.randomBytes === void 0 ? Le : t.randomBytes;
  if (a && (!r.is0(o.a) || typeof a.beta != "bigint" || !Array.isArray(a.basises)))
    throw new Error('invalid endo: expected "beta": bigint and "basises": array');
  const E = a ? {
    beta: a.beta,
    basises: a.basises.map((g) => [...g])
  } : void 0, x = rr(r, i);
  function R() {
    if (!r.isOdd)
      throw new Error("compression is not supported: Field does not have .isOdd()");
  }
  function H(g, u, y) {
    if (u.is0()) {
      if (!f)
        throw new Error("bad point: ZERO");
      return Uint8Array.of(0);
    }
    const { x: m, y: _ } = u.toAffine(), A = r.toBytes(m);
    if (At(y, "isCompressed"), y) {
      R();
      const v = !r.isOdd(_);
      return yt(nr(v), A);
    } else
      return yt(Uint8Array.of(4), A, r.toBytes(_));
  }
  function M(g) {
    Z(g, void 0, "Point");
    const { publicKey: u, publicKeyUncompressed: y } = x, m = g.length, _ = g[0], A = g.subarray(1);
    if (f && m === 1 && _ === 0)
      return { x: r.ZERO, y: r.ZERO };
    if (m === u && (_ === 2 || _ === 3)) {
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
      const C = r.isOdd(I);
      return (_ & 1) === 1 !== C && (I = r.neg(I)), { x: v, y: I };
    } else if (m === y && _ === 4) {
      const v = r.BYTES, S = r.fromBytes(A.subarray(0, v)), I = r.fromBytes(A.subarray(v, v * 2));
      if (!j(S, I))
        throw new Error("bad point: is not on curve");
      return { x: S, y: I };
    } else
      throw new Error(`bad point: got length ${m}, expected compressed=${u} or uncompressed=${y}`);
  }
  const O = w === void 0 ? H : w, P = p === void 0 ? M : p, U = r.mul(o.b, ye), K = r.is0(o.a) ? (g) => r.ZERO : (g) => r.mul(o.a, g);
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
  const D = r.mul(r.pow(o.a, ye), Di), ot = r.mul(r.sqr(o.b), BigInt(27));
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
    return Fi(g, E.basises, i.ORDER);
  }
  function st(g, u, y, m) {
    if (!i.isValid(m))
      throw new RangeError("invalid scalar: out of range");
    if (E) {
      const { k1neg: _, k1: A, k2neg: v, k2: S } = lt(m), I = new Q(r.mul(y.X, E.beta), y.Y, y.Z);
      g.push(_ ? y.negate() : y, v ? I.negate() : I), u.push(A, S);
    } else
      g.push(y), u.push(m);
  }
  const xt = /* @__PURE__ */ new WeakSet(), B = class B {
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
      if (u instanceof B)
        throw new Error("projective point not allowed");
      return r.is0(y) && r.is0(m) ? B.ZERO : new B(y, m, r.ONE);
    }
    static fromBytes(u) {
      const y = B.fromAffine(P(Z(u, void 0, "point")));
      return y.assertValidity(), y;
    }
    static fromHex(u) {
      return B.fromBytes(Re(u));
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
      return ht.setWindowSize(this, u), y || this.multiply(ye), this;
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
      const { X: y, Y: m, Z: _ } = this, { X: A, Y: v, Z: S } = u, I = r.eql(r.mul(y, S), r.mul(A, _)), C = r.eql(r.mul(m, S), r.mul(v, _));
      return I && C;
    }
    /** Flips point to one corresponding to (x, -y) in Affine coordinates. */
    negate() {
      return new B(this.X, r.neg(this.Y), this.Z);
    }
    // Renes-Costello-Batina exception-free doubling formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 3
    // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
    double() {
      const { X: u, Y: y, Z: m } = this;
      let _ = r.ZERO, A = r.ZERO, v = r.ZERO, S = r.mul(u, u), I = r.mul(y, y), C = r.mul(m, m), T = r.mul(u, y);
      return T = r.add(T, T), v = r.mul(u, m), v = r.add(v, v), _ = K(v), A = r.mul(U, C), A = r.add(_, A), _ = r.sub(I, A), A = r.add(I, A), A = r.mul(_, A), _ = r.mul(T, _), v = r.mul(U, v), C = K(C), T = r.sub(S, C), T = K(T), T = r.add(T, v), v = r.add(S, S), S = r.add(v, S), S = r.add(S, C), S = r.mul(S, T), A = r.add(A, S), C = r.mul(y, m), C = r.add(C, C), S = r.mul(C, T), _ = r.sub(_, S), v = r.mul(C, I), v = r.add(v, v), v = r.add(v, v), new B(_, A, v);
    }
    // Renes-Costello-Batina exception-free addition formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 1
    // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
    add(u) {
      nt(u);
      const { X: y, Y: m, Z: _ } = this, { X: A, Y: v, Z: S } = u;
      let I = r.ZERO, C = r.ZERO, T = r.ZERO, N = r.mul(y, A), $ = r.mul(m, v), q = r.mul(_, S), G = r.add(y, m), F = r.add(A, v);
      G = r.mul(G, F), F = r.add(N, $), G = r.sub(G, F), F = r.add(y, _);
      let W = r.add(A, S);
      return F = r.mul(F, W), W = r.add(N, q), F = r.sub(F, W), W = r.add(m, _), I = r.add(v, S), W = r.mul(W, I), I = r.add($, q), W = r.sub(W, I), T = K(F), I = r.mul(U, q), T = r.add(I, T), I = r.sub($, T), T = r.add($, T), C = r.mul(I, T), $ = r.add(N, N), $ = r.add($, N), q = K(q), F = r.mul(U, F), $ = r.add($, q), q = r.sub(N, q), q = K(q), F = r.add(F, q), N = r.mul($, F), C = r.add(C, N), N = r.mul(W, F), I = r.mul(G, I), I = r.sub(I, N), N = r.mul(G, $), T = r.mul(W, T), T = r.add(T, N), new B(I, C, T);
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
      if (!i.isValidNot0(u))
        throw new RangeError("invalid scalar: out of range");
      const { p: y, f: m } = ht.mulSecret(this, u, s, Nt);
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
      if (!i.isValid(m))
        throw new RangeError("invalid scalar: out of range");
      if (m === ft || y.is0())
        return B.ZERO;
      if (m === vt)
        return y;
      if (ht.hasWindowSize(this))
        return ht.mulUnsafe(y, m, Nt);
      const _ = [], A = [];
      return st(_, A, y, m), Ie(B, _, A);
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
      return st(_, A, this, u), st(_, A, y, m), Ie(B, _, A);
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
      const { X: _, Y: A, Z: v } = y;
      if (r.eql(v, r.ONE))
        return { x: _, y: A };
      const S = y.is0();
      m == null && (m = S ? r.ONE : r.inv(v));
      const I = r.mul(_, m), C = r.mul(A, m), T = r.mul(v, m);
      if (S)
        return { x: r.ZERO, y: r.ZERO };
      if (!r.eql(T, r.ONE))
        throw new Error("invZ was invalid");
      return { x: I, y: C };
    }
    /**
     * Checks whether Point is free of torsion elements (is in prime subgroup).
     * Always torsion-free for cofactor=1 curves.
     */
    isTorsionFree() {
      return s === vt ? !0 : b ? b(B, this) : ht.mulUnsafe(this, c).is0();
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
      return Fn(this.toBytes(u));
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
  };
  l(B, "BASE", new B(o.Gx, o.Gy, r.ONE)), l(B, "ZERO", new B(r.ZERO, r.ONE, r.ZERO)), l(B, "Fp", r), l(B, "Fn", i);
  let Q = B;
  const Nt = (g) => Bi(Q, g), ht = new Hi(Q, h);
  return ht.bits >= 6 && Q.BASE.precompute(6), Object.freeze(Q.prototype), Object.freeze(Q), Q;
}
function nr(e) {
  return Uint8Array.of(e ? 2 : 3);
}
function rr(e, t) {
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
function ki(e, t = {}) {
  Gt(e);
  const { Fn: n } = e, r = t.randomBytes === void 0 ? Le : t.randomBytes, i = Object.assign(rr(e.Fp, n), {
    seed: Math.max(Ke(n.ORDER), 16)
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
  function c(w) {
    return w = w === void 0 ? r(i.seed) : w, Vn(Z(w, i.seed, "seed"), n.ORDER);
  }
  function a(w, h = !0) {
    return e.BASE.multiply(n.fromBytes(w)).toBytes(h);
  }
  function f(w) {
    const { secretKey: h, publicKey: E, publicKeyUncompressed: x } = i, R = n._lengths;
    if (!de(w))
      return;
    const H = Z(w, void 0, "key").length, M = H === E || H === x, O = H === h || !!(R != null && R.includes(H));
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
    randomSecretKey: c
  }, p = Ui(c, a);
  return Object.freeze(b), Object.freeze(i), Object.freeze({ getPublicKey: a, getSharedSecret: d, keygen: p, Point: e, utils: b, lengths: i });
}
function Mi(e, t, n = {}) {
  Gt(e);
  const r = t;
  On(r), Xt(n, {}, {
    hmac: "function",
    lowS: "boolean",
    randomBytes: "function",
    bits2int: "function",
    bits2int_modN: "function"
  });
  const i = Object.assign({}, n), o = i.randomBytes === void 0 ? Le : i.randomBytes, s = i.hmac === void 0 ? (B, g) => Ae(r, B, g) : i.hmac, { Fp: c, Fn: a } = e, { ORDER: f, BITS: d } = a, b = Ke(f), p = Jn(o, b), { keygen: w, getPublicKey: h, getSharedSecret: E, utils: x, lengths: R } = ki(e, i), H = {
    prehash: !0,
    lowS: typeof i.lowS == "boolean" ? i.lowS : !0,
    format: "compact",
    extraEntropy: !1
  }, M = f * er + vt < c.ORDER;
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
  function it() {
    if (M)
      throw new Error('"recovered" sig type is not supported for cofactor >2 curves');
  }
  function j(B, g) {
    Se(g);
    const u = R.signature, y = g === "compact" ? u : g === "recovered" ? u + 1 : void 0;
    return Z(B, y);
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
    static fromBytes(g, u = H.format) {
      j(g, u);
      let y;
      if (u === "der") {
        if (g.length > 2 * a.BYTES + 16)
          throw new ge.Err("invalid signature: DER signature too long");
        const { r: v, s: S } = ge.toSig(Z(g), a.BYTES + 1);
        return new D(v, S);
      }
      u === "recovered" && (y = g[0], u = "compact", g = g.subarray(1));
      const m = R.signature / 2, _ = g.subarray(0, m), A = g.subarray(m, m * 2);
      return new D(a.fromBytes(_), a.fromBytes(A), y);
    }
    static fromHex(g, u) {
      return this.fromBytes(Re(g), u);
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
      const A = c.toBytes(_), v = e.fromBytes(yt(nr((m & 1) === 0), A)), S = a.inv(_), I = et(Z(g, void 0, "msgHash")), C = a.create(-I * S), T = a.create(y * S), N = e.BASE.mulAddUnsafe(C, v, T);
      if (N.is0())
        throw new Error("invalid recovery: point at infinify");
      return N.assertValidity(), N;
    }
    // Signatures should be low-s, to prevent malleability.
    hasHighS() {
      return O(this.s);
    }
    toBytes(g = H.format) {
      if (Se(g), g === "der")
        return Re(ge.hexFromSig(this));
      const { r: u, s: y } = this, m = a.toBytes(u), _ = a.toBytes(y);
      return g === "recovered" ? (it(), yt(Uint8Array.of(this.assertRecovery()), m, _)) : yt(m, _);
    }
    toHex(g) {
      return Fn(this.toBytes(g));
    }
  }
  Object.freeze(D.prototype), Object.freeze(D);
  const ot = i.bits2int === void 0 ? function(g) {
    if (g.length > 8192)
      throw new Error("input is too large");
    const u = Lt(g), y = g.length * 8 - d;
    return y > 0 ? u >> BigInt(y) : u;
  } : i.bits2int, et = i.bits2int_modN === void 0 ? function(g) {
    return a.create(ot(g));
  } : i.bits2int_modN, nt = $e(d);
  function lt(B) {
    return Pn("num < 2^" + d, B, ft, nt), a.toBytes(B);
  }
  function st(B, g) {
    return Z(B, void 0, "message"), g ? Z(r(B), void 0, "prehashed message") : B;
  }
  function xt(B, g, u) {
    const { lowS: y, prehash: m, extraEntropy: _ } = be(u, H);
    B = st(B, m);
    const A = et(B), v = a.fromBytes(g);
    if (!a.isValidNot0(v))
      throw new Error("invalid private key");
    const S = [lt(v), lt(A)];
    if (_ != null && _ !== !1) {
      const N = _ === !0 ? o(R.secretKey) : _;
      S.push(Z(N, void 0, "extraEntropy"));
    }
    const I = yt(...S), C = A;
    function T(N) {
      const $ = ot(N);
      if (!a.isValidNot0($))
        return;
      const q = e.BASE.multiply($).toAffine(), G = a.create(q.x);
      if (G === ft)
        return;
      let F;
      if (p !== void 0) {
        const Ft = Lt(Vn(p(b), f)), Ar = a.inv(a.mul(Ft, $)), Rr = a.mul(Ft, C), Ir = a.mul(Ft, v);
        F = a.create(Ar * a.create(Rr + Ir * G));
      } else {
        const Ft = wi($, f);
        F = a.create(Ft * a.create(C + G * v));
      }
      if (F === ft)
        return;
      let W = K(q.x, q.y, G), Xe = F;
      return y && O(F) && (Xe = a.neg(F), W ^= 1), new D(G, Xe, M ? void 0 : W);
    }
    return { seed: I, k2sig: T };
  }
  function Q(B, g, u = {}) {
    const { seed: y, k2sig: m } = xt(B, g, u);
    return di(r.outputLen, a.BYTES, s)(y, m).toBytes(u.format);
  }
  function Nt(B, g, u, y = {}) {
    const { lowS: m, prehash: _, format: A } = be(y, H);
    if (u = Z(u, void 0, "publicKey"), g = st(g, _), !de(B)) {
      const v = B instanceof D ? ", use sig.toBytes()" : "";
      throw new Error("verify expects Uint8Array signature" + v);
    }
    j(B, A);
    try {
      const v = D.fromBytes(B, A), S = e.fromBytes(u);
      if (S.is0() || m && v.hasHighS())
        return !1;
      const { r: I, s: C } = v, T = et(g), N = a.inv(C), $ = a.create(T * N), q = a.create(I * N), G = e.BASE.mulAddUnsafe($, S, q);
      if (G.is0())
        return !1;
      const F = G.toAffine();
      return !(a.create(F.x) !== I || A === "recovered" && v.recovery !== K(F.x, F.y, I));
    } catch {
      return !1;
    }
  }
  function ht(B, g, u = {}) {
    const { prehash: y } = be(u, H);
    return g = st(g, y), D.fromBytes(B, "recovered").recoverPublicKey(g).toBytes();
  }
  return Object.freeze({
    keygen: w,
    getPublicKey: h,
    getSharedSecret: E,
    utils: x,
    lengths: R,
    Point: e,
    sign: Q,
    verify: Nt,
    recoverPublicKey: ht,
    Signature: D,
    hash: r
  });
}
const je = {
  p: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
  n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
  h: BigInt(1),
  a: BigInt(0),
  b: BigInt(7),
  Gx: BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
  Gy: BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
}, Pi = {
  beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
  basises: [
    [BigInt("0x3086d221a7d46bcde86c90e49284eb15"), -BigInt("0xe4437ed6010e88286f547fa90abfe4c3")],
    [BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8"), BigInt("0x3086d221a7d46bcde86c90e49284eb15")]
  ]
}, wn = /* @__PURE__ */ BigInt(2);
function Ki(e) {
  const t = je.p, n = BigInt(3), r = BigInt(6), i = BigInt(11), o = BigInt(22), s = BigInt(23), c = BigInt(44), a = BigInt(88), f = e * e * e % t, d = f * f * e % t, b = tt(d, n, t) * d % t, p = tt(b, n, t) * d % t, w = tt(p, wn, t) * f % t, h = tt(w, i, t) * w % t, E = tt(h, o, t) * h % t, x = tt(E, c, t) * E % t, R = tt(x, a, t) * x % t, H = tt(R, c, t) * E % t, M = tt(H, n, t) * d % t, O = tt(M, s, t) * h % t, P = tt(O, r, t) * f % t, U = tt(P, wn, t);
  if (!Oe.eql(Oe.sqr(U), e))
    throw new Error("Cannot find square root");
  return U;
}
const Oe = /* @__PURE__ */ ue(je.p, { sqrt: Ki }), qi = /* @__PURE__ */ $i(je, {
  Fp: Oe,
  endo: Pi
}), Tt = /* @__PURE__ */ Mi(qi, Ue), ji = /* @__PURE__ */ Uint8Array.from([
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
]), ir = Uint8Array.from(new Array(16).fill(0).map((e, t) => t)), Yi = ir.map((e) => (9 * e + 5) % 16), or = /* @__PURE__ */ (() => {
  const n = [[ir], [Yi]];
  for (let r = 0; r < 4; r++)
    for (let i of n)
      i.push(i[r].map((o) => ji[o]));
  return n;
})(), sr = or[0], cr = or[1], ar = /* @__PURE__ */ [
  [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8],
  [12, 13, 11, 15, 6, 9, 9, 7, 12, 15, 11, 13, 7, 8, 7, 7],
  [13, 15, 14, 11, 7, 7, 6, 8, 13, 14, 13, 12, 5, 5, 6, 9],
  [14, 11, 12, 14, 8, 6, 5, 5, 15, 12, 15, 14, 9, 9, 8, 6],
  [15, 12, 13, 13, 9, 5, 8, 6, 14, 11, 12, 11, 8, 6, 5, 5]
].map((e) => Uint8Array.from(e)), Zi = /* @__PURE__ */ sr.map((e, t) => e.map((n) => ar[t][n])), zi = /* @__PURE__ */ cr.map((e, t) => e.map((n) => ar[t][n])), Xi = /* @__PURE__ */ Uint32Array.from([
  0,
  1518500249,
  1859775393,
  2400959708,
  2840853838
]), Gi = /* @__PURE__ */ Uint32Array.from([
  1352829926,
  1548603684,
  1836072691,
  2053994217,
  0
]);
function gn(e, t, n, r) {
  return e === 0 ? t ^ n ^ r : e === 1 ? t & n | ~t & r : e === 2 ? (t | ~n) ^ r : e === 3 ? t & r | n & ~r : t ^ (n | ~r);
}
const ne = /* @__PURE__ */ new Uint32Array(16);
class Wi extends Ce {
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
    let i = this.h0 | 0, o = i, s = this.h1 | 0, c = s, a = this.h2 | 0, f = a, d = this.h3 | 0, b = d, p = this.h4 | 0, w = p;
    for (let h = 0; h < 5; h++) {
      const E = 4 - h, x = Xi[h], R = Gi[h], H = sr[h], M = cr[h], O = Zi[h], P = zi[h];
      for (let U = 0; U < 16; U++) {
        const K = te(i + gn(h, s, a, d) + ne[H[U]] + x, O[U]) + p | 0;
        i = p, p = d, d = te(a, 10) | 0, a = s, s = K;
      }
      for (let U = 0; U < 16; U++) {
        const K = te(o + gn(E, c, f, b) + ne[M[U]] + R, P[U]) + w | 0;
        o = w, w = b, b = te(f, 10) | 0, f = c, c = K;
      }
    }
    this.set(this.h1 + a + b | 0, this.h2 + d + w | 0, this.h3 + p + o | 0, this.h4 + i + c | 0, this.h0 + s + f | 0);
  }
  roundClean() {
    ut(ne);
  }
  destroy() {
    this.destroyed = !0, ut(this.buffer), this.set(0, 0, 0, 0, 0);
  }
}
const Vi = /* @__PURE__ */ ae(() => new Wi());
const Ji = (e) => Object.freeze(e());
function Qi(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
function Yt(e) {
  if (!Qi(e))
    throw new TypeError("Uint8Array expected");
}
function fr(e) {
  if (typeof e != "function")
    throw new TypeError("function expected");
  return !0;
}
function dr(e, t) {
  if (typeof t != "string")
    throw new TypeError(`${e}: string expected`);
  return !0;
}
function to(e, t = "number") {
  if (typeof e != "number")
    throw new TypeError(`${t}: expected number, got ${typeof e}`);
  if (!Number.isSafeInteger(e))
    throw new RangeError(`${t}: expected safe integer, got ${e}`);
}
function eo(...e) {
  const t = (o) => o, n = (o, s) => (c) => o(s(c)), r = e.map((o) => o.encode).reduceRight(n, t), i = e.map((o) => o.decode).reduce(n, t);
  return { encode: r, decode: i };
}
const bn = /* @__PURE__ */ (() => {
  try {
    const e = new TextDecoder();
    return e.decode(Uint8Array.of(65, 48, 43, 127)) === "A0+" ? e : void 0;
  } catch {
    return;
  }
})(), me = 8192;
function no(e) {
  const t = e.length;
  if (bn !== void 0 && t >= 12)
    return bn.decode(e);
  if (t <= me)
    return String.fromCharCode.apply(null, e);
  let n = "";
  for (let r = 0; r < t; r += me)
    n += String.fromCharCode.apply(null, e.subarray(r, r + me));
  return n;
}
function ro(e, t) {
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
      const s = o.charCodeAt(0), c = i[t[o].charCodeAt(0)];
      if (o.length !== 1 || s > 127 || c === void 0 || c === -1)
        throw new Error(`alphabet: invalid alias ${o}`);
      i[s] = c;
    }
  return {
    encode: (o) => {
      const s = new Uint8Array(o.length);
      for (let c = 0; c < o.length; c++) {
        const a = o[c], f = r[a];
        if (f === void 0)
          throw new Error(`alphabet.encode: invalid digit ${a}`);
        s[c] = f;
      }
      return no(s);
    },
    decode: (o) => {
      dr("decode", o);
      const s = o.length, c = new Uint8Array(s);
      for (let a = 0; a < s; a++) {
        const f = o.charCodeAt(a), d = f < 128 ? i[f] : -1;
        if (d === -1)
          throw new Error(`Unknown letter "${o[a]}". Allowed: ${e}`);
        c[a] = d;
      }
      return c;
    }
  };
}
function io(e, t) {
  if (to(e), e <= 0)
    throw new RangeError(`checksum length must be positive: ${e}`);
  fr(t);
  const n = t;
  return {
    encode(r) {
      Yt(r);
      const i = n(r).slice(0, e), o = new Uint8Array(r.length + e);
      return o.set(r), o.set(i, r.length), o;
    },
    decode(r) {
      Yt(r);
      const i = r.slice(0, -e), o = r.slice(-e), s = n(i).slice(0, e);
      for (let c = 0; c < e; c++)
        if (s[c] !== o[c])
          throw new Error("Invalid checksum");
      return i;
    }
  };
}
const oo = 656356768, yn = 65536, so = 2048, co = 4096, ao = (e, t) => ({
  encode: (n) => {
    Yt(n);
    const r = n.length;
    if (r === 0)
      return new Uint8Array(0);
    if (r >= yn)
      throw new Error("invalid length");
    let i = 0;
    for (; i < r - 1 && n[i] === 0; )
      i++;
    const o = Math.ceil(r / 2), s = new Uint16Array(o), c = r & 1;
    c && (s[0] = n[0]);
    for (let h = c, E = c; h < r; h += 2, E++)
      s[E] = n[h] << 8 | n[h + 1];
    const a = [];
    let f = 0;
    for (; f < o; ) {
      let h = 0;
      for (let E = f; E < o; E++) {
        const x = h * 65536 + s[E], R = Math.floor(x / t);
        h = x - R * t, s[E] = R, R === 0 && E === f && f++;
      }
      a.push(h);
    }
    const d = a.length - 1;
    let b = d * 5;
    for (let h = a[d]; b++, !(h < e); h = Math.floor(h / e))
      ;
    const p = new Uint8Array(i + b);
    let w = p.length - 1;
    for (let h = 0; h < d; h++) {
      let E = a[h];
      for (let x = 0; x < 5; x++)
        p[w--] = E % e, E = Math.floor(E / e);
    }
    for (let h = a[d]; w >= i; h = Math.floor(h / e))
      p[w--] = h % e;
    return p;
  },
  decode: (n) => {
    Yt(n);
    const r = n.length;
    if (r === 0)
      return new Uint8Array(0);
    if (r >= yn)
      throw new Error("invalid length");
    let i = 0;
    for (; i < r - 1 && n[i] === 0; )
      i++;
    const o = new Uint16Array(Math.ceil(r * 6 / 16) + 1);
    let s = 0, c = 0, a = r % 5 || 5;
    for (; c < r; ) {
      let p = 0, w = 1;
      for (const E = c + a; c < E; c++) {
        const x = n[c];
        if (x >= e)
          throw new Error(`invalid integer: ${x}`);
        p = p * e + x, w *= e;
      }
      a = 5;
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
}), fo = (e, t) => {
  const n = ro(t);
  return {
    encode(r) {
      if (Yt(r), r.length > so)
        throw new Error("invalid length");
      return n.encode(e.encode(r));
    },
    decode(r) {
      if (dr("baseN.decode", r), r.length > co)
        throw new Error("invalid length");
      return e.decode(n.decode(r));
    }
  };
}, uo = /* @__PURE__ */ ao(58, oo), lo = (e) => fo(uo, e), ho = /* @__PURE__ */ Ji(() => lo("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz")), po = (e) => {
  fr(e);
  const t = e;
  return eo(io(4, (n) => t(t(n))), ho);
};
const Mt = Tt.Point, St = Mt.Fn, xe = /* @__PURE__ */ po(Ue), wo = Uint8Array.from("Bitcoin seed".split(""), (e) => e.charCodeAt(0)), Ee = { private: 76066276, public: 76067358 }, re = 2147483648, ve = 255, go = (e) => Vi(Ue(e)), bo = (e) => Ht(e).getUint32(0, !1), bt = (e, t = "number") => {
  if (typeof e != "number")
    throw new TypeError(`"${t}" expected number, got type=${typeof e}`);
  if (!Number.isSafeInteger(e) || e < 0 || e > 2 ** 32 - 1)
    throw new RangeError(`"${t}" expected integer in range 0..2**32-1, got ${e}`);
  const n = new Uint8Array(4);
  return Ht(n).setUint32(0, e, !1), n;
}, Be = (e, t = "versions") => {
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
    var o, s, c;
    if (!t || typeof t != "object")
      throw new Error("HDKey.constructor must not be called directly");
    const n = (o = t.depth) != null ? o : 0, r = (s = t.index) != null ? s : 0, i = (c = t.parentFingerprint) != null ? c : 0;
    if (!Number.isSafeInteger(n) || n < 0 || n > ve)
      throw new RangeError("HDKey: depth must be an integer in range 0..255");
    if (bt(r, "index"), bt(i, "parentFingerprint"), n === 0 && (r !== 0 || i !== 0))
      throw new Error("HDKey: zero depth with non-zero index/parent fingerprint");
    if (this.versions = t.versions ? Be(t.versions) : Ee, this.depth = n, t.chainCode && Y(t.chainCode, 32), this._chainCode = t.chainCode ? Uint8Array.from(t.chainCode) : null, this.index = r, this.parentFingerprint = i, t.publicKey && t.privateKey)
      throw new Error("HDKey: publicKey and privateKey at same time.");
    if (t.privateKey) {
      if (!Tt.utils.isValidSecretKey(t.privateKey))
        throw new Error("Invalid private key");
      this._privateKey = Uint8Array.from(t.privateKey), this._publicKey = Tt.getPublicKey(this._privateKey, !0);
    } else if (t.publicKey)
      this._publicKey = Mt.fromBytes(t.publicKey).toBytes(!0);
    else
      throw new Error("HDKey: no public or private key provided");
    this._pubHash = go(this._publicKey);
  }
  get fingerprint() {
    if (!this._pubHash)
      throw new Error("No publicKey set!");
    return bo(this._pubHash);
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
    return xe.encode(this.serialize(this.versions.private, kt(Uint8Array.of(0), t)));
  }
  get publicExtendedKey() {
    if (!this._publicKey)
      throw new Error("No public key");
    return xe.encode(this.serialize(this.versions.public, this._publicKey));
  }
  static fromMasterSeed(t, n = Ee) {
    if (Y(t), n = Be(n), 8 * t.length < 128 || 8 * t.length > 512)
      throw new RangeError("HDKey: seed length must be between 128 and 512 bits; 256 bits is advised, got " + t.length);
    const r = Ae(nn, wo, t), i = r.slice(0, 32), o = r.slice(32);
    return new Et({ versions: n, chainCode: o, privateKey: i });
  }
  static fromExtendedKey(t, n = Ee) {
    n = Be(n);
    const r = xe.decode(t);
    if (r.length !== 78)
      throw new Error(`HDKey: invalid extended key length: expected 78 bytes, got ${r.length}`);
    const i = Ht(r), o = i.getUint32(0, !1), s = {
      versions: n,
      depth: r[4],
      parentFingerprint: i.getUint32(5, !1),
      index: i.getUint32(9, !1),
      chainCode: r.slice(13, 45)
    }, c = r.slice(45), a = c[0] === 0;
    if (o !== n[a ? "private" : "public"])
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
    const n = t.replace(/^[mM]'?\//, "").split("/");
    if (n.length > ve - this.depth)
      throw new Error("HDKey: path exceeds the serializable depth 255");
    let r = this;
    for (const i of n) {
      const o = /^(\d+)('?)$/.exec(i), s = o && o[1];
      if (!o || o.length !== 3 || typeof s != "string")
        throw new Error("invalid child index: " + i);
      let c = +s;
      if (!Number.isSafeInteger(c) || c >= re)
        throw new Error("Invalid index");
      o[2] === "'" && (c += re), r = r.deriveChild(c);
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
      r = kt(Uint8Array.of(0), d, r);
    } else
      r = kt(this._publicKey, r);
    const i = n || Ae(nn, this._chainCode, r);
    Y(i, 64);
    const o = i.slice(0, 32), s = i.slice(32), c = {
      versions: this.versions,
      chainCode: s,
      depth: this.depth + 1,
      parentFingerprint: this.fingerprint,
      index: t
    };
    if (c.depth > ve)
      throw new Error("HDKey: depth exceeds the serializable value 255");
    const a = () => {
      const d = this._privateKey ? 4294967295 : re - 1;
      if (t >= d)
        throw new Error(`HDKey: cannot retry child derivation at index ${t}`);
      return this.deriveChild(t + 1);
    }, f = St.fromBytes(o, !0);
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
    return Y(t, 32), Tt.sign(t, this._privateKey, { prehash: !1 });
  }
  verify(t, n) {
    if (Y(t, 32), Y(n, 64), !this._publicKey)
      throw new Error("No publicKey set!");
    return Tt.verify(n, t, this._publicKey, { prehash: !1 });
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
    return Y(n, 33), kt(bt(t, "version"), new Uint8Array([this.depth]), bt(this.parentFingerprint, "parentFingerprint"), bt(this.index, "index"), this._chainCode, n);
  }
}
const yo = BigInt(0), Dt = BigInt(1), mo = BigInt(2), xo = BigInt(7), Eo = BigInt(256), vo = BigInt(113), ur = [], lr = [], hr = [];
for (let e = 0, t = Dt, n = 1, r = 0; e < 24; e++) {
  [n, r] = [r, (2 * n + 3 * r) % 5], ur.push(2 * (5 * r + n)), lr.push((e + 1) * (e + 2) / 2 % 64);
  let i = yo;
  for (let o = 0; o < 7; o++)
    t = (t << Dt ^ (t >> xo) * vo) % Eo, t & mo && (i ^= Dt << (Dt << BigInt(o)) - Dt);
  hr.push(i);
}
const pr = Sn(hr, !0), Bo = pr[0], _o = pr[1], Ao = (e, t, n) => e << n | t >>> 32 - n, Ro = (e, t, n) => t << n | e >>> 32 - n, Io = (e, t, n) => t << n - 32 | e >>> 64 - n, So = (e, t, n) => e << n - 32 | t >>> 64 - n, mn = (e, t, n) => n > 32 ? Io(e, t, n) : Ao(e, t, n), xn = (e, t, n) => n > 32 ? So(e, t, n) : Ro(e, t, n), Ot = new Uint32Array(10);
function Oo(e, t = 24) {
  if (!(e instanceof Uint32Array))
    throw new TypeError('"s" expected Uint32Array(50), got type=' + typeof e);
  if (e.length !== 50)
    throw new RangeError('"s" expected Uint32Array(50), got length=' + e.length);
  if (V(t, "rounds"), t < 1 || t > 24)
    throw new Error('"rounds" expected integer 1..24');
  for (let n = 24 - t; n < 24; n++) {
    for (let o = 0; o < 10; o++)
      Ot[o] = e[o] ^ e[o + 10] ^ e[o + 20] ^ e[o + 30] ^ e[o + 40];
    for (let o = 0; o < 10; o += 2) {
      const s = (o + 8) % 10, c = (o + 2) % 10, a = Ot[c], f = Ot[c + 1], d = mn(a, f, 1) ^ Ot[s], b = xn(a, f, 1) ^ Ot[s + 1];
      for (let p = 0; p < 50; p += 10)
        e[o + p] ^= d, e[o + p + 1] ^= b;
    }
    let r = e[2], i = e[3];
    for (let o = 0; o < 24; o++) {
      const s = lr[o], c = mn(r, i, s), a = xn(r, i, s), f = ur[o];
      r = e[f], i = e[f + 1], e[f] = c, e[f + 1] = a;
    }
    for (let o = 0; o < 50; o += 10) {
      const s = e[o], c = e[o + 1], a = e[o + 2], f = e[o + 3];
      e[o] ^= ~e[o + 2] & e[o + 4], e[o + 1] ^= ~e[o + 3] & e[o + 5], e[o + 2] ^= ~e[o + 4] & e[o + 6], e[o + 3] ^= ~e[o + 5] & e[o + 7], e[o + 4] ^= ~e[o + 6] & e[o + 8], e[o + 5] ^= ~e[o + 7] & e[o + 9], e[o + 6] ^= ~e[o + 8] & s, e[o + 7] ^= ~e[o + 9] & c, e[o + 8] ^= ~s & a, e[o + 9] ^= ~c & f;
    }
    e[0] ^= Bo[n], e[1] ^= _o[n];
  }
  ut(Ot);
}
class Ye {
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
    if (V(t, "blockLen"), V(n, "suffix"), V(o, "rounds"), Mr(i, "enableXOF"), this.blockLen = t, this.suffix = n, this.outputLen = r, this.enableXOF = i, this.canXOF = i, this.rounds = o, V(r, "outputLen"), !(0 < t && t < 200))
      throw new Error('"blockLen" must be 1..199');
    this.state = new Uint8Array(200), this.state32 = Qe(this.state);
  }
  clone() {
    return this._cloneInto();
  }
  keccak() {
    tn(this.state32), Oo(this.state32, this.rounds), tn(this.state32), this.posOut = 0, this.pos = 0;
  }
  update(t) {
    Ut(this), Y(t);
    const { blockLen: n, state: r, state32: i } = this, o = t.length, s = n % 4 === 0 && t.byteOffset % 4 === 0, c = n / 4, a = s && o >= n ? Qe(t) : void 0;
    for (let f = 0; f < o; ) {
      if (a !== void 0 && this.pos === 0 && f % 4 === 0 && o - f >= n) {
        for (let b = 0, p = f / 4; b < c; b++)
          i[b] ^= a[p + b];
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
    Ut(this, !1), Y(t), this.finish();
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
    if (Te(t, this), this.finished)
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
    return t || (t = new Ye(n, r, i, s, o)), t.blockLen = n, t.state32.set(this.state32), t.pos = this.pos, t.posOut = this.posOut, t.finished = this.finished, t.rounds = o, t.suffix = r, t.outputLen = i, t.enableXOF = s, t.canXOF = this.canXOF, t.destroyed = this.destroyed, t;
  }
}
const To = (e, t, n, r = {}) => ae(() => new Ye(t, e, n), r), wr = /* @__PURE__ */ To(1, 136, 32), Zt = 2147483648, En = [
  {
    id: "bip44",
    label: "BIP44",
    xpubPath: "m/44'/60'/{account}'",
    receiveTemplate: "m/44'/60'/{account}'/0/{index}",
    changeTemplate: "m/44'/60'/{account}'/1/{index}",
    note: "MetaMask、OKX Web3、Trust Wallet、imToken 默认路径"
  }
];
function Ho(e) {
  const t = En.find((n) => n.id === e);
  if (!t)
    throw new dt("PATH_INVALID", `unknown derivation scheme: ${e}`, {
      available: En.map((n) => n.id)
    });
  return t;
}
function vn(e, t, n = 0) {
  return e.replace("{account}", String(t)).replace("{index}", String(n));
}
function Co(e) {
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
    if (s >= Zt)
      throw new dt("PATH_INVALID", `path segment ${r} exceeds the hardened range`);
    return i ? s + Zt : s;
  });
}
function Uo(e) {
  return e.length === 0 ? "m" : "m/" + e.map((t) => t >= Zt ? `${t - Zt}'` : String(t)).join("/");
}
function Lo(e) {
  return e >= Zt;
}
function No(e, t) {
  const n = Co(t);
  let r = e;
  for (const i of n) {
    if (Lo(i) && !r.privateKey)
      throw new dt(
        "DERIVATION_HARDENED_NEEDS_PRIVATE",
        `cannot derive hardened child ${Uo([i])} from a public-only key`
      );
    r = r.deriveChild(i);
  }
  return r;
}
function Fo(e) {
  if (e.length === 33) {
    const t = Tt.Point.fromBytes(e).toAffine();
    return Do(t.x, t.y);
  }
  if (e.length === 65) {
    if (e[0] !== 4)
      throw new dt("KEY_MISSING_PRIVATE", "uncompressed public key must start with 0x04");
    return gr(e.subarray(1));
  }
  throw new dt("KEY_MISSING_PRIVATE", `unsupported public key length ${e.length}`);
}
function gr(e) {
  const t = wr(e);
  return $o(fe(t.subarray(12)));
}
function Do(e, t) {
  const n = new Uint8Array(64);
  return n.set(Bn(e), 0), n.set(Bn(t), 32), gr(n);
}
function Bn(e) {
  const t = new Uint8Array(32);
  let n = e;
  for (let r = 31; r >= 0; r--)
    t[r] = Number(n & 0xffn), n >>= 8n;
  if (n !== 0n) throw new dt("KEY_MISSING_PRIVATE", "coordinate does not fit in 32 bytes");
  return t;
}
function $o(e) {
  const t = e.toLowerCase().replace(/^0x/u, "");
  if (!/^[0-9a-f]{40}$/u.test(t))
    throw new dt("TX_INVALID_FIELD", `not an EVM address: ${e}`);
  const n = fe(wr(new TextEncoder().encode(t)));
  let r = "0x";
  for (let i = 0; i < 40; i++)
    r += Number.parseInt(n[i], 16) >= 8 ? t[i].toUpperCase() : t[i];
  return r;
}
BigInt(Number.MAX_SAFE_INTEGER);
function ko(e, t, n, r) {
  const i = Ho(t), o = Et.fromExtendedKey(e), s = vn(i.receiveTemplate, n, r), c = vn(i.xpubPath, n), a = s.slice(c.length).replace(/^\//u, ""), f = a.length === 0 ? o : No(o, `m/${a}`);
  return {
    account: n,
    scheme: t,
    address: Fo(f.publicKey),
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
const _n = {
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
}, Mo = 501;
function Po(e) {
  return e === Mo;
}
const ie = "netproof.companion.", le = {
  wallets: `${ie}wallets.v1`,
  settings: `${ie}settings.v1`,
  origins: `${ie}origins.v1`,
  pending: `${ie}pending.v1`
}, Ko = 200;
function qo(e) {
  var t;
  return ((t = e.addresses) != null ? t : []).map((n, r) => ({
    address: n.address,
    path: n.path,
    scheme: "solana",
    account: r,
    index: 0
  }));
}
function jo(e, t, n, r) {
  const i = e.accounts.find(
    (c) => c.scheme === t && c.account === n
  );
  if (!i) return [];
  const o = Math.max(1, Math.min(r, Ko)), s = [];
  for (let c = 0; c < o; c++)
    try {
      const a = ko(i.xpub, i.scheme, i.account, c);
      s.push({
        address: a.address,
        path: a.path,
        scheme: i.scheme,
        account: i.account,
        index: c
      });
    } catch {
      break;
    }
  return s;
}
function br(e, t) {
  return Po(t.chainId) ? qo(e).slice(t.accountIndex, t.accountIndex + 1) : jo(
    e,
    t.schemeId,
    t.accountIndex,
    t.addressCount
  );
}
function yr(e, t) {
  var r, i;
  const n = br(e, t);
  return (i = (r = n[t.addressIndex]) != null ? r : n[0]) != null ? i : null;
}
class Yo {
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
function $t(e, t) {
  if (typeof e != "string" || !/^0x[0-9a-fA-F]+$/u.test(e))
    throw new z({
      code: X.internal.code,
      message: `RPC 节点返回的 ${t} 不是合法的十六进制数量：${String(e)}`
    });
  return e;
}
async function Zo(e, t, n) {
  const r = new Yo({ url: n.rpcUrl });
  switch (e) {
    case "eth_getTransactionCount":
      return $t(await r.call(e, t), "nonce");
    case "eth_gasPrice":
      return $t(await r.call(e, t), "gasPrice");
    case "eth_estimateGas":
      return $t(await r.call(e, t), "gas");
    case "eth_maxPriorityFeePerGas": {
      const i = await r.call(e, t);
      return typeof i == "string" ? $t(i, "maxPriorityFeePerGas") : $t(await r.call("eth_gasPrice", []), "gasPrice");
    }
    case "eth_chainId": {
      const i = await r.call(e, t);
      return typeof i == "string" ? i : `0x${n.chainId.toString(16)}`;
    }
    case "eth_sendRawTransaction":
      return zo(t[0]), r.call(e, t);
    default:
      return r.call(e, t);
  }
}
function zo(e) {
  if (typeof e != "string" || !/^0x02[0-9a-fA-F]+$|^0x[0-9a-fA-F]{100,}$/u.test(e))
    throw new z({
      code: X.invalidParams.code,
      message: "拒绝广播：不是合法的已签名交易载荷"
    });
}
const Xo = /* @__PURE__ */ new Set([
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
]), Go = {
  eth_sendTransaction: "sendTransaction",
  eth_signTransaction: "signTransaction",
  personal_sign: "personal_sign",
  eth_signTypedData_v4: "signTypedData",
  eth_signTypedData: "signTypedData"
};
async function Wo(e, t, n) {
  try {
    return { result: await Vo(e, t, n) };
  } catch (r) {
    return r instanceof z ? { error: r.toShape() } : { error: { code: X.internal.code, message: r.message } };
  }
}
async function Vo(e, t, n) {
  var a;
  const { wallet: r, settings: i, origin: o, approvedOrigins: s } = n;
  switch (e) {
    case "eth_chainId":
      return `0x${i.chainId.toString(16)}`;
    case "net_version":
      return String(i.chainId);
    case "wallet_getPermissions":
      return s.includes(o) ? [{ parentCapability: "eth_accounts", caveats: [] }] : [];
    case "wallet_requestPermissions":
      return Rn(r), [
        {
          parentCapability: "eth_accounts",
          caveats: [{ type: "restrictReturnedAccounts", value: [(a = yr(r, i)) == null ? void 0 : a.address] }]
        }
      ];
    case "wallet_revokePermissions":
      return null;
    case "wallet_switchEthereumChain": {
      const f = Qo(t[0]);
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
      return !r || !s.includes(o) ? [] : An(r, i);
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
      }), An(r, i);
    }
  }
  if (Xo.has(e))
    return n.forward(e, t);
  const c = Go[e];
  if (c) {
    Rn(r), Jo(o, s);
    const f = {
      id: oe(),
      kind: c,
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
function An(e, t) {
  const n = new Set(t.hiddenAccounts.map((o) => o.toLowerCase())), r = br(e, t).filter(
    (o) => !n.has(o.address.toLowerCase())
  ), i = yr(e, t);
  return i ? [i.address, ...r.map((o) => o.address).filter((o) => o !== i.address)] : [];
}
function Rn(e) {
  if (!e)
    throw new z({
      code: X.disconnected.code,
      message: "尚未连接硬件钱包。请在插件中扫码导入 xpub。"
    });
}
function Jo(e, t) {
  if (!t.includes(e))
    throw new z({
      code: X.unauthorized.code,
      message: "该站点尚未获得账户授权。请先调用 eth_requestAccounts。"
    });
}
function Qo(e) {
  const t = e == null ? void 0 : e.chainId;
  if (typeof t == "string") return Number.parseInt(t.replace(/^0x/u, ""), 16);
  if (typeof t == "number") return t;
  throw new z(X.invalidParams);
}
function oe() {
  const e = new Uint8Array(16);
  return crypto.getRandomValues(e), fe(e, !0);
}
const mr = le.wallets, ts = le.settings, xr = le.origins, Ze = le.pending;
function Er() {
  return chrome.storage.local;
}
async function zt(e) {
  const n = (await Er().get(e))[e];
  if (n == null) return null;
  if (typeof n == "string")
    try {
      return JSON.parse(n);
    } catch {
      return null;
    }
  return n;
}
async function ze(e, t) {
  await Er().set({ [e]: JSON.stringify(t) });
}
async function es() {
  var t, n;
  const e = await zt(mr);
  return !e || !Array.isArray(e.wallets) ? null : (n = (t = e.wallets.find((r) => r.masterFingerprint === e.activeId)) != null ? t : e.wallets[0]) != null ? n : null;
}
async function vr() {
  var r, i, o, s, c, a, f, d;
  const e = await zt(ts), t = await zt(
    mr
  ), n = (o = (r = t == null ? void 0 : t.wallets) == null ? void 0 : r.find((b) => b.masterFingerprint === t.activeId)) != null ? o : (i = t == null ? void 0 : t.wallets) == null ? void 0 : i[0];
  return {
    ..._n,
    ...e != null ? e : {},
    rpcUrls: { ..._n.rpcUrls, ...(s = e == null ? void 0 : e.rpcUrls) != null ? s : {} },
    ...n ? {
      accountIndex: (c = n.accountIndex) != null ? c : 0,
      addressIndex: (a = n.addressIndex) != null ? a : 0,
      visibleAccounts: (f = n.visibleAccounts) != null ? f : 1,
      hiddenAccounts: (d = n.hiddenAccounts) != null ? d : []
    } : {}
  };
}
async function Br() {
  var e;
  return (e = await zt(xr)) != null ? e : [];
}
async function ns(e) {
  const t = await Br();
  t.includes(e) || await ze(xr, [...t, e]);
}
async function Wt() {
  var e;
  return (e = await zt(Ze)) != null ? e : [];
}
async function rs(e) {
  const t = await Wt();
  await ze(
    Ze,
    [...t.filter((n) => n.id !== e.id), e]
  );
}
async function is(e) {
  var n;
  return (n = (await Wt()).find((r) => r.id === e)) != null ? n : null;
}
async function he(e) {
  const t = await Wt();
  await ze(
    Ze,
    t.filter((n) => n.id !== e)
  );
}
const In = "tab.html", _t = /* @__PURE__ */ new Map();
chrome.runtime.onInstalled.addListener(() => {
  Wt().then(async (e) => {
    for (const t of e) await he(t.id);
  });
});
chrome.runtime.onConnect.addListener((e) => {
  e.name === "netproof-provider" && e.onMessage.addListener((t) => {
    (async () => {
      var n;
      try {
        if (t.type === "approval-result") {
          _r(t);
          return;
        }
        if (t.type === "provider-poke") {
          e.postMessage({ type: "poked" });
          return;
        }
        if (t.type !== "rpc") return;
        const r = await os(t.method, t.params, t.origin);
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
  return (r == null ? void 0 : r.type) === "approval-result" ? (_r(r), n({ ok: !0 }), !0) : (r == null ? void 0 : r.type) === "pending-list" ? (Wt().then((i) => n({ pending: i })), !0) : !1;
});
async function os(e, t, n) {
  const r = await vr(), i = await es(), o = await Br(), s = r.rpcUrls[r.chainId];
  return s ? Wo(e, t, {
    wallet: i,
    settings: r,
    origin: n,
    approvedOrigins: o,
    forward: (c, a) => Zo(c, a, { rpcUrl: s, chainId: r.chainId }),
    requestApproval: (c) => ss(c)
  }) : { error: { code: X.unrecognizedChain.code, message: `链 ${r.chainId} 没有配置 RPC` } };
}
function ss(e, t) {
  return new Promise((n, r) => {
    (async () => (await rs(e), _t.set(e.id, { resolve: n, reject: r }), await cs(e.id), setTimeout(() => {
      _t.has(e.id) && (_t.delete(e.id), he(e.id), r({ code: X.userRejected.code, message: "请求已超时，请重新发起" }));
    }, 600 * 1e3)))();
  });
}
async function cs(e) {
  const t = chrome.runtime.getURL(`${In}#/sign/${e}`), r = (await chrome.tabs.query({ url: chrome.runtime.getURL(`${In}*`) }))[0];
  if ((r == null ? void 0 : r.id) !== void 0) {
    await chrome.tabs.update(r.id, { url: t, active: !0 }), r.windowId !== void 0 && await chrome.windows.update(r.windowId, { focused: !0 });
    return;
  }
  await chrome.tabs.create({ url: t });
}
function _r(e) {
  const t = _t.get(e.id);
  t && (_t.delete(e.id), he(e.id), e.error ? t.reject(e.error) : t.resolve(e.result));
}
async function fs(e, t) {
  if (!await is(e)) return;
  await he(e);
  const r = _t.get(e);
  r && (_t.delete(e), t.error ? r.reject(t.error) : r.resolve(t.result));
}
async function ds(e) {
  await ns(e);
}
async function us() {
  return vr();
}
function ls() {
  const e = new Uint8Array(16);
  return crypto.getRandomValues(e), fe(e, !0);
}
export {
  z as RpcError,
  fs as __completeApproval,
  fs as completeApproval,
  ls as newRequestId,
  us as readSettings,
  ds as rememberOrigin
};
