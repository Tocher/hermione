'use strict';

const Runnable = require('./runnable');

module.exports = class Test extends Runnable {
    constructor(parent) {
        super(parent);

        this.title = 'default-title';

        this._file = null;
        this._pending = false;
    }

    get file() {
        return this._file;
    }

    set file(file) {
        this._file = file;
    }

    get pending() {
        return this._pending;
    }

    set pending(pending) {
        this._pending = pending;
    }
};
