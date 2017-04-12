'use strict';

const q = require('q');
const _ = require('lodash');
const EventEmitter = require('events').EventEmitter;
const Runnable = require('./runnable');
const Test = require('./test');

module.exports = class Suite extends EventEmitter {
    constructor(parent) {
        super();

        this._parent = parent;
        this._title = 'suite-title';

        this._beforeAll = [];
        this._beforeEach = [];
        this._afterEach = [];
        this._afterAll = [];
        this._tests = [];
        this._suites = [];

        this._ctx = {};

        this.addBeforeAllHook = this.beforeAll;
        this.addBeforeEachHook = this.beforeEach;
        this.addAfterEachHook = this.afterEach;
        this.addAfterAllHook = this.afterAll;

        this._beforeAllErrors = [];
        this._beforeEachErrors = [];
        this._testErrors = [];
        this._afterEachErrors = [];
        this._afterAllErrors = [];
    }

    static create(parent) {
        return new this(parent);
    }

    get title() {
        return this._title;
    }

    set title(title) {
        this._title = title;
    }

    get parent() {
        return this._parent;
    }

    set parent(parent) {
        this._parent = parent;
    }

    get tests() {
        return this._tests;
    }

    get suites() {
        return this._suites;
    }

    get beforeAllHooks() {
        return this._beforeAll;
    }

    get beforeEachHooks() {
        return this._beforeEach;
    }

    get afterEachHooks() {
        return this._afterEach;
    }

    get afterAllHooks() {
        return this._afterAll;
    }

    get ctx() {
        return this._ctx;
    }

    set ctx(ctx) {
        this._ctx = ctx;
    }

    fullTitle() {
        return this.title;
    }

    beforeAll(callback) {
        return this._createHook({
            title: 'before all',
            collection: this.beforeAllHooks,
            event: 'beforeAll',
            callback
        });
    }

    beforeEach(callback) {
        return this._createHook({
            title: 'before each',
            collection: this.beforeEachHooks,
            event: 'beforeEach',
            callback
        });
    }

    afterEach(callback) {
        return this._createHook({
            title: 'after each',
            collection: this.afterEachHooks,
            event: 'afterEach',
            callback
        });
    }

    afterAll(callback) {
        return this._createHook({
            title: 'after all',
            collection: this.afterAllHooks,
            event: 'afterAll',
            callback
        });
    }

    _createHook(props) {
        const hook = Runnable.create(this);
        hook.title = props.title;
        hook.fn = props.callback;

        props.collection.push(hook);
        this.emit(props.event, hook);
        return this;
    }

    addTest(title, callback, options) {
        callback = callback || _.noop;
        options = _.defaults(options || {}, {skipped: false, file: null});

        const test = Test.create(this);
        test.fn = callback;
        test.title = title;
        test.file = options.file;
        test.pending = options.skipped;

        this.tests.push(test);
        this.emit('test', test);

        return this;
    }

    addSuite(suite) {
        suite.parent = this;
        this.suites.push(suite);
        this.emit('suite', suite);
        return this;
    }

    eachTest(fn) {
        this.tests.forEach(fn);
    }

    enableTimeouts() {

    }

    get beforeAllErrors() {
        return this._beforeAllErrors;
    }

    get beforeEachErrors() {
        return this._beforeEachErrors;
    }

    get testErrors() {
        return this._testErrors;
    }

    get afterEachErrors() {
        return this._afterEachErrors;
    }

    get afterAllErrors() {
        return this._afterAllErrors;
    }

    run() {
        return q()
            .then(this._execRunnables(this.beforeAllHooks, this.beforeAllErrors))
            .then(() => this.tests.reduce((acc, test) => {
                return acc
                    .then(() => {
                        const setContextToHook = (hook) => hook.ctx.currentTest = test;

                        this.beforeEachHooks.forEach(setContextToHook);
                        this.afterEachHooks.forEach(setContextToHook);
                    })
                    .then(this._execRunnables(this.beforeEachHooks, this.beforeEachErrors))
                    .then(() => test.run())
                    .catch((error) => this.testErrors.push(error))
                    .then(this._execRunnables(this.afterEachHooks, this.afterEachErrors));
            }, q()))
            .then(this._execRunnables(this.suites, []))
            .then(this._execRunnables(this.afterAllHooks, this.afterAllErrors));
    }

    _execRunnables(runnables, errorCollection) {
        return () => _.reduce(runnables, (acc, runnable) => {
            return acc
                .then(() => runnable.run())
                .catch((error) => errorCollection.push(error));
        }, q());
    }
};
