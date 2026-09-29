'use strict';

const proxyHandler = {
    get(target, prop) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
            return target.get(Number(prop));
        }
        return target[prop];
    },
    set(target, prop, value) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
            return target.set(Number(prop), value);
        }
        target[prop] = value;
        return true;
    }
};

class Deque {
    constructor(initialCapacity = 16) {
        this._capacity = Math.max(16, initialCapacity);
        this._buffer = new Array(this._capacity);
        this._head = 0;
        this._tail = 0;
        this._length = 0;
        return new Proxy(this, proxyHandler);
    }

    get length() {
        return this._length;
    }

    pushRight(val) {
        if (this._length === this._capacity) {
            this._grow();
        }
        this._buffer[this._tail] = val;
        this._tail = (this._tail + 1) % this._capacity;
        this._length++;
        return this._length;
    }

    pushLeft(val) {
        if (this._length === this._capacity) {
            this._grow();
        }
        this._head = (this._head - 1 + this._capacity) % this._capacity;
        this._buffer[this._head] = val;
        this._length++;
        return this._length;
    }

    popLeft() {
        if (this._length === 0) return undefined;
        const val = this._buffer[this._head];
        this._buffer[this._head] = undefined;
        this._head = (this._head + 1) % this._capacity;
        this._length--;
        return val;
    }

    popRight() {
        if (this._length === 0) return undefined;
        this._tail = (this._tail - 1 + this._capacity) % this._capacity;
        const val = this._buffer[this._tail];
        this._buffer[this._tail] = undefined;
        this._length--;
        return val;
    }

    get(index) {
        if (index < 0 || index >= this._length) return undefined;
        const actualIdx = (this._head + index) % this._capacity;
        return this._buffer[actualIdx];
    }

    set(index, val) {
        if (index < 0 || index >= this._length) return false;
        const actualIdx = (this._head + index) % this._capacity;
        this._buffer[actualIdx] = val;
        return true;
    }

    slice(start, end) {
        if (start === undefined) start = 0;
        if (start < 0) start = Math.max(0, this._length + start);
        if (end === undefined) end = this._length;
        if (end < 0) end = Math.max(0, this._length + end);
        end = Math.min(end, this._length);

        if (start >= end) return [];
        const result = new Array(end - start);
        for (let i = start; i < end; i++) {
            result[i - start] = this.get(i);
        }
        return result;
    }

    toArray() {
        return this.slice(0, this._length);
    }

    remove(predicateOrValue, maxCount = 0) {
        const isFn = typeof predicateOrValue === 'function';
        let removed = 0;
        const remaining = [];

        for (let i = 0; i < this._length; i++) {
            const item = this.get(i);
            const matches = isFn ? predicateOrValue(item) : (item === predicateOrValue);
            if (matches && (maxCount === 0 || removed < maxCount)) {
                removed++;
            } else {
                remaining.push(item);
            }
        }

        if (removed > 0) {
            this._clear();
            for (let j = 0; j < remaining.length; j++) {
                this.pushRight(remaining[j]);
            }
        }

        return removed;
    }

    _clear() {
        this._buffer = new Array(this._capacity);
        this._head = 0;
        this._tail = 0;
        this._length = 0;
    }

    _grow() {
        const newCapacity = this._capacity * 2;
        const newBuffer = new Array(newCapacity);
        for (let i = 0; i < this._length; i++) {
            newBuffer[i] = this.get(i);
        }
        this._buffer = newBuffer;
        this._head = 0;
        this._tail = this._length;
        this._capacity = newCapacity;
    }

    [Symbol.iterator]() {
        let index = 0;
        const self = this;
        return {
            next() {
                if (index < self._length) {
                    return { value: self.get(index++), done: false };
                }
                return { done: true };
            }
        };
    }
}

module.exports = { Deque };
