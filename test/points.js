var test = require('tape')
var fdstore = require('fd-chunk-store')
var hyperkdb = require('../')
var kdbtree = require('kdb-tree-store')
var memdb = require('memdb')
var path = require('path')
var xtend = require('xtend')

var hyperlog = require('hyperlog')
var log = hyperlog(memdb(), { valueEncoding: 'json' })
var file = path.join(require('os').tmpdir(), 'kdb-tree-' + Math.random())

test('points', function (t) {
  t.plan(8)
  var kdb = hyperkdb({
    log: log,
    db: memdb(),
    types: [ 'float', 'float' ],
    kdbtree: kdbtree,
    store: fdstore(256, file),
    map: function (row, next) {
      if (row.value.type === 'remove' && row.value.points) {
        next(null, { type: 'del', points: row.value.points })
      } else if (row.value.type === 'remove') {
        next(null, { type: 'del', point: [ row.value.lat, row.value.lon ] })
      } else if (row.value.type === 'point') {
        next(null, { type: 'put', point: [ row.value.lat, row.value.lon ] })
      } else if (row.value.type === 'way') {
        next(null, { type: 'put', points: row.value.points })
      }
    }
  })
  var docs = {
    A: { v: { type: 'point', lat: 64, lon: -147 } },
    B: { v: { type: 'point', lat: 63, lon: -145 } },
    C: { v: { type: 'point', lat: 65, lon: -149 } },
    D: { v: { type: 'way', points: [ 'A', 'B', 'C' ] } }
  }
  var keys = Object.keys(docs).sort()
  var nodes = {}, knodes = {}
  ;(function advance () {
    if (keys.length === 0) return ready()
    var key = keys.shift()
    var doc = docs[key]
    var ln = (doc.links || []).map(function (k) { return nodes[k].key })
    if (doc.v.points) doc.v.points = doc.v.points.map(function (p) {
      return [docs[p].v.lat,docs[p].v.lon]
    })
    log.add(ln, doc.v, function (err, node) {
      t.ifError(err)
      nodes[key] = node
      knodes[node.key] = node
      advance()
    })
  })()
  function ready () {
    var q0 = [[63.5,65.1],[-150,-147.5]]
    kdb.query(q0, function (err, pts) {
      t.ifError(err)
      t.deepEqual(pts.sort(cmp), [
        { point: [ 65, -149 ], value: Buffer(nodes.C.key, 'hex') },
        { point: [ 65, -149 ], value: Buffer(nodes.D.key, 'hex') }
      ].sort(cmp))
    })
    var q1 = [[63.5,65.4],[-150,-142]]
    kdb.query(q1, function (err, pts) {
      t.ifError(err)
      t.deepEqual(pts.sort(cmp), [
        { point: [ 65, -149 ], value: Buffer(nodes.C.key, 'hex') },
        { point: [ 65, -149 ], value: Buffer(nodes.D.key, 'hex') },
        { point: [ 64, -147 ], value: Buffer(nodes.A.key, 'hex') },
        { point: [ 64, -147 ], value: Buffer(nodes.D.key, 'hex') }
      ].sort(cmp))
    })
  }
})

function cmp (a, b) {
  var n = Buffer.compare(a.value, b.value)
  if (n !== 0) return n
  return a.point.join(',') < b.point.join(',') ? -1 : 1
}
