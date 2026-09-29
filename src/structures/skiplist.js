'use strict';

const SKIPLIST_MAXLEVEL = 32;
const SKIPLIST_P = 0.25;

class SkipListNode {
    constructor(score, member, level) {
        this.score = score;
        this.member = member;
        this.forward = new Array(level).fill(null);
        this.span = new Array(level).fill(0);
        this.backward = null;
    }
}

function compareNodes(scoreA, memberA, scoreB, memberB) {
    if (scoreA < scoreB) return -1;
    if (scoreA > scoreB) return 1;
    if (memberA < memberB) return -1;
    if (memberA > memberB) return 1;
    return 0;
}

class SkipList {
    constructor() {
        this.header = new SkipListNode(0, null, SKIPLIST_MAXLEVEL);
        this.tail = null;
        this.length = 0;
        this.level = 1;
    }

    _randomLevel() {
        let level = 1;
        while (Math.random() < SKIPLIST_P && level < SKIPLIST_MAXLEVEL) {
            level++;
        }
        return level;
    }

    insert(score, member) {
        const update = new Array(SKIPLIST_MAXLEVEL);
        const rank = new Array(SKIPLIST_MAXLEVEL);
        let curr = this.header;

        for (let i = this.level - 1; i >= 0; i--) {
            rank[i] = (i === this.level - 1) ? 0 : rank[i + 1];
            while (curr.forward[i] && compareNodes(curr.forward[i].score, curr.forward[i].member, score, member) < 0) {
                rank[i] += curr.span[i];
                curr = curr.forward[i];
            }
            update[i] = curr;
        }

        const newLevel = this._randomLevel();
        if (newLevel > this.level) {
            for (let i = this.level; i < newLevel; i++) {
                rank[i] = 0;
                update[i] = this.header;
                update[i].span[i] = this.length;
            }
            this.level = newLevel;
        }

        const node = new SkipListNode(score, member, newLevel);

        for (let i = 0; i < newLevel; i++) {
            node.forward[i] = update[i].forward[i];
            update[i].forward[i] = node;

            node.span[i] = update[i].span[i] - (rank[0] - rank[i]);
            update[i].span[i] = (rank[0] - rank[i]) + 1;
        }

        for (let i = newLevel; i < this.level; i++) {
            update[i].span[i]++;
        }

        node.backward = (update[0] === this.header) ? null : update[0];
        if (node.forward[0]) {
            node.forward[0].backward = node;
        } else {
            this.tail = node;
        }

        this.length++;
        return node;
    }

    delete(score, member) {
        const update = new Array(SKIPLIST_MAXLEVEL);
        let curr = this.header;

        for (let i = this.level - 1; i >= 0; i--) {
            while (curr.forward[i] && compareNodes(curr.forward[i].score, curr.forward[i].member, score, member) < 0) {
                curr = curr.forward[i];
            }
            update[i] = curr;
        }

        curr = curr.forward[0];
        if (curr && curr.score === score && curr.member === member) {
            this._deleteNode(curr, update);
            return true;
        }
        return false;
    }

    _deleteNode(node, update) {
        for (let i = 0; i < this.level; i++) {
            if (update[i].forward[i] === node) {
                update[i].span[i] += node.span[i] - 1;
                update[i].forward[i] = node.forward[i];
            } else {
                update[i].span[i]--;
            }
        }

        if (node.forward[0]) {
            node.forward[0].backward = node.backward;
        } else {
            this.tail = node.backward;
        }

        while (this.level > 1 && this.header.forward[this.level - 1] === null) {
            this.level--;
        }

        this.length--;
    }

    getRank(score, member) {
        let rank = 0;
        let curr = this.header;

        for (let i = this.level - 1; i >= 0; i--) {
            while (curr.forward[i] && compareNodes(curr.forward[i].score, curr.forward[i].member, score, member) <= 0) {
                rank += curr.span[i];
                curr = curr.forward[i];
            }
            if (curr && curr.member === member && curr.score === score) {
                return rank;
            }
        }
        return 0;
    }

    getByRank(rank) {
        if (rank < 1 || rank > this.length) return null;

        let traversed = 0;
        let curr = this.header;

        for (let i = this.level - 1; i >= 0; i--) {
            while (curr.forward[i] && (traversed + curr.span[i]) <= rank) {
                traversed += curr.span[i];
                curr = curr.forward[i];
            }
            if (traversed === rank) {
                return curr;
            }
        }
        return null;
    }
}

module.exports = { SkipList, SkipListNode };
