import { JobRepository } from '../../domain/jobs/JobRepository.js';
import { GenerationJob } from '../../domain/jobs/GenerationJob.js';
import { JobStatus } from '../../domain/jobs/JobStatus.js';
import { UseCase } from '../../domain/jobs/GenerationRequest.js';
import { prisma } from '../database/prismaClient.js';
import { Job as PrismaJob } from '@prisma/client';

export class SqliteJobRepository implements JobRepository {
  async findById(id: string): Promise<GenerationJob | null> {
    const record = await prisma.job.findUnique({
      where: { id },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async save(job: GenerationJob): Promise<GenerationJob> {
    const data = this.toPrisma(job);
    const record = await prisma.job.upsert({
      where: { id: job.id },
      update: data,
      create: data,
    });
    return this.toDomain(record);
  }

  async list(filter?: { status?: JobStatus; providerId?: string }): Promise<GenerationJob[]> {
    const where: any = {};
    if (filter?.status) {
      where.status = filter.status;
    }
    if (filter?.providerId) {
      where.providerId = filter.providerId;
    }

    const records = await prisma.job.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return records.map(r => this.toDomain(r));
  }

  async findNonTerminal(): Promise<GenerationJob[]> {
    const records = await prisma.job.findMany({
      where: {
        NOT: [
          { status: JobStatus.SUCCEEDED },
          { status: JobStatus.FAILED },
          { status: JobStatus.CANCELLED },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    return records.map(r => this.toDomain(r));
  }

  private toDomain(record: PrismaJob): GenerationJob {
    return {
      id: record.id,
      request: {
        useCase: record.useCase as UseCase,
        prompt: record.prompt,
        providerId: record.providerId,
        pipelineId: record.pipelineId ?? undefined,
        params: {
          duration: record.duration ?? undefined,
          aspectRatio: record.aspectRatio ?? undefined,
          seed: record.seed ?? undefined,
        },
      },
      status: record.status as JobStatus,
      providerId: record.providerId,
      providerJobId: record.providerJobId ?? undefined,
      attempts: record.attempts,
      lastError: record.lastError ?? undefined,
      resultAssetId: record.resultAssetId ?? undefined,
      progress: record.progress ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private toPrisma(job: GenerationJob) {
    return {
      id: job.id,
      useCase: job.request.useCase,
      prompt: job.request.prompt,
      providerId: job.request.providerId,
      pipelineId: job.request.pipelineId ?? null,
      duration: job.request.params?.duration ?? null,
      aspectRatio: job.request.params?.aspectRatio ?? null,
      seed: job.request.params?.seed ?? null,
      status: job.status,
      providerJobId: job.providerJobId ?? null,
      attempts: job.attempts,
      lastError: job.lastError ?? null,
      resultAssetId: job.resultAssetId ?? null,
      progress: job.progress ?? null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}
