'use strict';

function ReplicationBacklog(maxSize) {
    this.maxSize = maxSize || (10 * 1024 * 1024);
    this.buffer = Buffer.alloc(0);
    this.firstOffset = 0;
    this.currentOffset = 0;
}

ReplicationBacklog.prototype.append = function (chunk) {
    if (!chunk || chunk.length === 0) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.currentOffset += chunk.length;

    if (this.buffer.length > this.maxSize) {
        var overflow = this.buffer.length - this.maxSize;
        this.buffer = this.buffer.subarray(overflow);
        this.firstOffset += overflow;
    }
};

ReplicationBacklog.prototype.canProvide = function (offset) {
    if (this.buffer.length === 0) return false;
    return offset >= this.firstOffset && offset <= this.currentOffset;
};

ReplicationBacklog.prototype.sliceFrom = function (offset) {
    if (!this.canProvide(offset)) return null;
    var relOffset = offset - this.firstOffset;
    return this.buffer.subarray(relOffset);
};

ReplicationBacklog.prototype.clear = function () {
    this.buffer = Buffer.alloc(0);
    this.firstOffset = 0;
    this.currentOffset = 0;
};

module.exports = { ReplicationBacklog: ReplicationBacklog };
