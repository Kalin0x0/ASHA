import { Global, Module } from '@nestjs/common';
import { type Env, loadEnv } from '@chista/config';

export const ENV = 'CHISTA_ENV';

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): Env => loadEnv() }],
  exports: [ENV],
})
export class EnvModule {}
