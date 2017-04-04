'use strict';

const _ = require('lodash');
const QEmitter = require('qemitter');
const qUtils = require('qemitter/utils');
const utils = require('q-promise-utils');
const BrowserAgent = require('./browser-agent');
const FileRunner = require('../file-runner');
const RunnerEvents = require('../../constants/runner-events');

module.exports = class BrowserRunner extends QEmitter {
    static create(browserId, browserPool, config) {
        return new BrowserRunner(browserId, browserPool, config);
    }

    constructor(browserId, browserPool, config) {
        super();

        this._config = config;

        this._browserAgent = BrowserAgent.create(browserId, browserPool);

        qUtils.passthroughEventAsync(this._browserAgent, this, [
            RunnerEvents.SESSION_START,
            RunnerEvents.SESSION_END
        ]);
    }

    run(files) {
        return _(files)
            .map((file) => this._runFile(file))
            .thru(utils.waitForResults)
            .value()
    }

    _runFile(file) {
        const runner = FileRunner.create(file, this._browserAgent, this._config);

        qUtils.passthroughEvent(runner, this, _.values(RunnerEvents.getSync()));

        qUtils.passthroughEventAsync(browserAgent, this, [
            RunnerEvents.SESSION_START,
            RunnerEvents.SESSION_END
        ]);

        return runner.run();
    }
};
