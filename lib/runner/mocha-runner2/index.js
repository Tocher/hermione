'use strict';

const MochaAdapter = require('./mocha-adapter');
const utils = require('q-promise-utils');
const QEmitter = require('qemitter');
const _ = require('lodash');

module.exports = class MochaRunner extends QEmitter {
    static init() {
        MochaAdapter.init();
    }

    static create(config, browserAgent, injectors) {
        return new MochaRunner(config, browserAgent, injectors);
    }

    constructor(config, browserAgent, injectors) {
        super();

        this._sharedMochaOpts = config.system.mochaOpts;
        this._ctx = _.clone(config.system.ctx);
        this._browserAgent = browserAgent;
        this._injectors = injectors;
    }

    run(file, filterFn) {
        return MochaAdapter
            .create(this._sharedMochaOpts, this._browserAgent, this._ctx)
            .attachTestFilter(filterFn)
            .attachTitleValidator(this._injectors.titles)
            .applySkip(this._injectors.testSkipper)
            .attachEmitFn(this.emit.bind(this))
            .addFiles([file])
            .run();
    }

    // run(file) {
    //     const titles = {};
    //
    //     return _(suitePaths)
    //         .map((path) => this._createMocha(path, titles, filterFn))
    //         .map((mocha) => mocha.run())
    //         .thru(utils.waitForResults)
    //         .value();
    // }

    // buildSuiteTree(suitePaths) {
    //     return this._createMocha(suitePaths, {}).suite;
    // }
    //
    // _createMocha(suiteFiles, titles, filterFn) {
    //     const mochaAdapter = MochaAdapter.create(this._sharedMochaOpts, this._browserAgent, this._ctx);
    //     suiteFiles = [].concat(suiteFiles);
    //
    //     return mochaAdapter
    //         .attachTestFilter(filterFn)
    //         .attachTitleValidator(titles)
    //         .applySkip(this._testSkipper)
    //         .attachEmitFn(this.emit.bind(this))
    //         .addFiles(suiteFiles);
    // }
};
