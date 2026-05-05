import { Injectable } from '@nestjs/common';

import { S1000Builder } from './s1000.builder';
import { S1005Builder } from './s1005.builder';
import { S1010Builder } from './s1010.builder';
import { S1020Builder } from './s1020.builder';
import { S1030Builder } from './s1030.builder';
import { S1040Builder } from './s1040.builder';
import { S1060Builder } from './s1060.builder';
import { S1050Builder } from './s1050.builder';
import { S1070Builder } from './s1070.builder';
import {
  S1xxxBuilder,
  S1xxxDispatchResult,
  S1xxxDispatchService,
  S1xxxEventKind,
} from './s1xxx-common';

@Injectable()
export class S1xxxService {
  private readonly builders: Partial<Record<S1xxxEventKind, S1xxxBuilder>>;

  constructor(
    private readonly dispatchService: S1xxxDispatchService,
    s1000: S1000Builder,
    s1005: S1005Builder,
    s1010: S1010Builder,
    s1020: S1020Builder,
    s1030: S1030Builder,
    s1040: S1040Builder,
    s1060: S1060Builder,
    s1050: S1050Builder,
    s1070: S1070Builder,
  ) {
    this.builders = {
      'S-1000': s1000,
      'S-1005': s1005,
      'S-1010': s1010,
      'S-1020': s1020,
      'S-1030': s1030,
      'S-1040': s1040,
      'S-1060': s1060,
      'S-1050': s1050,
      'S-1070': s1070,
    };
  }

  status() {
    return this.dispatchService.status();
  }

  async emitAll(input: {
    competence?: string;
    force?: boolean;
  }): Promise<S1xxxDispatchResult[]> {
    const results: S1xxxDispatchResult[] = [];
    for (const eventKind of Object.keys(this.builders) as S1xxxEventKind[]) {
      const builder = this.builders[eventKind];
      if (!builder) continue;
      results.push(...(await this.dispatchService.dispatch(builder, input)));
    }
    return results;
  }

  emitOne(
    eventKind: S1xxxEventKind,
    input: { competence?: string; force?: boolean },
  ): Promise<S1xxxDispatchResult[]> {
    const builder = this.builders[eventKind];
    if (!builder) {
      throw new Error(`Unsupported S-1xxx event kind: ${eventKind}`);
    }
    return this.dispatchService.dispatch(builder, input);
  }
}
