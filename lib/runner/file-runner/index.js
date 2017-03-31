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

        // this._injectors = {
        //     testSkipper: TestSkipper.create(config),
        //     titleCollector: TitleCollector.create()
        // };

        this._testSkipper = TestSkipper.create(config);
        this._retries = config.forBrowser(browserAgent.browserId).retry;

        MochaRunner.init();
    }

    run(testsToRun) {
        const mochaRunner = this._initMochaRunner();
        this._testsToRetry = [];

        return mochaRunner.run(this._file, (test, browserId) => {
                return _.isEmpty(testsToRun) || _.some(testsToRun, (runnable) => {
                    return runnable.browserId === browserId
                        && runnable.file === test.file
                        && runnable.fullTitle() === test.fullTitle();
                });
            })
            .then(() => this._retry());
    }

    _initMochaRunner() {
        const runner = MochaRunner.create(this._config, this._browserAgent, this._testSkipper);

        qUtils.passthroughEvent(runner, this, [
            RunnerEvents.BEFORE_FILE_READ,
            RunnerEvents.AFTER_FILE_READ,

            RunnerEvents.SUITE_BEGIN,
            RunnerEvents.SUITE_END,

            RunnerEvents.TEST_BEGIN,
            RunnerEvents.TEST_END,

            RunnerEvents.TEST_PASS,
            RunnerEvents.TEST_PENDING,

            RunnerEvents.ERROR
        ]);

        runner.on(RunnerEvents.TEST_FAIL, (data) => !this._submitForRetry(data) && this.emit(event, data));
        runner.on(RunnerEvents.SUITE_FAIL, (data) => {});
        runner.on(RunnerEvents.ERROR, (data) => {})

        return runner;
    }

    _submitForRetry(data) {
        if(!this._retries) {
            return false;
        }

        this._testsToRetry = this._testsToRetry.concat(data);
        this.emit(RunnerEvents.RETRY, _.extend(data, {retriesLeft: this._retries - 1}))
        return true;
    }

    _retry() {
        if (_.isEmpty(this._testsToRetry)) {
            return;
        }

        --this._retries;
        return this.run(this._testsToRetry);
    }
};
