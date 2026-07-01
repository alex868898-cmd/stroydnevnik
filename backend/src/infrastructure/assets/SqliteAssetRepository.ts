import { AssetRepository } from '../../domain/assets/AssetRepository.js';
import { AssetReference, AssetKind } from '../../domain/assets/AssetReference.js';
import { prisma } from '../database/prismaClient.js';
import { AssetReference as PrismaAsset } from '@prisma/client';

export class SqliteAssetRepository implements AssetRepository {
  async findById(id: string): Promise<AssetReference | null> {
    const record = await prisma.assetReference.findUnique({
      where: { id },
    });
    if (!record) return null;

    const jobRecord = await prisma.job.findFirst({
      where: { resultAssetId: id },
      select: { id: true }
    });

    return this.toDomain(record, jobRecord?.id);
  }

  async save(asset: AssetReference): Promise<AssetReference> {
    const data = this.toPrisma(asset);
    const record = await prisma.assetReference.upsert({
      where: { id: asset.id },
      update: data,
      create: data,
    });
    return this.toDomain(record, asset.sourceJobId);
  }

  async delete(id: string): Promise<void> {
    await prisma.assetReference.delete({
      where: { id },
    });
  }

  async list(): Promise<AssetReference[]> {
    const records = await prisma.assetReference.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const jobs = await prisma.job.findMany({
      where: { resultAssetId: { not: null } },
      select: { id: true, resultAssetId: true }
    });

    const assetIdToJobIdMap = new Map<string, string>();
    for (const job of jobs) {
      if (job.resultAssetId) {
        assetIdToJobIdMap.set(job.resultAssetId, job.id);
      }
    }

    return records.map(r => this.toDomain(r, assetIdToJobIdMap.get(r.id)));
  }

  async findByJobId(jobId: string): Promise<AssetReference | null> {
    const jobRecord = await prisma.job.findUnique({
      where: { id: jobId },
      select: { resultAssetId: true }
    });

    if (!jobRecord || !jobRecord.resultAssetId) {
      return null;
    }

    const record = await prisma.assetReference.findUnique({
      where: { id: jobRecord.resultAssetId }
    });

    if (!record) return null;
    return this.toDomain(record, jobId);
  }

  private toDomain(record: PrismaAsset, sourceJobId?: string | null): AssetReference {
    return {
      id: record.id,
      path: record.path,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      kind: record.kind as AssetKind,
      createdAt: record.createdAt,
      sourceJobId: sourceJobId ?? undefined,
    };
  }

  private toPrisma(asset: AssetReference) {
    return {
      id: asset.id,
      path: asset.path,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      kind: asset.kind,
      createdAt: asset.createdAt,
    };
  }
}
