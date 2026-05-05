import { SubmissionProcessor } from '../../../packages/domain/src/submission/submission-processor';

const processor = new SubmissionProcessor();

export async function handler(event: { Records?: Array<{ body?: string }> }) {
  const records = event.Records ?? [];
  return records.map((record) => processor.process(JSON.parse(record.body ?? '{}')));
}
