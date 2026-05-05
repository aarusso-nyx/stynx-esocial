import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';

type CircuitState = 'CLOSED' | 'HALF_OPEN' | 'OPEN';

interface CircuitRow extends QueryResultRow {
  endpoint_url: string;
  opened_at: Date | string | null;
  last_failure_at: Date | string | null;
  failure_count: number;
  state: CircuitState;
}

@Injectable()
export class CircuitBreakerService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

  async assertCanSend(endpointUrl: string): Promise<void> {
    const state = await this.state(endpointUrl);
    if (!state || state.state !== 'OPEN') return;

    const openedAt = state.opened_at ? new Date(state.opened_at) : new Date(0);
    if (Date.now() - openedAt.getTime() < this.cooldownMs()) {
      throw new ServiceUnavailableException(
        `eSocial endpoint circuit is open for ${endpointUrl}`,
      );
    }

    await this.databaseService.query(
      `
      UPDATE esocial.endpoint_circuit_state
      SET state = 'HALF_OPEN'::esocial.endpoint_circuit_state_status,
          updated_at = now()
      WHERE endpoint_url = $1
      `,
      [endpointUrl],
    );
  }

  async recordSuccess(endpointUrl: string): Promise<void> {
    await this.databaseService.query(
      `
      INSERT INTO esocial.endpoint_circuit_state (
        endpoint_url,
        failure_count,
        state
      )
      VALUES ($1, 0, 'CLOSED'::esocial.endpoint_circuit_state_status)
      ON CONFLICT (endpoint_url) DO UPDATE
      SET failure_count = 0,
          state = 'CLOSED'::esocial.endpoint_circuit_state_status,
          opened_at = NULL,
          last_failure_at = NULL,
          updated_at = now()
      `,
      [endpointUrl],
    );
  }

  async recordFailure(endpointUrl: string): Promise<CircuitState> {
    const rows = await this.databaseService.query<CircuitRow>(
      `
      INSERT INTO esocial.endpoint_circuit_state (
        endpoint_url,
        opened_at,
        last_failure_at,
        failure_count,
        state
      )
      VALUES (
        $1,
        CASE WHEN $2::int <= 1 THEN now() ELSE NULL END,
        now(),
        1,
        CASE
          WHEN $2::int <= 1 THEN 'OPEN'::esocial.endpoint_circuit_state_status
          ELSE 'CLOSED'::esocial.endpoint_circuit_state_status
        END
      )
      ON CONFLICT (endpoint_url) DO UPDATE
      SET failure_count = esocial.endpoint_circuit_state.failure_count + 1,
          last_failure_at = now(),
          opened_at = CASE
            WHEN esocial.endpoint_circuit_state.failure_count + 1 >= $2::int THEN now()
            ELSE esocial.endpoint_circuit_state.opened_at
          END,
          state = CASE
            WHEN esocial.endpoint_circuit_state.failure_count + 1 >= $2::int
              THEN 'OPEN'::esocial.endpoint_circuit_state_status
            ELSE 'CLOSED'::esocial.endpoint_circuit_state_status
          END,
          updated_at = now()
      RETURNING endpoint_url, opened_at, last_failure_at, failure_count, state::text AS state
      `,
      [endpointUrl, this.failureThreshold()],
    );
    return rows[0]?.state ?? 'CLOSED';
  }

  async list(): Promise<CircuitRow[]> {
    return this.databaseService.query<CircuitRow>(
      `
      SELECT
        endpoint_url,
        opened_at,
        last_failure_at,
        failure_count,
        state::text AS state
      FROM esocial.endpoint_circuit_state
      ORDER BY endpoint_url
      `,
    );
  }

  private async state(endpointUrl: string): Promise<CircuitRow | undefined> {
    const rows = await this.databaseService.query<CircuitRow>(
      `
      SELECT
        endpoint_url,
        opened_at,
        last_failure_at,
        failure_count,
        state::text AS state
      FROM esocial.endpoint_circuit_state
      WHERE endpoint_url = $1
      `,
      [endpointUrl],
    );
    return rows[0];
  }

  private failureThreshold(): number {
    const configured = Number(
      this.configService.get<string>('ESOCIAL_CIRCUIT_FAILURE_THRESHOLD') ?? 3,
    );
    return Number.isInteger(configured) && configured > 0 ? configured : 3;
  }

  private cooldownMs(): number {
    const configured = Number(
      this.configService.get<string>('ESOCIAL_CIRCUIT_COOLDOWN_MS') ?? 60_000,
    );
    return Number.isInteger(configured) && configured > 0 ? configured : 60_000;
  }
}
