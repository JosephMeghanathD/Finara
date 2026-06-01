// Vanilla JS pub/sub for loading state — works outside React so api.js can use it directly.
let _counter = 0
const _active = new Map()     // id → { id, label, type, startedAt }
const _listeners = new Set()

function _notify() {
  const snapshot = [..._active.values()]
  _listeners.forEach(fn => fn(snapshot))
}

export const loadingBus = {
  start(label, type = 'data') {
    const id = ++_counter
    _active.set(id, { id, label, type, startedAt: Date.now() })
    _notify()
    return id
  },
  end(id) {
    if (_active.has(id)) {
      _active.delete(id)
      _notify()
    }
  },
  subscribe(fn) {
    _listeners.add(fn)
    fn([..._active.values()])   // immediate snapshot on subscribe
    return () => _listeners.delete(fn)
  },
  getActive() {
    return [..._active.values()]
  },
}
