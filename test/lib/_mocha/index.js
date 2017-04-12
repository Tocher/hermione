'use strict';

const Suite = require('./suite');
const Test = require('./test');

module.exports = class Mocha {
    __constructor() {
        // needs for stub ability
    }

    constructor(options) {
        this.__constructor(options);
        this._suite = Suite.create();
    }

    static get Test() {
        return Test;
    }

    static get Suite() {
        return Suite;
    }

    run(cb) {
        return process.nextTick(cb);
    }

    execute(cb) {
        return this.suite.run().then(() => cb(this));
    }

    get suite() {
        return this._suite;
    }

    updateSuiteTree(callback) {
        this._suite = callback(this._suite);
        return this;
    }

    addFile() {
        // needs for stub ability
    }

    loadFiles() {
        // needs for stub ability
    }

    reporter() {
        // needs for stub ability
    }

    fullTrace() {
        // needs for stub ability
    }
};

