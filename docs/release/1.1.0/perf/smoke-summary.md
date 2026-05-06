# Round 4 Perf Summary

Mode: smoke
Iterations: 50

| Suite | p50 ms | p95 ms | p99 ms | Budget ms |
| --- | ---: | ---: | ---: | ---: |
| builder | 0.009 | 0.023 | 0.377 | 50 |
| idempotencyKey | 0.004 | 0.008 | 0.01 | 1 |
| parseReturn | 0.021 | 0.037 | 0.86 | 25 |
| sign | 0.998 | 5.529 | 13.439 | 50 |
| xsd | 6.315 | 8.867 | 10.52 | 100 |
| soapStub | 0.031 | 0.043 | 0.056 | 500 |
| dtoValidation | 0.001 | 0.001 | 0.003 | 10 |
