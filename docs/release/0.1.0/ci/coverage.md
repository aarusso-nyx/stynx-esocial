# Coverage Evidence

Command:

```bash
npm run coverage
```

Result from the Wave C local closure run on 2026-05-05:

| Reporter | Line coverage | Branch coverage | Function coverage | Status |
| --- | ---: | ---: | ---: | --- |
| Vitest v8 source inclusion | 1.03 % | 0.21 % | 0.63 % | Passes because thresholds are not yet enforced for the sparse Vitest slice. |
| Node experimental coverage over active tests | 69.88 % | 69.42 % | 71.50 % | Passes as executable coverage evidence, below the 80 % Round 0 target. |

The remaining coverage gap is a Round 1 test-expansion item. CI still runs
`npm run coverage` on every PR and `main` push so coverage cannot silently become
structural-only again.
