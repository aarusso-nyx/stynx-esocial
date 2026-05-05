# Batch 1 Leiaute Blockers

Round 1 Batch 1 promoted the unblocked table families S-1005, S-1020, S-1050,
and S-1070. The remaining table families are quarantined to Batch 1B because
their golden XML cannot be bound to an active XSD in the current repository
without a leiaute decision.

| Family | Golden namespace/version | Missing or blocked XSD | Owner needed | Decision options | Target |
| --- | --- | --- | --- | --- | --- |
| S-1030 | `evtTabCargo/v_S_01_03_00` | `evtTabCargo.xsd` is absent from `packages/domain/src/sgp-lifted/esocial-worker/xsd/`, `packages/domain/src/xml/xsd/`, and `docs/references/`. | eSocial product/regulatory owner | Fetch and bind the matching S-1.3 XSD, or retire S-1030 if this service will only support layouts where cargo data moved elsewhere. | Before Batch 2 promotion starts. |
| S-1040 | `evtTabFuncao/v_S_01_03_00` | `evtTabFuncao.xsd` is absent from `packages/domain/src/sgp-lifted/esocial-worker/xsd/`, `packages/domain/src/xml/xsd/`, and `docs/references/`. | eSocial product/regulatory owner | Fetch and bind the matching S-1.3 XSD, or retire S-1040 if this service will only support layouts where function data moved elsewhere. | Before Batch 2 promotion starts. |
| S-1060 | `evtTabAmbiente/v02_05_00` | The golden uses the legacy v2.5 namespace; no active current-layout `evtTabAmbiente.xsd` is present. | eSocial product/regulatory owner | Retire legacy S-1060, bind it explicitly as legacy-only evidence, or fetch a current-layout XSD and regenerate the golden/DTO contract. | Before Batch 2 promotion starts. |

Batch 1B must not mark these families ACTIVE_FULL until the chosen XSD/leiaute
path is recorded in `docs/events.md` and proven by XSD validation tests.
