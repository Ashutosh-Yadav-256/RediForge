'use strict';

const { SkipList } = require('./skiplist');

class SortedSet {
    constructor() {
        this.dict = new Map();
        this.sl = new SkipList();
    }

    get length() {
        return this.sl.length;
    }

    get size() {
        return this.sl.length;
    }

    get members() {
        return this.dict;
    }

    add(member, score) {
        const memStr = typeof member === 'string' ? member : String(member);
        const scoreNum = Number(score);

        const existingScore = this.dict.get(memStr);
        if (existingScore !== undefined) {
            if (existingScore === scoreNum) {
                return 0;
            }
            this.sl.delete(existingScore, memStr);
            this.dict.set(memStr, scoreNum);
            this.sl.insert(scoreNum, memStr);
            return 0;
        }

        this.dict.set(memStr, scoreNum);
        this.sl.insert(scoreNum, memStr);
        return 1;
    }

    remove(member) {
        const memStr = typeof member === 'string' ? member : String(member);
        const score = this.dict.get(memStr);
        if (score === undefined) return false;

        this.dict.delete(memStr);
        this.sl.delete(score, memStr);
        return true;
    }

    has(member) {
        const memStr = typeof member === 'string' ? member : String(member);
        return this.dict.has(memStr);
    }

    score(member) {
        const memStr = typeof member === 'string' ? member : String(member);
        return this.dict.get(memStr);
    }

    getScore(member) {
        return this.score(member);
    }

    rank(member) {
        const memStr = typeof member === 'string' ? member : String(member);
        const score = this.dict.get(memStr);
        if (score === undefined) return null;
        const r = this.sl.getRank(score, memStr);
        return r > 0 ? r - 1 : null;
    }

    revrank(member) {
        const r = this.rank(member);
        if (r === null) return null;
        return this.sl.length - 1 - r;
    }

    range(start, stop, withScores = false) {
        let s = start;
        let e = stop;
        const len = this.sl.length;

        if (s < 0) s = Math.max(0, len + s);
        if (e < 0) e = len + e;
        if (s > e || s >= len) return [];

        e = Math.min(e, len - 1);
        const startRank = s + 1;
        let node = this.sl.getByRank(startRank);
        const results = [];

        for (let i = s; i <= e && node; i++) {
            if (withScores) {
                results.push({ member: node.member, score: node.score });
            } else {
                results.push(node.member);
            }
            node = node.forward[0];
        }

        return results;
    }

    revrange(start, stop, withScores = false) {
        let s = start;
        let e = stop;
        const len = this.sl.length;

        if (s < 0) s = Math.max(0, len + s);
        if (e < 0) e = len + e;
        if (s > e || s >= len) return [];

        e = Math.min(e, len - 1);
        const startRank = len - s;
        let node = this.sl.getByRank(startRank);
        const results = [];

        for (let i = s; i <= e && node; i++) {
            if (withScores) {
                results.push({ member: node.member, score: node.score });
            } else {
                results.push(node.member);
            }
            node = node.backward;
        }

        return results;
    }

    rangeByScore(min, max, options = {}) {
        const withScores = !!options.withScores;
        const offset = options.offset || 0;
        const count = options.count !== undefined ? options.count : -1;
        const minExclusive = !!options.minExclusive;
        const maxExclusive = !!options.maxExclusive;

        let node = this.sl.header.forward[0];
        while (node) {
            if (minExclusive ? node.score > min : node.score >= min) {
                break;
            }
            node = node.forward[0];
        }

        const results = [];
        let skipped = 0;

        while (node) {
            if (maxExclusive ? node.score >= max : node.score > max) {
                break;
            }

            if (skipped < offset) {
                skipped++;
            } else {
                if (withScores) {
                    results.push({ member: node.member, score: node.score });
                } else {
                    results.push(node.member);
                }
                if (count > 0 && results.length >= count) {
                    break;
                }
            }
            node = node.forward[0];
        }

        return results;
    }

    revrangeByScore(max, min, options = {}) {
        const withScores = !!options.withScores;
        const offset = options.offset || 0;
        const count = options.count !== undefined ? options.count : -1;
        const minExclusive = !!options.minExclusive;
        const maxExclusive = !!options.maxExclusive;

        let node = this.sl.tail;
        while (node) {
            if (maxExclusive ? node.score < max : node.score <= max) {
                break;
            }
            node = node.backward;
        }

        const results = [];
        let skipped = 0;

        while (node) {
            if (minExclusive ? node.score <= min : node.score < min) {
                break;
            }

            if (skipped < offset) {
                skipped++;
            } else {
                if (withScores) {
                    results.push({ member: node.member, score: node.score });
                } else {
                    results.push(node.member);
                }
                if (count > 0 && results.length >= count) {
                    break;
                }
            }
            node = node.backward;
        }

        return results;
    }

    count(min, max, minExclusive = false, maxExclusive = false) {
        let cnt = 0;
        let node = this.sl.header.forward[0];
        while (node) {
            const minOk = minExclusive ? node.score > min : node.score >= min;
            const maxOk = maxExclusive ? node.score < max : node.score <= max;
            if (minOk && maxOk) {
                cnt++;
            } else if (!maxOk && node.score > max) {
                break;
            }
            node = node.forward[0];
        }
        return cnt;
    }
}

module.exports = { SortedSet };
