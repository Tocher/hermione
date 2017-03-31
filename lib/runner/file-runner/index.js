'use strict';

const _ = require('lodash');
const QEmitter = require('qemitter');
const MochaRunner = require('../mocha-runner2');
const TestSkipper = require('./test-skipper');
const RunnerEvents = require('../../constants/runner-events');
const qUtils = require('qemitter/utils');
const utils = require('q-promise-utils');

module.exports = class FileRunner extends QEmitter {
    static create(file, browserAgent, config) {
        return new FileRunner(file, browserAgent, config);
    }

    constructor(file, browserAgent, config) {
        super();

        this._file = file;
        this._browserAgent = browserAgent;
        this._config = config;

        this._testSkipper = TestSkipper.create(config);

        this._retries = config.forBrowser(browserAgent.browserId).retry;

        MochaRunner.init();
    }

    run(testsToRun) {
        const mochaRunner = this._initMochaRunner();
        this._testsToRetry = [];

        return mochaRunner.run(this._file, (test, browserId) => this._shouldRun(test, browserId))
            .then(() => this._retry());
    }

    _initMochaRunner() {
        const runner = MochaRunner.create(this._config, this._browserAgent, this._testSkipper);

        qUtils.passthroughEvent(runner, this, [
            'beforeFileRead',
            'afterFileRead',

            'beginSuite',
            'endSuite',

            'failSuite',

            'beginTest',
            'endTest',

            'passTest',
            // TEST_FAIL: 'failTest',
            'pendingTest',

            // RETRY: 'retry',

            'err'
        ]);

        qUtils.passthroughEventAsync(runner, this, [
            RunnerEvents.SESSION_START,
            RunnerEvents.SESSION_END
        ]);

        this._handleEvent(runner, RunnerEvents.TEST_FAIL);
        // this._handleEvent(runner, Events.SUITE_FAIL);

        return runner;
    }

    _handleEvent(runner, event) {
        runner.on(event, (data) => !this._submitForRetry(data) && this.emit(event, data));
    }

    _submitForRetry(data) {
        if(--this._retries < 0) {
            return false;
        }

        this._testsToRetry = this._testsToRetry.concat(data);
        this.emit(RunnerEvents.RETRY, _.extend(data, {retriesLeft: this._retries}))
        return true;
    }

    _shouldRun(test, browserId) {
        if (_.isEmpty(this._testsToRetry)) {
            return true;
        }

        return _.some(this._testsToRetry, (runnable) => {
            return runnable.browserId === browserId
                && runnable.file === test.file
                && runnable.fullTitle() === test.fullTitle();
        });
    }

    _retry() {
        if (_.isEmpty(this._testsToRetry)) {
            return;
        }

        --this._retries;
        return this.run(this._testsToRetry);
    }
};
