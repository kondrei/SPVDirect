import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

@Injectable()
export class AdvisoryLockRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async runExclusive(key: number, work: () => Promise<void>): Promise<boolean> {
    const runner = this.dataSource.createQueryRunner();
    let locked = false;
    try {
      const [row] = (await runner.query(
        'SELECT pg_try_advisory_lock($1) AS locked',
        [key],
      )) as { locked: boolean }[];
      locked = row?.locked === true;
      if (locked) await work();
      return locked;
    } finally {
      if (locked) {
        await runner
          .query('SELECT pg_advisory_unlock($1)', [key])
          .catch(() => undefined);
      }
      await runner.release();
    }
  }
}
