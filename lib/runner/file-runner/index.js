'use strict';

const _ = require('lodash');
const QEmitter = require('qemitter');
const MochaRunner = require('../mocha-runner2');
const TestSkipper = require('./test-skipper');
const RetryManager = require('./retry-manager');
const RunnerEvents = require('../../constants/runner-events');
const qUtils = require('qemitter/utils');

module.exports = class FileRunner extends QEmitter {
    static create(file, browserAgent, config) {
        return new FileRunner(file, browserAgent, config);
    }

    constructor(file, browserAgent, config) {
        super();

        this._browserAgent = browserAgent;
        this._config = config;

        this._retryManager = RetryManager.create(file, config.forBrowser(browserAgent.browserId).retry);
        qUtils.passthroughEvent(this._retryManager, this, [
            RunnerEvents.TEST_FAIL,
            RunnerEvents.SUITE_FAIL,
            RunnerEvents.ERROR,
            RunnerEvents.RETRY
        ]);

        this._injectors = {
            testSkipper: TestSkipper.create(config),
            titles: {}
        };

        MochaRunner.init();
    }

    run() {
        return this._retryManager.runWithRetries(this._run.bind(this));
    }

    _run(file, testsToRun) {
        return this._initMochaRunner().run(file, shouldRunTest);

        function shouldRunTest(test, browserId) {
            return _.isEmpty(testsToRun) || _.some(testsToRun, (runnable) => {
                return runnable.browserId === browserId
                    && runnable.file === test.file
                    && runnable.fullTitle() === test.fullTitle();
            });
        }
    }

    _initMochaRunner() {
        const runner = MochaRunner.create(this._config, this._browserAgent, this._injectors);

        qUtils.passthroughEvent(runner, this, [
            RunnerEvents.BEFORE_FILE_READ,
            RunnerEvents.AFTER_FILE_READ,

            RunnerEvents.SUITE_BEGIN,
            RunnerEvents.SUITE_END,

            RunnerEvents.TEST_BEGIN,
            RunnerEvents.TEST_END,

            RunnerEvents.TEST_PASS,
            RunnerEvents.TEST_PENDING
        ]);

        runner.on(RunnerEvents.TEST_FAIL, (data) => this._retryManager.registerTestFail(data));
        runner.on(RunnerEvents.SUITE_FAIL, (data) => this._retryManager.registerSuiteFail(data));
        runner.on(RunnerEvents.ERROR, (err, data) => this._retryManager.registerError(err, data));

        return runner;
    }
};
