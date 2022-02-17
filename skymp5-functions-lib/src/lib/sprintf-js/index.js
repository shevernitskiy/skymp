/*! sprintf-js v1.1.2 | Copyright (c) 2007-present, Alexandru Mărășteanu <hello@alexei.ro> | BSD-3-Clause */
!(function () {
  'use strict'
  var g = {
    not_string: /[^s]/,
    not_bool: /[^t]/,
    not_type: /[^T]/,
    not_primitive: /[^v]/,
    number: /[diefg]/,
    numeric_arg: /[bcdiefguxX]/,
    json: /[j]/,
    not_json: /[^j]/,
    text: /^[^\x25]+/,
    modulo: /^\x25{2}/,
    placeholder: /^\x25(?:([1-9]\d*)\$|\(([^)]+)\))?(\+)?(0|'[^$])?(-)?(\d+)?(?:\.(\d+))?([b-gijostTuvxX])/,
    key: /^([a-z_][a-z_\d]*)/i,
    key_access: /^\.([a-z_][a-z_\d]*)/i,
    index_access: /^\[(\d+)\]/,
    sign: /^[+-]/,
  }
  function y(e) {
    return (function (e, t) {
      var r,
        n,
        i,
        s,
        a,
        o,
        p,
        c,
        l,
        u = 1,
        f = e.length,
        d = ''
      for (n = 0; n < f; n++)
        if ('string' == typeof e[n]) d += e[n]
        else if ('object' == typeof e[n]) {
          if ((s = e[n]).keys)
            for (r = t[u], i = 0; i < s.keys.length; i++) {
              if (null == r) throw new Error(y('[sprintf] Cannot access property "%s" of undefined value "%s"', s.keys[i], s.keys[i - 1]))
              r = r[s.keys[i]]
            }
          else r = s.param_no ? t[s.param_no] : t[u++]
          if (
            (g.not_type.test(s.type) && g.not_primitive.test(s.type) && r instanceof Function && (r = r()),
            g.numeric_arg.test(s.type) && 'number' != typeof r && isNaN(r))
          )
            throw new TypeError(y('[sprintf] expecting number but found %T', r))
          switch ((g.number.test(s.type) && (c = 0 <= r), s.type)) {
            case 'b':
              r = parseInt(r, 10).toString(2)
              break
            case 'c':
              r = String.fromCharCode(parseInt(r, 10))
              break
            case 'd':
            case 'i':
              r = parseInt(r, 10)
              break
            case 'j':
              r = JSON.stringify(r, null, s.width ? parseInt(s.width) : 0)
              break
            case 'e':
              r = s.precision ? parseFloat(r).toExponential(s.precision) : parseFloat(r).toExponential()
              break
            case 'f':
              r = s.precision ? parseFloat(r).toFixed(s.precision) : parseFloat(r)
              break
            case 'g':
              r = s.precision ? String(Number(r.toPrecision(s.precision))) : parseFloat(r)
              break
            case 'o':
              r = (parseInt(r, 10) >>> 0).toString(8)
              break
            case 's':
              ;(r = String(r)), (r = s.precision ? r.substring(0, s.precision) : r)
              break
            case 't':
              ;(r = String(!!r)), (r = s.precision ? r.substring(0, s.precision) : r)
              break
            case 'T':
              ;(r = Object.prototype.toString.call(r).slice(8, -1).toLowerCase()), (r = s.precision ? r.substring(0, s.precision) : r)
              break
            case 'u':
              r = parseInt(r, 10) >>> 0
              break
            case 'v':
              ;(r = r.valueOf()), (r = s.precision ? r.substring(0, s.precision) : r)
              break
            case 'x':
              r = (parseInt(r, 10) >>> 0).toString(16)
              break
            case 'X':
              r = (parseInt(r, 10) >>> 0).toString(16).toUpperCase()
          }
          g.json.test(s.type)
            ? (d += r)
            : (!g.number.test(s.type) || (c && !s.sign) ? (l = '') : ((l = c ? '+' : '-'), (r = r.toString().replace(g.sign, ''))),
              (o = s.pad_char ? ('0' === s.pad_char ? '0' : s.pad_char.charAt(1)) : ' '),
              (p = s.width - (l + r).length),
              (a = s.width && 0 < p ? o.repeat(p) : ''),
              (d += s.align ? l + r + a : '0' === o ? l + a + r : a + l + r))
        }
      return d
    })(
      (function (e) {
        if (p[e]) return p[e]
        var t,
          r = e,
          n = [],
          i = 0
        for (; r; ) {
          if (null !== (t = g.text.exec(r))) n.push(t[0])
          else if (null !== (t = g.modulo.exec(r))) n.push('%')
          else {
            if (null === (t = g.placeholder.exec(r))) throw new SyntaxError('[sprintf] unexpected placeholder')
            if (t[2]) {
              i |= 1
              var s = [],
                a = t[2],
                o = []
              if (null === (o = g.key.exec(a))) throw new SyntaxError('[sprintf] failed to parse named argument key')
              for (s.push(o[1]); '' !== (a = a.substring(o[0].length)); )
                if (null !== (o = g.key_access.exec(a))) s.push(o[1])
                else {
                  if (null === (o = g.index_access.exec(a))) throw new SyntaxError('[sprintf] failed to parse named argument key')
                  s.push(o[1])
                }
              t[2] = s
            } else i |= 2
            if (3 === i) throw new Error('[sprintf] mixing positional and named placeholders is not (yet) supported')
            n.push({
              placeholder: t[0],
              param_no: t[1],
              keys: t[2],
              sign: t[3],
              pad_char: t[4],
              align: t[5],
              width: t[6],
              precision: t[7],
              type: t[8],
            })
          }
          r = r.substring(t[0].length)
        }
        return (p[e] = n)
      })(e),
      arguments,
    )
  }
  function e(e, t) {
    return y.apply(null, [e].concat(t || []))
  }
  var p = Object.create(null)
  'undefined' != typeof exports && ((exports.sprintf = y), (exports.vsprintf = e)),
    'undefined' != typeof window &&
      ((window.sprintf = y),
      (window.vsprintf = e),
      'function' == typeof define &&
        define.amd &&
        define(function () {
          return { sprintf: y, vsprintf: e }
        }))
})()
//# sourceMappingURL=sprintf.min.js.map
