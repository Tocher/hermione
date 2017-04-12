'use strict';

const _ = require('lodash');

module.exports = class Runnable {
    constructor(parent) {
        this._title = '';
        this._fn = _.noop;
        this._parent = parent;
        this._ctx = {};
    }

    static create(parent) {
        return new this(parent);
    }

    get fn() {
        return this._fn;
    }

    set fn(fn) {
        this._fn = fn;
    }

    get parent() {
        return this._parent;
    }

    get ctx() {
        return this._ctx;
    }

    set ctx(ctx) {
        this._ctx = ctx;
    }

    get title() {
        return this._title;
    }

    set title(title) {
        this._title = title;
    }

    fullTitle() {
        return `${this.parent.title} ${this.title}`;
    }

    run() {
        this.fn();
    }
};
