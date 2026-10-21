"""Private TL unittest reporter. Importing/collecting project code requires approval."""
import importlib.util
import json
import os
import sys
import time
import traceback
import unittest

report = os.fdopen(3, 'w', encoding='utf-8', buffering=1)
def emit(value):
    report.write(json.dumps(value, ensure_ascii=False) + '\n')

def flatten(suite):
    for test in suite:
        if isinstance(test, unittest.TestSuite):
            yield from flatten(test)
        else:
            yield test

class Result(unittest.TextTestResult):
    def startTest(self, test):
        self.started = time.monotonic()
        emit({'type':'case_start','caseId':test.id(),'name':str(test)})
        super().startTest(test)
    def outcome(self, test, status, error=None, reason=None):
        emit({'type':'case_result','caseId':test.id(),'name':str(test),'fullName':test.id(),'kind':'test', 'status':status,'durationMs':(time.monotonic()-getattr(self,'started',time.monotonic()))*1000,'error':error,'reason':reason})
    def addSuccess(self, test):
        super().addSuccess(test); self.outcome(test,'passed')
    def addFailure(self, test, err):
        super().addFailure(test,err); self.outcome(test,'failed',''.join(traceback.format_exception(*err)))
    def addError(self, test, err):
        super().addError(test,err); self.outcome(test,'error',''.join(traceback.format_exception(*err)))
    def addSkip(self, test, reason):
        super().addSkip(test,reason); self.outcome(test,'skipped',reason=reason)
    def addExpectedFailure(self, test, err):
        super().addExpectedFailure(test,err); self.outcome(test,'expected_failure',''.join(traceback.format_exception(*err)))
    def addUnexpectedSuccess(self, test):
        super().addUnexpectedSuccess(test); self.outcome(test,'unexpected_success')
    def addSubTest(self, test, subtest, err):
        super().addSubTest(test,subtest,err)
        self.outcome(subtest,'passed' if err is None else 'failed',''.join(traceback.format_exception(*err)) if err else None)

try:
    config = json.load(sys.stdin)
    emit({'type':'report_start','runner':'unittest','version':sys.version})
    sys.path.insert(0, os.getcwd())
    suite = unittest.TestSuite()
    for file in config['files']:
        relative = os.path.relpath(file, os.getcwd())
        module_name = os.path.splitext(relative)[0].replace(os.sep,'.')
        spec = importlib.util.spec_from_file_location(module_name,file)
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
        suite.addTests(unittest.defaultTestLoader.loadTestsFromModule(module))
    tests = list(flatten(suite))
    emit({'type':'catalog','cases':[{'caseId':t.id(),'name':str(t)} for t in tests]})
    requested = config.get('caseNames') or []
    missing = [name for name in requested if name not in [t.id() for t in tests]]
    if missing:
        raise ValueError('Selected tests were not collected: '+repr(missing))
    if requested:
        suite = unittest.TestSuite(t for t in tests if t.id() in requested)
    if config['operation'] == 'collect':
        emit({'type':'report_end','success':True,'collected':len(tests)})
    else:
        result = unittest.TextTestRunner(resultclass=Result,verbosity=2).run(suite)
        emit({'type':'summary','testsRun':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'skipped':len(result.skipped),'expectedFailures':len(result.expectedFailures),'unexpectedSuccesses':len(result.unexpectedSuccesses)})
        emit({'type':'report_end','success':result.wasSuccessful()})
        sys.exit(0 if result.wasSuccessful() else 1)
except Exception:
    emit({'type':'runner_error','error':traceback.format_exc()})
    traceback.print_exc()
    sys.exit(2)
