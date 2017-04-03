'use strict';

const _ = require('lodash');
const validators = require('../../validators');

// TODO: подумай над тем, чтобы переименовать этот класс нахуй, когда допилишь эти ебаные ретраи,
// ибо это нихуя не проcто TestSkipper; такое название путает с hermione.skip
module.exports = class TestSkipper {
    static create(config) {
        return new TestSkipper(config);
    }

    static _getBrowsersToSkip() {
        const browsers = process.env.HERMIONE_SKIP_BROWSERS;

        return browsers ? browsers.split(/, */) : [];
    }

    constructor(config) {
        this._skipBrowsers = TestSkipper._getBrowsersToSkip();

        validators.validateUnknownBrowsers(this._skipBrowsers, config.getBrowserIds());
    }

    applySkip(suite, browserId) {
        if (this._shouldBeSkipped(browserId)) {
            suite.pending = true;
            suite.skipReason = 'The test was skipped by environment variable HERMIONE_SKIP_BROWSERS';
        }
    }

    _shouldBeSkipped(browserId) {
        return _.contains(this._skipBrowsers, browserId);
    }
};
