import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type { ArtifactRecord } from '@jobautomation/core';
import type { ArtifactsRepository, CreateArtifactInput } from '@jobautomation/db';

export type StoreArtifactInput = {
  artifactsRepository: ArtifactsRepository;
  kind: string;
  format: string;
  fileName: string;
  storagePath: string;
  content: string | Buffer;
  jobId: string;
  discoveryRunId?: string | null;
  applicantProfileId?: string | null;
  applicantProfileUpdatedAt?: Date | null;
  version?: number;
};

export async function storeArtifact(input: StoreArtifactInput): Promise<ArtifactRecord> {
  const absolutePath = resolve(input.storagePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.content);

  const payload: CreateArtifactInput = {
    jobId: input.jobId,
    discoveryRunId: input.discoveryRunId ?? null,
    applicantProfileId: input.applicantProfileId ?? null,
    applicantProfileUpdatedAt: input.applicantProfileUpdatedAt ?? null,
    version: input.version ?? 1,
    kind: input.kind,
    format: input.format,
    fileName: input.fileName,
    storagePath: input.storagePath,
    createdAt: new Date()
  };

  return input.artifactsRepository.create(payload);
}
