import { Global, Module } from '@nestjs/common';
import { type Env, loadEnv } from '@asha/config';

export const ENV = 'ASHA_ENV';

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): Env => loadEnv() }],
  exports: [ENV],
})
export class EnvModule {}
