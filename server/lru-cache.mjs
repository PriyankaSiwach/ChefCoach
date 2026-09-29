/**
 * Fixed-capacity LRU cache: HashMap + doubly linked list for O(1) get/put.
 * Most-recently used sits after the head sentinel; least-recently used sits
 * before the tail sentinel. Evicts the LRU entry when capacity is exceeded.
 */
export function createLruCache(capacity = 100) {
  if (!(capacity > 0) || !Number.isFinite(capacity)) {
    throw new Error("capacity must be a positive number");
  }
  const max = Math.floor(capacity);

  /** @typedef {{ key: string | null, value: unknown, prev: any, next: any }} Node */
  /** @type {Node} */
  const head = { key: null, value: null, prev: null, next: null };
  /** @type {Node} */
  const tail = { key: null, value: null, prev: null, next: null };
  head.next = tail;
  tail.prev = head;

  /** @type {Map<string, { key: string, value: unknown, prev: any, next: any }>} */
  const map = new Map();

  function detach(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }

  function attachAfterHead(node) {
    node.prev = head;
    node.next = head.next;
    head.next.prev = node;
    head.next = node;
  }

  function moveToFront(node) {
    detach(node);
    attachAfterHead(node);
  }

  return {
    get size() {
      return map.size;
    },
    get(key) {
      const node = map.get(String(key));
      if (!node) return undefined;
      moveToFront(node);
      return node.value;
    },
    set(key, value) {
      const id = String(key);
      const existing = map.get(id);
      if (existing) {
        existing.value = value;
        moveToFront(existing);
        return;
      }
      const node = { key: id, value, prev: null, next: null };
      map.set(id, node);
      attachAfterHead(node);
      if (map.size > max) {
        const lru = tail.prev;
        detach(lru);
        map.delete(lru.key);
      }
    },
    has(key) {
      return map.has(String(key));
    },
    clear() {
      map.clear();
      head.next = tail;
      tail.prev = head;
    },
  };
}
