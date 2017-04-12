'use strict';

const BrowserAgent = require('../../../../lib/browser-agent');
const logger = require('../../../../lib/utils').logger;
const ProxyReporter = require('../../../../lib/runner/mocha-runner/proxy-reporter');
const SkipBuilder = require('../../../../lib/runner/mocha-runner/skip/skip-builder');
const OnlyBuilder = require('../../../../lib/runner/mocha-runner/skip/only-builder');
const Skip = require('../../../../lib/runner/mocha-runner/skip/');
const TestSkipper = require('../../../../lib/runner/test-skipper');
const RunnerEvents = require('../../../../lib/constants/runner-events');
const MochaStub = require('../../_mocha');
const proxyquire = require('proxyquire').noCallThru();
const EventEmitter = require('events').EventEmitter;
const _ = require('lodash');
const q = require('q');

describe('mocha-runner/mocha-adapter', () => {
    const sandbox = sinon.sandbox.create();

    let MochaAdapter;
    let browserAgent;
    let clearRequire;
    let testSkipper;

    const mkMochaAdapter_ = (opts, ctx) => {
        return MochaAdapter.create(opts || {}, browserAgent, ctx);
    };

    const mkBrowserStub_ = () => {
        return {publicAPI: Object.create({})};
    };

    beforeEach(() => {
        testSkipper = sinon.createStubInstance(TestSkipper);
        browserAgent = sinon.createStubInstance(BrowserAgent);

        clearRequire = sandbox.stub().named('clear-require');
        MochaAdapter = proxyquire('../../../../lib/runner/mocha-runner/mocha-adapter', {
            'clear-require': clearRequire,
            'mocha': MochaStub
        });

        sandbox.stub(logger);
    });

    afterEach(() => sandbox.restore());

    describe('init', () => {
        it('should add an empty hermione object to global', () => {
            MochaAdapter.init();

            assert.deepEqual(global.hermione, {});

            delete global.hermione;
        });
    });

    describe('constructor', () => {
        it('should pass shared opts to mocha instance', () => {
            sandbox.stub(MochaStub.prototype, '__constructor');
            mkMochaAdapter_({grep: 'foo'});

            assert.calledWith(MochaStub.prototype.__constructor, {grep: 'foo'});
        });

        it('should enable full stacktrace in mocha', () => {
            sandbox.stub(MochaStub.prototype, 'fullTrace');
            mkMochaAdapter_();

            assert.called(MochaStub.prototype.fullTrace);
        });
    });

    describe('addFiles', () => {
        beforeEach(() => sandbox.stub(MochaStub.prototype, 'addFile'));

        it('should add files', () => {
            const mochaAdapter = mkMochaAdapter_();

            mochaAdapter.addFiles(['path/to/file']);

            assert.calledOnce(MochaStub.prototype.addFile);
            assert.calledWith(MochaStub.prototype.addFile, 'path/to/file');
        });

        it('should clear require cache for file before adding', () => {
            const mochaAdapter = mkMochaAdapter_();

            mochaAdapter.addFiles(['path/to/file']);

            assert.calledWithMatch(clearRequire, 'path/to/file');
            assert.callOrder(clearRequire, MochaStub.prototype.addFile);
        });

        it('should load files after add', () => {
            sandbox.stub(MochaStub.prototype, 'loadFiles');

            const mochaAdapter = mkMochaAdapter_();

            mochaAdapter.addFiles(['path/to/file']);

            assert.calledOnce(MochaStub.prototype.loadFiles);
            assert.callOrder(MochaStub.prototype.addFile, MochaStub.prototype.loadFiles);
        });

        describe('hermione global', () => {
            beforeEach(() => MochaAdapter.init());
            afterEach(() => delete global.hermione);

            it('hermione.skip should return SkipBuilder instance', () => {
                mkMochaAdapter_();

                assert.instanceOf(global.hermione.skip, SkipBuilder);
            });

            it('hermione.only should return OnlyBuilder instance', () => {
                mkMochaAdapter_();

                assert.instanceOf(global.hermione.only, OnlyBuilder);
            });

            it('hermione.ctx should return passed ctx', () => {
                mkMochaAdapter_({}, {some: 'ctx'});

                assert.deepEqual(global.hermione.ctx, {some: 'ctx'});
            });
        });
    });

    describe('inject browser', () => {
        beforeEach(() => {
            browserAgent.getBrowser.returns(q(mkBrowserStub_()));
            browserAgent.freeBrowser.returns(q());
        });

        it('should request browser before suite execution', () => {
            return mkMochaAdapter_().mocha
                .updateSuiteTree((suite) => suite.addTest('some-test'))
                .execute(() => assert.calledOnce(browserAgent.getBrowser));
        });

        it('should not request browsers for suite with one skipped test', () => {
            return mkMochaAdapter_().mocha
                .updateSuiteTree((suite) => suite.addTest('some-test', _.noop, {skipped: true}))
                .execute(() => assert.notCalled(browserAgent.getBrowser));
        });

        it('should request browsers for suite with at least one non-skipped test', () => {
            return mkMochaAdapter_().mocha
                .updateSuiteTree((suite) => {
                    return suite
                        .addTest('some-skipped-title', _.noop, {skipped: true})
                        .addTest('some-title');
                })
                .execute(() => assert.calledOnce(browserAgent.getBrowser));
        });

        it('should not request browsers for suite with nested skipped tests', () => {
            return mkMochaAdapter_().mocha
                .updateSuiteTree((suite) => {
                    return suite
                        .addSuite(
                            MochaStub.Suite.create(suite)
                                .addTest('test1', _.noop, {skipped: true})
                                .addTest('test2', _.noop, {skipped: true})
                        );
                })
                .execute(() => assert.notCalled(browserAgent.getBrowser));
        });

        it('should release browser after suite execution', () => {
            const browser = mkBrowserStub_();
            browserAgent.getBrowser.returns(q(browser));
            browserAgent.freeBrowser.returns(q());

            return mkMochaAdapter_().mocha
                .updateSuiteTree((suite) => suite.addTest('some-title'))
                .execute(() => {
                    assert.calledOnce(browserAgent.freeBrowser);
                    assert.calledWith(browserAgent.freeBrowser, browser);
                });
        });

        it('should disable mocha timeouts while setting browser hooks', () => {
            sandbox.stub(MochaStub.Suite.prototype, 'enableTimeouts').onFirstCall().returns(true);
            const beforeAllStub = sandbox.stub(MochaStub.Suite.prototype, 'beforeAll');
            const afterAllStub = sandbox.stub(MochaStub.Suite.prototype, 'afterAll');

            mkMochaAdapter_();

            assert.callOrder(
                MochaStub.Suite.prototype.enableTimeouts, // get current value of enableTimeouts
                MochaStub.Suite.prototype.enableTimeouts.withArgs(false).named('disableTimeouts'),
                beforeAllStub,
                afterAllStub,
                MochaStub.Suite.prototype.enableTimeouts.withArgs(true).named('restoreTimeouts')
            );
        });

        it('should not be rejected if freeBrowser failed', (done) => {
            const browser = mkBrowserStub_();

            browserAgent.getBrowser.returns(q(browser));
            browserAgent.freeBrowser.returns(q.reject('some-error'));

            mkMochaAdapter_().mocha
                .updateSuiteTree((suite) => suite.addTest('some-title'))
                .execute(() => {
                    process.nextTick(() => {
                        assert.calledOnce(logger.warn);
                        assert.calledWithMatch(logger.warn, /some-error/);
                        done();
                    });
                });
        });
    });

    describe('inject skip', () => {
        beforeEach(() => {
            browserAgent.getBrowser.returns(q(mkBrowserStub_()));
            browserAgent.freeBrowser.returns(q());
            sandbox.stub(Skip.prototype, 'handleEntity');
        });

        it('should apply skip to test', () => {
            return mkMochaAdapter_().mocha
                .updateSuiteTree((suite) => suite.addTest('some-test'))
                .execute((mochaStub) => {
                    assert.called(Skip.prototype.handleEntity);
                    assert.calledWith(Skip.prototype.handleEntity, mochaStub.suite.tests[0]);
                });
        });

        it('should apply skip to suite', () => {
            return mkMochaAdapter_().mocha
                .updateSuiteTree((suite) => suite.addSuite(MochaStub.Suite.create(suite)))
                .execute((mochaStub) => {
                    assert.called(Skip.prototype.handleEntity);
                    assert.calledWith(Skip.prototype.handleEntity, mochaStub.suite.suites[0]);
                });
        });
    });

    describe('applySkip', () => {
        it('should skip suite using test skipper', () => {
            const mochaAdapter = mkMochaAdapter_();
            browserAgent.browserId = 'some-browser';

            mochaAdapter.applySkip(testSkipper);

            assert.calledWith(testSkipper.applySkip, mochaAdapter.mocha.suite, 'some-browser');
        });

        it('should be chainable', () => {
            const mochaAdapter = mkMochaAdapter_();
            const mochaInstance = mochaAdapter.applySkip(testSkipper);

            assert.instanceOf(mochaInstance, MochaAdapter);
        });
    });

    describe('inject execution context', () => {
        let browser;

        beforeEach(() => {
            browser = mkBrowserStub_();
            browserAgent.getBrowser.returns(q(browser));
            browserAgent.freeBrowser.returns(q());
        });

        it('should add execution context to browser', () => {
            return mkMochaAdapter_()
                .mocha.updateSuiteTree((suite) => suite.addTest('some-title'))
                .execute((mochaStub) => {
                    const runnable = mochaStub.suite.tests[0];
                    assert.includeMembers(
                        _.keys(browser.publicAPI.executionContext), _.keys(runnable));
                });
        });

        it('should handle nested tests', () => {
            return mkMochaAdapter_().mocha
                .updateSuiteTree((suite) => {
                    const nestedSuite = MochaStub.Suite.create(suite);
                    suite.addSuite(nestedSuite);
                    nestedSuite.addTest('nested-test');
                    return suite;
                })
                .execute((mochaStub) => {
                    const test = mochaStub.suite.suites[0].tests[0];
                    assert.includeMembers(
                        _.keys(browser.publicAPI.executionContext),
                        _.keys(test)
                    );
                });
        });

        it('should add browser id to the context', () => {
            BrowserAgent.prototype.browserId = 'some-browser';

            return mkMochaAdapter_()
                .mocha.updateSuiteTree((suite) => suite.addTest('some-title'))
                .execute(() => {
                    assert.property(browser.publicAPI.executionContext, 'browserId', 'some-browser');
                });
        });

        it('should add execution context to the browser prototype', () => {
            BrowserAgent.prototype.browserId = 'some-browser';

            return mkMochaAdapter_().mocha
                .updateSuiteTree((suite) => suite.addTest('some-title'))
                .execute(() => assert.property(Object.getPrototypeOf(browser.publicAPI), 'executionContext'));
        });
    });

    describe('attachTestFilter', () => {
        it('should check if test should be run', () => {
            BrowserAgent.prototype.browserId = 'some-browser';

            const shouldRun = sandbox.stub().returns(true);
            const mochaAdapter = mkMochaAdapter_();
            mochaAdapter.attachTestFilter(shouldRun);

            mochaAdapter.mocha.updateSuiteTree((suite) => {
                return suite.addTest('some-test');
            });

            assert.calledWith(shouldRun, mochaAdapter.mocha.suite.tests[0], 'some-browser');
        });

        it('should not remove test which expected to be run', () => {
            const shouldRun = sandbox.stub().returns(true);
            const mochaAdapter = mkMochaAdapter_();
            mochaAdapter.attachTestFilter(shouldRun);

            mochaAdapter.mocha.updateSuiteTree((suite) => {
                return suite
                    .addTest('test1')
                    .addTest('test2');
            });

            const tests = mochaAdapter.mocha.suite.tests;

            assert.equal(tests[0].title, 'test1');
            assert.equal(tests[1].title, 'test2');
        });

        it('should remove test which does not suppose to be run', () => {
            const shouldRun = sandbox.stub();
            shouldRun.onFirstCall().returns(true);
            shouldRun.onSecondCall().returns(false);

            const mochaAdapter = mkMochaAdapter_();
            mochaAdapter.attachTestFilter(shouldRun);

            mochaAdapter.mocha.updateSuiteTree((suite) => {
                return suite
                    .addTest('test1')
                    .addTest('test2');
            });

            const tests = mochaAdapter.mocha.suite.tests;

            assert.lengthOf(tests, 1);
            assert.equal(tests[0].title, 'test1');
        });

        it('should not filter any test if filter function is not passed', () => {
            const mochaAdapter = mkMochaAdapter_();
            mochaAdapter.attachTestFilter();

            mochaAdapter.mocha.updateSuiteTree((suite) => suite.addTest('some-test'));

            const tests = mochaAdapter.mocha.suite.tests;

            assert.lengthOf(tests, 1);
            assert.equal(tests[0].title, 'some-test');
        });
    });

    describe('attachTitleValidator', () => {
        it('should throw an error if tests have the same full title', () => {
            const mochaAdapter = mkMochaAdapter_();
            mochaAdapter.attachTitleValidator({});

            assert.throws(() => {
                mochaAdapter.mocha
                    .updateSuiteTree((suite) => {
                        return suite
                            .addTest('test-title', _.noop, {file: 'some/path/file.js'})
                            .addTest('test-title', _.noop, {file: 'other/path/file.js'});
                    });
            }, /with the same title: 'suite-title test-title'(.+) file: 'some\/path\/file.js'/);
        });
    });

    describe('attachEmitFn', () => {
        let mochaAdapter;

        beforeEach(() => {
            sandbox.stub(ProxyReporter.prototype, '__constructor');
            mochaAdapter = mkMochaAdapter_();
            sandbox.stub(mochaAdapter.mocha, 'reporter');
        });

        function attachEmitFn_(emitFn) {
            mochaAdapter.attachEmitFn(emitFn);

            const Reporter = mochaAdapter.mocha.reporter.lastCall.args[0];
            new Reporter(); // eslint-disable-line no-new
        }

        it('should set mocha reporter as proxy reporter in order to proxy events to emit fn', () => {
            attachEmitFn_(sinon.spy());

            assert.calledOnce(ProxyReporter.prototype.__constructor);
        });

        it('should pass to proxy reporter emit fn', () => {
            const emitFn = sinon.spy().named('emit');

            attachEmitFn_(emitFn);

            const emit_ = ProxyReporter.prototype.__constructor.firstCall.args[0];
            emit_('some-event', {some: 'data'});

            assert.calledOnce(emitFn);
            assert.calledWith(emitFn, 'some-event', sinon.match({some: 'data'}));
        });

        it('should pass to proxy reporter getter for requested browser', () => {
            const browser = mkBrowserStub_();
            browserAgent.getBrowser.returns(q(browser));
            attachEmitFn_(sinon.spy());

            mochaAdapter.mocha
                .execute(() => {
                    const getBrowser = ProxyReporter.prototype.__constructor.lastCall.args[1];
                    assert.equal(browser, getBrowser());
                });
        });

        it('should pass to proxy reporter getter for browser id if browser not requested', () => {
            browserAgent.browserId = 'some-browser';

            attachEmitFn_(sinon.spy());

            const getBrowser = ProxyReporter.prototype.__constructor.lastCall.args[1];
            assert.deepEqual(getBrowser(), {id: 'some-browser'});
        });

        describe('if event handler throws', () => {
            const initBadHandler_ = (event, handler) => {
                const emitter = new EventEmitter();
                emitter.on(event, handler);

                attachEmitFn_(emitter.emit.bind(emitter));
                return ProxyReporter.prototype.__constructor.firstCall.args[0];
            };

            it('proxy should rethrow error', () => {
                const emit_ = initBadHandler_('foo', () => {
                    throw new Error(new Error('bar'));
                });

                assert.throws(() => emit_('foo'), /bar/);
            });

            it('run should be rejected', () => {
                const emit_ = initBadHandler_('foo', () => {
                    throw new Error('bar');
                });

                const promise = mochaAdapter.run();

                try {
                    emit_('foo');
                } catch (e) {
                    // eslint иди лесом
                }

                return assert.isRejected(promise, /bar/);
            });
        });

        describe('file events', () => {
            beforeEach(() => MochaAdapter.init());
            afterEach(() => delete global.hermione);

            _.forEach({
                'pre-require': 'BEFORE_FILE_READ',
                'post-require': 'AFTER_FILE_READ'
            }, (hermioneEvent, mochaEvent) => {
                it(`should emit ${hermioneEvent} on mocha ${mochaEvent}`, () => {
                    const emit = sinon.spy();
                    browserAgent.browserId = 'bro';

                    mochaAdapter.attachEmitFn(emit);
                    mochaAdapter.mocha.suite.emit(mochaEvent, {}, '/some/file.js');

                    assert.calledOnce(emit);
                    assert.calledWith(emit, RunnerEvents[hermioneEvent], {
                        file: '/some/file.js',
                        hermione: global.hermione,
                        browser: 'bro',
                        suite: mochaAdapter.suite
                    });
                });
            });
        });
    });

    describe('"before" hook error handling', () => {
        beforeEach(() => {
            browserAgent.getBrowser.returns(q(mkBrowserStub_()));
            browserAgent.freeBrowser.returns(q());
        });

        it('should not launch suite original test if "before" hook failed', () => {
            const originalTestFn = sinon.spy();

            return mkMochaAdapter_().mocha
                .updateSuiteTree((suite) => {
                    return suite
                        .addBeforeAllHook(sandbox.stub().throws(new Error('some-error')))
                        .addTest('some-test', originalTestFn);
                })
                .execute(() => assert.notCalled(originalTestFn));
        });

        it('should fail suite tests with error thrown from "before" hook', () => {
            const error = new Error('some-error');

            return mkMochaAdapter_().mocha
                .updateSuiteTree((suite) => {
                    return suite
                        .addBeforeAllHook(sandbox.stub().throws(error))
                        .addTest('some-test');
                })
                .execute((mochaStub) => assert.equal(mochaStub.suite.testErrors[0], error));
        });

        it('should handle async "before hook" errors', () => {
            const error = new Error('some-error');

            return mkMochaAdapter_().mocha
                .updateSuiteTree((suite) => {
                    return suite
                        .addBeforeAllHook(sandbox.stub().returns(q.reject(error)))
                        .addTest('some-test');
                })
                .execute((mochaStub) => assert.equal(mochaStub.suite.testErrors[0], error));
        });

        it('should not execute original "before each" hook functionality if "before" hook failed', () => {
            const beforeEachHookFn = sinon.spy();

            return mkMochaAdapter_().mocha
                .updateSuiteTree((suite) => {
                    return suite
                        .addBeforeAllHook(sandbox.stub().throws(new Error('some-error')))
                        .addBeforeEachHook(beforeEachHookFn)
                        .addTest('some-test');
                })
                .execute(() => assert.notCalled(beforeEachHookFn));
        });

        it('should fail "before each" hook with error from before hook', () => {
            const beforeAllError = new Error('some-error');

            return mkMochaAdapter_().mocha
                .updateSuiteTree((suite) => {
                    return suite
                        .addBeforeAllHook(sandbox.stub().throws(beforeAllError))
                        .addBeforeEachHook(sandbox.stub().returns(true))
                        .addTest('some-test');
                })
                .execute((mochaStub) => assert.equal(mochaStub.suite.beforeEachErrors[0], beforeAllError));
        });
    });

    describe('"before each" hook error handling', () => {
        beforeEach(() => {
            browserAgent.getBrowser.returns(q(mkBrowserStub_()));
            browserAgent.freeBrowser.returns(q());
        });

        it('should not execute original suite test if "before each" hook failed', () => {
            const originalTestFn = sinon.spy();

            return mkMochaAdapter_().mocha
                .updateSuiteTree((suite) => {
                    return suite
                        .addBeforeEachHook(sandbox.stub().throws(new Error('some-error')))
                        .addTest('some-test', originalTestFn);
                })
                .execute(() => assert.notCalled(originalTestFn));
        });

        it('should execute original suite test if "before each hook was executed successfully"', () => {
            const originalTestFn = sinon.spy();

            return mkMochaAdapter_().mocha
                .updateSuiteTree((suite) => {
                    return suite
                        .addBeforeEachHook(sandbox.stub())
                        .addTest('some-test', originalTestFn);
                })
                .execute(() => assert.called(originalTestFn));
        });

        it('should fail test with error from "before each" hook', () => {
            const error = new Error('some-error');

            return mkMochaAdapter_().mocha
                .updateSuiteTree((suite) => {
                    return suite
                        .addBeforeEachHook(sandbox.stub().throws(error))
                        .addTest('some-test', sinon.spy());
                })
                .execute((mochaStub) => assert.equal(mochaStub.suite.testErrors[0], error));
        });

        it('should handle async "before each" hook errors', () => {
            const error = new Error('some-error');

            return mkMochaAdapter_().mocha
                .updateSuiteTree((suite) => {
                    return suite
                        .addBeforeEachHook(sandbox.stub().returns(q.reject(error)))
                        .addTest('some-test', sinon.spy());
                })
                .execute((mochaStub) => assert.equal(mochaStub.suite.testErrors[0], error));
        });

        it('should run another tests in suite after "before each" hook failed', () => {
            const beforeEachHookStub = sandbox.stub();
            beforeEachHookStub.onFirstCall().throws(new Error('some-error'));
            beforeEachHookStub.onSecondCall().returns(true);

            const testFn1 = sinon.spy();
            const testFn2 = sinon.spy();

            return mkMochaAdapter_().mocha
                .updateSuiteTree((suite) => {
                    return suite
                        .addBeforeEachHook(beforeEachHookStub)
                        .addTest('first', testFn1)
                        .addTest('second', testFn2);
                })
                .execute(() => {
                    assert.notCalled(testFn1);
                    assert.called(testFn2);
                });
        });
    });
});
