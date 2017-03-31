'use strict';

const _ = require('lodash');
const QEmitter = require('qemitter');
const qUtils = require('qemitter/utils');
const utils = require('q-promise-utils');
const BrowserAgent = require('./browser-agent');
const FileRunner = require('../file-runner');
const RunnerEvents = require('../../constants/runner-events');

module.exports = class BrowserRunner extends QEmitter {
    static create(browserId, config, browserPool) {
        return new BrowserRunner(browserId, config, browserPool);
    }

    constructor(browserId, config, browserPool) {
        super();

        this._browserId = browserId;
        this._config = config;
        this._browserPool = browserPool;
    }

    run(files) {
        return _(files)
            .map((file) => this._runFile(file))
            .thru(utils.waitForResults)
            .value()
    }

    _runFile(file) {
        const browserAgent = BrowserAgent.create(this._browserId, this._browserPool);
        const runner = FileRunner.create(file, browserAgent, this._config);

        qUtils.passthroughEvent(runner, this, _.values(RunnerEvents.getSync()));

        qUtils.passthroughEventAsync(runner, this, [
            RunnerEvents.SESSION_START,
            RunnerEvents.SESSION_END
        ]);

        return runner.run();
    }
};
