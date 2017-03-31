'use strict';

const _ = require('lodash');
const QEmitter = require('qemitter');
const qUtils = require('qemitter/utils');
const utils = require('q-promise-utils');
const BrowserPool = require('../browser-pool');
const RunnerEvents = require('../constants/runner-events');
const BrowserRunner = require('./browser-runner');

module.exports = class MainRunner extends QEmitter {
    static create(config) {
        return new MainRunner(config);
    }

    constructor(config) {
        super();

        this._config = config;

        this._browserPool = new BrowserPool(this._config);
    }

    run(tests) {
        return this.emitAndWait(RunnerEvents.RUNNER_START, this)
            .then(() => this._runTests(tests))
            .fin(() => this.emitAndWait(RunnerEvents.RUNNER_END));
    }

    _runTests(tests) {
        return _(tests)
            .map((files, browserId) => this._runTestsInBrowser(files, browserId))
            .thru(utils.waitForResults)
            .value();
    }

    _runTestsInBrowser(files, browserId) {
        const runner = BrowserRunner.create(browserId, this._config, this._browserPool);

        qUtils.passthroughEvent(runner, this, _.values(RunnerEvents.getSync()));

        qUtils.passthroughEventAsync(runner, this, [
            RunnerEvents.SESSION_START,
            RunnerEvents.SESSION_END
        ]);

        return runner.run(files);
    }

    buildSuiteTree(tests) {

    }

    // buildSuiteTree(tests) {
    //     return _.mapValues(tests, (files, browserId) => {
    //         const browserAgent = BrowserAgent.create(browserId, this.config, this._pool);
    //         const mochaRunner = MochaRunner.create(this._config, browserAgent, this._testSkipper);
    //
    //         qUtils.passthroughEvent(mochaRunner, this, [
    //             RunnerEvents.BEFORE_FILE_READ,
    //             RunnerEvents.AFTER_FILE_READ
    //         ]);
    //
    //         return mochaRunner.buildSuiteTree(files);
    //     });
    // }
};
