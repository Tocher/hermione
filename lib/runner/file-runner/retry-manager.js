'use strict';

const _ = require('lodash');
const QEmitter = require('qemitter');
const RunnerEvents = require('../../constants/runner-events');

module.exports = class RetryManager extends QEmitter {
    static create(file, retries) {
        return new RetryManager(file, retries);
    }

    constructor(file, retries) {
        super();

        this._file = file;
        this._retries = retries;
    }

    runWithRetries(runFn, testsToRun) {
        this._testsToRetry = [];

        return runFn(this._file, testsToRun)
            .then(() => this._retry(runFn));
    }

    registerTestFail(failed) {
        return this._handleFail(RunnerEvents.TEST_FAIL, failed);
    }

    registerSuiteFail(failed) {
        return this._handleFail(RunnerEvents.SUITE_FAIL, failed, failed.parent);
    }

    registerError(err, failed) {
        return this._handleFail(RunnerEvents.ERROR, _.extend(failed, {err}), failed.parent);
    }

    _handleFail(event, failed, runnable) {
        runnable = runnable || failed;

        !this._submitForRetry(failed, runnable) && this.emit(event, failed);
    }

    _submitForRetry(failed, runnable) {
        if(!this._retries) {
            return false;
        }

        this._addTestsToRetry(runnable);
        this.emit(RunnerEvents.RETRY, _.extend(failed, {retriesLeft: this._retries - 1}));
        return true;
    }

    _addTestsToRetry(runnable) {
        if (runnable.type === 'test') {
            this._testsToRetry.push(runnable);
        } else {
            _.union(runnable.suites, runnable.tests).forEach((runnable) => this._addTestsToRetry(runnable));
        }
    }

    _retry(runFn) {
        if (_.isEmpty(this._testsToRetry)) {
            return;
        }

        --this._retries;
        return this.runWithRetries(runFn, this._testsToRetry);
    }
};
