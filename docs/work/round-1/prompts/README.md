# Round 1 Prompts

Run these prompts in order:

1. `01-remaining-tables.md`
2. `02-remaining-periodic.md`
3. `03-worker-sst-tsv.md`
4. `04-benefits-process-exclusion.md`
5. `05-cleanup-and-evidence.md`

Prompts 1-4 implement family promotion in batches. Prompt 5 closes the lifted
tree and evidence story after every promoted family is green.

Every implementation prompt follows the Round 0 path:

```text
DTO -> builder -> golden XML -> XSD -> sign -> SOAP stub -> return parse -> publish
```

Workers must preserve unrelated changes. Do not edit landed migrations unless a
new forward migration is explicitly required by the prompt.
